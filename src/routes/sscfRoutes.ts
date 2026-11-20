import { Router, Request, Response } from 'express';
import https from 'https';
import * as cheerio from 'cheerio';

const router = Router();

const BASE_URL = 'https://sscf2016.or.kr';
const BOARD_URL = `${BASE_URL}/entry_list.do`;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분 캐싱

export interface SscfEntryItem {
  department: string; // 지원부서
  type: string;       // 유형
  title: string;      // 제목
  url: string;        // 상세보기 링크 (있는 경우)
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  pages: number[];
  hasPrev: boolean;
  hasNext: boolean;
}

interface ScrapeResult {
  items: SscfEntryItem[];
  pagination: PaginationInfo;
}

const cache = new Map<number, { data: ScrapeResult; expiresAt: number }>();

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

function parsePagination($: cheerio.CheerioAPI, currentPage: number): PaginationInfo {
  const pageSet = new Set<number>([currentPage]);
  let totalPages = currentPage;

  // 페이징 영역 후보 선택자
  const $pagerLinks = $(
    '.pagination a, .paging a, .page a, .board_pager a, .paginate a, [class*="pag"] a'
  );

  $pagerLinks.each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const href = $el.attr('href') ?? '';
    const onclick = $el.attr('onclick') ?? '';

    // 1. 숫자 버튼 추출
    if (/^\d+$/.test(text)) {
      const num = Number(text);
      pageSet.add(num);
      if (num > totalPages) totalPages = num;
    }

    // 2. "맨 마지막" / "다음" 버튼 등에서 최대 페이지 번호 추출
    const paramMatch =
      href.match(/(?:pageIndex|page|cPage|nPage)=(\d+)/i) ||
      onclick.match(/\((\d+)\)/);

    if (paramMatch) {
      const num = Number(paramMatch[1]);
      if (num > totalPages) totalPages = num;
    }
  });

  const pages = Array.from(pageSet).sort((a, b) => a - b);

  return {
    currentPage,
    totalPages,
    pages,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

async function scrapeSscfEntries(page: number): Promise<ScrapeResult> {
  // 전자정부프레임워크(.do) 표준 페이징 파라미터 pageIndex 사용
  const targetUrl = page > 1 ? `${BOARD_URL}?pageIndex=${page}` : BOARD_URL;
  const html = await fetchHtml(targetUrl);
  const $ = cheerio.load(html);
  const items: SscfEntryItem[] = [];

  // 페이지 내 여러 table 중 '지원부서' 컬럼이 있는 본문 게시판 테이블만 선택
  const $targetTable = $('table')
    .filter((_, table) => $(table).find('thead').text().includes('지원부서'))
    .first();

  $targetTable.find('tbody tr').each((_, row) => {
    const tds = $(row).find('td');
    if (tds.length < 4) return;

    const department = tds.eq(1).text().replace(/\s+/g, ' ').trim();
    const type = tds.eq(2).text().replace(/\s+/g, ' ').trim();

    const $titleTd = tds.eq(3);
    const $link = $titleTd.find('a').first();
    const title = ($link.length ? $link.text() : $titleTd.text())
      .replace(/\s+/g, ' ')
      .trim();

    if (!title) return;

    const href = $link.attr('href')?.trim() ?? '';
    let url = '';
    if (href && !href.startsWith('javascript:') && href !== '#') {
      url = href.startsWith('http')
        ? href
        : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
    }

    items.push({ department, type, title, url });
  });

  const pagination = parsePagination($, page);

  return { items, pagination };
}

// GET /api/sscf/entries?page=1
router.get('/entries', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const now = Date.now();

  const cached = cache.get(page);
  if (cached && cached.expiresAt > now) {
    return res.json({
      cached: true,
      count: cached.data.items.length,
      ...cached.data,
    });
  }

  try {
    const result = await scrapeSscfEntries(page);
    cache.set(page, { data: result, expiresAt: now + CACHE_TTL_MS });

    return res.json({
      cached: false,
      count: result.items.length,
      ...result,
    });
  } catch (error) {
    console.error('[sscf scrape error]', error);
    return res.status(502).json({
      error: '수원도시재단 목록을 불러오지 못했습니다.',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;