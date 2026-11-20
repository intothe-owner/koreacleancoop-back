import { Router, Request, Response } from 'express';
import https from 'https';
import * as cheerio from 'cheerio';

const router = Router();

const BASE_URL = 'https://www.kcpass.or.kr';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분 캐싱

const BOARD_MENUS: Record<string, string> = {
  'smart-home': 'MENU002060501000000',     // 스마트 홈 및 스마트 사회복지시설 사업
  'smart-service': 'MENU002060702000000',  // 스마트 사회서비스 시범사업
};

export interface NoticeItem {
  title: string;
  date: string;
  url: string;
}

export interface PaginationInfo {
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pages: number[];
  hasPrev: boolean;
  hasNext: boolean;
}

interface ScrapeResult {
  items: NoticeItem[];
  pagination: PaginationInfo;
}

const cache = new Map<string, { data: ScrapeResult; expiresAt: number }>();

// SSL 인증서 체인 오류 우회 + 리다이렉트 대응 HTML 요청 헬퍼
function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        rejectUnauthorized: false,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      },
      (res) => {
        // 301/302 리다이렉트 처리
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const nextUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${BASE_URL}${res.headers.location}`;
          res.resume();
          resolve(fetchHtml(nextUrl));
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`원본 서버 응답 오류: HTTP ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      }
    );

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('요청 시간 초과 (10초)'));
    });
  });
}

function parsePagination($: cheerio.CheerioAPI, requestedPage: number): PaginationInfo {
  const totalCount =
    Number($('.board-current-total').text().replace(/[^0-9]/g, '')) || 0;

  // "1/1" 형태 파싱
  const stateText = $('.board-current-state').text().trim();
  const [curStr, totalStr] = stateText.split('/');

  const currentPage = Number(curStr) || requestedPage;
  let totalPages = Number(totalStr) || 1;

  // 하단 페이징 버튼 (.board_pager a)
  const pageSet = new Set<number>([currentPage]);
  $('.board_pager a').each((_, el) => {
    const text = $(el).text().trim();
    if (/^\d+$/.test(text)) {
      const num = Number(text);
      pageSet.add(num);
      if (num > totalPages) totalPages = num;
    }
  });

  const pages = Array.from(pageSet).sort((a, b) => a - b);

  return {
    totalCount,
    currentPage,
    totalPages,
    pages,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

async function scrapeKcpassBoard(menuId: string, page: number): Promise<ScrapeResult> {
  const targetUrl =
    page > 1
      ? `${BASE_URL}/board?menuId=${menuId}&pageNum=${page}`
      : `${BASE_URL}/board?menuId=${menuId}`;

  const html = await fetchHtml(targetUrl);
  const $ = cheerio.load(html);
  const items: NoticeItem[] = [];

  $('.board-table table tbody tr').each((_, row) => {
    const $row = $(row);
    const $link = $row.find('a.btitle').first();
    if ($link.length === 0) return;

    // a.btitle 안의 <span>만 추출 (모바일용 날짜/조회수 제외)
    const title =
      $link.children('span').first().text().trim() ||
      $link.attr('title')?.trim() ||
      '';
    const href = $link.attr('href')?.trim() ?? '';

    if (!title || !href) return;

    // 등록일 (모바일/PC 공통으로 YYYY-MM-DD 추출)
    const dateText =
      $row.find('.m-visible-date').text().trim() ||
      $row.find('td.m-hidden').first().text().trim();
    const dateMatch = dateText.match(/\d{4}-\d{2}-\d{2}/);
    const date = dateMatch ? dateMatch[0] : '';

    const url = href.startsWith('http')
      ? href
      : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;

    items.push({ title, date, url });
  });

  const pagination = parsePagination($, page);

  return { items, pagination };
}

// GET /api/kcpass/smart-home?page=1
// GET /api/kcpass/smart-service?page=1
router.get(
  '/:boardType',
  async (req: Request<{ boardType: string }>, res: Response) => {
    const { boardType } = req.params;
    const menuId = BOARD_MENUS[boardType];

    if (!menuId) {
      return res.status(404).json({
        error: '지원하지 않는 게시판입니다.',
        available: Object.keys(BOARD_MENUS),
      });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const cacheKey = `${boardType}:${page}`;
    const now = Date.now();

    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return res.json({
        boardType,
        cached: true,
        count: cached.data.items.length,
        ...cached.data,
      });
    }

    try {
      const result = await scrapeKcpassBoard(menuId, page);
      cache.set(cacheKey, { data: result, expiresAt: now + CACHE_TTL_MS });

      return res.json({
        boardType,
        cached: false,
        count: result.items.length,
        ...result,
      });
    } catch (error) {
      console.error('[kcpass scrape error]', error);
      return res.status(502).json({
        error: '게시판 목록을 불러오지 못했습니다.',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

export default router;