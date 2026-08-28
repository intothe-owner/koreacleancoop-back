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


# =====================================
# 2. 실행 단계
# Production Runner
# =====================================
FROM node:24.14-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production


# =====================================
# 실행 중 필요한 시스템 패키지 설치
# =====================================
RUN apk add --no-cache \
    ghostscript \
    graphicsmagick \
    font-noto-cjk \
    font-noto-emoji


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
# 필요한 파일 복사
# 실제 프로젝트에 존재할 때만 사용
# =====================================
# COPY --from=builder /app/assets ./assets
# COPY --from=builder /app/templates ./templates
# COPY --from=builder /app/public ./public


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