import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// 💡 여기서 콘솔로 먼저 찍어봅니다!
console.log('🔍 [DB 환경변수 확인]');
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASS:', process.env.DB_PASS ? '****** (비밀번호 존재함)' : '❌ 없음');
console.log('DB_HOST:', process.env.DB_HOST);

export const sequelize = new Sequelize(
  process.env.DB_NAME as string,
  process.env.DB_USER as string,
  process.env.DB_PASS as string,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: false,
    timezone: '+09:00',
  }
);