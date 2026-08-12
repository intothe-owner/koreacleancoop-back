import { Router, Request, Response } from 'express';
import { SiteSetting } from '../models/SiteSetting';
import { upload } from '../middlewares/upload';

const router = Router();

// GET 로직은 기존과 동일... (생략)
router.get('/', async (req: Request, res: Response) => {
  try {
    const [setting] = await SiteSetting.findOrCreate({
      where: { id: 1 },
      defaults: {
        siteName: '초기 사이트명',
        displayMode: 'RESPONSIVE',
        themeMode: 'LIGHT',
        nightModeStartTime: '18:00:00',
        nightModeEndTime: '06:00:00',
      }
    });
    res.status(200).json({ success: true, data: setting });
  } catch (error) {
    console.error('사이트 설정 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// PUT /api/settings - 파일 업로드 미들웨어 추가 (logo와 favicon을 동시에 받음)
router.put('/', upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'favicon', maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const updateData: any = { ...req.body };
    const protocol = req.protocol; // 'http' 또는 'https'
    const host = req.get('host');    // 'localhost:3000' 또는 'yourdomain.com' 등
    const baseUrl = `${protocol}://${host}`;
    // 파일이 업로드된 경우 URL 경로 반영
    if (req.files) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (files['logo'] && files['logo'][0]) {
        // 서버의 도메인(또는 호스트) + 경로를 조합하여 URL을 만듭니다.
        // 예: /uploads/logo-12345.png
        updateData.logoUrl = (files['logo'][0] as any).location;
      }
      if (files['favicon'] && files['favicon'][0]) {
        updateData.faviconUrl = (files['favicon'][0] as any).location; 
      }
    }
    console.log(updateData);

    await SiteSetting.update(updateData, { where: { id: 1 } });

    const updatedSetting = await SiteSetting.findByPk(1);
    res.status(200).json({ success: true, data: updatedSetting, message: '설정이 저장되었습니다11.' });
  } catch (error) {
    console.error('사이트 설정 수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

export default router;