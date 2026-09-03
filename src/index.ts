import express, { Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { sequelize } from './config/database';
import './models/'; // 모델 임포트
import settingRoutes from './routes/settingRoutes';
import memberSettingRoutes from './routes/memberSettingRoutes';
import menuRoutes from './routes/menuRoutes';
import pageRoutes from './routes/pageRoutes';
import boardConfigRoutes from './routes/boardConfigRoutes';
import aiRoutes from './routes/aiRoutes';
import boardRoutes from './routes/boardRoutes';
import authRoutes from './routes/authRoutes';
import popupRoutes from './routes/popupRoutes';
import visitorRoutes from './routes/visitorRoutes';
import memberRoutes from './routes/memberRoutes';
import certificationRoutes from './routes/certificationRoutes';
import coopMemberRoutes from './routes/coopMemberRoutes';
import qualificationsRouter from './routes/qualificationsRoutes';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// 💡 1. HTTP 서버 생성 및 Socket.io 결합
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true
  }
});

// 라우터에서 io 객체를 사용할 수 있도록 app에 등록
app.set('io', io);

// 소켓 연결 이벤트 핸들러
io.on('connection', (socket) => {
  console.log(`🔌 소켓 클라이언트 연결됨: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`❌ 소켓 클라이언트 연결 해제: ${socket.id}`);
  });
});

// CORS 설정
const corsOptions: cors.CorsOptions = {
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
};
console.log(process.env.GEMINI_API_KEY);
app.use(cors(corsOptions));

// Body Parser 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일 제공
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// API 라우터 연결
app.use('/api/settings', settingRoutes);
app.use('/api/member-settings', memberSettingRoutes);
app.use('/api/menus', menuRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/board-configs', boardConfigRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/popups', popupRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/certifications', certificationRoutes);
app.use('/api', coopMemberRoutes);
app.use('/api/qualifications', qualificationsRouter);

const syncOptions = process.env.NODE_ENV === 'production' ? {} : { alter: true };

// DB 동기화 및 서버 실행 (app.listen 대신 server.listen 사용)
sequelize.sync(syncOptions)
  .then(() => {
    console.log('✅ 데이터베이스 연결 및 테이블 동기화 완료');
    server.listen(PORT, () => {
      console.log(`🚀 Node.js Backend Server & Socket.io is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ 데이터베이스 연결 실패:', error);
  });