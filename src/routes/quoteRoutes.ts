import express, { Request, Response } from 'express';
import { Op, literal } from 'sequelize';
import { sequelize } from '../config/database';
import { QuoteRequest, QuoteMatch, Member } from '../models';

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

// ==========================================
// 1. 견적문의 등록 및 1단계(5km 이내) 자동 매칭
// ==========================================
router.post('/', async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { customerName, customerPhone, address, addressDetail, latitude, longitude, serviceType, details, preferredDate } = req.body;

    // QuoteRequest에는 location POINT 객체 생성 삽입
    const location = literal(`ST_GeomFromText('POINT(${longitude} ${latitude})')`);

    const newQuote = (await QuoteRequest.create({
      customerName, customerPhone, address, addressDetail, latitude, longitude, location,
      serviceType, details, preferredDate, currentMatchStage: 0, status: 'MATCHING'
    }, { transaction: t })) as any;

    const range = MATCH_RANGES[0];

    // 🌟 핵심 수정: Member 테이블의 longitude, latitude(DECIMAL)를 MySQL POINT 함수로 묶어서 거리 계산
    const distanceQuery = literal(`ST_Distance_Sphere(POINT(\`Member\`.\`longitude\`, \`Member\`.\`latitude\`), ST_GeomFromText('POINT(${longitude} ${latitude})'))`);

    const nearbyMembers = await Member.findAll({
      attributes: ['id', [distanceQuery, 'distanceInMeters']],
      where: {
        // 위경도가 등록된 업체만 대상으로 설정 (NULL 에러 방지)
        latitude: { [Op.not]: null },
        longitude: { [Op.not]: null },
        [Op.and]: sequelize.where(distanceQuery, { [Op.between]: [range.min, range.max] })
      },
      transaction: t
    });

    const matchData = nearbyMembers.map((member: any) => ({
      quoteRequestId: newQuote.id,
      memberId: member.id,
      distance: (member.getDataValue('distanceInMeters') / 1000).toFixed(2), // 미터를 km로 변환
      matchStage: 0,
      status: 'WAITING'
    }));

    if (matchData.length > 0) {
      await QuoteMatch.bulkCreate(matchData, { transaction: t });
    }

    await t.commit();
    res.status(201).json({ success: true, data: newQuote, matchedCount: matchData.length });
  } catch (error) {
    await t.rollback();
    console.error(error);
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
      attributes: { exclude: ['location'] } // GEOMETRY 제외
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
              attributes: ['id', 'companyName', 'name', 'phone'] // 기업명 추가
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
    
    // 🌟 확장 매칭에서도 Member.longitude와 Member.latitude를 사용하도록 수정
    const distanceQuery = literal(`ST_Distance_Sphere(POINT(\`Member\`.\`longitude\`, \`Member\`.\`latitude\`), ST_GeomFromText('POINT(${quote.longitude} ${quote.latitude})'))`);

    const existingMatches = await QuoteMatch.findAll({ 
      where: { quoteRequestId: quote.id }, 
      attributes: ['memberId'] 
    });
    const excludeIds = existingMatches.map((m: any) => m.memberId);

    const newMembers = await Member.findAll({
      attributes: ['id', [distanceQuery, 'distanceInMeters']],
      where: {
        latitude: { [Op.not]: null }, // 위경도 값이 있는 회원만 조회
        longitude: { [Op.not]: null },
        id: { [Op.notIn]: excludeIds },
        [Op.and]: sequelize.where(distanceQuery, { [Op.between]: [range.min, range.max] })
      }
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

export default router;