// src/routes/socialContributionRoutes.ts
import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'; 
import path from 'path';
import { SocialContribution } from '../models'; // 모델 임포트
import dotenv from 'dotenv';

dotenv.config();
const router = Router();

// ==========================================
// ☁️ AWS S3 클라이언트 및 Multer 설정
// ==========================================
const s3 = new S3Client({
  region: process.env.AWS_REGION as string,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.exe' || ext === '.apk') {
    return cb(new Error('보안상 실행 파일(.exe, .apk)은 업로드할 수 없습니다.'));
  }
  cb(null, true);
};

export const upload = multer({ 
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME as string,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `social-contributions/${uniqueSuffix}${path.extname(originalName)}`);
    }
  }),
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } 
});

// 에디터 이미지 및 일반 첨부파일 구분
const uploadFields = upload.fields([
  { name: 'attachments', maxCount: 10 },
  { name: 'editorImages', maxCount: 20 }
]);

// ==========================================
// 1. 목록 조회 (GET)
// ==========================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;

    const whereClause: any = {};
    if (search) whereClause.title = { [Op.like]: `%${search}%` };
    
    const items = await SocialContribution.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    res.status(200).json({ 
      success: true, 
      data: items.rows, 
      totalCount: items.count,
      totalPages: Math.ceil(items.count / limit),
      currentPage: page 
    });
  } catch (error) {
    console.error('목록 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// ==========================================
// 2. 상세 조회 및 조회수 증가 (GET)
// ==========================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const item = await SocialContribution.findByPk(Number(req.params.id));
    if (!item) return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });

    await item.increment('views', { by: 1 });
    await item.reload();

    res.status(200).json({ success: true, data: item });
  } catch (error) {
    console.error('상세 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// ==========================================
// 3. 등록 (POST)
// ==========================================
router.post('/', uploadFields, async (req: Request, res: Response) => {
  try {
    let { title, content, author, isActive } = req.body;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const attachmentFiles = files?.['attachments'] || [];
    const editorImages = files?.['editorImages'] || [];

    // 에디터 이미지 URL 본문 치환 (cid:파일명 -> S3 URL)
    if (editorImages.length > 0) {
      editorImages.forEach((file: any) => {
        const s3Url = file.location;
        const fileId = path.parse(file.originalname).name;
        content = content.replace(new RegExp(`cid:${fileId}`, 'g'), s3Url);
      });
    }

    let uploadedMediaUrls: string[] = [];
    let thumbnailUrl: string | null = null;

    // 모든 업로드 파일 수집 (첨부파일 + 에디터이미지)
    const allFiles = [...attachmentFiles, ...editorImages];
    if (allFiles.length > 0) {
      uploadedMediaUrls = allFiles.map((file: any) => file.location);
      // 첫 번째 이미지를 썸네일로 지정
      const firstImage = allFiles.find(file => /\.(jpeg|jpg|gif|png|webp)$/i.test(file.originalname));
      if (firstImage) {
        thumbnailUrl = (firstImage as any).location;
      }
    }

    const newItem = await SocialContribution.create({
      title,
      content,
      author: author || '관리자',
      isActive: isActive === 'true' || isActive === true,
      mediaUrls: uploadedMediaUrls.length > 0 ? JSON.stringify(uploadedMediaUrls) : null,
      thumbnailUrl
    });

    res.status(201).json({ success: true, data: newItem, message: '등록되었습니다.' });
  } catch (error) {
    console.error('등록 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// ==========================================
// 4. 수정 (PUT)
// ==========================================
router.put('/:id', uploadFields, async (req: Request, res: Response) => {
  try {
    const item = await SocialContribution.findByPk(Number(req.params.id));
    if (!item) return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });

    const updateData: any = { ...req.body };
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const attachmentFiles = files?.['attachments'] || [];
    const editorImages = files?.['editorImages'] || [];

    // 1. 에디터 이미지 교체
    if (editorImages.length > 0) {
      let finalContent = updateData.content;
      editorImages.forEach((file: any) => {
        const s3Url = file.location;
        const fileId = path.parse(file.originalname).name;
        finalContent = finalContent.replace(new RegExp(`cid:${fileId}`, 'g'), s3Url);
      });
      updateData.content = finalContent;
    }

    // 2. 프론트에서 넘어온 유지할 파일(existingFiles) 처리
    let existingFiles: string[] = [];
    if (req.body.existingFiles) {
      try {
        existingFiles = JSON.parse(req.body.existingFiles);
      } catch (e) {
        console.error('existingFiles 파싱 에러:', e);
      }
    }

    // 3. 기존 첨부파일 목록 확인 및 삭제된 파일 S3에서 제거
    const currentMediaUrlsStr = item.getDataValue('mediaUrls');
    const currentMediaUrls: string[] = currentMediaUrlsStr ? JSON.parse(currentMediaUrlsStr) : [];
    const filesToDelete = currentMediaUrls.filter((url: string) => !existingFiles.includes(url));
    
    for (const fileUrl of filesToDelete) {
      try {
        if (fileUrl.includes('amazonaws.com')) {
          const key = new URL(fileUrl).pathname.substring(1);
          await s3.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME as string,
            Key: decodeURIComponent(key),
          }));
        }
      } catch (delErr) {
        console.error('S3 파일 삭제 실패:', delErr);
      }
    }

    // 4. 파일 배열 병합 및 썸네일 갱신
    const newUploadedMediaUrls = [...attachmentFiles, ...editorImages].map((file: any) => file.location);
    const finalMediaUrls = [...existingFiles, ...newUploadedMediaUrls];

    updateData.mediaUrls = finalMediaUrls.length > 0 ? JSON.stringify(finalMediaUrls) : null;
    const firstImage = finalMediaUrls.find((url: string) => /\.(jpeg|jpg|gif|png|webp)$/i.test(url));
    updateData.thumbnailUrl = firstImage || null;
    
    // boolean 처리
    if (updateData.isActive !== undefined) {
      updateData.isActive = updateData.isActive === 'true' || updateData.isActive === true;
    }

    await item.update(updateData);
    res.status(200).json({ success: true, data: item, message: '수정되었습니다.' });
  } catch (error) {
    console.error('수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// ==========================================
// 5. 삭제 (DELETE)
// ==========================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const item = await SocialContribution.findByPk(Number(req.params.id));
    if (!item) return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });

    // S3 파일 삭제
    const mediaUrlsStr = item.getDataValue('mediaUrls');
    if (mediaUrlsStr) {
      try {
        const urls: string[] = JSON.parse(mediaUrlsStr);
        for (const url of urls) {
          if (url.includes('amazonaws.com')) {
            const key = new URL(url).pathname.substring(1);
            await s3.send(new DeleteObjectCommand({
              Bucket: process.env.AWS_S3_BUCKET_NAME as string,
              Key: decodeURIComponent(key),
            }));
          }
        }
      } catch (delErr) {
        console.error('S3 파일 삭제 실패:', delErr);
      }
    }

    await item.destroy();
    res.status(200).json({ success: true, message: '삭제되었습니다.' });
  } catch (error) {
    console.error('삭제 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

export default router;