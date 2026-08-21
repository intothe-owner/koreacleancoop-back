// src/routes/popupRoutes.ts
import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import path from 'path'; // ✨ 파일명(id) 추출을 위해 추가
import { Popup } from '../models/Popup';
import { upload } from '../middlewares/upload'; 

const router = Router();

// ✨ 단일 업로드 대신 에디터 이미지와 대표 첨부파일을 함께 받을 수 있도록 필드 설정
const uploadFields = upload.fields([
  { name: 'attachment', maxCount: 1 },
  { name: 'editorImages', maxCount: 20 }
]);

// 1. 관리자용: 전체 팝업 목록 조회
router.get('/', async (req: Request, res: Response) => {
  try {
    const popups = await Popup.findAll({ order: [['createdAt', 'DESC']] });
    res.status(200).json({ success: true, data: popups });
  } catch (error) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 2. 프론트엔드용: 현재 활성화된(기간 내에 있는) 팝업만 조회
router.get('/active', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const activePopups = await Popup.findAll({
      where: {
        isActive: true,
        startDate: { [Op.lte]: now }, // 시작일이 지금보다 과거이거나 같음
        endDate: { [Op.gte]: now }    // 종료일이 지금보다 미래이거나 같음
      }
    });
    res.status(200).json({ success: true, data: activePopups });
  } catch (error) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 3. 팝업 생성 (파일 업로드 및 에디터 이미지 치환 포함)
router.post('/', uploadFields, async (req: Request, res: Response) => {
  try {
    const data = { ...req.body };
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    
    // 💡 1. 대표 이미지(단일 첨부) 처리
    if (files && files['attachment'] && files['attachment'].length > 0) {
      data.attachmentUrl = (files['attachment'][0] as any).location;
    }
    
    // 💡 2. 에디터 내부 이미지 처리 (cid 치환)
    const editorImages = files?.['editorImages'] || [];
    if (editorImages.length > 0 && data.content) {
      editorImages.forEach((file: any) => {
        const s3Url = file.location || `/uploads/${file.filename}`;
        const fileId = path.parse(file.originalname).name;
        // content 내의 <img src="cid:xxx"> 를 실제 업로드된 URL로 치환
        data.content = data.content.replace(new RegExp(`cid:${fileId}`, 'g'), s3Url);
      });
    }

    // Boolean 형변환
    data.isActive = data.isActive === 'true' || data.isActive === true;

    const popup = await Popup.create(data);
    res.status(201).json({ success: true, data: popup });
  } catch (error) {
    console.error('팝업 생성 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 4. 팝업 수정
router.put('/:id', uploadFields, async (req: Request, res: Response) => {
  try {
    const data = { ...req.body };
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    
    // 💡 1. 대표 이미지 처리
    if (files && files['attachment'] && files['attachment'].length > 0) {
      data.attachmentUrl = (files['attachment'][0] as any).location;
    }
    
    // 💡 2. 에디터 내부 이미지 처리 (cid 치환)
    const editorImages = files?.['editorImages'] || [];
    if (editorImages.length > 0 && data.content) {
      editorImages.forEach((file: any) => {
        const s3Url = file.location || `/uploads/${file.filename}`;
        const fileId = path.parse(file.originalname).name;
        data.content = data.content.replace(new RegExp(`cid:${fileId}`, 'g'), s3Url);
      });
    }
    
    if (data.isActive !== undefined) {
      data.isActive = data.isActive === 'true' || data.isActive === true;
    }

    await Popup.update(data, { where: { id: req.params.id } });
    const updatedPopup = await Popup.findByPk(req.params.id as string);
    res.status(200).json({ success: true, data: updatedPopup });
  } catch (error) {
    console.error('팝업 수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 5. 팝업 삭제
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await Popup.destroy({ where: { id: req.params.id } });
    res.status(200).json({ success: true, message: '삭제되었습니다.' });
  } catch (error) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

export default router;