import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
const router = Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


router.post('/generate-page', async (req: Request, res: Response) => {
  try {
    console.log(process.env.GEMINI_API_KEY);
    const { prompt, targetType, currentContent } = req.body;

    let systemInstruction = `당신은 웹 페이지 빌더 도우미입니다. 사용자의 요청을 분석하여 아래 JSON 배열 형식으로만 응답하세요.
    
[규칙]
1. 텍스트는 "TEXT" 타입에 HTML로 작성하세요. (필요 시 inline-style 포함 가능)
2. 이미지(사진, 그림 등)가 필요한 경우, "IMAGE" 타입 객체로 분리하고 content 속성에는 이미지를 상세하게 묘사하는 **정확한 영문 프롬프트만** 작성하세요.
3. 일반적인 응답은 [{"type": "TEXT", "content": "..."}, {"type": "IMAGE", "content": "a high quality modern corporate office interior"}] 처럼 배열이어야 합니다.
4. 버튼(BUTTON)이나 이미지(IMAGE)에서 클릭 시 이동할 링크 URL이 있다면, "linkUrl" 속성을 추가하여 반환하세요. (예: {"type": "BUTTON", "content": "바로가기", "linkUrl": "https://..."})`;
    let finalPrompt = prompt;

    if (targetType === 'TEXT') {
      systemInstruction += `\n\n[텍스트 수정 모드] 주어진 기존 텍스트를 사용자의 요청에 맞게 변경하여 단일 "TEXT" 객체로 반환하세요.`;
      finalPrompt = `기존 내용:\n${currentContent}\n\n수정 요청:\n${prompt}`;
    } else if (targetType === 'IMAGE') {
      systemInstruction += `\n\n[이미지 변경 모드] 사용자의 요청에 맞는 영문 프롬프트를 단일 "IMAGE" 객체로 반환하세요.`;
      finalPrompt = `새로운 이미지 요청:\n${prompt}`;
    } else if (targetType === 'CONTAINER') {
      systemInstruction += `\n\n[섹션(컨테이너) 수정 모드] 기존 블록의 맥락을 유지하면서, 사용자의 추가/수정 요청을 반영하여 엘리먼트 배열을 재구성하세요.`;
      finalPrompt = `기존 내용 데이터:\n${currentContent}\n\n섹션 수정 요청:\n${prompt}`;
    } else if (targetType === 'META') {
      systemInstruction += `\n\n[페이지 헤더 메타 모드] 사용자의 요청을 바탕으로 페이지 상단에 들어갈 짧고 강렬한 '배경 제목(TEXT)' 1개와, 그에 어울리는 '배경 이미지 영문 프롬프트(IMAGE)' 1개를 반환하세요. 텍스트에는 절대로 HTML 태그를 포함하지 마세요.`;
      finalPrompt = `기존 헤더 정보:\n${currentContent}\n\n헤더(제목+배경) 변경 요청:\n${prompt}`;
    }

    // 1단계: Gemini를 통한 텍스트 및 이미지 프롬프트 JSON 구성
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: finalPrompt,
      config: {
        responseMimeType: "application/json",
        systemInstruction
      }
    });

    const elementsData = JSON.parse(response.text || "[]");

    // 2단계: IMAGE 타입 요소가 존재할 경우 Nano Banana(gemini-3.1-flash-image) 모델 호출
    const processedElements = await Promise.all(
      elementsData.map(async (element: { type: string; content: string }) => {
        if (element.type === 'IMAGE' && element.content) {
          try {
            const imageResponse = await ai.models.generateContent({
              model: 'gemini-3.1-flash-image',
              contents: element.content,
            });

            const parts = imageResponse.candidates?.[0]?.content?.parts;
            const imagePart = parts?.find(part => part.inlineData);

            if (imagePart && imagePart.inlineData && imagePart.inlineData.data) {
              const base64Data = imagePart.inlineData.data; // 이제 무조건 string으로 인식됩니다.
              const mimeType = imagePart.inlineData.mimeType || 'image/jpeg';
              const extension = mimeType === 'image/png' ? 'png' : 'jpg';
              
              // Base64 데이터를 물리적 파일로 저장하기 위한 설정
              const fileName = `ai_img_${Date.now()}_${Math.round(Math.random() * 1e9)}.${extension}`;
              const uploadDir = path.join(process.cwd(), 'public', 'uploads');
              
              if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
              }
              const filePath = path.join(uploadDir, fileName);

              // 💡 에러 해결: base64Data가 확실한 string이므로 Buffer.from이 정상 작동합니다.
              const buffer = Buffer.from(base64Data, 'base64');
              fs.writeFileSync(filePath, buffer);

              // 프론트엔드가 접근할 수 있는 완전한 URL 주소 생성
              const baseUrl = `${req.protocol}://${req.get('host')}`;
              const fileUrl = `${baseUrl}/uploads/${fileName}`;
              
              return {
                ...element,
                content: fileUrl
              };
            } else {
              return {
                ...element,
                content: 'https://via.placeholder.com/800x600.png?text=Image+Not+Found'
              };
            }
          } catch (imgErr) {
            console.error("Nano Banana 이미지 생성 실패:", imgErr);
            return {
              ...element,
              content: 'https://via.placeholder.com/800x600.png?text=Image+Generation+Failed'
            };
          }
        }

        return element;
      })
    );

    res.status(200).json({ success: true, elements: processedElements });
  } catch (error) {
    console.error("Gemini API 호출 실패:", error);
    const err = error as any;

    if (err && err.status === 503) {
      return res.status(503).json({
        success: false,
        message: "현재 AI 서버 접속량이 많아 처리가 지연되고 있습니다. 잠시 후 다시 시도해 주세요."
      });
    }
    res.status(500).json({ success: false, message: "AI 생성 실패" });
  }
});


router.post('/generate-policy', async (req: Request, res: Response) => {
  try {
    const { prompt, currentContent, policyType } = req.body;

    const systemInstruction = `당신은 전문적인 법률 문서 및 약관 작성 어시스턴트입니다. 
    사용자의 요청에 따라 이용약관(Terms of Service) 또는 개인정보처리방침(Privacy Policy)을 작성하거나 수정하세요. 
    문서는 반드시 HTML 태그(<h3>, <h4>, <p>, <ul>, <li>, <strong> 등)를 사용하여 가독성 좋고 전문적인 형태로 작성되어야 합니다.
    JSON 형식이나 마크다운 틱(\`\`\`) 없이 오직 HTML 코드 형태의 순수 텍스트만 반환하세요.`;

    const typeLabel = policyType === 'terms' ? '이용약관' : '개인정보처리방침';
    const finalPrompt = `[문서 종류: ${typeLabel}]\n\n기존 내용:\n${currentContent || '기존 내용 없음'}\n\n사용자 요청사항:\n${prompt}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: finalPrompt,
      config: {
        systemInstruction
      }
    });

    let generatedHtml = response.text || '';
    generatedHtml = generatedHtml.replace(/^```html/im, '').replace(/```$/m, '').trim();
    console.log(generatedHtml);

    res.status(200).json({ success: true, content: generatedHtml });
  } catch (error) {
    console.error("약관 AI 생성 실패:", error);
    const err = error as any;

    if (err && err.status === 503) {
      return res.status(503).json({
        success: false,
        message: "현재 AI 서버 접속량이 많아 처리가 지연되고 있습니다. 잠시 후 다시 시도해 주세요."
      });
    }

    res.status(500).json({ success: false, message: "AI 약관 생성에 실패했습니다." });
  }
});
export default router;