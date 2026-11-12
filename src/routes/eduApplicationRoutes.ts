// src/routes/eduApplicationRoutes.ts
import { Router, Request, Response } from 'express';
import { EduApplication, EduSchedule } from '../models';

const router = Router();

// 1. 교육 신청 목록 전체 조회 (관리자용)
router.get('/', async (req: Request, res: Response) => {
  try {
    const applications = await EduApplication.findAll({
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: EduSchedule,
          as: 'scheduleInfo',
          attributes: ['id', 'title', 'eduDate', 'location', 'status'] // 연결된 일정 정보도 함께 가져옴
        }
      ]
    });

    res.status(200).json(applications);
  } catch (error) {
    console.error('교육 신청 목록 조회 에러:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

// 2. 단일 교육 신청 내역 조회 (관리자용)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const application = await EduApplication.findByPk(Number(id), {
      include: [
        {
          model: EduSchedule,
          as: 'scheduleInfo',
          attributes: ['id', 'title', 'eduDate', 'location', 'status']
        }
      ]
    });

    if (!application) {
      return res.status(404).json({ message: '해당 교육 신청 내역을 찾을 수 없습니다.' });
    }

    res.status(200).json(application);
  } catch (error) {
    console.error('교육 신청 단일 조회 에러:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

// 3. 교육 신청 등록 (사용자 프론트엔드용)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { scheduleId, eduName, applicantName, contact, inquiry } = req.body;

    // 필수값 체크
    if (!eduName || !applicantName || !contact) {
      return res.status(400).json({ message: '교육명, 신청자명, 연락처는 필수 입력 항목입니다.' });
    }

    const newApplication = await EduApplication.create({
      scheduleId: scheduleId || null,
      eduName,
      applicantName,
      contact,
      inquiry,
    });

    res.status(201).json({ message: '교육 신청이 완료되었습니다.', data: newApplication });
  } catch (error) {
    console.error('교육 신청 등록 에러:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

// 4. 교육 신청 정보 수정 (관리자용 - 필요시 이름/연락처 등 수정)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { applicantName, contact, inquiry } = req.body;

    const application = await EduApplication.findByPk(Number(id));
    if (!application) {
      return res.status(404).json({ message: '해당 교육 신청 내역을 찾을 수 없습니다.' });
    }

    await application.update({ applicantName, contact, inquiry });

    res.status(200).json({ message: '교육 신청 내역이 수정되었습니다.', data: application });
  } catch (error) {
    console.error('교육 신청 수정 에러:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

// 5. 교육 신청 내역 삭제 (관리자용)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const application = await EduApplication.findByPk(Number(id));
    if (!application) {
      return res.status(404).json({ message: '해당 교육 신청 내역을 찾을 수 없습니다.' });
    }

    await application.destroy(); // 논리 삭제 (paranoid: true)

    res.status(200).json({ message: '교육 신청 내역이 삭제되었습니다.' });
  } catch (error) {
    console.error('교육 신청 삭제 에러:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

export default router;