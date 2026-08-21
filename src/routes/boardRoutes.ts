// src/routes/boardRoutes.ts
import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import multer from 'multer';
import fs from 'fs';
import multerS3 from 'multer-s3';
// 💡 S3 파일 삭제를 위해 DeleteObjectCommand 추가
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'; 
import path from 'path';
import { Post, Comment, BoardConfig, Member } from '../models'; // ✨ Member 추가
import { checkLevel } from '../middlewares/authMiddleware';
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
// 📁 Multer S3 업로드 설정
// ==========================================
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
      cb(null, `uploads/${uniqueSuffix}${path.extname(originalName)}`);
    }
  }),
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } 
});
const uploadFields = upload.fields([
  { name: 'attachments', maxCount: 10 },
  { name: 'editorImages', maxCount: 20 }
]);

const findBoardConfig = async (param: string) => {
  return await BoardConfig.findOne({
    where: {
      [Op.or]: [
        { tableName: param },
        ...(isNaN(Number(param)) ? [] : [{ id: Number(param) }]) 
      ]
    }
  });
};

// ==========================================
// 1. 게시글 (Post) 라우터
// ==========================================

// 1-1. 게시글 목록 조회
router.get('/:boardId/posts', checkLevel, async (req: Request, res: Response) => {
  try {
    const boardIdParam = req.params.boardId as string; 
    const boardConfig = await findBoardConfig(boardIdParam);
    
    if (!boardConfig) return res.status(404).json({ success: false, message: '게시판 설정을 찾을 수 없습니다.' });
    if (req.user.level < boardConfig.getDataValue('readLevel')) return res.status(403).json({ success: false, message: '목록 열람 권한이 없습니다.' });
    
    const configId = boardConfig.get('id') as number; 
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const search = req.query.search as string;
    const category = req.query.category as string;

    const whereClause: any = { boardConfigId: configId };
    if (category) whereClause.category = category;
    if (search) whereClause.title = { [Op.like]: `%${search}%` };
    
    const posts = await Post.findAndCountAll({
      where: whereClause, 
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    res.status(200).json({ 
      success: true, 
      data: posts.rows, 
      totalCount: posts.count,
      totalPages: Math.ceil(posts.count / limit),
      currentPage: page 
    });
  } catch (error) {
    console.error('게시글 목록 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 1-2. 게시글 작성
router.post('/:boardId/posts', checkLevel, uploadFields, async (req: Request, res: Response) => {
  try {
    const boardIdParam = req.params.boardId as string;
    const boardConfig = await findBoardConfig(boardIdParam);
    
    if (!boardConfig) return res.status(404).json({ success: false, message: '게시판 설정을 찾을 수 없습니다.' });
    if (req.user.level < boardConfig.getDataValue('writeLevel')) return res.status(403).json({ success: false, message: '글쓰기 권한이 없습니다.' });

    const configId = boardConfig.get('id') as number;
    let { writerName, title, content, memberId, password, isNotice, category, extraData } = req.body;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const attachmentFiles = files?.['attachments'] || [];
    const editorImages = files?.['editorImages'] || [];

    if (editorImages.length > 0) {
      editorImages.forEach((file: any) => {
        const s3Url = file.location || `/uploads/${file.filename}`;
        const fileId = path.parse(file.originalname).name;
        content = content.replace(new RegExp(`cid:${fileId}`, 'g'), s3Url);
      });
    }

    let uploadedMediaUrls: string[] = [];
    let thumbnailUrl: string | null = null;

    if (attachmentFiles.length > 0) {
      uploadedMediaUrls = attachmentFiles.map((file: any) => file.location || `/uploads/${file.filename}`);
      const firstImage = attachmentFiles.find(file => /\.(jpeg|jpg|gif|png|webp)$/i.test(file.originalname));
      if (firstImage) {
        thumbnailUrl = (firstImage as any).location;
      }
    }

    const newPost = await Post.create({
      boardConfigId: configId,
      writerName,
      title,
      content,
      memberId: memberId || null,
      password: password || null,
      isNotice: isNotice === 'true' || isNotice === true,
      category: category || null,
      extraData: extraData ? JSON.parse(extraData) : null,
      mediaUrls: uploadedMediaUrls.length > 0 ? JSON.stringify(uploadedMediaUrls) : null,
      thumbnailUrl,
    });

   

    res.status(201).json({ success: true, data: newPost, message: '게시글이 작성되었습니다.' });
  } catch (error: any) {
    if (error.message && error.message.includes('보안상')) return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 1-3. 게시글 상세 조회
router.get('/posts/:postId', checkLevel, async (req: Request, res: Response) => {
  try {
    const postId = Number(req.params.postId);
    const post = await Post.findByPk(postId); 

    if (!post) return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });

    const boardConfig = await BoardConfig.findByPk(post.getDataValue('boardConfigId'));
    if (boardConfig && req.user.level < boardConfig.getDataValue('readLevel')) {
      return res.status(403).json({ success: false, message: '이 게시글을 읽을 수 있는 권한이 없습니다.' });
    }

    await post.increment('hitCount', { by: 1 }); 
    await post.reload();

    const prevPost = await Post.findOne({
      where: { 
        boardConfigId: post.getDataValue('boardConfigId'), 
        id: { [Op.gt]: postId } 
      },
      order: [['id', 'ASC']],
      attributes: ['id', 'title']
    });

    const nextPost = await Post.findOne({
      where: { 
        boardConfigId: post.getDataValue('boardConfigId'), 
        id: { [Op.lt]: postId } 
      },
      order: [['id', 'DESC']],
      attributes: ['id', 'title']
    });

    res.status(200).json({ 
      success: true, 
      data: post,
      prevPost: prevPost,
      nextPost: nextPost 
    });
  } catch (error) {
    console.error('게시글 상세 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 1-4. 게시글 수정
router.put('/posts/:postId', checkLevel, uploadFields, async (req: Request, res: Response) => {
  try {
    const postId = Number(req.params.postId);
    const post = await Post.findByPk(postId);
    
    if (!post) return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });

    const isAuthor = req.user.id && req.user.id === post.getDataValue('memberId');
    const isAdmin = req.user.level >= 9;
    const isGuestMatched = !post.getDataValue('memberId') && req.body.password && req.body.password === post.getDataValue('password');
    
    if (!isAuthor && !isAdmin && !isGuestMatched) return res.status(403).json({ success: false, message: '수정 권한이 없습니다.' });

    const updateData: any = { ...req.body };
    if (updateData.extraData && typeof updateData.extraData === 'string') updateData.extraData = JSON.parse(updateData.extraData);
    
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const attachmentFiles = files?.['attachments'] || [];
    const editorImages = files?.['editorImages'] || [];

    // 1. 에디터 이미지 교체
    if (editorImages.length > 0) {
      let finalContent = updateData.content;
      editorImages.forEach((file: any) => {
        const s3Url = file.location || `/uploads/${file.filename}`;
        const fileId = path.parse(file.originalname).name;
        finalContent = finalContent.replace(new RegExp(`cid:${fileId}`, 'g'), s3Url);
      });
      updateData.content = finalContent;
    }

    // 💡 2. 프론트에서 넘어온 유지할 파일(existingFiles) 처리
    let existingFiles: string[] = [];
    if (req.body.existingFiles) {
      try {
        existingFiles = JSON.parse(req.body.existingFiles);
      } catch (e) {
        console.error('existingFiles 파싱 에러:', e);
      }
    }

    // DB에 있던 원래 첨부파일 목록 가져오기
    const currentMediaUrlsStr = post.getDataValue('mediaUrls');
    const currentMediaUrls: string[] = currentMediaUrlsStr ? JSON.parse(currentMediaUrlsStr) : [];

    // 💡 3. 삭제된 파일(원래 있었지만 프론트에서 제외된 파일) S3 삭제 처리
    const filesToDelete = currentMediaUrls.filter((url: string) => !existingFiles.includes(url));
    
    for (const fileUrl of filesToDelete) {
      try {
        if (fileUrl.includes('amazonaws.com')) {
          const urlObj = new URL(fileUrl);
          const key = urlObj.pathname.substring(1); // 앞에 '/' 제거
          await s3.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME as string,
            Key: decodeURIComponent(key), // 한글/특수문자 파일명 고려
          }));
          console.log(`S3 파일 삭제 완료: ${key}`);
        }
      } catch (delErr) {
        console.error('S3 파일 삭제 실패:', delErr);
      }
    }

    // 💡 4. 파일 배열 병합 (유지할 기존 파일 + 새 업로드 파일)
    const newUploadedMediaUrls = attachmentFiles.map((file: any) => file.location || `/uploads/${file.filename}`);
    const finalMediaUrls = [...existingFiles, ...newUploadedMediaUrls];

    updateData.mediaUrls = finalMediaUrls.length > 0 ? JSON.stringify(finalMediaUrls) : null;
    
    // 💡 5. 썸네일 재설정 (병합된 전체 목록 중 첫 번째 이미지로)
    const firstImage = finalMediaUrls.find((url: string) => /\.(jpeg|jpg|gif|png|webp)$/i.test(url));
    updateData.thumbnailUrl = firstImage || null;

    await Post.update(updateData, { where: { id: postId } });
    const updatedPost = await Post.findByPk(postId);
    res.status(200).json({ success: true, data: updatedPost, message: '게시글이 수정되었습니다.' });
  } catch (error) {
    console.error('게시글 수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 1-5. 게시글 삭제
router.delete('/posts/:postId', checkLevel, async (req: Request, res: Response) => {
  try {
    const postId = Number(req.params.postId);
    const post = await Post.findByPk(postId);
    
    if (!post) return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });

    const isAuthor = req.user.id && req.user.id === post.getDataValue('memberId');
    const isAdmin = req.user.level >= 9;
    
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ success: false, message: '삭제 권한이 없습니다.' });
    }

    // 게시글 삭제 전 S3 첨부파일 제거 (선택사항)
    const mediaUrlsStr = post.getDataValue('mediaUrls');
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
        console.error('게시글 삭제 중 S3 파일 삭제 실패:', delErr);
      }
    }

    await Post.destroy({ where: { id: postId } });
    res.status(200).json({ success: true, message: '게시글이 삭제되었습니다.' });
  } catch (error) {
    console.error('게시글 삭제 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// ==========================================
// 2. 댓글 (Comment) 라우터
// ==========================================

router.get('/posts/:postId/comments', async (req: Request, res: Response) => {
  try {
    const postId = Number(req.params.postId);
    const comments = await Comment.findAll({
      where: { postId },
      order: [['createdAt', 'ASC']]
    });
    res.status(200).json({ success: true, data: comments });
  } catch (error) {
    console.error('댓글 목록 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

router.post('/posts/:postId/comments', checkLevel, async (req: Request, res: Response) => {
  try {
    const postId = Number(req.params.postId);
    const post = await Post.findByPk(postId);
    if (!post) return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });

    const boardConfig = await BoardConfig.findByPk(post.getDataValue('boardConfigId'));
    
    if (!boardConfig?.getDataValue('useComment')) {
      return res.status(400).json({ success: false, message: '댓글을 사용할 수 없는 게시판입니다.' });
    }
    if (req.user.level < boardConfig.getDataValue('commentWriteLevel')) {
      return res.status(403).json({ success: false, message: '댓글 작성 권한이 없습니다.' });
    }

    const { writerName, password, content, parentId } = req.body;

    const newComment = await Comment.create({
      postId,
      memberId: req.user.id || null,
      writerName,
      password: password || null,
      content,
      parentId: parentId || null
    });

    res.status(201).json({ success: true, data: newComment, message: '댓글이 작성되었습니다.' });
  } catch (error) {
    console.error('댓글 작성 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

router.put('/comments/:commentId', checkLevel, async (req: Request, res: Response) => {
  try {
    const commentId = Number(req.params.commentId);
    const comment = await Comment.findByPk(commentId);
    if (!comment) return res.status(404).json({ success: false, message: '댓글을 찾을 수 없습니다.' });

    const isAuthor = req.user.id && req.user.id === comment.getDataValue('memberId');
    const isAdmin = req.user.level >= 9;

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ success: false, message: '댓글을 수정할 권한이 없습니다.' });
    }

    const { content } = req.body;
    await Comment.update({ content }, { where: { id: commentId } });
    const updatedComment = await Comment.findByPk(commentId);

    res.status(200).json({ success: true, data: updatedComment, message: '댓글이 수정되었습니다.' });
  } catch (error) {
    console.error('댓글 수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

router.delete('/comments/:commentId', checkLevel, async (req: Request, res: Response) => {
  try {
    const commentId = Number(req.params.commentId);
    const comment = await Comment.findByPk(commentId);
    if (!comment) return res.status(404).json({ success: false, message: '댓글을 찾을 수 없습니다.' });

    const isAuthor = req.user.id && req.user.id === comment.getDataValue('memberId');
    const isAdmin = req.user.level >= 9;

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ success: false, message: '댓글을 삭제할 권한이 없습니다.' });
    }

    await Comment.destroy({ where: { id: commentId } });
    res.status(200).json({ success: true, message: '댓글이 삭제되었습니다.' });
  } catch (error) {
    console.error('댓글 삭제 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});
export default router; 