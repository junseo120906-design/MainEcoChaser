# EcoChaser Cloudflare Pages 배포 가이드

## 📋 사전 준비

1. **Cloudflare 계정 생성**
   - https://dash.cloudflare.com/sign-up 에서 계정 생성
   - 무료 플랜으로 시작 가능

2. **GitHub 계정**
   - 프로젝트를 GitHub 저장소에 푸시

3. **Wrangler CLI 설치** (선택사항 - 로컬 개발용)
   ```bash
   npm install -g wrangler
   ```

## 🗄️ D1 데이터베이스 설정

### 1. D1 데이터베이스 생성

Cloudflare 대시보드에서:
1. Workers & Pages → D1 메뉴로 이동
2. "Create database" 클릭
3. 데이터베이스 이름: `eco-chaser_db`
4. 생성 후 Database ID 복사

또는 CLI로:
```bash
wrangler d1 create eco-chaser_db
```

### 2. wrangler.toml 파일 업데이트

생성된 Database ID를 `wrangler.toml` 파일의 `database_id`에 입력:
```toml
[[d1_databases]]
binding = "DB"
database_name = "eco-chaser_db"
database_id = "여기에-실제-database-id-입력"
```

### 3. 스키마 적용

```bash
wrangler d1 execute eco-chaser_db --remote --file=./schema.sql
```

## 🚀 Cloudflare Pages 배포

### 방법 1: GitHub 연동 (권장)

1. **GitHub 저장소에 코드 푸시**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/username/ecochaser.git
   git push -u origin main
   ```

2. **Cloudflare Pages 프로젝트 생성**
   - Cloudflare 대시보드 → Workers & Pages
   - "Create application" → "Pages" → "Connect to Git"
   - GitHub 계정 연결 및 저장소 선택

3. **빌드 설정**
   - **Framework preset**: None
   - **Build command**: (비워두기)
   - **Build output directory**: `/`
   - **Root directory**: `/`

4. **환경 변수 및 바인딩 설정**
   - "Settings" → "Functions" → "D1 database bindings"
   - Variable name: `DB`
   - D1 database: `eco-chaser_db` 선택

5. **배포**
   - "Save and Deploy" 클릭
   - 배포 완료 후 제공되는 URL로 접속 (예: `https://ecochaser.pages.dev`)

### 방법 2: Wrangler CLI 직접 배포

```bash
# 로그인
wrangler login

# Pages 프로젝트 생성 및 배포
wrangler pages deploy . --project-name=ecochaser

# D1 바인딩 설정
wrangler pages deployment create ecochaser --binding DB=eco-chaser_db
```

## 🔄 자동 배포 설정

GitHub 연동 시 자동으로 설정됩니다:
- `main` 브랜치에 푸시하면 프로덕션 배포
- 다른 브랜치에 푸시하면 프리뷰 배포

## 🧪 로컬 개발

```bash
# 로컬 D1 데이터베이스 초기화
wrangler d1 execute eco-chaser_db --local --file=./schema.sql

# 개발 서버 실행
wrangler pages dev . --d1=DB=eco-chaser_db

# 브라우저에서 http://localhost:8788 접속
```

## 📝 API 엔드포인트

배포 후 다음 API를 사용할 수 있습니다:

- `POST /api/signup` - 회원가입
- `POST /api/login` - 로그인
- `GET /api/users` - 사용자 목록
- `POST /api/scores` - 점수 저장
- `GET /api/ranking` - 랭킹 조회
- `GET /api/scores/regions` - 지역별 통계
- `POST /api/admin/query` - 관리자 쿼리
- `GET /api/stats/region-waste` - 지역별 쓰레기 통계

## 🔍 문제 해결

### D1 바인딩 오류
Functions 설정에서 D1 바인딩이 올바르게 설정되었는지 확인:
- Variable name: `DB`
- Database: `eco-chaser_db`

### CORS 오류
`_middleware.js`가 `/functions/api/` 폴더에 있는지 확인

### 데이터베이스 초기화
프로덕션 DB 초기화가 필요한 경우:
```bash
wrangler d1 execute eco-chaser_db --remote --file=./schema.sql
```

## 📊 모니터링

Cloudflare 대시보드에서:
- Workers & Pages → 프로젝트 선택 → "Analytics"
- 요청 수, 에러율, 응답 시간 확인

## 🔐 보안 팁

1. 프로덕션에서는 비밀번호를 해싱 처리 권장
2. 관리자 API는 인증 추가 권장
3. Rate limiting 설정 고려

## 📞 도움말

- [Cloudflare Pages 문서](https://developers.cloudflare.com/pages/)
- [D1 문서](https://developers.cloudflare.com/d1/)
- [Wrangler 문서](https://developers.cloudflare.com/workers/wrangler/)
