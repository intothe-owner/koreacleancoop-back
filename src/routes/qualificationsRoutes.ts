import { Router, Request, Response } from "express";
import { Op, Transaction } from "sequelize";
import multer from "multer";
import XLSX from "xlsx";
import { sequelize } from "../config/database";

// 작성해둔 모델 임포트
import { CertificationExam } from "../models/CertificationExam";
import { Question } from "../models/Question";

// 권한 체크 미들웨어 (기존에 사용하시던 것)
import { checkLevel } from "../middlewares/authMiddleware";
import { ExamSession } from "../models/ExamSession";
import { UserAnswer } from "../models/UserAnswer";

const router = Router();

// 엑셀 업로드용 메모리 스토리지 (20MB 제한)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

/**
 * 1. 시험 목록 조회 (년도/회차 목록)
 */
router.get("/", checkLevel, async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const year = req.query.year ? Number(req.query.year) : null;

    const where: any = {};
    if (year) {
      where.year = year;
    }

    const offset = (page - 1) * pageSize;
    const { count, rows } = await CertificationExam.findAndCountAll({
      where,
      order: [["year", "DESC"], ["sessionNumber", "DESC"]], // 최신 년도, 최신 회차 순
      offset,
      limit: pageSize,
    });

    return res.status(200).json({ ok: true, data: rows, total: count });
  } catch (error) {
    console.error("시험 목록 조회 에러:", error);
    return res.status(500).json({ ok: false, message: "서버 오류가 발생했습니다." });
  }
});

/**
 * 2. 신규 시험(년도/회차) 껍데기 등록
 */
router.post("/", checkLevel, async (req: Request, res: Response) => {
  const tx = await sequelize.transaction();
  try {
    const { year, sessionNumber, questionCount } = req.body;

    if (!year || !sessionNumber) {
      await tx.rollback();
      return res.status(400).json({ ok: false, message: "년도와 회차는 필수입니다." });
    }

    const newExam = await CertificationExam.create({
      year,
      sessionNumber,
      questionCount: questionCount || 30,
      status: "READY",
    }, { transaction: tx });

    await tx.commit();
    return res.status(201).json({ ok: true, data: newExam, message: "시험이 생성되었습니다." });
  } catch (error) {
    if (tx) await tx.rollback();
    console.error("시험 생성 에러:", error);
    return res.status(500).json({ ok: false, message: "등록에 실패했습니다." });
  }
});
router.get("/:id", checkLevel, async (req: Request, res: Response) => {
  try {
    const examId = Number(req.params.id);
    
    // params.id가 숫자가 아닌 경우(예: /join 이 먼저 매칭되는 충돌 방지) 방어 코드
    if (isNaN(examId)) {
      return res.status(400).json({ ok: false, message: "잘못된 접근입니다." });
    }

    const exam = await CertificationExam.findByPk(examId);
    
    if (!exam) {
      return res.status(404).json({ ok: false, message: "해당 시험(ID)을 찾을 수 없습니다." });
    }

    const questions = await Question.findAll({
      where: { examId },
      order: [['id', 'ASC']]
    });

    return res.status(200).json({
      ok: true,
      data: { exam, questions }
    });
  } catch (error) {
    console.error("단일 시험 조회 에러:", error);
    return res.status(500).json({ ok: false, message: "조회 중 오류 발생" });
  }
});
/**
 * 3. 개별 문제 등록
 */
router.post("/:id/questions", checkLevel, async (req: Request, res: Response) => {
  const tx = await sequelize.transaction();
  try {
    const examId = Number(req.params.id);
    const { content, options, correctAnswer } = req.body;

    const exam = await CertificationExam.findByPk(examId);
    if (!exam) {
      await tx.rollback();
      return res.status(404).json({ ok: false, message: "해당 시험 회차를 찾을 수 없습니다." });
    }

    if (!content || !options || !correctAnswer) {
      await tx.rollback();
      return res.status(400).json({ ok: false, message: "문제 내용, 보기, 정답은 필수입니다." });
    }

    const newQuestion = await Question.create({
      examId,
      content,
      options, // 배열 형태로 들어와야 함 (예: ["보기1", "보기2", "보기3", "보기4"])
      correctAnswer,
    }, { transaction: tx });

    await tx.commit();
    return res.status(201).json({ ok: true, data: newQuestion, message: "문제가 등록되었습니다." });
  } catch (error) {
    if (tx) await tx.rollback();
    console.error("문제 개별 등록 에러:", error);
    return res.status(500).json({ ok: false, message: "문제 등록 중 오류가 발생했습니다." });
  }
});

/**
 * 4. 엑셀 업로드를 통한 문제 일괄 등록 (동적 파싱)
 * 예상 엑셀 컬럼명: '문제내용', '보기1', '보기2', '보기3', '보기4', '정답' 등
 */
router.post("/:id/upload", checkLevel, upload.single("file"), async (req: Request, res: Response) => {
  let tx: Transaction | null = null;
  try {
    const examId = Number(req.params.id);
    const exam = await CertificationExam.findByPk(examId);

    if (!exam) return res.status(404).json({ ok: false, message: "시험 회차를 찾을 수 없습니다." });
    if (!req.file) return res.status(400).json({ ok: false, message: "엑셀 파일이 없습니다." });

    // 1. 엑셀 읽기
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rawRows.length === 0) {
      return res.status(400).json({ ok: false, message: "데이터가 비어있습니다." });
    }

    tx = await sequelize.transaction();

    // 기존 데이터 덮어쓰기 옵션이 있을 경우
    if (req.body.overwrite === "true") {
      await Question.destroy({ where: { examId }, transaction: tx });
    }

    const parsedQuestions = [];
    const errors: string[] = [];

    // 2. 로우 데이터 파싱 (휴리스틱으로 문제 내용, 보기, 정답 추출)
    for (const [index, row] of rawRows.entries()) {
      try {
        let content = "";
        let answerIndexRaw = "";
        const optionsMap: { [key: number]: string } = {}; // 💡 보기 번호와 텍스트를 매핑할 객체

        for (const key of Object.keys(row)) {
          const val = String(row[key] || "").trim();
          
          if (key.includes("문제") || key.includes("내용") || key.includes("질문")) {
            if (val) content = val;
          } else if (key.includes("정답") || key.includes("답안")) {
            if (val) answerIndexRaw = val; // 예: "3"
          } else if (key.includes("보기") || key.includes("선택지") || key.match(/^[1-5]$/)) {
            // "보기1", "보기2" 등에서 숫자 추출하여 맵핑
            const match = key.match(/\d+/);
            if (match && val) {
              optionsMap[Number(match[0])] = val;
            }
          }
        }

        // 보기 1~4번 배열로 정렬하여 변환
        const options: string[] = [];
        const sortedKeys = Object.keys(optionsMap).map(Number).sort((a, b) => a - b);
        for (const k of sortedKeys) {
          options.push(optionsMap[k]);
        }

        // 🔥 핵심: 정답이 '3'과 같은 숫자로 들어왔다면, 매핑된 보기의 텍스트로 치환
        let correctAnswer = answerIndexRaw; 
        const answerIdx = Number(answerIndexRaw);
        
        // 정답이 정상적인 숫자(예: 1, 2, 3...)이고 해당 번호의 보기가 존재한다면
        if (!isNaN(answerIdx) && optionsMap[answerIdx]) {
          correctAnswer = optionsMap[answerIdx]; // 예: optionsMap[3] -> "복지관 및 요양원"
        }

        // 유효성 검사 (필수 값 누락 시 스킵 및 에러 기록)
        if (!content || !correctAnswer || options.length === 0) {
          errors.push(`${index + 2}행 파싱 오류: 필수 데이터 누락 (문제, 정답, 보기)`);
          continue;
        }

        // Question 조립
        parsedQuestions.push({
          examId,
          content,
          options, // JSON 필드에 배열 삽입
          correctAnswer, // 치환된 텍스트 정답 삽입
        });

      } catch (err) {
        errors.push(`${index + 2}행 파싱 중 알 수 없는 오류`);
      }
    }

    // 3. Bulk Create (한 번에 인서트)
    if (parsedQuestions.length > 0) {
      await Question.bulkCreate(parsedQuestions as any, { transaction: tx });
    }
    
    await tx.commit();

    return res.status(200).json({
      ok: true,
      total: rawRows.length,
      saved: parsedQuestions.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    if (tx) await tx.rollback();
    console.error("문제 엑셀 업로드 처리 에러:", error);
    return res.status(500).json({ ok: false, message: "엑셀 처리 중 서버 오류" });
  }
});


/**
 * 5. QR 대기 상태 제어 및 토큰 생성 API (관리자)
 * - 관리자가 [QR 대기] 버튼 클릭 시 호출
 */
// src/routes/qualificationsRoutes.ts (QR 대기 상태 제어 API 부분 수정)

router.patch("/:id/qr-open", checkLevel, async (req: Request, res: Response) => {
  try {
    const examId = Number(req.params.id); // 💡 우리가 URL에서 추출한 확실한 숫자!
    const exam = await CertificationExam.findByPk(examId);

    if (!exam || exam.status === 'CLOSED') {
      return res.status(400).json({ ok: false, message: "유효하지 않거나 종료된 시험입니다." });
    }

    const qrToken = crypto.randomUUID();
    await exam.update({ status: 'QR_OPEN', qrToken: qrToken });
    const joinUrlPath = `/exam/join?token=${qrToken}`;

    const io = req.app.get('io');
    if (io) {
      io.emit('qr_opened', {
        examId: examId, // 🔥 exam.id 대신 확실한 examId 변수 사용!
        qrToken: qrToken,
      });
      console.log(`📡 [Socket] qr_opened 발송 성공! (examId: ${examId})`);
    }

    return res.status(200).json({
      ok: true,
      message: "QR 대기 상태로 변경되었습니다.",
      data: { joinUrlPath }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "상태 변경 오류" });
  }
});

router.post("/join", async (req: Request, res: Response) => {
  try {
    const { qrToken, centerName, studentName } = req.body;

    if (!qrToken || !centerName || !studentName) {
      return res.status(400).json({ ok: false, message: "접속 토큰, 센터명, 이름은 필수입니다." });
    }

    const exam = await CertificationExam.findOne({ where: { qrToken } });
    if (!exam) {
      return res.status(404).json({ ok: false, message: "유효하지 않은 QR 코드입니다." });
    }

    if (exam.status === 'READY' || exam.status === 'CLOSED') {
      return res.status(400).json({ ok: false, message: "현재 입장이 불가능한 시험입니다." });
    }

    // 💡 [추가된 로직] 시험이 이미 시작된 상태에서 입장(지각)하는 경우 즉시 문제 배정
    let randomQuestions = null;
    if (exam.status === 'STARTED') {
      const allQuestions = await Question.findAll({ 
        where: { examId: exam.id }, 
        attributes: ['id'], 
        raw: true 
      }) as unknown as { id: number }[];

      const questionIds = allQuestions.map(q => q.id);
      const shuffledIds = questionIds.sort(() => 0.5 - Math.random());
      randomQuestions = shuffledIds.slice(0, exam.questionCount);
    }

    // 1. 수강생 DB 저장 (randomQuestions 포함)
    const newSession = await ExamSession.create({
      examId: exam.id,
      centerName,
      studentName,
      memberId: null, 
      score: 0,
      isPassed: false,
      isSubmitted: false,
      randomQuestions: randomQuestions // 💡 변경됨 (지각생은 여기서 문제 채워짐)
    });

    // 2. Socket.io를 통해 관리자 화면으로 실시간 데이터 전송
    const io = req.app.get('io');
    if (io) {
      io.emit('new_student', {
        examId: exam.id,
        sessionId: newSession.id,
        centerName: newSession.centerName,
        studentName: newSession.studentName,
        createdAt: new Date()
      });
    }

    return res.status(201).json({
      ok: true,
      message: "입장 처리되었습니다.",
      data: {
        sessionId: newSession.id,
        examId: exam.id,
        examStatus: exam.status
      }
    });
  } catch (error) {
    console.error("수강생 시험 입장 에러:", error);
    return res.status(500).json({ ok: false, message: "입장 처리 중 오류가 발생했습니다." });
  }
});

router.patch("/:id/start", checkLevel, async (req: Request, res: Response) => {
  const tx = await sequelize.transaction();
  try {
    const examId = Number(req.params.id);
    const { questionCount } = req.body;

    if (!questionCount || isNaN(Number(questionCount))) {
      await tx.rollback();
      return res.status(400).json({ ok: false, message: "출제할 문제 수를 정확히 입력해 주세요." });
    }

    // 1. 시험 정보 조회 및 상태 검증
    const exam = await CertificationExam.findByPk(examId);
    if (!exam) {
      await tx.rollback();
      return res.status(404).json({ ok: false, message: "시험을 찾을 수 없습니다." });
    }
    if (exam.status === 'STARTED' || exam.status === 'CLOSED') {
      await tx.rollback();
      return res.status(400).json({ ok: false, message: "이미 시작되었거나 종료된 시험입니다." });
    }

    // 2. 해당 시험에 등록된 전체 문제 조회
    const allQuestions = await Question.findAll({
      where: { examId },
      attributes: ['id'], // 문제 번호(ID)만 가져옴
      raw: true,
      transaction: tx
    })as unknown as { id: number }[];;

    const totalQuestions = allQuestions.length;
    if (totalQuestions < questionCount) {
      await tx.rollback();
      return res.status(400).json({ 
        ok: false, 
        message: `등록된 문제(${totalQuestions}개)가 설정한 출제 문항 수(${questionCount}개)보다 적습니다.` 
      });
    }

    // 문제 ID만 추출한 배열
    const questionIds = allQuestions.map(q => q.id);

    // 3. 해당 시험에 대기 중인 전체 수강생(Session) 조회
    const sessions = await ExamSession.findAll({
      where: { examId, isSubmitted: false },
      transaction: tx
    });

    // 4. 수강생별로 설정된 개수만큼 랜덤하게 문제를 추출하여 저장
    const updatePromises = sessions.map(session => {
      // Fisher-Yates 셔플 방식으로 배열을 무작위로 섞은 뒤 앞에서부터 questionCount 만큼 자름
      const shuffledIds = [...questionIds].sort(() => 0.5 - Math.random());
      const selectedQuestions = shuffledIds.slice(0, questionCount);

      // 세션 업데이트
      return session.update({ randomQuestions: selectedQuestions }, { transaction: tx });
    });

    await Promise.all(updatePromises); // 모든 수강생 업데이트 동시 실행

    // 5. 시험 상태 및 문제 수 업데이트
    await exam.update({
      status: 'STARTED',
      questionCount: Number(questionCount)
    }, { transaction: tx });

    await tx.commit();

    // 🔥 6. Socket.io를 통해 수강생들(및 관리자)에게 시험 시작 알림 발송
    const io = req.app.get('io');
    if (io) {
      io.emit('exam_started', {
        examId: exam.id,
        message: "시험이 시작되었습니다.",
        questionCount: exam.questionCount
      });
      console.log(`📡 [Socket] exam_started 발송 성공! (examId: ${examId})`);
    }

    return res.status(200).json({
      ok: true,
      message: "시험이 시작되었습니다. 수강생들에게 문제가 배포되었습니다.",
      data: {
        examId: exam.id,
        status: exam.status,
        questionCount: exam.questionCount,
        studentCount: sessions.length
      }
    });

  } catch (error) {
    if (tx) await tx.rollback();
    console.error("시험 시작 처리 에러:", error);
    return res.status(500).json({ ok: false, message: "시험 시작 중 서버 오류가 발생했습니다." });
  }
});

/**
 * 7. 중간 답안 저장 API (실시간 자동 저장)
 * - 프론트엔드에서 1문제를 풀고 '다음'으로 넘어갈 때마다 호출
 */
router.post("/session/:sessionId/answer", async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const { questionId, submittedAnswer } = req.body;

    if (!questionId || !submittedAnswer) {
      return res.status(400).json({ ok: false, message: "문제 ID와 선택한 답안이 필요합니다." });
    }

    // 1. 세션 확인 및 검증
    const session = await ExamSession.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({ ok: false, message: "세션을 찾을 수 없습니다." });
    }
    if (session.isSubmitted) {
      return res.status(400).json({ ok: false, message: "이미 최종 제출이 완료된 시험입니다." });
    }

    // 2. 시험 상태 확인
    const exam = await CertificationExam.findByPk(session.examId);
    if (!exam || exam.status !== 'STARTED') {
      return res.status(400).json({ ok: false, message: "현재 진행 중인 시험이 아닙니다." });
    }

    // 3. 문제의 실제 정답 가져오기 (채점용)
    const question = await Question.findByPk(questionId);
    if (!question) {
      return res.status(404).json({ ok: false, message: "해당 문제를 찾을 수 없습니다." });
    }

    // 정답 여부 판별 (공백 제거 후 비교하여 오차 줄임)
    const isCorrect = question.correctAnswer.trim() === submittedAnswer.trim();

    // 4. UserAnswer 테이블에 답안 저장 (이미 저장된 경우 UPDATE, 없으면 INSERT)
    // Sequelize의 findOne 후 갱신/생성 로직 사용
    const existingAnswer = await UserAnswer.findOne({
      where: { sessionId, questionId }
    });

    if (existingAnswer) {
      await existingAnswer.update({ submittedAnswer, isCorrect });
    } else {
      await UserAnswer.create({
        sessionId,
        questionId,
        submittedAnswer,
        isCorrect
      });
    }

    return res.status(200).json({ 
      ok: true, 
      message: "답안이 임시 저장되었습니다." 
    });
  } catch (error) {
    console.error("중간 답안 저장 에러:", error);
    return res.status(500).json({ ok: false, message: "답안 저장 중 서버 오류가 발생했습니다." });
  }
});

/**
 * 8. 세션 복구 및 진행 상황 조회 API (이어풀기 용도)
 * - 수강생이 튕겼다 재접속 시 브라우저 localStorage의 sessionId를 들고 호출
 */
router.get("/session/:sessionId/progress", async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.sessionId);

    // 1. 세션 정보 확인
    const session = await ExamSession.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({ ok: false, message: "세션 정보를 찾을 수 없습니다. 처음부터 다시 입장해 주세요." });
    }

    // 2. 시험 상태 확인
    const exam = await CertificationExam.findByPk(session.examId);
    
    // 3. 현재까지 수강생이 저장한 답안 목록 조회 (questionId 배열 추출)
    const savedAnswers = await UserAnswer.findAll({
      where: { sessionId },
      attributes: ['questionId', 'submittedAnswer'], // 어떤 문제를 풀었고, 어떤 답을 체크했는지
      raw: true
    });

    // 이미 풀이 완료한 문제 ID 배열
    const answeredQuestionIds = savedAnswers.map(ans => ans.questionId);

    return res.status(200).json({
      ok: true,
      data: {
        sessionId: session.id,
        examStatus: exam ? exam.status : 'CLOSED', // STARTED 여부 판별
        isSubmitted: session.isSubmitted,          // 최종 제출 여부 (이미 냈으면 결과창을 띄워줘야 함)
        randomQuestions: session.randomQuestions,  // 배정된 30문제 전체 배열 
        answeredQuestionIds: answeredQuestionIds,  // 현재까지 푼 문제 ID 배열 (예: [14, 5, 22])
        savedAnswers: savedAnswers                 // 체크했던 번호를 UI에 복구하기 위해 전달
      }
    });
  } catch (error) {
    console.error("세션 복구 조회 에러:", error);
    return res.status(500).json({ ok: false, message: "세션 복구 중 서버 오류가 발생했습니다." });
  }
});

/**
 * 9. 최종 답안 제출 및 자동 채점 API (수강생 제출)
 * - 수강생이 모든 문제를 풀고 [최종 제출] 클릭 시 호출
 */
router.post("/session/:sessionId/submit", async (req: Request, res: Response) => {
  const tx = await sequelize.transaction();
  try {
    const sessionId = Number(req.params.sessionId);
    // answers 형태: [{ questionId: 1, submittedAnswer: "3" }, { questionId: 2, submittedAnswer: "1" }, ...]
    const { answers } = req.body; 

    // 1. 세션 및 시험 정보 확인
    const session = await ExamSession.findByPk(sessionId, { transaction: tx });
    if (!session) {
      await tx.rollback();
      return res.status(404).json({ ok: false, message: "세션을 찾을 수 없습니다." });
    }
    if (session.isSubmitted) {
      await tx.rollback();
      return res.status(400).json({ ok: false, message: "이미 최종 제출 및 채점이 완료된 시험입니다." });
    }

    const exam = await CertificationExam.findByPk(session.examId, { transaction: tx });
    if (!exam) {
      await tx.rollback();
      return res.status(404).json({ ok: false, message: "시험 정보를 찾을 수 없습니다." });
    }

    // 2. 프론트엔드에서 전체 답안 배열을 보낸 경우 (누락 방지용 일괄 업데이트)
    if (answers && Array.isArray(answers) && answers.length > 0) {
      // 성능 최적화를 위해 넘어온 문제들의 정답을 한 번에 조회
      const questionIds = answers.map((a: any) => a.questionId);
      const questions = await Question.findAll({
        where: { id: questionIds },
        attributes: ['id', 'correctAnswer'],
        raw: true,
        transaction: tx
      });

      // 빠른 매칭을 위한 맵(Dictionary) 구조 생성
      const questionMap: { [key: number]: string } = {};
      questions.forEach(q => { questionMap[q.id] = q.correctAnswer.trim(); });

      // 기존에 중간 저장된 답안들 조회
      const existingAnswers = await UserAnswer.findAll({
        where: { sessionId },
        transaction: tx
      });
      const existingMap: { [key: number]: UserAnswer } = {};
      existingAnswers.forEach(ea => { existingMap[ea.questionId] = ea; });

      // 모든 제출 답안을 순회하며 정답 체크 후 Create 또는 Update (Promise 병렬 처리)
      const upsertPromises = answers.map((ans: any) => {
        const correctAnswer = questionMap[ans.questionId];
        if (!correctAnswer) return Promise.resolve(); // 유효하지 않은 문제 패스

        const isCorrect = correctAnswer === String(ans.submittedAnswer).trim();

        if (existingMap[ans.questionId]) {
          return existingMap[ans.questionId].update({ submittedAnswer: ans.submittedAnswer, isCorrect }, { transaction: tx });
        } else {
          return UserAnswer.create({
            sessionId,
            questionId: ans.questionId,
            submittedAnswer: ans.submittedAnswer,
            isCorrect
          }, { transaction: tx });
        }
      });

      await Promise.all(upsertPromises);
    }

    // 3. 최종 채점 진행
    // UserAnswer 테이블에서 현재 세션의 맞춘(isCorrect = true) 개수 조회
    const correctCount = await UserAnswer.count({
      where: { sessionId, isCorrect: true },
      transaction: tx
    });

    // 4. 점수 및 합격 여부 계산 
    // 공식: (맞춘 개수 / 관리자가 설정한 출제 문제 수) * 100
    // Math.round()를 통해 소수점 반올림 처리
    const score = Math.round((correctCount / exam.questionCount) * 100);
    
    // 기본적으로 합격선(passingScore)은 60점
    const isPassed = score >= exam.passingScore;

    // 5. ExamSession 상태 업데이트 (최종 점수, 합격여부 반영 및 제출 마감 처리)
    await session.update({
      score,
      isPassed,
      isSubmitted: true
    }, { transaction: tx });

    await tx.commit();

    const io = req.app.get('io');
    console.log("💡 [Submit] 백엔드 io 객체 존재 여부:", !!io); // 확인용 로그
    if (io) {
      io.emit('student_submitted', {
        examId: exam.id,
        sessionId: session.id,
      });
      console.log(`📡 [Socket] student_submitted 발송 성공! (sessionId: ${session.id})`);
    }

    // 6. 결과 반환 (프론트엔드에서 즉시 합격/불합격 결과창 렌더링에 사용)
    return res.status(200).json({
      ok: true,
      message: "채점이 완료되었습니다.",
      data: {
        score,
        isPassed,
        correctCount,
        questionCount: exam.questionCount
      }
    });

  } catch (error) {
    if (tx) await tx.rollback();
    console.error("최종 제출 및 채점 에러:", error);
    return res.status(500).json({ ok: false, message: "제출 처리 중 오류가 발생했습니다." });
  }
});

/**
 * 10. 합격자 명단 및 결과 조회 API (관리자)
 * - 특정 시험 회차의 응시자 현황 및 합격자 목록 조회
 */
router.get("/:id/sessions", checkLevel, async (req: Request, res: Response) => {
  try {
    const examId = Number(req.params.id);
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const keyword = req.query.keyword as string; // 검색어 (센터명 또는 이름)
    const isPassedFilter = req.query.isPassed as string; // 'true' 또는 'false'

    // 기본 검색 조건: 해당 시험(examId)에 속한 세션
    const where: any = { examId };

    // 1. 합격 여부 필터링
    if (isPassedFilter === 'true') {
      where.isPassed = true;
      where.isSubmitted = true; // 최종 제출된 사람 중에서만 합격자를 가림
    } else if (isPassedFilter === 'false') {
      where.isPassed = false;
      where.isSubmitted = true;
    }

    // 2. 키워드 검색 (센터명 또는 수강생 이름)
    if (keyword) {
      where[Op.or] = [
        { centerName: { [Op.like]: `%${keyword}%` } },
        { studentName: { [Op.like]: `%${keyword}%` } }
      ];
    }

    const offset = (page - 1) * pageSize;

    // 3. DB 조회 (목록 및 총 개수)
    const { count, rows } = await ExamSession.findAndCountAll({
      where,
      order: [
        ["score", "DESC"],     // 점수가 높은 순으로 우선 정렬
        ["createdAt", "DESC"]  // 점수가 같다면 최신 응시자 순
      ],
      offset,
      limit: pageSize,
    });

    // 4. (보너스) 상단 대시보드 표시용 통계 데이터 추출
    // - 필터링과 무관하게 해당 회차의 전체 응시자, 합격자, 합격률 계산
    const totalParticipants = await ExamSession.count({ where: { examId, isSubmitted: true } });
    const passedParticipants = await ExamSession.count({ where: { examId, isSubmitted: true, isPassed: true } });
    const passRate = totalParticipants > 0 ? Math.round((passedParticipants / totalParticipants) * 100) : 0;

    return res.status(200).json({
      ok: true,
      data: rows,
      total: count, // 현재 필터(where) 조건에 맞는 데이터의 총 개수 (페이지네이션 용)
      stats: {
        totalParticipants,
        passedParticipants,
        passRate // 예: 75 (%)
      }
    });

  } catch (error) {
    console.error("합격자 명단 조회 에러:", error);
    return res.status(500).json({ ok: false, message: "명단 조회 중 서버 오류가 발생했습니다." });
  }
});

/**
 * [추가] 수강생용 세션 상세 정보 및 문제 데이터 조회 API
 * - 문제 풀이 화면 및 결과 화면에서 호출
 */
router.get("/session/:sessionId/play-data", async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.sessionId);
    
    const session = await ExamSession.findByPk(sessionId);
    if (!session) return res.status(404).json({ ok: false, message: "세션을 찾을 수 없습니다." });

    const exam = await CertificationExam.findByPk(session.examId);
    if (!exam) return res.status(404).json({ ok: false, message: "시험 정보를 찾을 수 없습니다." });

    // 배정된 문제 번호(배열)를 기반으로 실제 문제 데이터 조회
    let questions: any[] = [];
    if (session.randomQuestions && Array.isArray(session.randomQuestions)) {
      questions = await Question.findAll({
        where: { id: session.randomQuestions },
        attributes: ['id', 'content', 'options'], // 💡 정답(correctAnswer)은 부정행위 방지를 위해 제외!
        raw: true
      });

      // randomQuestions 배열 순서대로 문제 정렬 (섞인 순서 유지)
      questions.sort((a, b) => 
        session.randomQuestions.indexOf(a.id) - session.randomQuestions.indexOf(b.id)
      );
    }

    // 현재까지 푼 답안 내역
    const savedAnswers = await UserAnswer.findAll({
      where: { sessionId },
      attributes: ['questionId', 'submittedAnswer'],
      raw: true
    });

    return res.status(200).json({
      ok: true,
      data: {
        session: {
          id: session.id,
          centerName: session.centerName,
          studentName: session.studentName,
          isSubmitted: session.isSubmitted,
          isPassed: session.isPassed,
          score: session.score
        },
        examStatus: exam.status,
        questions,
        savedAnswers
      }
    });
  } catch (error) {
    console.error("수강생 플레이 데이터 조회 에러:", error);
    return res.status(500).json({ ok: false, message: "데이터 로드 중 오류가 발생했습니다." });
  }
});
export default router;