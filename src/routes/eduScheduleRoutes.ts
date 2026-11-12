// src/routes/eduScheduleRoutes.ts
import { Router, Request, Response } from 'express';
import { EduSchedule } from '../models';
import { Op } from 'sequelize';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { activeOnly, status } = req.query; // 🌟 status 파라미터 추가

    const whereCondition: any = {};
    
    // 🌟 프론트엔드에서 특정 상태값(예: status=모집중)을 넘겼을 때 최우선 적용
    if (status) {
      whereCondition.status = status;
    } 
    // 기존 관리자/사용자페이지 목록용 (준비중, 모집중 모두 노출)
    else if (activeOnly === 'true') {
      whereCondition.status = {
        [Op.in]: ['준비중', '모집중']
      };
    }

    const schedules = await EduSchedule.findAll({
      where: whereCondition,
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json(schedules);
  } catch (error) {
    console.error('교육 일정 목록 조회 에러:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});


// 2. 단일 교육 일정 조회
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const schedule = await EduSchedule.findByPk(Number(id));

    if (!schedule) {
      return res.status(404).json({ message: '해당 교육 일정을 찾을 수 없습니다.' });
    }

    res.status(200).json(schedule);
  } catch (error) {
    console.error('교육 일정 단일 조회 에러:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

// 3. 교육 일정 등록 (관리자용)
router.post('/', async (req: Request, res: Response) => {
  try {
    // eduDate 대신 startDate, endDate 받기
    const { title, startDate, endDate, location, status } = req.body;

    const newSchedule = await EduSchedule.create({
      title,
      startDate,
      endDate,
      location,
      status: status || '준비중',
    });

    res.status(201).json(newSchedule);
  } catch (error) {
    console.error('교육 일정 등록 에러:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

// 4. 교육 일정 수정 (관리자용)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // eduDate 대신 startDate, endDate 받기
    const { title, startDate, endDate, location, status } = req.body;

    const schedule = await EduSchedule.findByPk(Number(id));
    if (!schedule) {
      return res.status(404).json({ message: '해당 교육 일정을 찾을 수 없습니다.' });
    }

    await schedule.update({ title, startDate, endDate, location, status });

    res.status(200).json(schedule);
  } catch (error) {
    console.error('교육 일정 수정 에러:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

// 5. 교육 일정 삭제 (관리자용)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const schedule = await EduSchedule.findByPk(Number(id));
    if (!schedule) {
      return res.status(404).json({ message: '해당 교육 일정을 찾을 수 없습니다.' });
    }

    await schedule.destroy(); // 논리 삭제 (paranoid: true)

    res.status(200).json({ message: '교육 일정이 삭제되었습니다.' });
  } catch (error) {
    console.error('교육 일정 삭제 에러:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

export default router;