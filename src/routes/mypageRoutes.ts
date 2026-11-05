import express, { Request, Response } from 'express';
import { Op } from 'sequelize';
import { QuoteRequest, QuoteMatch, Member } from '../models';
import { checkLevel } from '../middlewares/authMiddleware';

const router = express.Router();

// ==========================================
// 1. 마이페이지 대시보드 통계 및 최근 내역
// GET /api/mypage/dashboard
// ==========================================
router.get('/dashboard', checkLevel, async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    const { id: userId, level } = req.user;
    const isPartner = level >= 2;

    let stats = { total: 0, pending: 0, matched: 0, completed: 0 };
    let recentQuotes: any[] = [];

    if (isPartner) {
      // 💡 [수정] as any[] 를 추가하여 TypeScript 에러 회피
      const matches = (await QuoteMatch.findAll({
        where: { memberId: userId },
        include: [{ model: QuoteRequest, as: 'quoteRequest', attributes: ['status', 'serviceType', 'address', 'createdAt'] }]
      })) as any[];

      stats.total = matches.length;
      stats.pending = matches.filter(m => m.quoteRequest?.status === 'MATCHING').length;
      stats.matched = matches.filter(m => ['PROPOSED', 'MATCHED'].includes(m.quoteRequest?.status)).length;
      stats.completed = matches.filter(m => m.quoteRequest?.status === 'COMPLETED').length;

      matches.sort((a, b) => new Date(b.quoteRequest.createdAt).getTime() - new Date(a.quoteRequest.createdAt).getTime());
      recentQuotes = matches.slice(0, 4).map(m => ({
        id: m.quoteRequestId,
        serviceType: m.quoteRequest.serviceType,
        address: m.quoteRequest.address,
        status: m.quoteRequest.status,
        createdAt: m.quoteRequest.createdAt
      }));
    } else {
      // [일반 고객용]
      const quotes = (await QuoteRequest.findAll({
        where: { memberId: userId },
        order: [['createdAt', 'DESC']]
      })) as any[];

      stats.total = quotes.length;
      stats.pending = quotes.filter(q => q.status === 'MATCHING').length;
      stats.matched = quotes.filter(q => ['PROPOSED', 'MATCHED'].includes(q.status)).length;
      stats.completed = quotes.filter(q => q.status === 'COMPLETED').length;

      recentQuotes = quotes.slice(0, 4).map(q => ({
        id: q.id,
        serviceType: q.serviceType,
        address: q.address,
        status: q.status,
        createdAt: q.createdAt
      }));
    }

    res.json({ success: true, data: { stats, recentQuotes } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: '대시보드 데이터 조회 실패' });
  }
});

// ==========================================
// 2. 카테고리별 견적 목록 (페이징)
// GET /api/mypage/quotes?serviceType=BUILDING&page=1&limit=10
// ==========================================
router.get('/quotes', checkLevel, async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    const { id: userId, level } = req.user;
    const { serviceType } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const isPartner = level >= 2;
    let rows: any[] = [];
    let count = 0;

    if (isPartner) {
      // 💡 [수정] 쿼리 결과를 임시 변수에 받고 as any 배열로 처리
      const matchResult = await QuoteMatch.findAndCountAll({
        where: { memberId: userId },
        include: [{
          model: QuoteRequest,
          as: 'quoteRequest',
          where: serviceType ? { serviceType } : undefined,
          attributes: ['id', 'serviceType', 'customerName', 'address', 'status', 'createdAt']
        }],
        order: [['createdAt', 'DESC']],
        limit,
        offset
      });
      
      count = matchResult.count;
      const matchRows = matchResult.rows as any[];
      rows = matchRows.map(m => m.quoteRequest);
    } else {
      const whereClause: any = { memberId: userId };
      if (serviceType) whereClause.serviceType = serviceType;

      const quoteResult = await QuoteRequest.findAndCountAll({
        where: whereClause,
        attributes: ['id', 'serviceType', 'address', 'status', 'createdAt'],
        order: [['createdAt', 'DESC']],
        limit,
        offset
      });
      
      count = quoteResult.count;
      rows = quoteResult.rows;
    }

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: '목록 조회 실패' });
  }
});

// ==========================================
// 3. 진행 상태 변경 (업체 전용)
// PATCH /api/mypage/quotes/:id/status
// ==========================================
router.patch('/quotes/:id/status', checkLevel, async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    const { level } = req.user;
    if (level < 2) return res.status(403).json({ success: false, message: '상태 변경 권한이 없습니다.' });

    const quoteId = req.params.id;
    const { status } = req.body;

    const quote = await QuoteRequest.findByPk(Number(quoteId));
    if (!quote) return res.status(404).json({ success: false, message: '견적을 찾을 수 없습니다.' });

    await quote.update({ status });
    res.json({ success: true, message: '상태가 변경되었습니다.', data: quote });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: '상태 변경 실패' });
  }
});

// ==========================================
// 4. 리뷰 및 답글 작성
// POST /api/mypage/quotes/:id/review
// ==========================================
router.post('/quotes/:id/review', checkLevel, async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    const { level, id: userId } = req.user;
    const quoteId = req.params.id;
    const { rating, content, reply } = req.body;

    const quote = (await QuoteRequest.findByPk(Number(quoteId))) as any;
    if (!quote) return res.status(404).json({ success: false, message: '견적을 찾을 수 없습니다.' });

    if (level === 1) {
      if (quote.memberId !== userId) return res.status(403).json({ success: false, message: '권한이 없습니다.' });
      if (quote.status !== 'COMPLETED') return res.status(400).json({ success: false, message: '시공 완료 후 리뷰 작성이 가능합니다.' });
      
      await quote.update({ reviewRating: rating, reviewContent: content });
      res.json({ success: true, message: '리뷰가 등록되었습니다.' });

    } else {
      if (!quote.reviewContent) return res.status(400).json({ success: false, message: '고객 리뷰가 존재하지 않습니다.' });
      
      await quote.update({ reviewReply: reply });
      res.json({ success: true, message: '답글이 등록되었습니다.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: '리뷰 처리 실패' });
  }
});

export default router;