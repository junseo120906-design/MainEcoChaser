# 🌿 EcoChaser

환경 보호 게임 - 쓰레기 분리수거 교육 플랫폼

## 🚀 빠른 시작

### 로컬 개발

```bash
# Wrangler 설치
npm install -g wrangler

# D1 로컬 데이터베이스 초기화
wrangler d1 execute eco-chaser_db --local --file=./schema.sql

# 개발 서버 실행
wrangler pages dev .
```

### 배포

자세한 배포 가이드는 [DEPLOYMENT.md](./DEPLOYMENT.md)를 참고하세요.

## 📁 프로젝트 구조

```
EcoChaser/
├── functions/          # Cloudflare Pages Functions (API)
│   └── api/
│       ├── _middleware.js    # CORS 설정
│       ├── login.js          # 로그인 API
│       ├── signup.js         # 회원가입 API
│       ├── users.js          # 사용자 관리
│       ├── ranking.js        # 랭킹 조회
│       ├── scores/           # 점수 관련 API
│       ├── admin/            # 관리자 API
│       └── stats/            # 통계 API
├── game/               # 게임 관련 파일
├── css/                # 스타일시트
├── js/                 # 클라이언트 JavaScript
├── index.html          # 메인 페이지
├── admin.html          # 관리자 페이지
├── wrangler.toml       # Cloudflare 설정
├── schema.sql          # D1 데이터베이스 스키마
└── DEPLOYMENT.md       # 배포 가이드
```

## 🗄️ 데이터베이스

### 테이블 구조

- **users** - 사용자 정보
- **game_scores** - 게임 점수 기록
- **game_waste_stats** - 쓰레기 종류별 통계

## 🔧 기술 스택

- **프론트엔드**: HTML, CSS, JavaScript
- **백엔드**: Cloudflare Pages Functions
- **데이터베이스**: Cloudflare D1 (SQLite)
- **배포**: Cloudflare Pages

## 📝 API 문서

### 인증

#### POST /api/signup
회원가입
```json
{
  "username": "user123",
  "password": "password",
  "nickname": "플레이어",
  "region": "seoul"
}
```

#### POST /api/login
로그인
```json
{
  "username": "user123",
  "password": "password"
}
```

### 게임

#### POST /api/scores
점수 저장
```json
{
  "playerName": "플레이어",
  "score": 100,
  "regionId": "seoul",
  "regionName": "서울",
  "wasteStats": [
    {
      "wasteType": "플라스틱",
      "correct": 5,
      "wrong": 1
    }
  ]
}
```

#### GET /api/ranking
랭킹 조회

#### GET /api/scores/regions
지역별 통계 조회

## 🤝 기여

풀 리퀘스트는 언제나 환영합니다!

## 📄 라이선스

MIT License
