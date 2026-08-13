import { Request, Response, NextFunction, Router } from 'express';
import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'zerov_secret_key_2026';

// Request 객체에 user 타입 추가
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// 💡 미들웨어: 토큰 만료 시 401 에러 반환 추가
export const checkLevel = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  req.user = { level: 1 }; // 기본값: 비회원(Level 1)
  
  // 디버깅용: 토큰이 잘 들어오는지 확인
  console.log("전달받은 authHeader:", authHeader);

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded; // { id, loginId, name, level }
    } catch (err: any) {
      console.warn('JWT 토큰 검증 실패 또는 만료:', err.message);
      
      // 토큰이 만료되었거나 잘못된 경우 즉시 401 에러 응답
      return res.status(401).json({ 
        success: false, 
        message: '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.',
        isTokenExpired: true 
      });
    }
  }
  next();
};