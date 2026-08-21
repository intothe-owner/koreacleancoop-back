import { Router, Request, Response, NextFunction } from "express";
import { Page, Menu } from "../models";
import { upload } from "../middlewares/upload"; // multer 미들웨어 임포트

const router = Router();

// 모든 페이지 API 요청의 시작/종료 상태를 기록한다.
// upload 미들웨어에서 실패해도 요청이 들어왔는지와 최종 상태코드를 알 수 있다.
router.use((req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();
  console.log(`[pages] ${req.method} ${req.originalUrl} 시작`);
  res.on("finish", () => {
    console.log(
      `[pages] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`,
    );
  });
  next();
});

// multer 오류는 라우트 핸들러의 try/catch보다 먼저 발생하므로 별도로 잡아야 한다.
const pageUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.any()(req, res, (error: any) => {
    if (!error) return next();

    console.error("[pages] 파일 업로드 오류:", {
      name: error.name,
      code: error.code,
      message: error.message,
      field: error.field,
    });

    const isSizeError =
      error.code === "LIMIT_FILE_SIZE" || error.code === "LIMIT_FIELD_VALUE";
    return res.status(isSizeError ? 413 : 400).json({
      success: false,
      message: isSizeError
        ? "업로드 파일 또는 페이지 데이터의 크기가 허용 한도를 초과했습니다."
        : `파일 업로드 실패: ${error.message || "알 수 없는 오류"}`,
      code: error.code || "UPLOAD_ERROR",
    });
  });
};

// 1. 전체 페이지 목록 조회
router.get("/", async (req: Request, res: Response) => {
  try {
    const pages = await Page.findAll({
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({ success: true, data: pages });
  } catch (error) {
    console.error("페이지 조회 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// 2. 특정 페이지 상세 조회
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const param = req.params.id;

    // 💡 param이 "0"인 경우(메인 페이지) 처리
    if (param === "0") {
      const page = await Page.findOne({ where: { menuId: null } });
      if (!page) {
        return res
          .status(404)
          .json({
            success: false,
            message: "페이지 콘텐츠를 찾을 수 없습니다.",
          });
      }
      return res.status(200).json({ success: true, data: page });
    }

    let menuIds: number[] = [];

    // 1. 숫자인지 문자열(url 슬러그)인지 판별하여 메뉴 검색
    if (!isNaN(Number(param))) {
      // 💡 param이 숫자일 경우: 메뉴를 먼저 찾습니다.
      const menu = await Menu.findByPk(Number(param));

      if (menu) {
        // 💡 [핵심 수정 부분] 메뉴에 url이 존재한다면, 같은 url을 쓰는 모든 메뉴를 검색하여 ID를 담습니다.
        if ((menu as any).url) {
          const sharedMenus = await Menu.findAll({
            where: { url: (menu as any).url },
          });
          menuIds = sharedMenus.map((m: any) => m.id);
        } else {
          // url이 없는 특수한 경우라면 자기 자신의 ID만 담습니다.
          menuIds.push((menu as any).id);
        }
      }
    } else {
      // 💡 param이 문자열일 경우: 기존과 동일하게 url 기준으로 검색
      const searchUrl = `/${param}`;
      console.log(searchUrl);
      const menus = await Menu.findAll({ where: { url: searchUrl } });
      menuIds = menus.map((m: any) => m.id);
    }

    console.log("공유되는 메뉴 ID 목록:", menuIds);

    if (menuIds.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "메뉴를 찾을 수 없습니다." });
    }

    // 3. Page 테이블에서 menuId 배열 중 하나라도 일치하는 컨텐츠 조회
    const page = await Page.findOne({ where: { menuId: menuIds } });

    if (!page) {
      return res
        .status(404)
        .json({ success: false, message: "페이지 콘텐츠를 찾을 수 없습니다." });
    }

    res.status(200).json({ success: true, data: page });
  } catch (error) {
    console.error("페이지 조회 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});
router.get("/:id/:secondId", async (req: Request, res: Response) => {
  try {
    const { id, secondId } = req.params;

    // DB의 Menu 테이블에 저장된 url 형태(예: /about/history)로 조합
    const searchUrl = `/${id}/${secondId}`;
    console.log("2뎁스 검색 URL:", searchUrl);

    // 1. 해당 URL을 가진 메뉴 검색
    const menus = await Menu.findAll({ where: { url: searchUrl } });
    const menuIds = menus.map((m: any) => m.id);

    if (menuIds.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "메뉴를 찾을 수 없습니다." });
    }

    // 2. 해당 메뉴 ID와 일치하는 페이지 콘텐츠 조회
    const page = await Page.findOne({ where: { menuId: menuIds } });

    if (!page) {
      return res
        .status(404)
        .json({ success: false, message: "페이지 콘텐츠를 찾을 수 없습니다." });
    }

    res.status(200).json({ success: true, data: page });
  } catch (error) {
    console.error("2뎁스 페이지 조회 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});
//게시판
router.get("/boards/:id", async (req: Request, res: Response) => {
  try {
    const param = req.params.id;

    // 💡 param이 "0"인 경우(메인 페이지) 처리
    if (param === "0") {
      const page = await Page.findOne({ where: { menuId: null } });
      if (!page) {
        return res
          .status(404)
          .json({
            success: false,
            message: "페이지 콘텐츠를 찾을 수 없습니다.",
          });
      }
      return res.status(200).json({ success: true, data: page });
    }

    let menuIds: number[] = [];

    // 1. 숫자인지 문자열(url 슬러그)인지 판별하여 메뉴 검색
    if (!isNaN(Number(param))) {
      const menu = await Menu.findByPk(Number(param));
      if (menu) menuIds.push((menu as any).id);
    } else {
      const searchUrl = `/boards/${param}`;
      //const searchUrl = `/page?id=${param}`;
      console.log(searchUrl);
      const menus = await Menu.findAll({ where: { url: searchUrl } });
      menuIds = menus.map((m: any) => m.id);
    }
    console.log(menuIds);

    if (menuIds.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "메뉴를 찾을 수 없습니다." });
    }

    // 3. Page 테이블에서 menuId 배열 중 하나라도 일치하는 컨텐츠 조회
    const page = await Page.findOne({ where: { menuId: menuIds } });

    if (!page) {
      return res
        .status(404)
        .json({ success: false, message: "페이지 콘텐츠를 찾을 수 없습니다." });
    }

    res.status(200).json({ success: true, data: page });
  } catch (error) {
    console.error("페이지 조회 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// JSON 데이터와 파일을 매핑해주는 헬퍼 함수
// JSON 데이터와 파일을 매핑해주는 헬퍼 함수
const processFileData = (
  req: Request,
  files: any,
  blocks: any[],
  slides: any[],
  pageMeta: any,
) => {
  if (files && Array.isArray(files)) {
    files.forEach((file: any) => {
      const fieldName = file.fieldname;

      // S3의 location (업로드된 최종 URL)
      const fileUrl = file.location;

      // HTML에서 분리된 Base64 이미지. 객체 전체를 순회해 토큰을 S3 URL로 바꾼다.
      if (fieldName.startsWith("asset_file_")) {
        const index = fieldName.replace("asset_file_", "");
        const token = `__S3_ASSET_${index}__`;
        const replaceToken = (value: any): any => {
          if (typeof value === "string")
            return value.split(token).join(fileUrl);
          if (Array.isArray(value)) return value.map(replaceToken);
          if (value && typeof value === "object") {
            Object.keys(value).forEach((key) => {
              value[key] = replaceToken(value[key]);
            });
          }
          return value;
        };
        replaceToken(blocks);
      }
      // 1. 슬라이드 파일인 경우
      else if (fieldName.startsWith("slide_file_")) {
        const idx = parseInt(fieldName.replace("slide_file_", ""), 10);
        if (slides[idx]) slides[idx].mediaUrl = fileUrl;
      }
      // 2. 블록 엘리먼트 파일인 경우
      else if (fieldName.startsWith("element_file_")) {
        const elId = fieldName.replace("element_file_", "");
        blocks.forEach((container: any) => {
          container.columns.forEach((col: any) => {
            col.elements.forEach((el: any) => {
              if (el.id === elId) {
                // 💡 타입별로 분기 처리
                if (
                  el.type === "IMAGE" ||
                  el.type === "VIDEO" ||
                  el.type === "AUDIO"
                ) {
                  // 단일 미디어는 전체 내용을 URL로 교체
                  el.content = fileUrl;
                } else if (el.type === "TEXT" || el.type === "CARD") {
                  // 💡 HTML 에디터 내용인 경우, 전체를 덮어쓰지 않고 Base64 또는 Blob 형태의 임시 src만 S3 주소로 치환
                  el.content = el.content.replace(
                    /src="(data:image\/[^;]+;base64,[^"]+|blob:[^"]+)"/g,
                    `src="${fileUrl}"`,
                  );
                }
              }
            });
          });
        });
      }
      // 3. 테이블 셀 내부 이미지 파일인 경우
      else if (fieldName.startsWith("table_file_")) {
        const match = fieldName.match(/^table_file_(.+)_(.+)$/);
        if (match) {
          const elId = match[1];
          const cellKey = match[2];
          blocks.forEach((container: any) => {
            container.columns.forEach((col: any) => {
              col.elements.forEach((el: any) => {
                if (
                  el.id === elId &&
                  el.type === "TABLE" &&
                  el.tableData &&
                  el.tableData.cells &&
                  el.tableData.cells[cellKey]
                ) {
                  // 💡 테이블 셀 내부에서도 Base64 또는 Blob 형태의 임시 src만 치환하도록 정규식 적용
                  el.tableData.cells[cellKey].content = el.tableData.cells[
                    cellKey
                  ].content.replace(
                    /src="(data:image\/[^;]+;base64,[^"]+|blob:[^"]+)"/g,
                    `src="${fileUrl}"`,
                  );
                }
              });
            });
          });
        }
      }
      // 4. 메타 배경 파일인 경우
      else if (fieldName === "meta_bg_file") {
        pageMeta.bgImage = fileUrl;
      }
    });
  }
};

// 3. 새 페이지 생성 (multer 추가 및 매핑 로직)
router.post("/", pageUpload, async (req: Request, res: Response) => {
  try {
    let { menuId, title, contentBlocks, sliderData, pageMeta } = req.body;

    // FormData로 넘어온 데이터는 문자열이므로 파싱 필요
    let parsedBlocks =
      typeof contentBlocks === "string"
        ? JSON.parse(contentBlocks)
        : contentBlocks || [];
    let parsedSlides =
      typeof sliderData === "string"
        ? JSON.parse(sliderData)
        : sliderData || [];
    let parsedMeta =
      typeof pageMeta === "string" ? JSON.parse(pageMeta) : pageMeta || {};

    // 업로드된 파일 매핑 처리
    processFileData(req, req.files, parsedBlocks, parsedSlides, parsedMeta);

    const newPage = await Page.create({
      menuId: menuId ? Number(menuId) : null,
      title,
      contentBlocks: parsedBlocks,
      sliderData: parsedSlides,
      pageMeta: parsedMeta,
    });
    res
      .status(201)
      .json({
        success: true,
        data: newPage,
        message: "페이지가 생성되었습니다.",
      });
  } catch (error) {
    console.error("페이지 생성 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// 4. 기존 페이지 수정 (multer 추가 및 매핑 로직)
router.put("/:id", pageUpload, async (req: Request, res: Response) => {
  try {
    const pageId = Number(req.params.id);
    let { menuId, title, contentBlocks, sliderData, pageMeta } = req.body;

    let parsedBlocks =
      typeof contentBlocks === "string"
        ? JSON.parse(contentBlocks)
        : contentBlocks || [];
    let parsedSlides =
      typeof sliderData === "string"
        ? JSON.parse(sliderData)
        : sliderData || [];
    let parsedMeta =
      typeof pageMeta === "string" ? JSON.parse(pageMeta) : pageMeta || {};

    // 업로드된 파일 매핑 처리
    processFileData(req, req.files, parsedBlocks, parsedSlides, parsedMeta);

    await Page.update(
      {
        menuId: menuId ? Number(menuId) : null,
        title,
        contentBlocks: parsedBlocks,
        sliderData: parsedSlides,
        pageMeta: parsedMeta, // 👈 이 부분을 추가해야 DB에 반영됩니다.
      },
      { where: { id: pageId } },
    );

    const updatedPage = await Page.findByPk(pageId);
    res
      .status(200)
      .json({
        success: true,
        data: updatedPage,
        message: "페이지가 수정되었습니다.",
      });
  } catch (error) {
    console.error("페이지 수정 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// 5. 페이지 삭제 (Soft Delete)
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const pageId = Number(req.params.id);
    await Page.destroy({ where: { id: pageId } });
    res
      .status(200)
      .json({ success: true, message: "페이지가 삭제되었습니다." });
  } catch (error) {
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

export default router;