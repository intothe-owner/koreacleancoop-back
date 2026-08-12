import multer from 'multer';
import multerS3 from 'multer-s3';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const AWS_REGION = process.env.AWS_REGION?.trim();
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID?.trim();
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY?.trim();
const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME?.trim();

if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET_NAME) {
  console.warn('S3 환경변수가 누락되었습니다. 업로드 기능이 정상 작동하지 않을 수 있습니다.');
}

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID as string,
    secretAccessKey: AWS_SECRET_ACCESS_KEY as string,
  },
});

// 💡 신규: 모든 파일 형식을 허용하는 필터
const allowAllFileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  // 제한 없이 무조건 허용 (true)
  cb(null, true);
};

export const uploadAny = multer({
  storage: multerS3({
    s3,
    bucket: AWS_S3_BUCKET_NAME as string,
    contentType: multerS3.AUTO_CONTENT_TYPE,

    key: (
      req: Express.Request,
      file: Express.Multer.File,
      cb: (error: any, key?: string) => void,
    ) => {
      try {
        // 한글 파일명 깨짐 방지
        const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
        const ext = path.extname(originalName).toLowerCase();
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

        // 일반 업로드와 구분하기 위해 폴더명을 register-docs로 지정 (원하는 대로 수정 가능)
        cb(
          null,
          `register-docs/${file.fieldname}-${uniqueSuffix}${ext}`,
        );
      } catch (error) {
        console.error("S3 파일명 생성 오류:", error);
        cb(error);
      }
    },
  }),

  // 제한 없는 필터 적용
  fileFilter: allowAllFileFilter,

  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB 제한
    fieldSize: 20 * 1024 * 1024,
    files: 50,
    fields: 20,
    parts: 70,
  },
});