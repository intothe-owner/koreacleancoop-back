import { Router, Request, Response } from 'express';
import { MemberSetting } from '../models/MemberSetting';
import { Policy } from '../models/Policy'; // 신규 생성한 Policy 모델 임포트

const router = Router();

// GET /api/member-settings - 회원 설정 및 약관 조회
router.get('/', async (req: Request, res: Response) => {
  try {
    const [setting] = await MemberSetting.findOrCreate({
      where: { id: 1 },
      defaults: {
        memberSystemMode: 'ALL',
        useEmailAsLoginId: true,
        useEmail: true,
        useName: true,
        useNickname: true,
        useMobile: true,
        useTermsOfService: true,
        usePrivacyPolicy: true,
        useApproval: false,
        approvalType: 'DOCUMENT',
        approvalWaitLevel: 0, // ✨ 신규 추가: DB 초기 생성 시 기본 대기 레벨 0 할당
        defaultLevel: 1,
        levelNames: {
          0: "차단/대기", 1: "일반회원", 2: "정회원", 3: "우수회원",
          4: "VIP회원", 5: "특별회원", 6: "부관리자", 7: "운영자",
          8: "부서장", 9: "관리자", 10: "최고관리자"
        },
        useKakaoLogin: false,
        useNaverLogin: false,
        useGoogleLogin: false,
      }
    });

    // 활성화된 약관/정책 조회
    const termsPolicy:any = await Policy.findOne({ where: { type: 'TERMS', isActive: true } });
    const privacyPolicy:any = await Policy.findOne({ where: { type: 'PRIVACY', isActive: true } });

    // 프론트엔드로 전달할 데이터 병합
    const responseData = {
      ...setting.toJSON(),
      termsContent: termsPolicy ? termsPolicy.content : '',
      privacyContent: privacyPolicy ? privacyPolicy.content : ''
    };

    res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    console.error('회원 설정 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// PUT /api/member-settings - 회원 설정 및 약관 업데이트
router.put('/', async (req: Request, res: Response) => {
  try {
    // 프론트엔드에서 넘어온 데이터 중 정책 관련 내용과 설정 분리
    const { termsContent, privacyContent, ...updateData } = req.body;
    
    const formattedData: any = {};
    for (const key in updateData) {
      const val = updateData[key];
      if (val === 'true') formattedData[key] = true;
      else if (val === 'false') formattedData[key] = false;
      else formattedData[key] = val;
    }

    // 1. 회원 기본 설정 업데이트
    await MemberSetting.update(formattedData, { where: { id: 1 } });
    
    // 2. 이용약관(TERMS) 저장 또는 업데이트
    if (termsContent !== undefined) {
      const terms = await Policy.findOne({ where: { type: 'TERMS', isActive: true } });
      if (terms) {
        await terms.update({ content: termsContent });
      } else {
        await Policy.create({ type: 'TERMS', version: 'v1.0', content: termsContent, isActive: true });
      }
    }

    // 3. 개인정보처리방침(PRIVACY) 저장 또는 업데이트
    if (privacyContent !== undefined) {
      const privacy = await Policy.findOne({ where: { type: 'PRIVACY', isActive: true } });
      if (privacy) {
        await privacy.update({ content: privacyContent });
      } else {
        await Policy.create({ type: 'PRIVACY', version: 'v1.0', content: privacyContent, isActive: true });
      }
    }

    const updatedSetting = await MemberSetting.findByPk(1);
    res.status(200).json({ success: true, data: updatedSetting, message: '저장되었습니다.' });
  } catch (error) {
    console.error('회원 설정 수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

export default router;