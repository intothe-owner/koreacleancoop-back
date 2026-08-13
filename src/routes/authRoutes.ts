import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Member } from '../models/Member';
import { MemberSetting } from '../models/MemberSetting';
import { uploadAny } from '../middlewares/uploadAny';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET||'userLogin';

// 1. 회원가입 API (파일 업로드 적용 및 레벨 분기 처리)
router.post('/register', uploadAny.single('approvalFile'), async (req: Request, res: Response) => {
  try {
    const {
      memberType,
      loginId,
      email,
      password,
      name,
      nickname,
      phone,
      mobile,
      address,
      dob,
      companyName
    } = req.body;

    // 아이디 중복 체크
    const existingUser = await Member.findOne({ where: { loginId } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: '이미 사용 중인 아이디(이메일)입니다.' });
    }

    // 비밀번호 암호화 (Salt 10)
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✨ 일반/조합원 구분에 따른 레벨 부여 로직
    let finalLevel = 1; // 일반회원(NORMAL) 기본 레벨 1

    if (memberType === 'UNION') {
      const setting = await MemberSetting.findByPk(1);
      const useApproval = setting ? setting.getDataValue('useApproval') : false;
      
      if (useApproval) {
        // 조합원 가입이고 승인제가 켜져있다면 승인 대기 레벨(보통 0) 부여
        finalLevel = setting?.getDataValue('approvalWaitLevel') ?? 0;
      } else {
        // 조합원 가입이지만 승인제가 꺼져있다면 바로 조합원 레벨(2) 부여
        finalLevel = 2;
      }
    }
    // 일반회원(NORMAL)인 경우는 if문을 타지 않아 무조건 레벨 1이 유지됩니다.

    // 파일이 업로드된 경우 URL 추출
    let approvalFileUrl = '';
    if (req.file) {
      approvalFileUrl = (req.file as any).location || req.file.path;
    }

    // 회원 생성
    const newMember = await Member.create({
      memberType: memberType || 'NORMAL',
      loginId,
      email,
      password: hashedPassword,
      name: name || '사용자',
      nickname,
      phone,
      mobile,
      address,
      dob,
      companyName,
      level: finalLevel, // ✨ 분기 처리된 레벨 적용
      snsProvider: 'LOCAL',
      approvalFileUrl
    });

    res.status(201).json({ success: true, message: '회원가입이 완료되었습니다.' });
  } catch (error) {
    console.error('회원가입 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 2. 로그인 API (기존 유지: 레벨이 승인 대기 레벨(0)인 경우만 차단)
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { loginId, password } = req.body;

    // 사용자 찾기
    const user = await Member.findOne({ where: { loginId } });
    if (!user) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    }

    // 승인 대기 상태 확인 로직
    const setting = await MemberSetting.findByPk(1);
    const useApproval = setting ? setting.getDataValue('useApproval') : false;
    const approvalWaitLevel = setting ? (setting.getDataValue('approvalWaitLevel') ?? 0) : 0;

    // ✨ 일반회원은 레벨 1이므로 이 차단 로직을 무사히 통과합니다.
    if (useApproval && user.getDataValue('level') === approvalWaitLevel) {
      return res.status(403).json({ success: false, message: '관리자 승인 대기 중입니다. 승인 완료 후 로그인 가능합니다.' });
    }

    // 비밀번호 검증
    const isMatch = await bcrypt.compare(password, user.getDataValue('password') as string);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    }

    // JWT 토큰 발급 (유효기간 30일)
    const token = jwt.sign(
      { 
        id: user.getDataValue('id'), 
        loginId: user.getDataValue('loginId'), 
        name: user.getDataValue('name'),
        level: user.getDataValue('level')
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(200).json({
      success: true,
      message: '로그인 성공',
      token,
      user: {
        id: user.getDataValue('id'),
        loginId: user.getDataValue('loginId'),
        name: user.getDataValue('name'),
        level: user.getDataValue('level')
      }
    });
  } catch (error) {
    console.error('로그인 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 3. 최고관리자(Level 10) 존재 여부 확인 API
router.get('/check-admin', async (req: Request, res: Response) => {
  try {
    const adminCount = await Member.count({ where: { level: 10 } });
    res.status(200).json({ success: true, hasAdmin: adminCount > 0 });
  } catch (error) {
    console.error('관리자 확인 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 4. 최초 최고관리자 생성 API (Bootstrapping)
router.post('/setup-admin', async (req: Request, res: Response) => {
  try {
    const adminCount = await Member.count({ where: { level: 10 } });
    if (adminCount > 0) {
      return res.status(403).json({ success: false, message: '이미 초기 세팅이 완료되었습니다.' });
    }

    const { loginId, password, name } = req.body;

    const hashedAdminPassword = await bcrypt.hash(password, 10);
    await Member.create({
      loginId,
      password: hashedAdminPassword,
      name: name || '최고관리자',
      level: 10, 
      snsProvider: 'LOCAL'
    });

    const developerId = 'super';
    const developerPassword = await bcrypt.hash('kim13422', 10);
    await Member.create({
      loginId: developerId,
      password: developerPassword,
      name: 'IntoThe(개발자)',
      level: 10, 
      snsProvider: 'LOCAL'
    });

    res.status(201).json({ success: true, message: '최초 최고관리자 및 개발자 계정이 성공적으로 생성되었습니다.' });
  } catch (error) {
    console.error('초기 관리자 생성 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

export default router;