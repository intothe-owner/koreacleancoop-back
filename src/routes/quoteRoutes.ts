import express, { Request, Response } from 'express';
import { Op, literal } from 'sequelize';
import { sequelize } from '../config/database';
import { QuoteRequest, QuoteMatch, Member } from '../models';
import { checkLevel } from '../middlewares/authMiddleware'; 

const router = express.Router();

// 거리 매칭 구간 정의 (단위: 미터)
const MATCH_RANGES = [
  { min: 0, max: 5000 },          // Stage 0: 0 ~ 5km
  { min: 5000, max: 10000 },      // Stage 1: 6 ~ 10km
  { min: 10000, max: 20000 },     // Stage 2: 11 ~ 20km
  { min: 20000, max: 30000 },     // Stage 3: 21 ~ 30km
  { min: 30000, max: 50000 },     // Stage 4: 31 ~ 50km
  { min: 50000, max: 9999999 }    // Stage 5: 51km 이상
];

// 한 번에 매칭될 최대 업체 수 (랜덤 추출 기준)
const MAX_MATCH_COUNT = 5; 

// ==========================================
// 1. 견적문의 등록 및 자동 점진적 확장 랜덤 매칭
// ==========================================
router.post('/', checkLevel, async (req: Request, res: Response) => {
  const { 
    customerName, customerPhone, address, addressDetail, 
    latitude, longitude, serviceType, details, preferredDate,
    password 
  } = req.body;

  const memberId = req.user?.id || null;

  if (!memberId && !password) {
    return res.status(400).json({ success: false, message: '비회원 견적 신청 시 조회용 비밀번호가 반드시 필요합니다.' });
  }

  if (!latitude || !longitude) {
    return res.status(400).json({ success: false, message: '정확한 주소 좌표(위도, 경도)가 필요합니다. 주소 검색을 다시 시도해주세요.' });
  }

  const t = await sequelize.transaction();
  try {
    const location = literal(`ST_GeomFromText('POINT(${longitude} ${latitude})')`);

    // 견적서 우선 생성 (초기 스테이지 0으로 세팅)
    const newQuote = (await QuoteRequest.create({
      memberId: memberId, 
      password: password || null,
      customerName, 
      customerPhone, 
      address, 
      addressDetail, 
      latitude, 
      longitude, 
      location,
      serviceType, 
      details, 
      preferredDate, 
      currentMatchStage: 0, 
      status: 'MATCHING'
    }, { transaction: t })) as any;

    let matchData: any[] = [];
    let matchedStage = 0;

    // 🌟 [핵심 수정] 0단계부터 순차적으로 탐색 (Loop)
    for (let stage = 0; stage < MATCH_RANGES.length; stage++) {
      const range = MATCH_RANGES[stage];
      const distanceQuery = literal(`ST_Distance_Sphere(POINT(\`Member\`.\`longitude\`, \`Member\`.\`latitude\`), ST_GeomFromText('POINT(${longitude} ${latitude})'))`);

      const nearbyMembers = await Member.findAll({
        attributes: ['id', [distanceQuery, 'distanceInMeters']],
        where: {
          latitude: { [Op.not]: null },
          longitude: { [Op.not]: null },
          level: { [Op.between]: [2, 9] }, // 레벨 2~9 회원만 매칭
          [Op.and]: sequelize.where(distanceQuery, { [Op.between]: [range.min, range.max] })
        },
        order: sequelize.random(), // 🌟 랜덤 정렬 추출 (동일 반경 내 공평한 매칭)
        limit: MAX_MATCH_COUNT,    // 🌟 최대 5곳까지만 랜덤으로 매칭 (무한정 매칭 방지)
        transaction: t
      });

      if (nearbyMembers.length > 0) {
        matchData = nearbyMembers.map((member: any) => ({
          quoteRequestId: newQuote.id,
          memberId: member.id,
          distance: (member.getDataValue('distanceInMeters') / 1000).toFixed(2),
          matchStage: stage,
          status: 'WAITING'
        }));
        
        matchedStage = stage;
        break; // 🌟 업체를 1곳 이상 찾았다면 다음 반경으로 넓히지 않고 즉시 중단
      }
    }

    // 매칭된 업체가 있다면 DB 삽입 및 견적의 스테이지 업데이트
    if (matchData.length > 0) {
      await QuoteMatch.bulkCreate(matchData, { transaction: t });
      await newQuote.update({ currentMatchStage: matchedStage }, { transaction: t });
    }

    await t.commit();
    res.status(201).json({ 
      success: true, 
      data: newQuote, 
      matchedCount: matchData.length,
      matchedStage: matchedStage 
    });
  } catch (error) {
    await t.rollback();
    console.error('견적 등록 에러:', error);
    res.status(500).json({ success: false, message: '견적 요청 등록 및 매칭 실패' });
  }
});

// ==========================================
// 2. 견적문의 목록 조회 (페이징 및 필터링)
// ==========================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const { serviceType, status } = req.query;
    
    const whereClause: any = {};
    if (serviceType) whereClause.serviceType = serviceType;
    if (status) whereClause.status = status;

    const { rows, count } = await QuoteRequest.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      attributes: { exclude: ['location'] }
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: '견적 목록 조회 실패' });
  }
});

// ==========================================
// 3. 견적문의 상세 보기 (매칭된 업체 내역 포함)
// ==========================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const quoteId = req.params.id;

    const quote = await QuoteRequest.findByPk(Number(quoteId), {
      attributes: { exclude: ['location'] },
      include: [
        {
          model: QuoteMatch,
          as: 'matches',
          include: [
            {
              model: Member,
              as: 'member',
              // 🌟 수정: name(담당자명)과 mobile(휴대폰) 추가 호출
              attributes: ['id', 'companyName', 'name', 'phone', 'mobile']
            }
          ]
        }
      ]
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: '견적을 찾을 수 없습니다.' });
    }

    res.json({ success: true, data: quote });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: '견적 상세 조회 실패' });
  }
});

// ==========================================
// 4. 반경 확장 매칭 실행 (수동 또는 스케줄러용)
// ==========================================
router.post('/:id/expand-match', async (req: Request, res: Response) => {
  try {
    const quoteId = req.params.id;
    const quote = (await QuoteRequest.findByPk(Number(quoteId))) as any;

    if (!quote || quote.status !== 'MATCHING') {
      return res.status(400).json({ success: false, message: '매칭 중인 견적이 아닙니다.' });
    }

    const nextStage = quote.currentMatchStage + 1;
    if (nextStage >= MATCH_RANGES.length) {
      return res.status(400).json({ success: false, message: '최대 매칭 반경에 도달했습니다.' });
    }

    const range = MATCH_RANGES[nextStage];
    
    const distanceQuery = literal(`ST_Distance_Sphere(POINT(\`Member\`.\`longitude\`, \`Member\`.\`latitude\`), ST_GeomFromText('POINT(${quote.longitude} ${quote.latitude})'))`);

    const existingMatches = await QuoteMatch.findAll({ 
      where: { quoteRequestId: quote.id }, 
      attributes: ['memberId'] 
    });
    const excludeIds = existingMatches.map((m: any) => m.memberId);

    const newMembers = await Member.findAll({
      attributes: ['id', [distanceQuery, 'distanceInMeters']],
      where: {
        latitude: { [Op.not]: null },
        longitude: { [Op.not]: null },
        level: { [Op.between]: [2, 9] },
        id: { [Op.notIn]: excludeIds },
        [Op.and]: sequelize.where(distanceQuery, { [Op.between]: [range.min, range.max] })
      },
      order: sequelize.random(), // 🌟 수동 확장에서도 랜덤 적용
      limit: MAX_MATCH_COUNT     // 🌟 수동 확장에서도 최대 5곳
    });

    const matchData = newMembers.map((member: any) => ({
      quoteRequestId: quote.id,
      memberId: member.id,
      distance: (member.getDataValue('distanceInMeters') / 1000).toFixed(2),
      matchStage: nextStage,
      status: 'WAITING'
    }));

    if (matchData.length > 0) {
      await QuoteMatch.bulkCreate(matchData);
    }
    
    await quote.update({ currentMatchStage: nextStage });

    res.json({ success: true, stage: nextStage, matchedCount: matchData.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: '반경 확장 매칭 실패' });
  }
});

// ==========================================
// 비회원 견적문의 조회 (이름, 연락처, 비밀번호 매칭)
// POST /api/quotes/guest-search
// ==========================================
router.post('/guest-search', async (req: Request, res: Response) => {
  try {
    const { customerName, customerPhone, password } = req.body;

    if (!customerName || !customerPhone || !password) {
      return res.status(400).json({ success: false, message: '조회 정보를 모두 입력해주세요.' });
    }

    const quote = await QuoteRequest.findOne({
      where: { customerName, customerPhone, password },
      attributes: { exclude: ['location', 'password'] },
      include: [
        {
          model: QuoteMatch,
          as: 'matches',
          include: [
            {
              model: Member,
              as: 'member',
              // 🌟 수정: 비회원 조회 시에도 name, mobile 추가
              attributes: ['id', 'companyName', 'name', 'phone', 'mobile']
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: '입력하신 정보와 일치하는 견적 내역이 없습니다.' });
    }

    const formattedQuote = quote.toJSON();
    
    if (formattedQuote.reviewContent) {
      formattedQuote.review = {
        rating: formattedQuote.reviewRating,
        content: formattedQuote.reviewContent,
        reply: formattedQuote.reviewReply
      };
    } else {
      formattedQuote.review = null;
    }
    
    // 🌟 수정: 기업명이 없으면 담당자명으로, 유선번호가 없으면 휴대폰 번호로 대체
    formattedQuote.matchedPartners = (formattedQuote.matches || []).map((m: any) => ({
      id: m.member?.id,
      companyName: m.member?.companyName || m.member?.name || '업체명 미상',
      phone: m.member?.phone || m.member?.mobile || '연락처 없음'
    }));
    delete formattedQuote.matches;

    res.json({ success: true, data: formattedQuote });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: '조회 중 오류가 발생했습니다.' });
  }
});

export default router;