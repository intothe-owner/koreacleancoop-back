// src/routes/customerRoutes.ts
import { Router, Request, Response } from 'express';
import { Achievement, Customer } from '../models';

const router = Router();

// ==========================================
// [ 주요 실적 (Achievement) API ]
// ==========================================
router.get('/achievements', async (req: Request, res: Response) => {
  try {
    // 💡 수정됨: dateStr 대신 year와 dateOrMonth를 기준으로 내림차순 정렬
    const achievements = await Achievement.findAll({ 
      order: [
        ['year', 'DESC'],
        ['dateOrMonth', 'DESC']
      ] 
    });
    res.json({ success: true, data: achievements });
  } catch (error) {
    console.error('실적 조회 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

router.post('/achievements', async (req: Request, res: Response) => {
  try {
    // 💡 수정됨: 변경된 필드(year, dateOrMonth) 명시적 추출 및 저장
    const { year, dateOrMonth, title, description, isActive } = req.body;
    const newAchievement = await Achievement.create({
      year,
      dateOrMonth,
      title,
      description,
      isActive
    });
    res.status(201).json({ success: true, data: newAchievement });
  } catch (error) {
    console.error('실적 등록 에러:', error);
    res.status(500).json({ success: false, message: '등록 실패' });
  }
});

router.put('/achievements/:id', async (req: Request, res: Response) => {
  try {
    const achievement = await Achievement.findByPk(Number(req.params.id));
    if (!achievement) return res.status(404).json({ success: false, message: '찾을 수 없습니다.' });
    
    // 💡 수정됨: 변경된 필드(year, dateOrMonth) 명시적 업데이트
    const { year, dateOrMonth, title, description, isActive } = req.body;
    await achievement.update({
      year,
      dateOrMonth,
      title,
      description,
      isActive
    });
    res.json({ success: true, data: achievement });
  } catch (error) {
    console.error('실적 수정 에러:', error);
    res.status(500).json({ success: false, message: '수정 실패' });
  }
});

router.delete('/achievements/:id', async (req: Request, res: Response) => {
  try {
    const achievement = await Achievement.findByPk(Number(req.params.id));
    if (!achievement) return res.status(404).json({ success: false, message: '찾을 수 없습니다.' });
    await achievement.destroy();
    res.json({ success: true, message: '삭제 완료' });
  } catch (error) {
    res.status(500).json({ success: false, message: '삭제 실패' });
  }
});

// ==========================================
// [ 고객 현황 (Customer) API ]
// ==========================================
router.get('/customers', async (req: Request, res: Response) => {
  try {
    const customers = await Customer.findAll({ order: [['id', 'DESC']] });
    res.json({ success: true, data: customers });
  } catch (error) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

router.post('/customers', async (req: Request, res: Response) => {
  try {
    const { name, isActive } = req.body;
    const newCustomer = await Customer.create({ name, isActive });
    res.status(201).json({ success: true, data: newCustomer });
  } catch (error) {
    res.status(500).json({ success: false, message: '등록 실패' });
  }
});

router.put('/customers/:id', async (req: Request, res: Response) => {
  try {
    const customer = await Customer.findByPk(Number(req.params.id));
    if (!customer) return res.status(404).json({ success: false, message: '찾을 수 없습니다.' });
    
    const { name, isActive } = req.body;
    await customer.update({ name, isActive });
    res.json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: '수정 실패' });
  }
});

router.delete('/customers/:id', async (req: Request, res: Response) => {
  try {
    const customer = await Customer.findByPk(Number(req.params.id));
    if (!customer) return res.status(404).json({ success: false, message: '찾을 수 없습니다.' });
    await customer.destroy();
    res.json({ success: true, message: '삭제 완료' });
  } catch (error) {
    res.status(500).json({ success: false, message: '삭제 실패' });
  }
});

export default router;