import { Router, Request, Response } from 'express';
import * as cheerio from 'cheerio';

const router = Router();

const BASE_URL = 'https://www.kdissw.or.kr';
const BOARD_URL = `${BASE_URL}/board.es?mid=a10501040000&bid=0046`;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분 캐싱

export interface NoticeItem {
  title: string;
  date: string;
  url: string;
}

export interface PaginationInfo {
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

const cache = new Map<number, { data: ScrapeResult; expiresAt: number }>();

function parsePagination($: cheerio.CheerioAPI, currentPage: number): PaginationInfo {
  const pageSet = new Set<number>([currentPage]);
  let maxPage = currentPage;

  // 1. 페이징 영역의 링크에서 nPage 파라미터 추출 (끝페이지/다음페이지 포함)
  $('a[href*="nPage="]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const match = href.match(/nPage=(\d+)/);
    if (match) {
      const num = Number(match[1]);
      if (num > maxPage) maxPage = num;

      // 숫자 버튼만 pages 배열에 추가 ("다음", "끝" 같은 텍스트 버튼 제외)
      if (/^\d+$/.test($(el).text().trim())) {
        pageSet.add(num);
      }
    }
  });

  // 2. 혹시 본문 상단에 "1 / 15 페이지" 같은 표기가 있으면 totalPages 보정
  const bodyText = $('body').text();
  const pageRatioMatch = bodyText.match(/(\d+)\s*\/\s*(\d+)\s*페이지/);
  if (pageRatioMatch) {
    const totalFromText = Number(pageRatioMatch[2]);
    if (totalFromText > maxPage) maxPage = totalFromText;
  }

  const pages = Array.from(pageSet).sort((a, b) => a - b);

  return {
    currentPage,
    totalPages: maxPage,
    pages,
    hasPrev: currentPage > 1,
    hasNext: currentPage < maxPage,
  };
}

async function scrapeNotices(page: number): Promise<ScrapeResult> {
  const res = await fetch(`${BOARD_URL}&nPage=${page}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`원본 서버 응답 오류: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const items: NoticeItem[] = [];

  $('table tbody tr').each((_, row) => {
    const $row = $(row);
    const $link = $row.find('a').first();
    const title = $link.text().trim();
    const href = $link.attr('href')?.trim() ?? '';

    if (!title || !href) return;

    let date = '';
    $row.find('td').each((__, td) => {
      const text = $(td).text().trim();
      if (/^\d{4}[-.]\d{2}[-.]\d{2}$/.test(text)) {
        date = text;
      }
    });

    const url = href.startsWith('http')
      ? href
      : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;

    items.push({ title, date, url });
  });

  const pagination = parsePagination($, page);

  return { items, pagination };
}

// GET /api/kdissw/notices?page=1
router.get('/notices', async (req: Request, res: Response) => {
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
    const result = await scrapeNotices(page);
    cache.set(page, { data: result, expiresAt: now + CACHE_TTL_MS });

    return res.json({
      cached: false,
      count: result.items.length,
      ...result,
    });
  } catch (error) {
    return res.status(502).json({
      error: '공고 목록을 불러오지 못했습니다.',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;