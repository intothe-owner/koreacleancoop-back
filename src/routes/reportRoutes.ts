// src/routes/reportRoutes.ts
import express, { Request, Response } from 'express';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import path from 'path';
import { WorkReport, QuoteRequest } from '../models';
import { checkLevel } from '../middlewares/authMiddleware';
import dotenv from 'dotenv';
import ejs from 'ejs';
import puppeteer from 'puppeteer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Member } from '../models'; // Member 추가 임포트 필요
dotenv.config();
const router = express.Router();

// ==========================================
// ☁️ AWS S3 클라이언트 설정
// ==========================================
const s3 = new S3Client({
  region: process.env.AWS_REGION as string,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
});

// ==========================================
// 📁 Multer S3 업로드 설정 (보고서 전용)
// ==========================================
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  // 이미지 파일만 허용 (보안)
  if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
    return cb(new Error('보고서에는 이미지 파일만 첨부할 수 있습니다.'));
  }
  cb(null, true);
};

export const uploadReportImages = multer({ 
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME as string,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      // S3에 저장될 경로: uploads/reports/랜덤파일명.확장자
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `uploads/reports/${uniqueSuffix}${path.extname(originalName)}`);
    }
  }),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 1장당 10MB 제한
});

// ==========================================
// 작업 보고서(사진 4장) 업로드 및 DB 저장
// POST /api/reports/:quoteId
// ==========================================
router.post('/:quoteId', checkLevel, uploadReportImages.fields([
  { name: 'entranceImg', maxCount: 1 },
  { name: 'beforeImg', maxCount: 1 },
  { name: 'duringImg', maxCount: 1 },
  { name: 'afterImg', maxCount: 1 }
]), async (req: Request, res: Response) => {
  try {
    // 1. 권한 체크 (조합원 이상만 가능)
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }
    const { id: userId, level } = req.user;
    if (level < 2) {
      return res.status(403).json({ success: false, message: '보고서 작성 권한이 없습니다.' });
    }

    const quoteId = req.params.quoteId;
    const { workDate } = req.body;
    
    // multer-s3가 처리한 파일 정보 캐스팅
    const files = req.files as { [fieldname: string]: Express.MulterS3.File[] } | undefined;

    // 2. 파일 누락 체크
    if (!files || !files.entranceImg || !files.beforeImg || !files.duringImg || !files.afterImg) {
      return res.status(400).json({ success: false, message: '4장의 사진(입구/작업전/작업중/작업후)을 모두 첨부해야 합니다.' });
    }

    // 3. S3 URL 추출 (location 속성에 S3 주소가 담깁니다)
    const entranceUrl = files.entranceImg[0].location;
    const beforeUrl = files.beforeImg[0].location;
    const duringUrl = files.duringImg[0].location;
    const afterUrl = files.afterImg[0].location;

    // 4. DB 저장
    const report = await WorkReport.create({
      quoteRequestId: Number(quoteId),
      memberId: userId,
      workDate: workDate,
      entranceImg: entranceUrl,
      beforeImg: beforeUrl,
      duringImg: duringUrl,
      afterImg: afterUrl,
    });

    // 5. 견적 상태를 자동으로 '시공 완료(COMPLETED)'로 변경
    await QuoteRequest.update(
      { status: 'COMPLETED' }, 
      { where: { id: quoteId } }
    );

    res.status(201).json({ 
      success: true, 
      message: '작업 보고서가 성공적으로 저장 및 전송되었습니다.', 
      data: report 
    });
  } catch (error: any) {
    console.error('보고서 업로드 에러:', error);
    
    // Multer 파일 필터 에러 처리
    if (error.message && error.message.includes('이미지 파일만')) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(500).json({ success: false, message: '서버 에러가 발생하여 보고서를 저장하지 못했습니다.' });
  }
});

// ==========================================
// 📄 작업 보고서 PDF 생성 및 S3 업로드 후 URL 반환
// GET /api/reports/:quoteId/pdf
// ==========================================
router.get('/:quoteId/pdf', async (req: Request, res: Response) => {
  try {
    const quoteId = Number(req.params.quoteId);

    // 1. 견적 및 보고서 데이터 조회
    const quote = await QuoteRequest.findByPk(quoteId) as any;
    if (!quote) return res.status(404).json({ success: false, message: '견적 정보를 찾을 수 없습니다.' });

    const report = await WorkReport.findOne({ where: { quoteRequestId: quoteId } }) as any;
    if (!report) return res.status(404).json({ success: false, message: '작성된 보고서가 없습니다.' });

    // 파트너(업체) 정보 조회
    const partner = await Member.findByPk(report.memberId) as any;

    // 2. 템플릿에 전달할 데이터 매핑
    const serviceNameMap: Record<string, string> = {
      BUILDING: '건물위생관리', AIRCON: '냉난방기종합세척', PEST: '소독방역', PUBLIC: '공공시설청소'
    };

    const templateData = {
      customerName: quote.customerName,
      serviceName: serviceNameMap[quote.serviceType] || '작업',
      companyName: partner?.companyName || partner?.name || '업체명 미상',
      address: `${quote.address} ${quote.addressDetail}`,
      customerPhone: quote.customerPhone,
      workDate: report.workDate, 
      workerName: partner?.name || '작업자',
      representativeName: partner?.companyName || partner?.name,
      entranceImg: report.entranceImg,
      beforeImg: report.beforeImg,
      duringImg: report.duringImg,
      afterImg: report.afterImg,
    };

    // 3. EJS 템플릿 렌더링
    const ejsPath = path.join(__dirname, '../views/reportTemplate.ejs');
    const htmlContent = await ejs.renderFile(ejsPath, templateData);

    // 🌟 4. Puppeteer를 이용해 HTML -> PDF 변환 (Docker 옵션 적용)
    const browser = await puppeteer.launch({
      headless: true,
      // 🌟 Dockerfile에서 설정한 OS 경로 강제 적용
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, 
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // 🌟 도커 환경 필수 (메모리 부족 방지)
        '--disable-gpu'
      ] 
    });
    
    const page = await browser.newPage();
    
    // 💡 타입 에러 해결 및 외부 이미지 로딩 대기
    await page.setContent(htmlContent, { waitUntil: 'load' });
    await page.waitForNetworkIdle({ idleTime: 500 }); // S3 등 외부 네트워크 완전 대기
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    
    await browser.close();

    // 5. AWS S3에 PDF 업로드
    const fileName = `uploads/reports/pdfs/report_${quoteId}_${Date.now()}.pdf`;
    
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME as string,
      Key: fileName,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      ContentDisposition: `attachment; filename="report_${quoteId}.pdf"`
    }));

    const pdfS3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

    res.json({
      success: true,
      message: 'PDF가 생성되었습니다.',
      url: pdfS3Url
    });

  } catch (error) {
    console.error('PDF 생성 오류:', error);
    res.status(500).json({ success: false, message: 'PDF 생성 중 오류가 발생했습니다.' });
  }
});
export default router;