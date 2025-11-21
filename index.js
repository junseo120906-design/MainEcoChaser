// 1. 필요한 도구들 불러오기
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// 👈 JSON 파일 경로가 하나로 변경됨
const DB_FILE = path.join(__dirname, 'db.json');

// 2. 서버 기본 설정
app.use(cors());
app.use(express.json());

// 3. DB 대신 JSON 파일 읽고 쓰는 도우미 함수 (수정됨)

// (파일을 읽어와서 JSON 객체로 변환)
const readDb = () => {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('파일 읽기 오류:', err);
        // 👈 파일이 없거나 비어있으면 기본 구조 반환
        return { users: [], scores: [] }; 
    }
};

// (JSON 객체를 문자열로 변환해서 파일에 덮어쓰기)
const writeDb = (data) => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('파일 쓰기 오류:', err);
    }
};

// ---------------------------------------------------
// 4. API 만들기 (db.json 파일 사용 버전)
// ---------------------------------------------------

/**
 * [회원가입 API]
 */
app.post('/signup', (req, res) => {
    const { username, password, nickname } = req.body;
    console.log('회원가입 요청 받음:', username, nickname);

    if (!username || !password || !nickname) {
        return res.status(400).json({ success: false, message: '모든 항목을 입력해주세요.' });
    }

    // 1. 전체 DB를 읽어옴
    const db = readDb(); 
    // 2. 그 안에서 users 배열을 꺼냄
    const users = db.users;

    // 아이디 또는 닉네임 중복 체크
    const isDuplicate = users.some(user => user.username === username || user.nickname === nickname);
    if (isDuplicate) {
        return res.status(400).json({ success: false, message: '아이디 또는 닉네임이 중복됩니다.' });
    }

    const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;

    const newUser = {
        id: newId,
        username: username,
        password: password,
        nickname: nickname
    };

    // 3. users 배열에 새 사용자를 추가
    db.users.push(newUser);
    // 4. 변경된 전체 db 객체를 파일에 씀
    writeDb(db); 

    console.log('회원가입 성공:', username);
    res.status(201).json({ success: true, message: '회원가입 성공!' });
});

/**
 * [로그인 API]
 */
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log('로그인 요청 받음:', username);

    const db = readDb();
    const users = db.users; // 👈 db에서 users 배열만 가져옴

    const user = users.find(u => u.username === username);

    if (!user) {
        console.log('로그인 실패: 해당 아이디 없음');
        return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 틀립니다.' });
    }

    if (user.password === password) {
        console.log('로그인 성공:', user.nickname);
        res.status(200).json({
            success: true,
            message: '로그인 성공!',
            nickname: user.nickname,
            userId: user.id
        });
    } else {
        console.log('로그인 실패: 비밀번호 불일치');
        res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 틀립니다.' });
    }
});

/**
 * [점수 저장 API]
 */
app.post('/submit-score', (req, res) => {
    const { userId, score, mistakes, wrongItems } = req.body;
    console.log('점수 저장 요청 받음:', '유저ID:', userId, '점수:', score);

    const db = readDb();

    const user = db.users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ success: false, message: '점수를 저장할 사용자를 찾을 수 없습니다.' });
    }

    const safeWrongItems = Array.isArray(wrongItems) ? wrongItems : [];
    const safeMistakes = Number.isFinite(mistakes) ? mistakes : safeWrongItems.length;

    const newScore = {
        userId: userId,
        score: Number(score),
        mistakes: Number(safeMistakes),
        wrongItems: safeWrongItems,
        nickname: user.nickname,
        createdAt: Date.now()
    };

    db.scores.push(newScore);
    writeDb(db);

    console.log('점수 저장 성공:', user.nickname, score, '오답:', newScore.mistakes);
    res.status(201).json({ success: true, message: '점수가 성공적으로 등록되었습니다.' });
});

/**
 * [랭킹 조회 API]
 */
app.get('/ranking', (req, res) => {
    console.log('랭킹 조회 요청 받음');

    const db = readDb();
    const scores = db.scores || [];

    // 1) 원본 배열을 건드리지 않도록 복사한 뒤, 피셔-예이츠로 섞기
    const shuffled = [...scores];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 2) 섞인 배열에서 상위 10개만 추출
    const picked = shuffled.slice(0, 10);

    // 3) 그 10개를 점수 내림차순(동점 시 오답 적은 순, 그다음 기록 시간 순)으로 정렬
    const sortedPicked = picked.sort((a, b) => {
        const aScore = Number(a.score) || 0;
        const bScore = Number(b.score) || 0;
        if (aScore !== bScore) return bScore - aScore; // 점수 높은 순

        const aMistakes = Number(a.mistakes) || 0;
        const bMistakes = Number(b.mistakes) || 0;
        if (aMistakes !== bMistakes) return aMistakes - bMistakes; // 오답 적은 순

        const aTime = Number(a.createdAt) || 0;
        const bTime = Number(b.createdAt) || 0;
        return aTime - bTime; // 먼저 기록한 순
    });

    const rankingData = sortedPicked.map(s => ({
        nickname: s.nickname,
        score: s.score,
        mistakes: Number(s.mistakes) || 0
    }));

    console.log('랭킹 데이터 전송:', rankingData.length, '개');
    res.status(200).json({ success: true, ranking: rankingData });
});

// 5. 서버 실행
app.listen(port, () => {
    console.log(`🚀 백엔드 서버가 http://localhost:${port} 에서 실행 중입니다.`);
    console.log(`(서버를 중지하려면 터미널에서 Ctrl+C 를 누르세요)`);
    console.log('---');
    console.log(`통합 DB 파일: ${DB_FILE}`); // 👈 경로 안내 수정
    console.log('---');
});