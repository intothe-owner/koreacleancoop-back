import multer from 'multer';
import multerS3 from 'multer-s3';
import {
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const AWS_REGION = process.env.AWS_REGION?.trim();
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID?.trim();
const AWS_SECRET_ACCESS_KEY =
  process.env.AWS_SECRET_ACCESS_KEY?.trim();
const AWS_S3_BUCKET_NAME =
  process.env.AWS_S3_BUCKET_NAME?.trim();

if (!AWS_REGION) {
  throw new Error('AWS_REGION 환경변수가 없습니다.');
}

if (!AWS_ACCESS_KEY_ID) {
  throw new Error('AWS_ACCESS_KEY_ID 환경변수가 없습니다.');
}

if (!AWS_SECRET_ACCESS_KEY) {
  throw new Error('AWS_SECRET_ACCESS_KEY 환경변수가 없습니다.');
}

if (!AWS_S3_BUCKET_NAME) {
  throw new Error('AWS_S3_BUCKET_NAME 환경변수가 없습니다.');
}

console.log('S3 설정 확인:', {
  region: AWS_REGION,
  bucket: AWS_S3_BUCKET_NAME,
  accessKeyLoaded: true,
  secretAccessKeyLoaded: true,
});

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

export async function checkS3Bucket(): Promise<void> {
  try {
    await s3.send(
      new HeadBucketCommand({
        Bucket: AWS_S3_BUCKET_NAME,
      }),
    );

    console.log(`S3 버킷 연결 성공: ${AWS_S3_BUCKET_NAME}`);
  } catch (error: any) {
    console.error('S3 버킷 연결 실패:', {
      bucket: AWS_S3_BUCKET_NAME,
      region: AWS_REGION,
      errorName: error?.name,
      errorMessage: error?.message,
      statusCode: error?.$metadata?.httpStatusCode,
    });

    throw error;
  }
}

const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowed =
    file.mimetype.startsWith('image/') ||
    file.mimetype.startsWith('video/') ||
    file.mimetype.startsWith('audio/');

  if (allowed) {
    cb(null, true);
  } else {
    cb(
      new Error(
        '이미지, 동영상, 오디오 파일만 업로드 가능합니다.',
      ),
    );
  }
};

export const upload = multer({
  storage: multerS3({
    s3,
    bucket: AWS_S3_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,

    key: (
      req: Express.Request,
      file: Express.Multer.File,
      cb: (error: any, key?: string) => void,
    ) => {
      try {
        const originalName = Buffer.from(
          file.originalname,
          "latin1",
        ).toString("utf8");

        const ext = path.extname(originalName).toLowerCase();
        const uniqueSuffix =
          `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

        cb(
          null,
          `uploads/${file.fieldname}-${uniqueSuffix}${ext}`,
        );
      } catch (error) {
        console.error("S3 파일명 생성 오류:", error);
        cb(error);
      }
    },
  }),

  fileFilter,

  limits: {
    fileSize: 50 * 1024 * 1024,
    fieldSize: 20 * 1024 * 1024,
    files: 50,
    fields: 20,
    parts: 70,
  },
});