# =====================================
# 1. 빌드 단계
# Dependencies & Build
# =====================================
FROM node:24.14-alpine AS builder

WORKDIR /app


# =====================================
# Node.js 의존성 설치
# devDependencies 포함
# =====================================
COPY package*.json ./

RUN npm ci


# =====================================
# 소스 코드 복사 및 빌드
# =====================================
COPY . .

RUN npm run build

# 🌟 컴파일 직후 src/views 폴더를 dist/views로 복사
RUN cp -r src/views dist/views

# =====================================
# 2. 실행 단계
# Production Runner
# =====================================
FROM node:24.14-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production


# =====================================
# 🌟 [추가] Alpine Linux용 Chromium 및 한글 폰트 설치
# PDF 생성을 위한 브라우저 엔진과 한글 깨짐 방지 폰트
# =====================================
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-cjk


# =====================================
# 🌟 [추가] Puppeteer 환경 변수 설정
# npm 설치 시 자체 다운로드를 막고 방금 설치한 OS 크롬 경로를 지정
# =====================================
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser


# =====================================
# 프로덕션 의존성 설치
# =====================================
COPY package*.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force


# =====================================
# 빌드 결과물 복사
# =====================================
COPY --from=builder /app/dist ./dist


# =====================================
# 업로드 임시 폴더 생성
# =====================================
RUN mkdir -p /app/uploads/temp \
    && chown -R node:node /app/uploads


# =====================================
# 일반 사용자로 실행
# =====================================
USER node


# =====================================
# 애플리케이션 포트
# =====================================
EXPOSE 4000


# =====================================
# 애플리케이션 실행
# =====================================
CMD ["node", "dist/index.js"]