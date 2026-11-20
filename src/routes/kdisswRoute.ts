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

const cache = new Map<number, { data: ScrapeResult; expiresAt: number }>();

function parsePagination($: cheerio.CheerioAPI, requestedPage: number): PaginationInfo {
  // 상단 "전체 296건 / 현재 페이지 1/30" 파싱
  const totalCountText = $('.page_info .total_page b').text().replace(/[^0-9]/g, '');
  const currentPageText = $('.page_info .current_page strong').text().replace(/[^0-9]/g, '');
  const totalPagesText = $('.page_info .current_page b').text().replace(/[^0-9]/g, '');

  const totalCount = Number(totalCountText) || 0;
  const currentPage = Number(currentPageText) || requestedPage;
  let totalPages = Number(totalPagesText) || 1;

  // 하단 페이징 블록 숫자 추출 (a.pageNow, a.pageNone)
  const pages: number[] = [];
  $('.board_pager a.pageNow, .board_pager a.pageNone').each((_, el) => {
    const num = Number($(el).text().trim());
    if (!Number.isNaN(num) && num > 0) {
      pages.push(num);
    }
  });

  // totalPages가 비어있을 경우 마지막 페이지 버튼(a.pageLast)에서 보정
  if (totalPages <= 1) {
    const lastHref = $('.board_pager a.pageLast').attr('href') ?? '';
    const match = lastHref.match(/nPage=(\d+)/);
    if (match) totalPages = Number(match[1]);
  }

  return {
    totalCount,
    currentPage,
    totalPages,
    pages,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
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

  // 실제 목록 컨테이너: #listView > ul
  $('#listView > ul').each((_, ul) => {
    const $ul = $(ul);
    const $link = $ul.find('li.title a').first();

    const title = $link.text().trim();
    const href = $link.attr('href')?.trim() ?? '';
    if (!title || !href) return;

    // 등록일: <li class="W13 m-br"><span class="sr-only">등록일</span>2026/10/30</li>
    let date = '';
    $ul.find('li').each((__, li) => {
      const match = $(li).text().match(/\d{4}\/\d{2}\/\d{2}/);
      if (match) {
        date = match[0]; // "2026-10-30" 형태로 원하면 match[0].replace(/\//g, '-')
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