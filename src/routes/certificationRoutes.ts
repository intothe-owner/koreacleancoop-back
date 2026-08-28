// src/routes/certificationRoutes.ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fromPath } from 'pdf2pic';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Certification } from '../models'; // 미리 만들어둔 Certification 모델
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

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
// 📁 Multer 로컬 임시 저장 설정 (S3 직행이 아님!)
// ==========================================
const uploadLocal = multer({ dest: 'uploads/temp/' });

// 서버 시작 시 temp 폴더가 없으면 자동 생성 (에러 방지)
const tempDir = 'uploads/temp/';
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// ==========================================
// 1. 인증·인허가 목록 조회 (GET) - ✨ 신규 추가
// ==========================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const certifications = await Certification.findAll({
      order: [['createdAt', 'DESC']] // 최신순 정렬
    });
    res.status(200).json({ success: true, data: certifications });
  } catch (error) {
    console.error('인증서 목록 조회 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ==========================================
// 2. 인증·인허가 등록 (POST)
// ==========================================
router.post('/', uploadLocal.single('file'), async (req: Request, res: Response) => {
  try {
    const { title, issuer, issueDate, description, isActive } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: '파일이 업로드되지 않았습니다.' });
    }

    let finalImagePath = file.path;
    let finalFileName = `cert_${Date.now()}`;
    let contentType = file.mimetype;
    let s3Url = '';

    if (file.mimetype === 'application/pdf') {
      const outputDirectory = 'uploads/temp/';
      const options = {
        density: 300,
        saveFilename: finalFileName,
        savePath: outputDirectory,
        format: 'png',
        width: 800,
        height: 1131
      };

      const storeAsImage = fromPath(file.path, options);
      const resolve = await storeAsImage(1);
      
      finalImagePath = resolve.path as string;
      finalFileName = `${finalFileName}.png`;
      contentType = 'image/png';
    } else {
      const ext = path.extname(file.originalname);
      finalFileName = `${finalFileName}${ext}`;
    }

    const s3Key = `certifications/${finalFileName}`;
    const fileStream = fs.createReadStream(finalImagePath);

    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME as string,
      Key: s3Key,
      Body: fileStream,
      ContentType: contentType,
    }));

    s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    if (file.mimetype === 'application/pdf' && fs.existsSync(finalImagePath)) {
      fs.unlinkSync(finalImagePath);
    }

    const newCert = await Certification.create({
      title,
      issuer,
      issueDate: issueDate || null, // 빈 문자열 처리
      description,
      isActive: isActive === 'true', // FormData로 넘어온 문자열 boolean 처리
      imageUrl: s3Url
    });

    res.status(201).json({ success: true, message: '인증서가 성공적으로 등록되었습니다.', data: newCert });
  } catch (error) {
    console.error('인증서 등록 에러:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ==========================================
// 3. 인증·인허가 수정 (PUT) - ✨ 신규 추가
// ==========================================
router.put('/:id', uploadLocal.single('file'), async (req: Request, res: Response) => {
  try {
    const certId = Number(req.params.id);
    const cert = await Certification.findByPk(certId);

    if (!cert) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: '인증서를 찾을 수 없습니다.' });
    }

    const { title, issuer, issueDate, description, isActive } = req.body;
    const file = req.file;
    let s3Url = cert.getDataValue('imageUrl'); // 기본값: 기존 이미지 URL 유지

    // 새로운 파일이 업로드된 경우 (기존 파일 S3 삭제 후 새 파일 업로드)
    if (file) {
      // (1) 기존 S3 이미지 삭제
      if (s3Url && s3Url.includes('amazonaws.com')) {
        try {
          const key = new URL(s3Url).pathname.substring(1);
          await s3.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME as string,
            Key: decodeURIComponent(key),
          }));
        } catch (delErr) {
          console.error('기존 S3 파일 삭제 실패 (무시하고 계속 진행):', delErr);
        }
      }

      // (2) 새 파일 변환 및 업로드
      let finalImagePath = file.path;
      let finalFileName = `cert_${Date.now()}`;
      let contentType = file.mimetype;

      if (file.mimetype === 'application/pdf') {
        const options = {
          density: 300,
          saveFilename: finalFileName,
          savePath: 'uploads/temp/',
          format: 'png',
          width: 800,
          height: 1131
        };
        const storeAsImage = fromPath(file.path, options);
        const resolve = await storeAsImage(1);
        finalImagePath = resolve.path as string;
        finalFileName = `${finalFileName}.png`;
        contentType = 'image/png';
      } else {
        const ext = path.extname(file.originalname);
        finalFileName = `${finalFileName}${ext}`;
      }

      const s3Key = `certifications/${finalFileName}`;
      await s3.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME as string,
        Key: s3Key,
        Body: fs.createReadStream(finalImagePath),
        ContentType: contentType,
      }));

      s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

      // (3) 로컬 임시 파일 삭제
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      if (file.mimetype === 'application/pdf' && fs.existsSync(finalImagePath)) {
        fs.unlinkSync(finalImagePath);
      }
    }

    // DB 업데이트
    await cert.update({
      title,
      issuer,
      issueDate: issueDate || null,
      description,
      isActive: isActive === 'true',
      imageUrl: s3Url
    });

    res.status(200).json({ success: true, message: '인증서가 수정되었습니다.', data: cert });
  } catch (error) {
    console.error('인증서 수정 에러:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// ==========================================
// 4. 인증·인허가 삭제 (DELETE)
// ==========================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const certId = Number(req.params.id);
    const cert = await Certification.findByPk(certId);

    if (!cert) {
      return res.status(404).json({ success: false, message: '인증서를 찾을 수 없습니다.' });
    }

    const imageUrl = cert.getDataValue('imageUrl');
    if (imageUrl && imageUrl.includes('amazonaws.com')) {
      try {
        const urlObj = new URL(imageUrl);
        const key = urlObj.pathname.substring(1); 
        
        await s3.send(new DeleteObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME as string,
          Key: decodeURIComponent(key),
        }));
      } catch (s3Error) {
        console.error('S3 파일 삭제 실패:', s3Error);
      }
    }

    await cert.destroy();

    res.status(200).json({ success: true, message: '인증서가 삭제되었습니다.' });
  } catch (error) {
    console.error('인증서 삭제 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

export default router;