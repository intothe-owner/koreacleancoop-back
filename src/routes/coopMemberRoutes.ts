// src/routes/coopMemberRoutes.ts
import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { CoopMember } from '../models'; // 모델 임포트
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
// 📁 Multer 로컬 임시 저장 설정
// ==========================================
const uploadLocal = multer({ dest: 'uploads/temp/' });

const tempDir = 'uploads/temp/';
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// ==========================================
// 1. 조합원 목록 조회 및 검색 (GET)
// ==========================================
router.get('/coop-members', async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, search, regionSido, regionSigungu, isActive } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // 💡 검색 조건(Where) 구성
    const whereClause: any = {};

    // 1) 지역 필터 (시/도, 시/군/구)
    if (regionSido) whereClause.regionSido = regionSido;
    if (regionSigungu) whereClause.regionSigungu = regionSigungu;
    
    // 2) 기업명 검색
    if (search) {
      whereClause.companyName = { [Op.like]: `%${search}%` };
    }

    // 3) 노출 여부 필터 (프론트에서 'true' 또는 'false'를 보냈을 때)
    if (isActive !== undefined && isActive !== '') {
      whereClause.isActive = isActive === 'true';
    }

    const members = await CoopMember.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']], // 최신순 정렬
      limit: Number(limit),
      offset: offset,
    });

    res.status(200).json({ 
      success: true, 
      data: members.rows,
      totalCount: members.count,
      totalPages: Math.ceil(members.count / Number(limit)),
      currentPage: Number(page)
    });
  } catch (error) {
    console.error('조합원 목록 조회 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ==========================================
// 2. 조합원 상세 조회 (GET)
// ==========================================
router.get('/coop-members/:id', async (req: Request, res: Response) => {
  try {
    const member = await CoopMember.findByPk(Number(req.params.id));
    if (!member) {
      return res.status(404).json({ success: false, message: '조합원 정보를 찾을 수 없습니다.' });
    }
    res.status(200).json({ success: true, data: member });
  } catch (error) {
    console.error('조합원 상세 조회 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// ==========================================
// 3. 조합원 등록 (POST)
// ==========================================
router.post('/coop-members', uploadLocal.single('logo'), async (req: Request, res: Response) => {
  try {
    const { 
      companyName, contact, homepageUrl, address, addressDetail, 
      latitude, longitude, regionSido, regionSigungu, isActive 
    } = req.body;
    
    const file = req.file;
    let s3Url = null;

    // 로고 파일이 첨부된 경우 S3 업로드
    if (file) {
      const ext = path.extname(file.originalname);
      const finalFileName = `logo_${Date.now()}${ext}`;
      const s3Key = `logos/${finalFileName}`;
      
      const fileStream = fs.createReadStream(file.path);

      await s3.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME as string,
        Key: s3Key,
        Body: fileStream,
        ContentType: file.mimetype,
      }));

      s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
      
      // 로컬 임시 파일 삭제
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }

    const newMember = await CoopMember.create({
      companyName,
      contact: contact || null,
      homepageUrl: homepageUrl || null,
      address,
      addressDetail: addressDetail || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      regionSido: regionSido || null,
      regionSigungu: regionSigungu || null,
      isActive: isActive === 'true',
      logoUrl: s3Url
    });

    res.status(201).json({ success: true, message: '조합원이 성공적으로 등록되었습니다.', data: newMember });
  } catch (error) {
    console.error('조합원 등록 에러:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ==========================================
// 4. 조합원 정보 수정 (PUT)
// ==========================================
router.put('/coop-members/:id', uploadLocal.single('logo'), async (req: Request, res: Response) => {
  try {
    const memberId = Number(req.params.id);
    const member = await CoopMember.findByPk(memberId);

    if (!member) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: '조합원을 찾을 수 없습니다.' });
    }

    const { 
      companyName, contact, homepageUrl, address, addressDetail, 
      latitude, longitude, regionSido, regionSigungu, isActive 
    } = req.body;
    
    const file = req.file;
    let s3Url = member.getDataValue('logoUrl'); // 기존 로고 유지

    // 새로운 로고가 업로드된 경우
    if (file) {
      // 1) 기존 S3 이미지 삭제
      if (s3Url && s3Url.includes('amazonaws.com')) {
        try {
          const key = new URL(s3Url).pathname.substring(1);
          await s3.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME as string,
            Key: decodeURIComponent(key),
          }));
        } catch (delErr) {
          console.error('기존 로고 삭제 실패:', delErr);
        }
      }

      // 2) 새 이미지 S3 업로드
      const ext = path.extname(file.originalname);
      const finalFileName = `logo_${Date.now()}${ext}`;
      const s3Key = `logos/${finalFileName}`;

      await s3.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME as string,
        Key: s3Key,
        Body: fs.createReadStream(file.path),
        ContentType: file.mimetype,
      }));

      s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
      
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }

    // DB 업데이트
    await member.update({
      companyName,
      contact: contact || null,
      homepageUrl: homepageUrl || null,
      address,
      addressDetail: addressDetail || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      regionSido: regionSido || null,
      regionSigungu: regionSigungu || null,
      isActive: isActive === 'true',
      logoUrl: s3Url
    });

    res.status(200).json({ success: true, message: '조합원 정보가 수정되었습니다.', data: member });
  } catch (error) {
    console.error('조합원 수정 에러:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// ==========================================
// 5. 조합원 삭제 (DELETE)
// ==========================================
router.delete('/coop-members/:id', async (req: Request, res: Response) => {
  try {
    const memberId = Number(req.params.id);
    const member = await CoopMember.findByPk(memberId);

    if (!member) {
      return res.status(404).json({ success: false, message: '조합원을 찾을 수 없습니다.' });
    }

    const logoUrl = member.getDataValue('logoUrl');
    
    // 로고가 있으면 S3에서 파일 삭제
    if (logoUrl && logoUrl.includes('amazonaws.com')) {
      try {
        const urlObj = new URL(logoUrl);
        const key = urlObj.pathname.substring(1); 
        
        await s3.send(new DeleteObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME as string,
          Key: decodeURIComponent(key),
        }));
      } catch (s3Error) {
        console.error('S3 파일 삭제 실패:', s3Error);
      }
    }

    // DB 데이터 삭제
    await member.destroy();

    res.status(200).json({ success: true, message: '조합원이 삭제되었습니다.' });
  } catch (error) {
    console.error('조합원 삭제 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

export default router;