import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Member } from '../models/Member';
import { MemberSetting } from '../models/MemberSetting';
import { uploadAny } from '../middlewares/uploadAny';
import nodemailer from 'nodemailer';
import { checkLevel } from '../middlewares/authMiddleware';

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
      companyName,
      isApp // ⭐ 프론트에서 보낸 명시적 플래그 받기
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

    if (isApp === 'true' || isApp === true) {
      // 💡 앱에서 가입한 경우 무조건 최고관리자 레벨 10 부여
      finalLevel = 10;
    } else {
      // 기존 웹 가입 로직 유지
      if (memberType === 'UNION') {
        const setting = await MemberSetting.findByPk(1);
        const useApproval = setting ? setting.getDataValue('useApproval') : false;
        
        if (useApproval) {
          finalLevel = setting?.getDataValue('approvalWaitLevel') ?? 0;
        } else {
          finalLevel = 2;
        }
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
    // 💡 프론트엔드에서 로그인 시 fcm 토큰과 기기 ID도 같이 받습니다.
    const { loginId, password } = req.body;
    console.log(req.body);

    const user = await Member.findOne({ where: { loginId } });
    if (!user) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    }

    const setting = await MemberSetting.findByPk(1);
    const useApproval = setting ? setting.getDataValue('useApproval') : false;
    const approvalWaitLevel = setting ? (setting.getDataValue('approvalWaitLevel') ?? 0) : 0;

    if (useApproval && user.getDataValue('level') === approvalWaitLevel) {
      return res.status(403).json({ success: false, message: '관리자 승인 대기 중입니다. 승인 완료 후 로그인 가능합니다.' });
    }

    const isMatch = await bcrypt.compare(password, user.getDataValue('password') as string);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    }

    const memberId = user.getDataValue('id');

   

    const token = jwt.sign(
      { 
        id: memberId, 
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
        id: memberId,
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

// 로그인 후 클라이언트가 FCM 토큰을 서버로 전송할 때 호출하는 API
router.post('/token', async (req: Request, res: Response) => {
  try {
    // ✨ req.user 대신 req.body에서 memberId를 직접 추출합니다.
    const {  memberId } = req.body;

    if (!memberId) {
      return res.status(400).json({ success: false, message: '회원 ID가 필요합니다.' });
    }


    res.status(200).json({ success: true, message: '푸시 토큰이 등록되었습니다.' });
  } catch (error) {
    console.error('토큰 저장 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 5. 아이디(이메일) 찾기 API
router.post('/find-id', async (req: Request, res: Response) => {
  try {
    const { name, mobile, dob } = req.body;

    const setting = await MemberSetting.findByPk(1);
    if (!setting?.getDataValue('useFindIdPwViaEmail')) {
      return res.status(403).json({ success: false, message: '계정 찾기 기능이 비활성화되어 있습니다.' });
    }

    const method = setting.getDataValue('findIdMethod');
    const whereClause: any = { name };

    if (method === 'PHONE') {
      if (!mobile) return res.status(400).json({ success: false, message: '휴대폰 번호를 입력해 주세요.' });
      whereClause.mobile = mobile;
    } else if (method === 'DOB') {
      if (!dob) return res.status(400).json({ success: false, message: '생년월일을 입력해 주세요.' });
      whereClause.dob = dob;
    }

    const user = await Member.findOne({ where: whereClause });
    if (!user) {
      return res.status(404).json({ success: false, message: '입력하신 정보와 일치하는 계정이 없습니다.' });
    }

    // 보안을 위해 이메일 아이디 일부를 마스킹 처리 (예: in***@naver.com)
    const loginId = user.getDataValue('loginId') as string;
    const [idStr, domain] = loginId.split('@');
    let maskedEmail = loginId;
    
    if (domain) {
      const maskedId = idStr.length > 2 
        ? idStr.substring(0, 2) + '*'.repeat(idStr.length - 2) 
        : idStr + '*';
      maskedEmail = `${maskedId}@${domain}`;
    }

    res.status(200).json({ success: true, email: maskedEmail });
  } catch (error) {
    console.error('아이디 찾기 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 6. 비밀번호 재설정 메일 발송 API
router.post('/find-password', async (req: Request, res: Response) => {
  try {
    const { loginId, name } = req.body;

    const setting = await MemberSetting.findByPk(1);
    if (!setting?.getDataValue('useFindIdPwViaEmail')) {
      return res.status(403).json({ success: false, message: '비밀번호 재설정 기능이 비활성화되어 있습니다.' });
    }

    const user = await Member.findOne({ where: { loginId, name } });
    if (!user) {
      return res.status(404).json({ success: false, message: '일치하는 계정 정보를 찾을 수 없습니다.' });
    }

    // SMTP 정보 확인
    const smtpHost = setting.getDataValue('smtpHost');
    const smtpPort = setting.getDataValue('smtpPort');
    const smtpUser = setting.getDataValue('smtpUser');
    const smtpPassword = setting.getDataValue('smtpPassword');
    const smtpSecure = setting.getDataValue('smtpSecure');

    if (!smtpHost || !smtpUser || !smtpPassword) {
      return res.status(500).json({ success: false, message: '서버에 메일 발송 설정이 완료되지 않았습니다. 관리자에게 문의하세요.' });
    }

    // 1시간 동안만 유효한 임시 JWT 토큰 생성 (비밀번호 변경 페이지에서 검증용)
    const resetToken = jwt.sign(
      { id: user.getDataValue('id'), type: 'PASSWORD_RESET' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Nodemailer 트랜스포터 세팅
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });

    // 메일 내용 구성 (보내는 사람에 브랜드명 포함)
    const clientUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    const resetLink = `${clientUrl}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"인투더" <${smtpUser}>`,
      to: loginId,
      subject: '[인투더] 비밀번호 재설정 안내입니다.',
      html: `
        <div style="font-family: 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #1e293b; font-size: 24px; margin-bottom: 20px;">비밀번호 재설정 안내</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6;">
            <strong>${name}</strong> 회원님, 안녕하세요.<br/>
            요청하신 비밀번호 재설정 링크를 안내해 드립니다.<br/>
            아래 버튼을 클릭하여 새로운 비밀번호를 설정해 주세요.
          </p>
          <div style="text-align: center; margin: 40px 0;">
            <a href="${resetLink}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">비밀번호 재설정하기</a>
          </div>
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 20px;">
            * 본 메일은 발송 전용입니다.<br/>
            * 이 링크는 보안을 위해 발송 후 <strong>1시간 동안만 유효</strong>합니다.<br/>
            * 본인이 재설정을 요청하지 않으셨다면 이 메일을 무시하셔도 안전합니다.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ success: true, message: '비밀번호 재설정 링크가 포함된 메일을 발송했습니다.' });
  } catch (error) {
    console.error('비밀번호 찾기 메일 발송 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류로 인해 메일 발송에 실패했습니다.' });
  }
});
// 7. 실제 비밀번호 변경 (토큰 검증) API
router.put('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: '유효하지 않은 요청입니다.' });
    }

    // JWT 토큰 검증
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ success: false, message: '만료되었거나 유효하지 않은 링크입니다. 비밀번호 찾기를 다시 진행해 주세요.' });
    }

    // 토큰 타입 검증 (로그인 토큰과 구분하기 위함)
    if (decoded.type !== 'PASSWORD_RESET') {
      return res.status(401).json({ success: false, message: '잘못된 토큰 형식입니다.' });
    }

    const memberId = decoded.id;

    // 회원 존재 여부 확인
    const user = await Member.findByPk(memberId);
    if (!user) {
      return res.status(404).json({ success: false, message: '존재하지 않는 회원입니다.' });
    }

    // 비밀번호 암호화 및 업데이트 (Salt 10)
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashedPassword });

    res.status(200).json({ success: true, message: '비밀번호가 성공적으로 변경되었습니다.' });
  } catch (error) {
    console.error('비밀번호 변경 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});
export default router;