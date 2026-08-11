# 1. 빌드 단계 (Dependencies & Build)
FROM node:24.14-alpine AS builder
WORKDIR /app

# 패키지 파일 복사 후 전체 의존성 설치 (devDependencies 포함)
COPY package*.json ./
RUN npm ci

# 소스 코드 복사 및 빌드 실행 (예: TypeScript 컴파일 등)
COPY . .
RUN npm run build

# 2. 실행 단계 (Production Runner)
FROM node:24.14-alpine
WORKDIR /app

# 프로덕션에 필요한 패키지만 다시 깔끔하게 설치
COPY package*.json ./
RUN npm ci --only=production

# builder 단계에서 생성된 빌드 결과물(dist 등)만 복사해오기
COPY --from=builder /app/dist ./dist

# 만약 패키지나 기타 실행 파일이 있다면 추가 복사
# COPY --from=builder /app/package.json ./

EXPOSE 4000

# 빌드된 결과물을 실행 (프로젝트 구조에 맞게 경로 수정 필요, 예: dist/index.js)
CMD ["node", "dist/index.js"]
