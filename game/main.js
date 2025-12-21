// API 설정 - Workers URL이 준비되면 여기에 입력
const API_BASE_URL = 'https://eco-chaser.pages.dev'; // 배포된 사이트 주소
const USE_API = true; // D1 API 사용

// localStorage 안전하게 사용하는 헬퍼 함수 (Safari/프라이빗 모드 대응)
const safeLocalStorage = {
    isAvailable: function() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch(e) {
            return false;
        }
    },
    getItem: function(key) {
        try {
            if (this.isAvailable()) {
                return localStorage.getItem(key);
            }
        } catch(e) {
            console.warn('localStorage access blocked:', e);
        }
        return null;
    },
    setItem: function(key, value) {
        try {
            if (this.isAvailable()) {
                localStorage.setItem(key, value);
                return true;
            }
        } catch(e) {
            console.warn('localStorage access blocked:', e);
        }
        return false;
    }
};

// 닉네임 욕설/비속어 필터 (간단한 금칙어 리스트 기반)
function isNicknameAllowed(name) {
    if (!name) return false;
    const lowered = name.toLowerCase();
    // 한글/영문에서 자주 쓰이는 욕설/비속어 일부를 필터링
    const banned = [
        'shit', 'fuck', 'wtf', 'bitch', 'bastard', 'asshole',
        'fuckyou', 'fucker', 'motherfucker', 'dick', 'cunt', 'slut',
        'sex', 'porn',
        '개새', '개새끼', '개색기', '개색끼',
        '씨발', '시발', '십알', 'ㅅㅂ',
        '좆', '좃',
        '병신', '븅신', 'ㅄ',
        '지랄', '미친',
        '닥쳐', '꺼져'
    ];

    // 공백/특수문자 제거 후도 검사 (예: s h i t, s*h*i*t)
    const compact = lowered.replace(/[^a-z0-9가-힣]+/g, '');

    return !banned.some((word) => lowered.includes(word) || compact.includes(word));
}

// THREE r128에는 CapsuleGeometry가 포함되어 있지 않아 커스텀 폴백을 제공
if (!THREE.CapsuleGeometry) {
    THREE.CapsuleGeometry = class CapsuleGeometry extends THREE.LatheGeometry {
        constructor(radius = 1, length = 1, capSegments = 8, radialSegments = 16) {
            const halfLength = Math.max(length, 0) * 0.5;
            const segments = Math.max(3, capSegments);
            const profile = [];

            for (let i = 0; i <= segments; i++) {
                const theta = (Math.PI / 2) - (i * Math.PI) / segments;
                profile.push(new THREE.Vector2(Math.cos(theta) * radius, halfLength + Math.sin(theta) * radius));
            }

            for (let i = 1; i <= segments; i++) {
                const theta = (Math.PI / 2) - (i * Math.PI) / segments;
                profile.push(new THREE.Vector2(Math.cos(theta) * radius, -halfLength - Math.sin(theta) * radius));
            }

            super(profile, Math.max(8, radialSegments));
            this.type = 'CapsuleGeometry';
        }
    };
}

// 키보드 이벤트 핸들러 저장용 (중복 등록 방지)
let keyboardHandler = null;

const state = {
    scene: null,
    camera: null,
    renderer: null,
    player: null,
    lanes: [-4, 0, 4], // 3 레인 (왼/중/오)
    playerLane: 1,
    roadSegments: [],
    laneLines: [], // 차선 라인들을 저장
    roadLength: 200,
    gameSpeed: 0.19,
    environmentObjects: [],
    isPlaying: false,
    animationId: null,
    score: 0,
    gameTime: 0,
    gameTimeLimit: 60, // 초
    regionData: null,
    regionId: '', // 선택한 지역 ID (예: kr_seoul, kr_busan)
    regionName: '', // 선택한 지역 이름 (예: 서울특별시)
    currentProblem: null,
    remainingProblems: [], // 이전 단일 세트 방식에서 사용 (현재는 미사용)
    currentQuestionSprite: null, // 이전 단일 세트 방식에서 사용 (현재는 미사용)
    bins: [], // 이전 단일 세트 방식에서 사용 (현재는 미사용)
    problemSets: [], // 여러 문제 세트: { problem, questionSprite, bins: [{ mesh, label, id, name, lane }], resolved }
    incorrectAnswers: [],
    playerName: '',
    language: 'ko',
    trackEndZ: null,
    regionStatsCache: null,
    selectedStatsRegionId: '',
    regionDetailCache: {},
};

const statsChartInstances = {
    score: null,
    practice: null,
    regionAccuracy: null,
    wrong: null,
};

const SCORE_BUCKETS = [
    { key: '0-20', min: 0, max: 20, labelKo: '0-20점', labelEn: '0-20 pts' },
    { key: '21-40', min: 21, max: 40, labelKo: '21-40점', labelEn: '21-40 pts' },
    { key: '41-60', min: 41, max: 60, labelKo: '41-60점', labelEn: '41-60 pts' },
    { key: '61-80', min: 61, max: 80, labelKo: '61-80점', labelEn: '61-80 pts' },
    { key: '81-100', min: 81, max: 100, labelKo: '81-100점', labelEn: '81-100 pts' },
];

const PRACTICE_BUCKETS = [
    { key: 'starter', min: 0, max: 39, labelKo: '미실천', labelEn: 'Needs Work' },
    { key: 'in_progress', min: 40, max: 69, labelKo: '보통', labelEn: 'In Progress' },
    { key: 'excellent', min: 70, max: 100, labelKo: '우수', labelEn: 'Excellent' },
];

const SCORE_BUCKET_COLORS = ['#ef5350', '#ffb74d', '#ffee58', '#81c784', '#2e7d32'];
const PRACTICE_BUCKET_COLORS = ['#ef9a9a', '#ffd54f', '#80cbc4'];

function getAllLocalScores() {
    try {
        return JSON.parse(safeLocalStorage.getItem('ecoGameScores') || '[]');
    } catch (error) {
        console.warn('Failed to parse local score cache:', error);
        return [];
    }
}

function statsText(koreanText, englishText) {
    return state.language === 'en' ? englishText : koreanText;
}

function computeMedian(values) {
    if (!values || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }
    return sorted[mid];
}

function buildDistributionCounts(buckets, scores) {
    const counts = buckets.map(() => 0);
    scores.forEach((score) => {
        const value = Number(score);
        if (Number.isNaN(value)) return;
        for (let i = 0; i < buckets.length; i++) {
            const bucket = buckets[i];
            if (value >= bucket.min && value <= bucket.max) {
                counts[i] += 1;
                break;
            }
        }
    });
    return buckets.map((bucket, index) => ({ key: bucket.key, count: counts[index] }));
}

function getBucketByKey(buckets, key) {
    return buckets.find((bucket) => bucket.key === key);
}

function getBucketLabel(bucket) {
    if (!bucket) return '';
    return state.language === 'en' ? bucket.labelEn : bucket.labelKo;
}

function formatPercent(count, total) {
    if (!total) return 0;
    return Math.round((count / total) * 100);
}

function formatDateLabel(timestamp) {
    if (!timestamp) return state.language === 'en' ? 'N/A' : '정보 없음';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return state.language === 'en' ? 'N/A' : '정보 없음';
    return date.toLocaleString(state.language === 'en' ? 'en-US' : 'ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

// 오답 통계 차트
// - 1순위: D1 기반 /api/stats/region-waste 에서 지역별 집계 데이터를 가져와 표시
// - 2순위(폴백): 현재 세션 state.incorrectAnswers 기반으로만 표시
async function renderWrongAnswerChart(regionIdForStats) {
    const canvas = document.getElementById('statsWrongChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');

    destroyStatsChart('wrong');

    const captionEl = document.getElementById('statsWrongCaption');

    // 1) 가능한 경우, D1 API를 사용해 지역별 오답 통계를 불러온다.
    const targetRegionId = regionIdForStats || state.selectedStatsRegionId || state.regionId || null;

    if (USE_API && targetRegionId) {
        try {
            const params = `?regionId=${encodeURIComponent(targetRegionId)}`;
            const res = await fetch(`${API_BASE_URL}/api/stats/region-waste${params}`);
            if (res.ok) {
                const raw = await res.json();
                const wasteData = Array.isArray(raw) ? raw : [];

                if (wasteData.length) {
                    const labels = wasteData.map((item) => item.wasteType || item.label || '기타');
                    const data = wasteData.map((item) => {
                        const rate = Number(item.wrongRate ?? 0);
                        return Math.max(0, Math.min(100, Math.round(rate * 100)));
                    });

                    // 항목별로 눈에 잘 들어오는 색상을 다르게 적용
                    const baseColors = [
                        '#f97373', // 빨강톤
                        '#fb923c', // 주황
                        '#facc15', // 노랑
                        '#4ade80', // 연두
                        '#60a5fa', // 파랑
                        '#c4b5fd', // 보라
                    ];
                    const backgroundColors = labels.map((_, idx) => baseColors[idx % baseColors.length]);

                    statsChartInstances.wrong = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels,
                            datasets: [
                                {
                                    label:
                                        state.language === 'en'
                                            ? 'Wrong answer rate'
                                            : '오답률(%)',
                                    data,
                                    backgroundColor: backgroundColors,
                                    borderColor: backgroundColors,
                                    borderWidth: 1,
                                },
                            ],
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                            },
                            scales: {
                                x: {
                                    ticks: { color: '#ffffff' },
                                },
                                y: {
                                    beginAtZero: true,
                                    max: 100,
                                    ticks: {
                                        precision: 0,
                                        color: '#ffffff',
                                        callback: (value) => `${value}%`,
                                    },
                                },
                            },
                        },
                    });

                    if (captionEl) {
                        captionEl.textContent =
                            state.language === 'en'
                                ? 'Wrong-answer rate by waste type, based on all runs in this region.'
                                : '이 지역에서 누적 플레이 기준으로 분리배출 항목별 오답률(%)을 집계한 그래프입니다.';
                    }
                    return; // D1 데이터로 성공적으로 렌더링했으므로 여기서 종료
                }
            }
        } catch (err) {
            console.error('D1 기반 오답 통계 불러오기 실패, 세션 기준으로 폴백:', err);
        }
    }

    // 2) D1 데이터를 사용할 수 없거나, 해당 지역 데이터가 없을 때는
    //    현재 세션의 state.incorrectAnswers 를 기준으로 간단한 오답 통계를 보여준다.
    const countsByCategory = {};
    if (Array.isArray(state.incorrectAnswers)) {
        state.incorrectAnswers.forEach((item) => {
            const key = item.correctAnswer || '기타';
            countsByCategory[key] = (countsByCategory[key] || 0) + 1;
        });
    }

    const labels = Object.keys(countsByCategory);
    const data = labels.map((label) => countsByCategory[label]);

    if (!labels.length) {
        if (captionEl) {
            captionEl.textContent =
                state.language === 'en'
                    ? 'No incorrect answers recorded in this session.'
                    : '이번 플레이에서는 오답이 없습니다.';
        }
        return;
    }

    // 세션 기준 오답 횟수 그래프도 동일한 팔레트를 사용
    const baseColors = [
        '#f97373',
        '#fb923c',
        '#facc15',
        '#4ade80',
        '#60a5fa',
        '#c4b5fd',
    ];
    const backgroundColors = labels.map((_, idx) => baseColors[idx % baseColors.length]);

    statsChartInstances.wrong = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: state.language === 'en' ? 'Wrong answers' : '오답 횟수',
                    data,
                    backgroundColor: backgroundColors,
                    borderColor: backgroundColors,
                    borderWidth: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: {
                    ticks: { color: '#ffffff' },
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        color: '#ffffff',
                    },
                },
            },
        },
    });

    if (captionEl) {
        captionEl.textContent =
            state.language === 'en'
                ? 'Number of incorrect answers by correct category (this session).'
                : '이번 플레이에서 정답 분리수거 통 기준으로 집계한 오답 횟수입니다.';
    }
}

function resolveBucketIndex(item, buckets) {
    if (!item) return -1;
    const candidates = [
        item.key,
        item.bucket,
        item.range,
        item.label,
        item.bucket_key,
    ]
        .filter(Boolean)
        .map((value) => value.toString());

    for (const raw of candidates) {
        const normalized = raw.replace(/\s+/g, '');
        const idx = buckets.findIndex(
            (bucket) =>
                bucket.key === normalized ||
                bucket.labelKo === raw ||
                bucket.labelEn === raw ||
                bucket.labelKo === normalized ||
                bucket.labelEn === normalized
        );
        if (idx >= 0) return idx;

        const digits = normalized.replace(/[^0-9-]/g, '');
        if (digits) {
            const digitIdx = buckets.findIndex((bucket) => bucket.key === digits);
            if (digitIdx >= 0) return digitIdx;
        }
    }

    if (typeof item.min === 'number' && typeof item.max === 'number') {
        const idx = buckets.findIndex(
            (bucket) => bucket.min === item.min && bucket.max === item.max
        );
        if (idx >= 0) return idx;
    }

    return -1;
}

function normalizeDistributionArray(rawData, buckets) {
    const normalized = buckets.map((bucket) => ({ key: bucket.key, count: 0 }));
    if (!Array.isArray(rawData)) {
        return normalized;
    }

    rawData.forEach((item) => {
        const idx = resolveBucketIndex(item, buckets);
        if (idx >= 0) {
            normalized[idx].count = Number(item.count ?? item.value ?? item.total ?? 0);
        }
    });

    return normalized;
}

function buildLocalRegionDetail(regionId) {
    const allScores = getAllLocalScores().filter((entry) => entry.regionId === regionId);
    const count = allScores.length;
    const scores = allScores.map((entry) => Number(entry.score) || 0);
    const total = scores.reduce((sum, value) => sum + value, 0);
    const bestScore = count ? Math.max(...scores) : 0;
    const lastPlayedEntry = allScores.reduce((latest, entry) => {
        if (!latest) return entry;
        return new Date(entry.timestamp) > new Date(latest.timestamp) ? entry : latest;
    }, null);

    return {
        regionId,
        regionName:
            allScores[0]?.regionName ||
            state.regionStatsCache?.[regionId]?.regionName ||
            state.regionName ||
            '',
        count,
        averageScore: count ? Math.round(total / count) : 0,
        bestScore,
        medianScore: computeMedian(scores),
        lastPlayed: lastPlayedEntry?.timestamp || null,
        scores,
        distribution: buildDistributionCounts(SCORE_BUCKETS, scores),
        practiceDistribution: buildDistributionCounts(PRACTICE_BUCKETS, scores),
    };
}

function normalizeRegionDetail(apiData, fallbackRegionId) {
    if (!apiData) return null;
    const rawScores = Array.isArray(apiData.scores)
        ? apiData.scores.map((entry) =>
              typeof entry === 'number' ? entry : Number(entry.score) || 0
          )
        : [];
    const count = apiData.count ?? rawScores.length ?? 0;
    const total = rawScores.reduce((sum, value) => sum + value, 0);

    return {
        regionId: apiData.region_id || apiData.regionId || fallbackRegionId,
        regionName: apiData.region_name || apiData.regionName || '',
        count,
        averageScore:
            apiData.average_score ??
            apiData.averageScore ??
            (count ? Math.round(total / count) : 0),
        bestScore:
            apiData.best_score ?? apiData.bestScore ?? (count ? Math.max(...rawScores) : 0),
        medianScore: apiData.median_score ?? apiData.medianScore ?? computeMedian(rawScores),
        lastPlayed:
            apiData.last_played ||
            apiData.lastPlayed ||
            (Array.isArray(apiData.recent_scores)
                ? apiData.recent_scores[0]?.timestamp
                : null),
        scores: rawScores,
        distribution: normalizeDistributionArray(
            apiData.distribution || apiData.score_distribution,
            SCORE_BUCKETS
        ),
        practiceDistribution: normalizeDistributionArray(
            apiData.practice_distribution || apiData.practice,
            PRACTICE_BUCKETS
        ),
    };
}

// 간단한 UI 다국어(i18n) 문자열
const i18n = {
    ko: {
        scoreLabel: '점수:',
        timerLabel: '남은 시간:',
        timerUnit: '초',
        introDescription:
            '러너 게임을 즐기며 자연스럽게 지역별 분리배출 규칙을 배워보세요!',
        introLanguageLabel: '언어',
        introRegionLabel: '지역 선택',
        playerNamePlaceholder: '이름을 입력하세요',
        startButton: '게임 시작',
        endingNamePlaceholder: '이름을 입력하세요',
        submitScoreButton: '점수 저장',
        endingTitle: '게임 종료!',
        rankingTitle: '🏆 랭킹',
        finalScoreLabel: '최종 점수:',
        finalScoreUnit: '점',
        restartButton: '다시 시작',
        noRecords: '아직 기록이 없습니다.',
        rankingHeaderRank: '순위',
        rankingHeaderName: '이름',
        rankingHeaderScore: '점수',
        rankingHeaderDate: '날짜',
        rankingScoreSuffix: '점',
        alertEnterName: '이름을 입력해주세요!',
        feedbackCorrect: '정답입니다! +10점',
        feedbackWrong: '틀렸습니다!',
        wrongAnswerTitle: '틀린 문제:',
        allCorrect: '모든 문제를 맞추셨습니다!',
        questionPrefix: '문제',
        selectedAnswerLabel: '선택한 답:',
        correctAnswerLabel: '정답:',
        explanationLabel: '설명:',
        regionLabelSeoul: '서울특별시',
        regionLabelBusan: '부산광역시',
        regionLabelIncheon: '인천광역시',
        regionLabelCheonan: '천안시',
        // 로그인/회원가입 및 기타 UI
        loginEmailPlaceholder: '이메일',
        loginPasswordPlaceholder: '비밀번호',
        signupEmailPlaceholder: '이메일',
        signupPasswordPlaceholder: '비밀번호',
        signupPasswordConfirmPlaceholder: '비밀번호 확인',
        loginButton: '로그인',
        signupButton: '회원가입',
        forgotPasswordButton: '비밀번호 찾기',
        signupConfirmButton: '확인',
        exitConfirmButton: '확인',
        exitCancelButton: '취소',
        reviewTitle: '오답노트',
        reviewRestartButton: '다시 시작',
        reviewBackButton: '닫기',
        rankingBackButton: '확인',
        rankingButton: '랭킹 보기',
        endingOkButton: '오답노트',
        shareButton: '공유하기',
        // 랭킹/통계 탭 및 설명
        rankingTabRegion: '지역별 랭킹',
        rankingTabPersonal: '지역 순위',
        rankingTabStats: '통계',
        rankingRegionDesc: '지역별 평균 점수 순위',
        rankingPersonalDesc: '{region} 플레이어 순위',
        rankingStatsDesc: '지역별 플레이 통계',
        // 공유 카드 라벨
        shareLabelNickname: '닉네임',
        shareLabelRegion: '플레이 지역',
        shareLabelScore: '점수',
        shareTitle: 'EcoChaser 게임 결과',
        // 설정 및 모달
        settingsTitle: '⚙️ 설정',
        settingsQuitGame: '🏠 게임 종료',
        settingsResumeGame: '▶️ 계속하기',
        settingsGoHome: '⬅️ 바탕화면으로',
        quitConfirmTitle: '⚠️ 게임 종료',
        quitConfirmBody:
            '정말 게임을 종료하시겠습니까?\n현재 진행 중인 게임은 저장되지 않으며, 점수에 반영되지 않습니다.',
        quitConfirmYes: '게임 종료',
        quitConfirmNo: '취소',
        exitModalBody: '게임을 나가시겠습니까?\n저장되지 않은 게임은 점수에 반영되지 않습니다.',
        scoreSavedMessage: '점수가 저장되었습니다!',
        scoreSavedOk: '확인',
        homeButton: '← 홈으로 돌아가기',
        // 이름/닉네임 관련 에러
        nameRequiredError: '이름을 입력해주세요.',
        profanityError:
            '닉네임에 비속어나 욕설이 포함되어 있습니다. 다시 입력해주세요.',
        // 공유 관련
        shareModalClose: '닫기',
        shareLinkCopied:
            '공유용 링크가 클립보드에 복사되었습니다. 친구에게 이 링크를 보내보세요!',
        // 오답노트용 배지/문제 라벨
        reviewQuestionPrefix: '문제',
        reviewWrongBadge: '오답',
    },
    en: {
        scoreLabel: 'Score:',
        timerLabel: 'Time left:',
        timerUnit: 's',
        introDescription:
            'Run through the city from a top-down view and sort the trash into the right bins!',
        introLanguageLabel: 'Language',
        introRegionLabel: 'Select Region',
        playerNamePlaceholder: 'Enter your name',
        startButton: 'Start Game',
        endingNamePlaceholder: 'Enter your name',
        submitScoreButton: 'Save Score',
        endingTitle: 'Game Over!',
        rankingTitle: '🏆 Ranking',
        finalScoreLabel: 'Final Score:',
        finalScoreUnit: 'pts',
        restartButton: 'Restart',
        noRecords: 'No records yet.',
        rankingHeaderRank: 'Rank',
        rankingHeaderName: 'Name',
        rankingHeaderScore: 'Score',
        rankingHeaderDate: 'Date',
        rankingScoreSuffix: 'pts',
        alertEnterName: 'Please enter your name!',
        feedbackCorrect: 'Correct! +10 pts',
        feedbackWrong: 'Wrong!',
        wrongAnswerTitle: 'Incorrect Questions:',
        allCorrect: 'You answered all questions correctly!',
        questionPrefix: 'Question',
        selectedAnswerLabel: 'Your answer:',
        correctAnswerLabel: 'Correct answer:',
        explanationLabel: 'Explanation:',
        regionLabelSeoul: 'Seoul',
        regionLabelBusan: 'Busan',
        regionLabelIncheon: 'Incheon',
        regionLabelCheonan: 'Cheonan',
        // 로그인/회원가입 및 기타 UI
        loginEmailPlaceholder: 'Email',
        loginPasswordPlaceholder: 'Password',
        signupEmailPlaceholder: 'Email',
        signupPasswordPlaceholder: 'Password',
        signupPasswordConfirmPlaceholder: 'Confirm Password',
        loginButton: 'Log In',
        signupButton: 'Sign Up',
        forgotPasswordButton: 'Forgot Password',
        signupConfirmButton: 'Confirm',
        exitConfirmButton: 'OK',
        exitCancelButton: 'Cancel',
        reviewTitle: 'Incorrect Answers',
        reviewRestartButton: 'Restart',
        reviewBackButton: 'Close',
        rankingBackButton: 'OK',
        rankingButton: 'View Ranking',
        endingOkButton: 'Review Answers',
        shareButton: 'Share',
        // 랭킹/통계 탭 및 설명
        rankingTabRegion: 'Region Ranking',
        rankingTabPersonal: 'Player Ranking',
        rankingTabStats: 'Stats',
        rankingRegionDesc: 'Average score by region',
        rankingPersonalDesc: 'Players in {region}',
        rankingStatsDesc: 'Play statistics by region',
        // 공유 카드 라벨
        shareLabelNickname: 'Nickname',
        shareLabelRegion: 'Region',
        shareLabelScore: 'Score',
        shareTitle: 'EcoChaser Result',
        // 설정 및 모달
        settingsTitle: '⚙️ Settings',
        settingsQuitGame: '🏠 Quit Game',
        settingsResumeGame: '▶️ Resume',
        settingsGoHome: '⬅️ Back to Home',
        quitConfirmTitle: '⚠️ Quit Game',
        quitConfirmBody:
            'Are you sure you want to quit?\nThe current run will not be saved and will not count toward your score.',
        quitConfirmYes: 'Quit Game',
        quitConfirmNo: 'Cancel',
        exitModalBody:
            'Do you want to leave the game?\nUnsaved runs will not be counted toward your score.',
        scoreSavedMessage: 'Your score has been saved!',
        scoreSavedOk: 'OK',
        homeButton: '← Back to Home',
        // 이름/닉네임 관련 에러
        nameRequiredError: 'Please enter your name.',
        profanityError:
            'Your nickname contains inappropriate words. Please choose another one.',
        // 공유 관련
        shareModalClose: 'Close',
        shareLinkCopied:
            'A share link has been copied to your clipboard. Send it to your friends!',
        // Review card labels
        reviewQuestionPrefix: 'Question',
        reviewWrongBadge: 'Incorrect',
    },
};

function t(key) {
    const langTable = i18n[state.language] || i18n.ko;
    return langTable[key] || key;
}

// 현재 선택된 언어를 UI에 반영
function applyLanguageToUI() {
    const scoreLabelEl = document.getElementById('scoreLabel');
    if (scoreLabelEl) scoreLabelEl.textContent = t('scoreLabel');

    // HUD 지역 라벨 (점수 옆)
    const regionLabelEl = document.getElementById('regionLabel');
    if (regionLabelEl) {
        // state.regionName에는 항상 한국어 전체 지역명이 들어 있으므로,
        // 영어 모드에서는 i18n의 짧은 라벨을 사용한다.
        let label = state.regionName || '';
        if (state.language === 'en') {
            switch (state.regionId) {
                case 'kr_seoul':
                    label = t('regionLabelSeoul');
                    break;
                case 'kr_busan':
                    label = t('regionLabelBusan');
                    break;
                case 'kr_incheon':
                    label = t('regionLabelIncheon');
                    break;
                case 'kr_cheonan':
                    label = t('regionLabelCheonan');
                    break;
                default:
                    break;
            }
        }
        regionLabelEl.textContent = label;
    }

    const timerLabelEl = document.getElementById('timerLabel');
    if (timerLabelEl) timerLabelEl.textContent = t('timerLabel');

    const timerUnitEl = document.getElementById('timeUnit');
    if (timerUnitEl) timerUnitEl.textContent = t('timerUnit');

    const introDescEl = document.getElementById('introDescription');
    if (introDescEl) introDescEl.textContent = t('introDescription');

    // 질문 패널 기본 문구
    const questionTextEl = document.getElementById('questionText');
    if (questionTextEl) {
        questionTextEl.textContent =
            state.language === 'en'
                ? 'Questions will start soon.'
                : '문제가 곧 시작됩니다.';
    }

    // 인트로 언어/지역 라벨
    const introLanguageLabelEl = document.querySelector('label[for="languageSelect"]');
    if (introLanguageLabelEl) introLanguageLabelEl.textContent = t('introLanguageLabel');

    // 시각적 라벨(div.field-label)과 숨겨진 label[for="regionSelect"] 둘 다 갱신
    const introRegionFieldLabelEl = document.querySelector('.region-field .field-label');
    if (introRegionFieldLabelEl) introRegionFieldLabelEl.textContent = t('introRegionLabel');

    const introRegionLabelEl = document.querySelector('label[for="regionSelect"]');
    if (introRegionLabelEl) introRegionLabelEl.textContent = t('introRegionLabel');

    const playerNameInput = document.getElementById('playerName');
    if (playerNameInput) playerNameInput.placeholder = t('playerNamePlaceholder');

    // 엔딩 이름 입력 모달
    const endingNameInput = document.getElementById('endingPlayerName');
    if (endingNameInput) endingNameInput.placeholder = t('endingNamePlaceholder');

    const submitScoreBtn = document.getElementById('submitScoreBtn');
    if (submitScoreBtn) submitScoreBtn.textContent = t('submitScoreButton');

    // 인트로 게임 시작 버튼
    const startGameIntroBtn = document.getElementById('startGameBtn');
    if (startGameIntroBtn) startGameIntroBtn.textContent = t('startButton');

    // 로그인/회원가입 입력창 placeholder
    const loginEmailInput = document.getElementById('loginEmail');
    if (loginEmailInput) loginEmailInput.placeholder = t('loginEmailPlaceholder');

    const loginPasswordInput = document.getElementById('loginPassword');
    if (loginPasswordInput) loginPasswordInput.placeholder = t('loginPasswordPlaceholder');

    const signupEmailInput = document.getElementById('signupEmail');
    if (signupEmailInput) signupEmailInput.placeholder = t('signupEmailPlaceholder');

    const signupPasswordInput = document.getElementById('signupPassword');
    if (signupPasswordInput) signupPasswordInput.placeholder = t('signupPasswordPlaceholder');

    const signupPasswordConfirmInput = document.getElementById('signupPasswordConfirm');
    if (signupPasswordConfirmInput)
        signupPasswordConfirmInput.placeholder = t('signupPasswordConfirmPlaceholder');

    const endingTitleEl = document.getElementById('endingTitle');
    if (endingTitleEl) endingTitleEl.textContent = t('endingTitle');

    const rankingTitleEl = document.getElementById('rankingTitle');
    if (rankingTitleEl) rankingTitleEl.textContent = t('rankingTitle');

    const finalScoreLabelEl = document.getElementById('finalScoreLabel');
    if (finalScoreLabelEl) finalScoreLabelEl.textContent = t('finalScoreLabel');

    const finalScoreUnitEl = document.getElementById('finalScoreUnit');
    if (finalScoreUnitEl) finalScoreUnitEl.textContent = t('finalScoreUnit');

    const restartBtn = document.getElementById('restartBtn');
    if (restartBtn) restartBtn.textContent = t('restartButton');

    // 엔딩 화면의 확인/랭킹 버튼
    const endingOkBtn = document.getElementById('reviewBtn');
    if (endingOkBtn) endingOkBtn.textContent = t('endingOkButton');

    const endingRankingBtn = document.getElementById('rankingBtn');
    if (endingRankingBtn) endingRankingBtn.textContent = t('rankingButton');

    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) shareBtn.textContent = t('shareButton');

    // 지역 셀렉트 박스 옵션 라벨
    const regionSelect = document.getElementById('regionSelect');
    if (regionSelect) {
        Array.from(regionSelect.options).forEach((opt) => {
            switch (opt.value) {
                case 'regions/kr_seoul.json':
                    opt.textContent = t('regionLabelSeoul');
                    break;
                case 'regions/kr_busan.json':
                    opt.textContent = t('regionLabelBusan');
                    break;
                case 'regions/kr_incheon.json':
                    opt.textContent = t('regionLabelIncheon');
                    break;
                case 'regions/kr_cheonan.json':
                    opt.textContent = t('regionLabelCheonan');
                    break;
                default:
                    break;
            }
        });
    }

    const regionCards = document.querySelectorAll('.region-card');
    if (regionCards.length) {
        regionCards.forEach((card) => {
            const nameEl = card.querySelector('.region-name');
            const tagEl = card.querySelector('.region-tag');
            if (nameEl) {
                nameEl.textContent =
                    state.language === 'en'
                        ? card.dataset.labelEn || nameEl.textContent
                        : card.dataset.labelKo || nameEl.textContent;
            }
            if (tagEl) {
                tagEl.textContent =
                    state.language === 'en'
                        ? card.dataset.tagEn || tagEl.textContent
                        : card.dataset.tagKo || tagEl.textContent;
            }
        });
    }

    // 리뷰/랭킹 화면 버튼 및 제목
    const reviewTitleEl = document.querySelector('#review h2');
    if (reviewTitleEl) reviewTitleEl.textContent = t('reviewTitle');

    const reviewRestartBtn = document.getElementById('reviewRestartBtn');
    if (reviewRestartBtn) reviewRestartBtn.textContent = t('reviewRestartButton');

    const reviewBackBtn = document.getElementById('reviewBackBtn');
    if (reviewBackBtn) reviewBackBtn.textContent = t('reviewBackButton');

    const rankingBackBtn = document.getElementById('rankingBackBtn');
    if (rankingBackBtn) rankingBackBtn.textContent = t('rankingBackButton');

    // 랭킹 탭 및 설명
    const regionTabBtn = document.getElementById('regionTabBtn');
    if (regionTabBtn) regionTabBtn.textContent = t('rankingTabRegion');

    const personalTabBtn = document.getElementById('personalTabBtn');
    if (personalTabBtn) personalTabBtn.textContent = t('rankingTabPersonal');

    const statsTabBtn = document.getElementById('statsTabBtn');
    if (statsTabBtn) statsTabBtn.textContent = t('rankingTabStats');

    const regionDesc = document.querySelector('#regionRanking .tab-description');
    if (regionDesc) regionDesc.textContent = t('rankingRegionDesc');

    const personalDesc = document.getElementById('personalRankingDesc');
    if (personalDesc) {
        const baseRegion =
            state.language === 'en'
                ? t('regionLabelSeoul')
                : '서울특별시';
        personalDesc.textContent = t('rankingPersonalDesc').replace('{region}', baseRegion);
    }

    const statsDesc = document.querySelector('#statsView .tab-description');
    if (statsDesc) statsDesc.textContent = t('rankingStatsDesc');

    // 로그인/회원가입 버튼들
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.textContent = t('loginButton');

    const signupBtn = document.getElementById('signupBtn');
    if (signupBtn) signupBtn.textContent = t('signupButton');

    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    if (forgotPasswordBtn) forgotPasswordBtn.textContent = t('forgotPasswordButton');

    const signupConfirmBtn = document.getElementById('signupConfirmBtn');
    if (signupConfirmBtn) signupConfirmBtn.textContent = t('signupConfirmButton');

    // 종료 모달 버튼
    const exitConfirmBtn = document.getElementById('exitConfirmBtn');
    if (exitConfirmBtn) exitConfirmBtn.textContent = t('exitConfirmButton');

    const exitCancelBtn = document.getElementById('exitCancelBtn');
    if (exitCancelBtn) exitCancelBtn.textContent = t('exitCancelButton');

    // 설정 메뉴 (톱니바퀴)
    const settingsTitleEl = document.querySelector('#settingsModal h3');
    if (settingsTitleEl) settingsTitleEl.textContent = t('settingsTitle');

    const quitGameBtn = document.getElementById('quitGameBtn');
    if (quitGameBtn) quitGameBtn.textContent = t('settingsQuitGame');

    const resumeGameBtn = document.getElementById('resumeGameBtn');
    if (resumeGameBtn) resumeGameBtn.textContent = t('settingsResumeGame');

    const goHomeBtn = document.getElementById('goHomeBtn');
    if (goHomeBtn) goHomeBtn.textContent = t('settingsGoHome');

    // 게임 종료 확인 모달
    const quitConfirmTitleEl = document.querySelector('#quitConfirmModal h3');
    if (quitConfirmTitleEl) quitConfirmTitleEl.textContent = t('quitConfirmTitle');

    const quitConfirmBodyEl = document.querySelector('#quitConfirmModal p');
    if (quitConfirmBodyEl) quitConfirmBodyEl.textContent = t('quitConfirmBody');

    const quitConfirmBtnEl = document.getElementById('quitConfirmBtn');
    if (quitConfirmBtnEl) quitConfirmBtnEl.textContent = t('quitConfirmYes');

    const quitCancelBtnEl = document.getElementById('quitCancelBtn');
    if (quitCancelBtnEl) quitCancelBtnEl.textContent = t('quitConfirmNo');

    // ESC 종료 확인 모달 본문
    const exitModalBodyEl = document.querySelector('#exitModal p');
    if (exitModalBodyEl) exitModalBodyEl.textContent = t('exitModalBody');

    // 점수 저장 완료 모달
    const scoreSavedMsgEl = document.getElementById('scoreSavedMessage');
    if (scoreSavedMsgEl) scoreSavedMsgEl.textContent = t('scoreSavedMessage');

    const scoreSavedOkBtn = document.getElementById('scoreSavedOkBtn');
    if (scoreSavedOkBtn) scoreSavedOkBtn.textContent = t('scoreSavedOk');

    // 엔딩 화면의 홈으로 돌아가기 버튼 (있다면)
    const homeButtonEl = document.querySelector('.intro-home-btn');
    if (homeButtonEl) homeButtonEl.textContent = t('homeButton');

    // 공유 요약 모달 닫기 버튼
    const shareSummaryCloseBtn = document.getElementById('shareSummaryCloseBtn');
    if (shareSummaryCloseBtn) shareSummaryCloseBtn.textContent = t('shareModalClose');
}

function createEndBarrier(z) {
    const group = new THREE.Group();

    const wallGeo = new THREE.BoxGeometry(40, 14, 4);
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x263238,
        roughness: 0.8,
        metalness: 0.1,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 7, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    const stripeGeo = new THREE.BoxGeometry(40.2, 0.6, 0.4);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x90caf9 });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(0, 10, z + 0.01);
    group.add(stripe);

    state.scene.add(group);
    state.environmentObjects.push(group);
}

// Three.js 초기화
function initThreeJS() {
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x87CEEB);

    // 캐릭터 뒤쪽·위에서 보는 시작 위치
    const aspect = window.innerWidth / window.innerHeight;
    state.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    state.camera.position.set(0, 8, -15);
    state.camera.lookAt(0, 2, 20);

    const container = document.getElementById('gameContainer');
    if (!container) {
        console.error('gameContainer not found!');
        return;
    }
    
    state.renderer = new THREE.WebGLRenderer({ 
        antialias: false, // 성능 향상을 위해 안티앨리어싱 끄기
        powerPreference: 'high-performance' // 고성능 GPU 우선
    });
    state.renderer.setSize(container.clientWidth, container.clientHeight);
    state.renderer.shadowMap.enabled = false; // 그림자 비활성화 (텍스처 유닛 절약)
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 고해상도 제한
    
    try {
        container.appendChild(state.renderer.domElement);
    } catch (e) {
        console.error('Failed to append renderer:', e);
    }

    // 주변광 (전체적인 밝기)
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    state.scene.add(ambient);

    // 주 광원 (태양광)
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(10, 30, 10);
    state.scene.add(dir);
    
    // 보조 광원 (반대편에서 은은하게)
    const fillLight = new THREE.DirectionalLight(0xb3e5fc, 0.3);
    fillLight.position.set(-15, 20, -10);
    state.scene.add(fillLight);
}

// 무한 도로 생성
function createRoad() {
    const roadGeo = new THREE.PlaneGeometry(16, state.roadLength);
    const roadMat = new THREE.MeshStandardMaterial({
        color: 0x707070, // 회색 도로
        roughness: 0.7,
        side: THREE.DoubleSide,
    });

    // 도로 세그먼트를 7개로 늘려서 시야 앞뒤 모두 여유롭게 유지 (앞/뒤 3개씩 + 현재)
    for (let i = -3; i <= 3; i++) {
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(0, 0, i * state.roadLength);
        road.receiveShadow = true;
        state.scene.add(road);
        state.roadSegments.push(road);
    }

    // 중앙선 & 레인 라인
    const lineGeo = new THREE.PlaneGeometry(0.2, 4);
    const laneMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
    });

    // 차선 표시 범위를 한 번 더 늘려 도로가 더 멀리까지 보이도록 함
    state.laneLines = []; // 차선 배열 초기화
    for (let z = 0; z < state.roadLength * 10; z += 6) {
        const left = new THREE.Mesh(lineGeo, laneMat);
        left.rotation.x = -Math.PI / 2;
        left.position.set(-2, 0.01, z);
        state.scene.add(left);
        state.laneLines.push({ mesh: left, baseZ: z });

        const right = new THREE.Mesh(lineGeo, laneMat);
        right.rotation.x = -Math.PI / 2;
        right.position.set(2, 0.01, z);
        state.scene.add(right);
        state.laneLines.push({ mesh: right, baseZ: z });
    }
}

// ============================================================
// 배경 환경 요소 함수들은 environment.js 파일로 이동되었습니다
// ============================================================

// 3D 쓰레기통 생성 (사진 그대로 재현)
function createTrashBin(color, labelText = '') {
    const bin = new THREE.Group();

    // 몸통용 캔버스 텍스처 생성 (평면 색 + 중앙 라벨) - 고해상도
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');

    // 배경색 (쓰레기통 색상)
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 정면 중앙에 흰색 배경판 + 텍스트
    if (labelText) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const plateWidth = 960; // 기존보다 약간 넓게
        const plateHeight = 540; // 기존보다 약간 높게
        const cx = canvas.width / 2;
        const cy = 1160;

        // 흰색 사각형 배경 (둥근 모서리)
        const cornerRadius = 70;
        ctx.beginPath();
        ctx.moveTo(cx - plateWidth/2 + cornerRadius, cy - plateHeight/2);
        ctx.lineTo(cx + plateWidth/2 - cornerRadius, cy - plateHeight/2);
        ctx.quadraticCurveTo(cx + plateWidth/2, cy - plateHeight/2, cx + plateWidth/2, cy - plateHeight/2 + cornerRadius);
        ctx.lineTo(cx + plateWidth/2, cy + plateHeight/2 - cornerRadius);
        ctx.quadraticCurveTo(cx + plateWidth/2, cy + plateHeight/2, cx + plateWidth/2 - cornerRadius, cy + plateHeight/2);
        ctx.lineTo(cx - plateWidth/2 + cornerRadius, cy + plateHeight/2);
        ctx.quadraticCurveTo(cx - plateWidth/2, cy + plateHeight/2, cx - plateWidth/2, cy + plateHeight/2 - cornerRadius);
        ctx.lineTo(cx - plateWidth/2, cy - plateHeight/2 + cornerRadius);
        ctx.quadraticCurveTo(cx - plateWidth/2, cy - plateHeight/2, cx - plateWidth/2 + cornerRadius, cy - plateHeight/2);
        ctx.closePath();
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        // 테두리
        ctx.lineWidth = 22;
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.stroke();

        // 텍스트
        // 기본 폰트 크기: 한글 기준 340px, 영어/긴 텍스트는 조금 작게 시작
        let fontSize = 340;
        if (state.language === 'en' || (labelText && labelText.length > 4)) {
            fontSize = 280;
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 줄바꿈 처리: 영어 등 공백이 있는 텍스트는 2줄로 나누어 가운데 정렬
        let lines = [labelText];
        if (labelText && /\s/.test(labelText)) {
            const parts = labelText.split(/\s+/);
            if (parts.length >= 2) {
                lines = [parts[0], parts.slice(1).join(' ')];
            }
        }

        // plate 안에 모든 줄이 들어오도록 측정해서 필요 시 폰트 크기 축소
        const maxTextWidth = plateWidth * 0.8;
        function applyFont() {
            ctx.font = `900 ${fontSize}px Noto Sans KR, Arial, sans-serif`;
        }

        applyFont();
        let maxWidth = 0;
        for (const line of lines) {
            const m = ctx.measureText(line);
            maxWidth = Math.max(maxWidth, m.width);
        }
        while (maxWidth > maxTextWidth && fontSize > 140) {
            fontSize -= 10;
            applyFont();
            maxWidth = 0;
            for (const line of lines) {
                const m = ctx.measureText(line);
                maxWidth = Math.max(maxWidth, m.width);
            }
        }

        // 줄 수에 따라 세로 위치 분배 (1줄: 가운데, 2줄: 위/아래로 충분히 띄워서 나눔)
        const lineOffsets =
            lines.length === 2
                ? [-fontSize * 0.5, fontSize * 0.5]
                : [0];

        // 검은색 외곽선 + 글자
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 10;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.fillStyle = '#000000';

        lines.forEach((line, idx) => {
            const y = cy + lineOffsets[idx] || 0;
            ctx.strokeText(line, cx, y);
            ctx.fillText(line, cx, y);
        });
    }

    const bodyTexture = new THREE.CanvasTexture(canvas);
    bodyTexture.anisotropy = 16;
    bodyTexture.needsUpdate = true;

    // 치수 정의 (가로로 넓고 높이는 낮게)
    const bodyWidth = 2.0;
    const bodyDepth = 1.15;
    const bodyHeight = 2.2;
    
    const lidWidth = bodyWidth * 1.05;
    const lidDepth = bodyDepth * 1.05;
    const lidThickness = 0.1;

    // 몸통 (단순 박스) - 단색
    const bodyGeo = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
    const bodyMat = new THREE.MeshStandardMaterial({
        map: bodyTexture,
        roughness: 0.7,
        metalness: 0.05,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = bodyHeight / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    bin.add(body);
    
    // 뚜껑 베이스 (평평한 판) - 같은 색의 진한 버전
    const darkerColor = new THREE.Color(color).multiplyScalar(0.75);
    const lidGeo = new THREE.BoxGeometry(lidWidth, lidThickness, lidDepth);
    const lidMat = new THREE.MeshStandardMaterial({
        color: darkerColor,
        roughness: 0.65,
        metalness: 0.05,
    });
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.y = bodyHeight + lidThickness / 2;
    lid.castShadow = true;
    bin.add(lid);

    // 뚜껑 위 경사진 부분 (뒤가 높음)
    const slopedTopGeo = new THREE.BoxGeometry(lidWidth * 0.95, 0.38, lidDepth * 0.85);
    const slopedTop = new THREE.Mesh(slopedTopGeo, lidMat);
    slopedTop.position.set(0, bodyHeight + lidThickness + 0.16, -0.06);
    slopedTop.rotation.x = -0.15;
    slopedTop.castShadow = true;
    bin.add(slopedTop);

    // 뚜껑 투입구 프레임 (검은색 내부 없이)
    const openingWidth = 0.68;
    const openingDepth = 0.42;
    const openingHeight = 0.2;
    
    const openingFrameGeo = new THREE.BoxGeometry(openingWidth, openingHeight, openingDepth);
    const openingFrame = new THREE.Mesh(openingFrameGeo, lidMat);
    openingFrame.position.set(0, bodyHeight + lidThickness + 0.3, 0.14);
    openingFrame.castShadow = true;
    bin.add(openingFrame);

    // 뚜껑 앞쪽 손잡이 바
    const frontHandleGeo = new THREE.BoxGeometry(lidWidth * 0.75, 0.08, 0.08);
    const frontHandle = new THREE.Mesh(frontHandleGeo, lidMat);
    frontHandle.position.set(0, bodyHeight + lidThickness + 0.06, lidDepth / 2 + 0.03);
    bin.add(frontHandle);

    // 뚜껑 뒤쪽 경첩 힌지
    const hingeGeo = new THREE.BoxGeometry(0.16, 0.11, 0.13);
    const hinge1 = new THREE.Mesh(hingeGeo, lidMat);
    hinge1.position.set(-lidWidth * 0.3, bodyHeight + lidThickness + 0.34, -lidDepth / 2 + 0.06);
    bin.add(hinge1);

    const hinge2 = hinge1.clone();
    hinge2.position.x = lidWidth * 0.3;
    bin.add(hinge2);

    // 바퀴 (양옆 아래)
    const wheelRadius = 0.14;
    const wheelThickness = 0.16;
    const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 20);
    const wheelMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.85,
    });

    // 왼쪽 바퀴
    const wheelLeft = new THREE.Mesh(wheelGeo, wheelMat);
    wheelLeft.rotation.z = Math.PI / 2;
    wheelLeft.position.set(-bodyWidth * 0.45, wheelRadius, 0);
    wheelLeft.castShadow = true;
    bin.add(wheelLeft);

    // 왼쪽 바퀴 림
    const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.5, wheelRadius * 0.5, wheelThickness * 1.1, 20);
    const rimMat = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.75,
    });
    const rimLeft = new THREE.Mesh(rimGeo, rimMat);
    rimLeft.rotation.z = Math.PI / 2;
    rimLeft.position.set(-bodyWidth * 0.45, wheelRadius, 0);
    bin.add(rimLeft);

    // 오른쪽 바퀴
    const wheelRight = wheelLeft.clone();
    wheelRight.position.set(bodyWidth * 0.45, wheelRadius, 0);
    wheelRight.castShadow = true;
    bin.add(wheelRight);

    // 오른쪽 바퀴 림
    const rimRight = rimLeft.clone();
    rimRight.position.set(bodyWidth * 0.45, wheelRadius, 0);
    bin.add(rimRight);

    return bin;
}
function createPlayer() {
    const player = new THREE.Group();

    const palette = {
        skin: 0xffe4c3,
        hair: 0x4c2d1c,
        hairTint: 0x6b3b23,
        shirt: 0x2a88ff,
        panel: 0x5ed44e,
        cuff: 0x1a5fd1,
        pant: 0x1a5ed1,
        pantAccent: 0x3f8cff,
        shoe: 0x279943,
        shoeAccent: 0x1e6f32,
        backpack: 0x35a646,
        backpackAccent: 0x66f08d,
        strap: 0x1d742f,
        strapClip: 0x0f3d1f,
        buckle: 0xd8f5d5,
    };

    const skinMat = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.6 });
    const hairMat = new THREE.MeshStandardMaterial({ color: palette.hair, roughness: 0.35 });
    const hairTintMat = new THREE.MeshStandardMaterial({ color: palette.hairTint, roughness: 0.4 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: palette.shirt, roughness: 0.4, metalness: 0.04 });
    const panelMat = new THREE.MeshStandardMaterial({ color: palette.panel, roughness: 0.3 });
    const cuffMat = new THREE.MeshStandardMaterial({ color: palette.cuff, roughness: 0.42 });
    const backpackMat = new THREE.MeshStandardMaterial({ color: palette.backpack, roughness: 0.4 });
    const backpackAccentMat = new THREE.MeshStandardMaterial({ color: palette.backpackAccent, roughness: 0.34 });
    const strapMat = new THREE.MeshStandardMaterial({ color: palette.strap, roughness: 0.55 });
    const strapClipMat = new THREE.MeshStandardMaterial({ color: palette.strapClip, roughness: 0.45 });
    const buckleMat = new THREE.MeshStandardMaterial({ color: palette.buckle, roughness: 0.2 });
    const pantMat = new THREE.MeshStandardMaterial({ color: palette.pant, roughness: 0.45 });
    const pantAccentMat = new THREE.MeshStandardMaterial({ color: palette.pantAccent, roughness: 0.4 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: palette.shoe, roughness: 0.45 });
    const shoeAccentMat = new THREE.MeshStandardMaterial({ color: palette.shoeAccent, roughness: 0.55 });

    // 머리 (살짝 줄여서 자연스러운 비율)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 30, 30), skinMat);
    head.scale.set(1.0, 1.06, 1.0);
    head.position.set(0, 1.48, 0);
    head.castShadow = true;
    player.add(head);
    player.userData.head = head;

    const hairShell = new THREE.Mesh(new THREE.SphereGeometry(0.36, 26, 26, 0, Math.PI * 2, 0, Math.PI * 0.7), hairMat);
    hairShell.position.set(0, 1.54, -0.012);
    hairShell.castShadow = true;
    player.add(hairShell);

    const hairBand = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 16, 32), hairTintMat);
    hairBand.rotation.x = Math.PI / 2;
    hairBand.position.set(0, 1.5, 0.05);
    player.add(hairBand);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.1, 0.11, 18), skinMat);
    neck.position.set(0, 1.26, 0);
    player.add(neck);

    // 상체
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 0.98, 0);
    player.add(torsoGroup);
    player.userData.body = torsoGroup;
    player.userData.bodyBaseY = torsoGroup.position.y;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.82, 0.24), shirtMat);
    torso.castShadow = true;
    torsoGroup.add(torso);

    const torsoPanel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.01), panelMat);
    torsoPanel.position.set(0, 0, 0.14);
    torsoGroup.add(torsoPanel);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 14, 32), cuffMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.36, 0);
    torsoGroup.add(collar);

    const waistBand = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.24), pantAccentMat);
    waistBand.position.set(0, -0.34, 0);
    torsoGroup.add(waistBand);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.24), pantMat);
    pelvis.position.set(0, 0.54, 0);
    pelvis.castShadow = true;
    player.add(pelvis);
    player.userData.pelvis = pelvis;

    // 백팩 (네모 가방 느낌, 살짝 둥근 모서리)
    const backpackGroup = new THREE.Group();
    // 어깨 바로 아래, 등에 밀착
    backpackGroup.position.set(0, 0.98, -0.19);
    player.add(backpackGroup);
    player.userData.backpackGroup = backpackGroup;

    const backpackBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.18), backpackMat);
    backpackBody.castShadow = true;
    backpackGroup.add(backpackBody);

    // 아래쪽을 살짝 부풀린 앞 주머니
    const backpackPocket = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.08), backpackAccentMat);
    backpackPocket.position.set(0, -0.08, 0.12);
    backpackGroup.add(backpackPocket);

    // 가방 윗부분의 얇은 덮개 느낌
    const backpackFlap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.19), backpackMat);
    backpackFlap.position.set(0, 0.2, 0.0);
    backpackGroup.add(backpackFlap);

    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 12, 32), strapMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0.38, -0.02);
    backpackGroup.add(handle);

    const strapGeo = new THREE.BoxGeometry(0.055, 0.9, 0.03);
    const leftStrap = new THREE.Mesh(strapGeo, strapMat);
    leftStrap.position.set(-0.28, 0.94, 0.08);
    player.add(leftStrap);
    const rightStrap = leftStrap.clone();
    rightStrap.position.x = 0.28;
    player.add(rightStrap);

    const strapClip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.03), strapClipMat);
    strapClip.position.set(0, 0.86, 0.17);
    player.add(strapClip);

    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.028), buckleMat);
    buckle.position.set(0, 0.86, 0.2);
    player.add(buckle);

    player.userData.backpackBaseY = backpackGroup.position.y;

    // 팔 (둥근 원통 느낌의 단단한 실루엣)
    const upperArmGeo = new THREE.CylinderGeometry(0.088, 0.088, 0.34, 18);
    const lowerArmGeo = new THREE.CylinderGeometry(0.082, 0.082, 0.25, 18);
    const handGeo = new THREE.SphereGeometry(0.075, 14, 14);

    const createArm = (side = 'left') => {
        const dir = side === 'left' ? -1 : 1;
        const armGroup = new THREE.Group();
        armGroup.position.set(0.4 * dir, 1.08, 0);
        player.add(armGroup);

        const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 20), shirtMat);
        shoulder.position.y = 0.02;
        armGroup.add(shoulder);

        const upper = new THREE.Mesh(upperArmGeo, shirtMat);
        upper.position.y = -0.18;
        upper.castShadow = true;
        armGroup.add(upper);

        const elbowGroup = new THREE.Group();
        elbowGroup.position.y = -0.36;
        armGroup.add(elbowGroup);

        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 16), cuffMat);
        cuff.position.set(0, -0.02, 0);
        elbowGroup.add(cuff);

        const forearm = new THREE.Mesh(lowerArmGeo, cuffMat);
        forearm.position.y = -0.14;
        forearm.castShadow = true;
        elbowGroup.add(forearm);

        const hand = new THREE.Mesh(handGeo, skinMat);
        hand.position.set(0, -0.28, 0);
        elbowGroup.add(hand);

        if (side === 'left') {
            player.userData.leftArmGroup = armGroup;
            player.userData.leftForearmGroup = elbowGroup;
        } else {
            player.userData.rightArmGroup = armGroup;
            player.userData.rightForearmGroup = elbowGroup;
        }
    };

    createArm('left');
    createArm('right');

    // 다리 (원통 다리 + 스니커즈 형태 신발)
    const thighGeo = new THREE.CylinderGeometry(0.13, 0.12, 0.48, 18);
    const calfGeo = new THREE.CylinderGeometry(0.11, 0.1, 0.4, 18);
    const ankleGeo = new THREE.SphereGeometry(0.075, 14, 14);
    const footGeo = new THREE.BoxGeometry(0.26, 0.11, 0.32);

    const createLeg = (side = 'left') => {
        const dir = side === 'left' ? -1 : 1;
        const legGroup = new THREE.Group();
        legGroup.position.set(0.16 * dir, 0.5, 0);
        player.add(legGroup);

        const thigh = new THREE.Mesh(thighGeo, pantMat);
        thigh.position.y = -0.26;
        thigh.castShadow = true;
        legGroup.add(thigh);

        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.012), pantAccentMat);
        stripe.position.set(0.05 * dir, -0.16, 0.12);
        legGroup.add(stripe);

        const kneeGroup = new THREE.Group();
        kneeGroup.position.y = -0.52;
        legGroup.add(kneeGroup);

        const calf = new THREE.Mesh(calfGeo, pantMat);
        calf.position.y = -0.2;
        calf.castShadow = true;
        kneeGroup.add(calf);

        const ankleGroup = new THREE.Group();
        ankleGroup.position.y = -0.42;
        kneeGroup.add(ankleGroup);

        // 발목과 신발의 경계를 보여주는 카라
        const ankleCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 18), shoeAccentMat);
        ankleCollar.position.y = 0.0;
        ankleGroup.add(ankleCollar);

        const shoe = new THREE.Mesh(footGeo, shoeMat);
        shoe.position.set(0, -0.1, 0.09);
        shoe.castShadow = true;
        ankleGroup.add(shoe);

        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.36), shoeAccentMat);
        sole.position.set(0, -0.145, 0.09);
        ankleGroup.add(sole);

        if (side === 'left') {
            player.userData.leftLegGroup = legGroup;
            player.userData.leftKneeGroup = kneeGroup;
            player.userData.leftAnkleGroup = ankleGroup;
        } else {
            player.userData.rightLegGroup = legGroup;
            player.userData.rightKneeGroup = kneeGroup;
            player.userData.rightAnkleGroup = ankleGroup;
        }
    };

    createLeg('left');
    createLeg('right');

    player.userData.animationTime = 0;

    player.position.set(state.lanes[state.playerLane], 1.02, 5);
    state.scene.add(player);
    state.player = player;
}

// 2D 캔버스 텍스트 스프라이트 생성 헬퍼
function createTextSprite(text, width = 512, height = 128, fontSize = 36) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, width, height);
    ctx.font = `bold ${fontSize}px Noto Sans KR`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
    });
    const sprite = new THREE.Sprite(mat);
    return sprite;
}

// 지역 데이터 로드
async function loadRegionData() {
    const select = document.getElementById('regionSelect');
    const file = select.value;

    try {
        const res = await fetch(file);
        state.regionData = await res.json();
        
        // regionId와 regionName을 state에 저장
        if (state.regionData) {
            state.regionId = state.regionData.regionId || '';
            state.regionName = state.regionData.regionName || '';
            state.selectedStatsRegionId = state.regionId;
        }
    } catch (e) {
        console.error('Failed to load region data', e);
        // 기본 값
        state.regionData = {
            regionId: 'kr_seoul',
            regionName: '서울특별시',
            bins: [
                {
                    id: 'general',
                    name: '일반쓰레기',
                    name_en: 'General Waste',
                    color: 0x757575,
                },
                {
                    id: 'recycle',
                    name: '재활용',
                    name_en: 'Recyclables',
                    color: 0x2196f3,
                },
                {
                    id: 'food',
                    name: '음식물',
                    name_en: 'Food Waste',
                    color: 0xffb74d,
                },
            ],
            problems: [
                {
                    question: '어떤 쓰레기를 버려야 할까요? (플라스틱 병)',
                    question_en:
                        'Which bin should this go into? (Plastic bottle)',
                    answer: 'recycle',
                    explanation: '플라스틱 병은 재활용으로 분류됩니다.',
                    explanation_en: 'Plastic bottles go into the recycling bin.',
                },
            ],
        };
        state.regionId = 'kr_seoul';
        state.regionName = '서울특별시';
        state.selectedStatsRegionId = state.regionId;
    }
}

// JSON의 모든 문제를 기반으로 여러 세트(쓰레기통 3개 + 위 타입 라벨 + 문제 스프라이트)를
// z 축 방향으로 간격을 두고 한 번에 생성
function createAllProblemSets() {
    // 이전 세트들 제거
    if (state.problemSets && state.problemSets.length > 0) {
        state.problemSets.forEach((set) => {
            if (set.questionSprite) state.scene.remove(set.questionSprite);
            if (Array.isArray(set.bins)) {
                set.bins.forEach((b) => {
                    if (b.mesh) state.scene.remove(b.mesh);
                    if (b.label) state.scene.remove(b.label);
                });
            }
        });
    }
    state.problemSets = [];

    if (!state.regionData || !state.regionData.bins || state.regionData.bins.length < 3)
        return;
    const binsData = state.regionData.bins;
    const allProblems = Array.isArray(state.regionData.problems)
        ? state.regionData.problems
        : [];

    if (allProblems.length === 0) return;

    const shuffledProblems = allProblems.slice();
    for (let i = shuffledProblems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = shuffledProblems[i];
        shuffledProblems[i] = shuffledProblems[j];
        shuffledProblems[j] = temp;
    }

    const maxProblems = 10;
    const problems = shuffledProblems.slice(0, Math.min(maxProblems, shuffledProblems.length));

    // 첫 번째 세트 시작 z, 세트 간 간격
    const firstStartZ = 60;
    const gapZ = 40; // 세트 사이 간격

    let lastBaseZ = firstStartZ;

    problems.forEach((problem, index) => {
        const baseZ = firstStartZ + index * gapZ;
        lastBaseZ = baseZ;

        // 각 문제 세트마다 쓰레기통 종류를 랜덤 배치
        const shuffledBins = [...binsData].sort(() => Math.random() - 0.5);

        const setBins = [];
        for (let i = 0; i < 3; i++) {
            const binData = shuffledBins[i];

            // 쓰레기통 색상: 타입별 고정 색상 사용
            // general(일반) = 노란색, recycle(재활용) = 파란색, food(음식물) = 초록색
            let fixedColor;
            switch (binData.id) {
                case 'general':
                    fixedColor = 0xffe66d; // 노란색 계열
                    break;
                case 'recycle':
                    fixedColor = 0x2196f3; // 파란색
                    break;
                case 'food':
                    fixedColor = 0x4caf50; // 초록색
                    break;
                default:
                    fixedColor = 0x95e1d3; // 예비용 민트색
                    break;
            }

            // 라벨 텍스트 준비
            const binLabelText =
                state.language === 'en' && binData.name_en
                    ? binData.name_en
                    : binData.name;
            
            const bin = createTrashBin(fixedColor, binLabelText);
            
            bin.castShadow = true;
            bin.position.set(state.lanes[i], 0, baseZ);

            // 쓰레기통 크기 설정 (조금 더 크게)
            bin.scale.set(1.25, 1.25, 1.25);

            state.scene.add(bin);

            setBins.push({
                mesh: bin,
                id: binData.id,
                // name은 항상 기본(한글) 이름을 보존
                name: binData.name,
                lane: i,
            });
        }

        state.problemSets.push({
            problem,
            questionSprite: null,
            bins: setBins,
            resolved: false, // 판정 완료 여부
        });
    });

    // 트랙 끝 z 값 저장 (마지막 문제 세트의 위치 기준)
    state.trackEndZ = lastBaseZ;

    // 첫 번째 미해결 세트를 기준으로 상단 문제 패널 텍스트를 갱신
    updateQuestionPanelForNextSet();
}

// 상단 문제 패널에 다음 문제 텍스트를 반영
function updateQuestionPanelForNextSet() {
    const panel = document.getElementById('questionPanel');
    const textEl = document.getElementById('questionText');
    if (!panel || !textEl) return;

    const nextSet = state.problemSets.find((s) => !s.resolved);
    if (!nextSet) {
        panel.style.display = 'none';
        textEl.textContent = '';
        return;
    }

    const problem = nextSet.problem;
    const questionText =
        state.language === 'en' && problem.question_en
            ? problem.question_en
            : problem.question;

    textEl.textContent = questionText || '';
    panel.style.display = 'block';
}

// HUD 업데이트
function updateHUD() {
    const scoreEl = document.getElementById('score');
    if (scoreEl) {
        scoreEl.textContent = state.score;
    }

    const timeLeft = Math.max(0, Math.ceil(state.gameTimeLimit - state.gameTime));
    document.getElementById('timeLeft').textContent = timeLeft;

    const regionLabelEl = document.getElementById('regionLabel');
    if (regionLabelEl) {
        let label = state.regionName || '';
        if (state.language === 'en') {
            switch (state.regionId) {
                case 'kr_seoul':
                    label = t('regionLabelSeoul');
                    break;
                case 'kr_busan':
                    label = t('regionLabelBusan');
                    break;
                case 'kr_incheon':
                    label = t('regionLabelIncheon');
                    break;
                case 'kr_cheonan':
                    label = t('regionLabelCheonan');
                    break;
                default:
                    break;
            }
        }
        regionLabelEl.textContent = label;
    }
}

// 피드백 표시
function showFeedback(message, isCorrect) {
    const el = document.getElementById('feedbackMessage');
    el.textContent = message;
    el.className = isCorrect ? 'correct' : 'incorrect';
    el.style.display = 'block';
    setTimeout(() => {
        el.style.display = 'none';
    }, 1200);
}

// 오답 말풍선 표시
function showWrongAnswerBubble(questionText, yourAnswer, correctAnswer) {
    const bubble = document.getElementById('wrongAnswerBubble');
    const bubbleText = document.getElementById('bubbleText');
    
    if (!bubble || !bubbleText) return;

    // 한국어일 때는 풀 지역명 + 고정 문장 패턴으로 표시
    let message;
    if (state.language === 'ko') {
        let itemPart = '';
        if (typeof questionText === 'string' && questionText.length > 0) {
            // "고구마 껍질은 어디에 버려야 할까요?" 에서 "고구마 껍질" 부분만 추출
            const m = questionText.match(/^(.+?)(은|를|을)/);
            if (m) {
                itemPart = m[1];
                // 질문 앞부분에 포함된 "서울에서/부산에서/인천에서/천안에서" 같은 지역 표현 제거
                itemPart = itemPart
                    .replace(/^서울에서\s*/, '')
                    .replace(/^부산에서\s*/, '')
                    .replace(/^인천에서\s*/, '')
                    .replace(/^천안에서\s*/, '');
            }
        }

        // 지역 ID 기준으로 풀 지역명 통일
        // (지역 선택 UI의 라벨과 1:1로 맞춤)
        let regionFullName = '';
        switch (state.regionId) {
            case 'kr_seoul':
                regionFullName = '서울특별시';
                break;
            case 'kr_busan':
                regionFullName = '부산광역시';
                break;
            case 'kr_incheon':
                regionFullName = '인천광역시';
                break;
            case 'kr_cheonan':
                regionFullName = '천안시';
                break;
            default:
                regionFullName = '';
                break;
        }

        // 혹시라도 공백 뒤에 다른 단어(예: "서울")가 붙어 들어온 경우 잘라서 첫 단어만 사용
        if (regionFullName && regionFullName.includes(' ')) {
            regionFullName = regionFullName.split(' ')[0];
        }

        const regionPrefix = regionFullName ? `${regionFullName}에서는 ` : '';

        // 정답 문구에 지역명이 한 번 더 들어가 있다면 제거하여 중복 표시 방지
        let binLabel = (correctAnswer || '').toString();
        if (regionFullName && binLabel.includes(regionFullName)) {
            binLabel = binLabel.replace(regionFullName, '').trim();
        }

        if (itemPart) {
            // 예: "서울특별시에서는 고구마 껍질은 일반에 버려요."
            message = `${regionPrefix}${itemPart}은 ${binLabel}에 버려요.`;
        } else {
            message = `${regionPrefix}${binLabel}에 버려요.`;
        }
    } else {
        message = `Put it in ${correctAnswer}.`;
    }
    
    bubbleText.textContent = message;
    
    // 말풍선 표시
    bubble.classList.remove('hidden', 'fade-out');
    
    // 짧게 표시 후(약 0.7초) 사라짐
    setTimeout(() => {
        bubble.classList.add('fade-out');
        setTimeout(() => {
            bubble.classList.add('hidden');
        }, 200);
    }, 700);
}

// 클립보드에 텍스트 복사
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        const message = state.language === 'ko' 
            ? '✅ 클립보드에 복사되었습니다!'
            : '✅ Copied to clipboard!';
        alert(message);
    } catch (err) {
        console.error('Failed to copy:', err);
        // 폴백: textarea 사용
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            const message = state.language === 'ko' 
                ? '✅ 클립보드에 복사되었습니다!'
                : '✅ Copied to clipboard!';
            alert(message);
        } catch (err2) {
            console.error('Fallback copy failed:', err2);
        }
        document.body.removeChild(textarea);
    }
}

function getEndingMessage(score) {
    const clamped = Math.max(0, Math.min(100, score));
    let title = '';
    let body = '';
    let iconPath = '';

    if (clamped <= 20) {
        if (state.language === 'en') {
            title = 'Eco Sprout Badge';
            body = "You've taken your first step as an eco runner. Remember today’s mistakes and try thinking twice next time before you throw it away.";
        } else {
            title = '에코 새싹 배지';
            body = '환경 러너의 첫걸음을 떼었어요. 오늘의 실수를 기억하고, 다음에는 한 번 더 고민하고 버려볼까요?';
        }
        iconPath = 'images/badge_sprout.png'; // 새싹 배지
    } else if (clamped <= 40) {
        title = '에코 도전자 배지';
        body = '좋은 시작이에요! 분리배출 규칙을 조금씩 알아가고 있어요. 한 번 더 플레이하면서 헷갈렸던 통을 집중해서 연습해봐요.';
        iconPath = 'images/badge_challenger.png'; // 도전자 배지
    } else if (clamped <= 60) {
        title = '에코 실천가 배지';
        body = '환경 지식을 꽤 잘 알고 있어요! 일상에서도 지금처럼만 실천하면 우리 동네의 분리배출 모범생이 될 수 있어요.';
        iconPath = 'images/badge_practitioner.png'; // 실천가 배지
    } else if (clamped <= 80) {
        title = '에코 챌린저 배지';
        body = '훌륭해요! 대부분의 문제를 정확히 맞췄어요. 어려웠던 몇 가지만 복습하면 에코 마스터까지 금방이에요.';
        iconPath = 'images/badge_expert.png'; // 챌린저 배지
    } else {
        title = '에코 마스터 배지';
        body = '완벽에 가까운 분리배출 실력을 보여주었어요! 이제는 친구들에게도 올바른 분리배출 방법을 알려주는 환경 지킴이가 되어주세요.';
        iconPath = 'images/badge_master.png'; // 마스터 배지
    }

    return {
        clamped,
        title,
        body,
        iconPath,
    };
}

// 게임 종료
function endGame() {
    state.isPlaying = false;
    if (state.animationId) cancelAnimationFrame(state.animationId);
    
    // 배경음악 정지
    const bgm = document.getElementById('bgm');
    if (bgm) {
        bgm.pause();
        bgm.currentTime = 0;
    }

    document.getElementById('finalScore').textContent = state.score;

    // 게임 종료 시 상단 문제 패널 숨기기
    const panel = document.getElementById('questionPanel');
    if (panel) panel.style.display = 'none';

    // 이름 입력 섹션 표시, 액션 버튼 줄 숨기기
    const nameInput = document.getElementById('endingPlayerName');
    const nameSection = document.getElementById('nameInputSection');
    const endingActions = document.getElementById('endingActions');
    const reviewBtn = document.getElementById('reviewBtn');
    const rankingBtn = document.getElementById('rankingBtn');
    const restartBtn = document.getElementById('restartBtn');
    const shareBtn = document.getElementById('shareBtn');

    if (nameInput) nameInput.value = '';
    if (nameSection) nameSection.style.display = 'block';
    if (endingActions) endingActions.style.display = 'none';
    if (reviewBtn) reviewBtn.disabled = true;
    if (rankingBtn) rankingBtn.disabled = true;
    if (restartBtn) restartBtn.disabled = true;
    if (shareBtn) shareBtn.disabled = true;

    // 에코 배지(엔딩 메시지)는 이름 입력 후 점수 저장 시에만 표시되도록 초기에는 숨김
    const endingMessageEl = document.getElementById('endingMessageText');
    const endingMessageTitle = document.getElementById('endingMessageTitle');
    const endingMessageBody = document.getElementById('endingMessageBody');
    const endingBadgeIcon = document.getElementById('endingBadgeIcon');
    if (endingMessageEl) endingMessageEl.style.display = 'none';
    if (endingMessageTitle) endingMessageTitle.textContent = '';
    if (endingMessageBody) endingMessageBody.textContent = '';
    if (endingBadgeIcon) endingBadgeIcon.src = '';

    document.getElementById('ending').style.display = 'flex';
}

// 점수 저장 (D1 DB API + localStorage 백업)
async function saveScore(playerName, score, regionId, regionName) {
    const timestamp = new Date().toISOString();

    // 1) 이번 플레이의 오답들을 쓰레기 종류별로 집계 (state.incorrectAnswers 기반)
    const wrongByWasteType = {};
    if (Array.isArray(state.incorrectAnswers)) {
        state.incorrectAnswers.forEach((item) => {
            // correctAnswer 또는 category 등에 들어 있는 "정답 통" 기준으로 그룹핑
            const key = item.correctAnswer || item.category || '기타';
            if (!wrongByWasteType[key]) {
                wrongByWasteType[key] = { correct: 0, wrong: 0 };
            }
            // 현재 로직에서는 오답 목록만 모으므로 wrong만 +1
            wrongByWasteType[key].wrong += 1;
        });
    }

    const wasteStats = Object.entries(wrongByWasteType).map(([wasteType, counts]) => ({
        wasteType,
        correct: counts.correct,
        wrong: counts.wrong,
    }));

    const scoreData = {
        playerName,
        score,
        regionId,
        regionName,
        timestamp,
        wasteStats,
    };

    // 2) localStorage에 백업 저장 (오프라인 대비)
    let allScores = JSON.parse(safeLocalStorage.getItem('ecoGameScores') || '[]');
    allScores.push(scoreData);
    
    // 최근 1000개만 유지
    if (allScores.length > 1000) {
        allScores = allScores.slice(-1000);
    }
    
    safeLocalStorage.setItem('ecoGameScores', JSON.stringify(allScores));
    state.regionStatsCache = null;
    state.regionDetailCache = {};

    // 3) D1 DB API 호출 (USE_API가 true일 때만)
    if (USE_API) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(scoreData),
            });

            if (!response.ok) {
                console.error('Failed to save score to DB:', response.status, await response.text());
            } else {
                console.log('Score saved to DB successfully!');
            }
        } catch (error) {
            console.error('Error saving score to API:', error);
            // 실패해도 localStorage에는 저장되어 있음
        }
    }

    return scoreData;
}

// 지역별 평균 점수 계산 (D1 DB API + localStorage 폴백)
async function calculateRegionStats(forceRefresh = false) {
    if (!forceRefresh && state.regionStatsCache) {
        return state.regionStatsCache;
    }

    let regionStats = {};

    if (USE_API) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/scores/regions`);
            if (response.ok) {
                const regions = await response.json();
                regions.forEach((region) => {
                    regionStats[region.region_id] = {
                        regionId: region.region_id,
                        regionName: region.region_name,
                        count: region.count,
                        averageScore: Math.round(region.average_score),
                        totalScore: Math.round(region.average_score * region.count),
                    };
                });
                console.log('Region stats loaded from API');
            }
        } catch (error) {
            console.error('Error fetching region stats from API:', error);
        }
    }

    if (Object.keys(regionStats).length === 0) {
        const allScores = getAllLocalScores();
        allScores.forEach((entry) => {
            if (!regionStats[entry.regionId]) {
                regionStats[entry.regionId] = {
                    regionId: entry.regionId,
                    regionName: entry.regionName,
                    totalScore: 0,
                    count: 0,
                };
            }
            regionStats[entry.regionId].totalScore += entry.score;
            regionStats[entry.regionId].count += 1;
        });

        Object.keys(regionStats).forEach((regionId) => {
            const stat = regionStats[regionId];
            stat.averageScore = stat.count > 0 ? Math.round(stat.totalScore / stat.count) : 0;
        });

        console.log('Region stats loaded from localStorage');
    }

    state.regionStatsCache = regionStats;
    return regionStats;
}

// 지역별 랭킹 표시
async function displayRegionRanking() {
    const listEl = document.getElementById('regionRankingList');
    if (!listEl) return;

    const regionStats = await calculateRegionStats();
    const regions = Object.values(regionStats);
    
    if (regions.length === 0) {
        listEl.innerHTML = '<p>아직 기록이 없습니다.</p>';
        return;
    }

    // 평균 점수 순으로 정렬
    regions.sort((a, b) => b.averageScore - a.averageScore);

    let html = '<table class="region-ranking-table" style="width: 100%; text-align: left; border-collapse: collapse;">';
    html += `<thead><tr>
        <th>${statsText('순위', 'Rank')}</th>
        <th>${statsText('지역', 'Region')}</th>
        <th>${statsText('평균 점수', 'Avg. Score')}</th>
        <th>${statsText('플레이 수', 'Runs')}</th>
    </tr></thead><tbody>`;
    
    regions.forEach((region, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
        const highlight = region.regionId === state.regionId ? 'style="background: rgba(76, 175, 80, 0.15);"' : '';
        html += `<tr class="region-row" data-region-id="${region.regionId}" ${highlight}>
            <td style="padding: 8px;">${medal}</td>
            <td style="padding: 8px;">${region.regionName}</td>
            <td style="padding: 8px; font-weight: 700;">${region.averageScore}점</td>
            <td style="padding: 8px;">${region.count}회</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    listEl.innerHTML = html;

    const rows = listEl.querySelectorAll('tr.region-row');
    rows.forEach((row) => {
        row.addEventListener('click', () => {
            state.selectedStatsRegionId = row.dataset.regionId;
            const statsTabBtnEl = document.getElementById('statsTabBtn');
            if (statsTabBtnEl) {
                statsTabBtnEl.click();
            } else {
                displayStatsView();
            }
        });
    });
}

// 선택한 지역 내 개인 랭킹 표시
async function displayPersonalRanking() {
    const listEl = document.getElementById('personalRankingList');
    const descEl = document.getElementById('personalRankingDesc');
    const myRankText = document.getElementById('myRankText');
    
    if (!listEl) return;

    let regionScores = [];
    
    // API 사용 시 서버에서 가져오기
    if (USE_API) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/scores/${state.regionId}`);
            if (response.ok) {
                const data = await response.json();
                regionScores = data.scores.map(s => ({
                    playerName: s.player_name,
                    score: s.score,
                    regionId: s.region_id,
                    regionName: s.region_name,
                    timestamp: s.timestamp
                }));
                console.log('Personal ranking loaded from API');
            }
        } catch (error) {
            console.error('Error fetching personal ranking from API:', error);
        }
    }
    
    // localStorage 사용 (API 미사용 또는 실패 시)
    if (regionScores.length === 0) {
        const allScores = JSON.parse(safeLocalStorage.getItem('ecoGameScores') || '[]');
        regionScores = allScores.filter(entry => entry.regionId === state.regionId);
        console.log('Personal ranking loaded from localStorage');
    }
    
    if (descEl) {
        descEl.textContent = `${state.regionName} 플레이어 순위`;
    }

    if (regionScores.length === 0) {
        listEl.innerHTML = '<p>아직 이 지역의 기록이 없습니다.</p>';
        if (myRankText) myRankText.textContent = '';
        return;
    }

    // 점수 순으로 정렬
    regionScores.sort((a, b) => b.score - a.score);

    // 상위 20명만 표시
    const topScores = regionScores.slice(0, 20);
    
    let html = '<table style="width: 100%; text-align: left; border-collapse: collapse;">';
    html += `<thead><tr>
        <th>${statsText('순위', 'Rank')}</th>
        <th>${statsText('이름', 'Name')}</th>
        <th>${statsText('점수', 'Score')}</th>
        <th>${statsText('날짜', 'Date')}</th>
    </tr></thead><tbody>`;
    
    topScores.forEach((entry, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
        const isMe = entry.playerName === state.playerName && entry.score === state.score;
        const highlight = isMe ? 'style="background: rgba(76, 175, 80, 0.2); font-weight: 700;"' : '';
        const date = new Date(entry.timestamp).toLocaleDateString();
        
        html += `<tr ${highlight}>
            <td style="padding: 8px;">${medal}</td>
            <td style="padding: 8px;">${entry.playerName}</td>
            <td style="padding: 8px; font-weight: 700;">${entry.score}점</td>
            <td style="padding: 8px;">${date}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    listEl.innerHTML = html;

    // 내 순위 표시
    if (state.playerName && myRankText) {
        const myRank = regionScores.findIndex(entry => 
            entry.playerName === state.playerName && entry.score === state.score
        ) + 1;
        
        if (myRank > 0) {
            myRankText.textContent = `${state.regionName}에서 당신의 순위: ${myRank}위 / ${regionScores.length}명`;
            myRankText.style.display = 'block';
        } else {
            myRankText.style.display = 'none';
        }
    }
}

function destroyStatsChart(key) {
    if (statsChartInstances[key]) {
        statsChartInstances[key].destroy();
        statsChartInstances[key] = null;
    }
}

function renderScoreDistributionChart(detail) {
    const canvas = document.getElementById('statsScoreChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    destroyStatsChart('score');

    const labels = SCORE_BUCKETS.map((bucket) => getBucketLabel(bucket));
    const data = SCORE_BUCKETS.map((bucket, index) => detail.distribution[index]?.count || 0);

    statsChartInstances.score = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: statsText('플레이 수', 'Runs'),
                    data,
                    backgroundColor: SCORE_BUCKET_COLORS,
                    borderRadius: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 800,
                easing: 'easeOutCubic',
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#fff', precision: 0 },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                },
                x: {
                    ticks: { color: '#fff' },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' },
                },
            },
            plugins: {
                legend: {
                    labels: { color: '#fff' },
                },
            },
        },
    });
}

// 지역별 평균 오답률 차트 (임시: 평균 점수를 기반으로 추정한 오답률)
function renderRegionAccuracyChart(regionStats) {
    const canvas = document.getElementById('statsRegionAccuracyChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');

    destroyStatsChart('regionAccuracy');

    const regions = Object.values(regionStats || {});
    if (!regions.length) {
        const captionEl = document.getElementById('statsRegionAccuracyCaption');
        if (captionEl) {
            captionEl.textContent = statsText(
                '아직 지역별 통계 데이터가 없습니다.',
                'No regional stats available yet.'
            );
        }
        return;
    }

    // 상위 6개 지역만 사용 (플레이 수 기준)
    const top = [...regions]
        .sort((a, b) => (b.count || 0) - (a.count || 0))
        .slice(0, 6);

    const labels = top.map((r) => r.regionName || r.regionId);
    // 임시 오답률: 100 - 평균 점수 (0~100 범위로 가정)
    const data = top.map((r) => {
        const avg = typeof r.averageScore === 'number' ? r.averageScore : 0;
        return Math.max(0, Math.min(100, 100 - avg));
    });

    statsChartInstances.regionAccuracy = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: statsText('평균 오답률', 'Avg wrong rate'),
                    data,
                    backgroundColor: 'rgba(255, 138, 101, 0.9)',
                    borderColor: 'rgba(255, 112, 67, 1)',
                    borderWidth: 1,
                    borderRadius: 6,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 800,
                easing: 'easeOutCubic',
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        color: '#ffffff',
                        callback: (value) => `${value}%`,
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' },
                },
                x: {
                    ticks: {
                        color: '#ffffff',
                    },
                },
            },
            plugins: {
                legend: {
                    display: false,
                },
            },
        },
    });

    const captionEl = document.getElementById('statsRegionAccuracyCaption');
    if (captionEl) {
        captionEl.textContent = statsText(
            '최근 기록 기준 상위 6개 지역의 추정 오답률입니다.',
            'Estimated wrong rate for top 6 regions by recent runs.'
        );
    }
}

function renderPracticeDistributionChart(detail) {
    const canvas = document.getElementById('statsPracticeChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    destroyStatsChart('practice');

    const labels = PRACTICE_BUCKETS.map((bucket) => getBucketLabel(bucket));
    const data = PRACTICE_BUCKETS.map(
        (bucket, index) => detail.practiceDistribution[index]?.count || 0
    );

    statsChartInstances.practice = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [
                {
                    label: statsText('비율', 'Share'),
                    data,
                    backgroundColor: PRACTICE_BUCKET_COLORS,
                    borderColor: '#111',
                    borderWidth: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            animation: {
                duration: 800,
                easing: 'easeOutCubic',
            },
            plugins: {
                legend: {
                    labels: { color: '#fff' },
                },
            },
        },
    });
}

async function getRegionDetail(regionId, forceRefresh = false) {
    if (!regionId) return null;
    if (!forceRefresh && state.regionDetailCache[regionId]) {
        return state.regionDetailCache[regionId];
    }

    let detail = null;

    if (USE_API) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/scores/regions/${regionId}`);
            if (response.ok) {
                const apiData = await response.json();
                detail = normalizeRegionDetail(apiData, regionId);
            }
        } catch (error) {
            console.error('Error fetching region detail from API:', error);
        }
    }

    if (!detail) {
        detail = buildLocalRegionDetail(regionId);
    }

    state.regionDetailCache[regionId] = detail;
    return detail;
}

function updateStatsRegionSelect(regions, selectedId) {
    const selectEl = document.getElementById('statsRegionSelect');
    if (!selectEl) return;

    selectEl.innerHTML = '';
    regions.forEach((region) => {
        const option = document.createElement('option');
        option.value = region.regionId;
        option.textContent = region.regionName;
        if (region.regionId === selectedId) {
            option.selected = true;
        }
        selectEl.appendChild(option);
    });

    if (!selectEl.dataset.listenerAttached) {
        selectEl.addEventListener('change', (event) => {
            state.selectedStatsRegionId = event.target.value;
            displayStatsView();
        });
        selectEl.dataset.listenerAttached = 'true';
    }
}

function renderStatsSummary(detail) {
    const summaryEl = document.getElementById('statsSummary');
    if (!summaryEl) return;

    const summaryItems = [
        {
            label: statsText('총 플레이', 'Total Runs'),
            value: `${detail.count.toLocaleString()}${statsText('회', '')}`,
        },
        {
            label: statsText('평균 점수', 'Avg. Score'),
            value: `${detail.averageScore} ${statsText('점', 'pts')}`,
        },
        {
            label: statsText('중앙값', 'Median'),
            value: `${detail.medianScore} ${statsText('점', 'pts')}`,
        },
        {
            label: statsText('최고 점수', 'Best Score'),
            value: `${detail.bestScore} ${statsText('점', 'pts')}`,
        },
        {
            label: statsText('최근 플레이', 'Last Played'),
            value: formatDateLabel(detail.lastPlayed),
        },
    ];

    summaryEl.innerHTML = `
        <h3>${detail.regionName}</h3>
        <div class="summary-grid">
            ${summaryItems
                .map(
                    (item) => `
                <div class="summary-item">
                    <span>${item.label}</span>
                    <strong>${item.value}</strong>
                </div>
            `
                )
                .join('')}
        </div>
    `;
}

function renderStatsTable(detail) {
    const tableEl = document.getElementById('statsDistributionTable');
    if (!tableEl) return;

    const total = detail.distribution.reduce((sum, entry) => sum + entry.count, 0) || detail.count;

    const rows = SCORE_BUCKETS.map((bucket, index) => {
        const count = detail.distribution[index]?.count || 0;
        const percent = total ? formatPercent(count, total) : 0;
        return `
            <tr>
                <td>${getBucketLabel(bucket)}</td>
                <td>${count.toLocaleString()}</td>
                <td>${percent}%</td>
            </tr>
        `;
    }).join('');

    tableEl.innerHTML = `
        <thead>
            <tr>
                <th>${statsText('점수 구간', 'Score Range')}</th>
                <th>${statsText('플레이 수', 'Runs')}</th>
                <th>%</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    `;
}

function clearStatsView(message) {
    const summaryEl = document.getElementById('statsSummary');
    const tableEl = document.getElementById('statsDistributionTable');
    const scoreCaptionEl = document.getElementById('statsScoreCaption');
    const practiceCaptionEl = document.getElementById('statsPracticeCaption');
    const regionAccuracyCaptionEl = document.getElementById('statsRegionAccuracyCaption');

    if (summaryEl) summaryEl.innerHTML = `<p>${message}</p>`;
    if (tableEl) tableEl.innerHTML = '';
    if (scoreCaptionEl) scoreCaptionEl.textContent = '';
    if (practiceCaptionEl) practiceCaptionEl.textContent = '';
    if (regionAccuracyCaptionEl) regionAccuracyCaptionEl.textContent = '';
    const wrongCaptionEl = document.getElementById('statsWrongCaption');
    if (wrongCaptionEl) wrongCaptionEl.textContent = '';
    destroyStatsChart('score');
    destroyStatsChart('practice');
    destroyStatsChart('regionAccuracy');
    destroyStatsChart('wrong');
}

async function displayStatsView(forceRefresh = false) {
    const summaryEl = document.getElementById('statsSummary');
    if (!summaryEl) return;
    summaryEl.innerHTML = `<p>${statsText('📊 데이터를 불러오는 중입니다...', 'Loading stats...')}</p>`;

    const regionStats = await calculateRegionStats(forceRefresh);
    const regions = Object.values(regionStats);

    if (regions.length === 0) {
        clearStatsView(statsText('아직 데이터가 없습니다.', 'No records yet.'));
        return;
    }

    let selectedId = state.selectedStatsRegionId;
    if (!selectedId || !regionStats[selectedId]) {
        if (state.regionId && regionStats[state.regionId]) {
            selectedId = state.regionId;
        } else {
            selectedId = regions[0].regionId;
        }
    }
    state.selectedStatsRegionId = selectedId;

    updateStatsRegionSelect(regions, selectedId);
    const detail = await getRegionDetail(selectedId, forceRefresh);

    if (!detail || detail.count === 0) {
        clearStatsView(
            statsText('해당 지역의 데이터가 아직 없습니다.', 'No runs recorded for this region yet.')
        );
        return;
    }

    renderStatsSummary(detail);
    renderStatsTable(detail);
    renderScoreDistributionChart(detail);
    renderPracticeDistributionChart(detail);
    renderRegionAccuracyChart(regionStats);
    await renderWrongAnswerChart(selectedId);

    const scoreCaptionEl = document.getElementById('statsScoreCaption');
    const practiceCaptionEl = document.getElementById('statsPracticeCaption');
    if (scoreCaptionEl) {
        scoreCaptionEl.textContent = statsText(
            `총 ${detail.count.toLocaleString()}회 플레이 기준`,
            `Based on ${detail.count.toLocaleString()} runs`
        );
    }
    if (practiceCaptionEl) {
        practiceCaptionEl.textContent = statsText(
            '점수 구간을 기반으로 추정한 실천 단계 비율입니다.',
            'Estimated practice levels inferred from score buckets.'
        );
    }
}

// 오답노트 화면 표시
function showReviewScreen() {
    const review = document.getElementById('review');
    const reviewList = document.getElementById('reviewList');

    if (!review || !reviewList) return;

    reviewList.innerHTML = '';

    if (!state.incorrectAnswers || state.incorrectAnswers.length === 0) {
        // 모두 정답인 경우 안내 문구만 표시
        const emptyCard = document.createElement('div');
        emptyCard.className = 'review-empty';
        emptyCard.innerHTML = `
            <div class="empty-icon">🎉</div>
            <p>${t('allCorrect')}</p>
        `;
        reviewList.appendChild(emptyCard);
    } else {
        state.incorrectAnswers.forEach((item, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'review-item';

            // 카드 헤더 (문제 번호)
            const header = document.createElement('div');
            header.className = 'review-header';
            header.innerHTML = `
                <span class="review-number">${t('reviewQuestionPrefix')} ${index + 1}</span>
                <span class="review-badge">❌ ${t('reviewWrongBadge')}</span>
            `;
            wrapper.appendChild(header);

            // 문제 문장
            const question = document.createElement('div');
            question.className = 'review-question';
            question.innerHTML = `<strong>📝 ${item.question}</strong>`;
            wrapper.appendChild(question);

            // 내가 선택한 답 (오답)
            const yourAnswer = document.createElement('div');
            yourAnswer.className = 'review-your-answer';
            yourAnswer.innerHTML = `
                <span class="answer-label">❌ ${t('selectedAnswerLabel')}</span>
                <span class="answer-value wrong">${item.yourAnswer}</span>
            `;
            wrapper.appendChild(yourAnswer);

            // 정답
            const correctAnswer = document.createElement('div');
            correctAnswer.className = 'review-correct-answer';
            correctAnswer.innerHTML = `
                <span class="answer-label">✅ ${t('correctAnswerLabel')}</span>
                <span class="answer-value correct">${item.correctAnswer}</span>
            `;
            wrapper.appendChild(correctAnswer);

            // 설명 (있는 경우)
            if (item.explanation) {
                const explanation = document.createElement('div');
                explanation.className = 'review-explanation';
                explanation.innerHTML = `
                    <span class="explanation-icon">💡</span>
                    <span>${item.explanation}</span>
                `;
                wrapper.appendChild(explanation);
            }

            reviewList.appendChild(wrapper);
        });
    }

    review.style.display = 'flex';
}

// 키보드 입력
function setupKeyboardControls() {
    const exitModal = document.getElementById('exitModal');
    const exitConfirmBtn = document.getElementById('exitConfirmBtn');
    const exitCancelBtn = document.getElementById('exitCancelBtn');

    // 키보드 이벤트 리스너가 이미 등록되어 있으면 제거
    if (keyboardHandler) {
        document.removeEventListener('keydown', keyboardHandler);
    }

    // 새로운 핸들러 생성 및 등록
    keyboardHandler = (e) => {
        // ESC로 종료 확인 모달 표시
        if (e.key === 'Escape') {
            // 실제 게임 플레이 중이 아닐 때는(인트로나 엔딩 등) 무시
            if (!state.isPlaying) return;
            if (!exitModal) return;
            e.preventDefault();
            // 이미 모달이 열려 있으면 닫기
            const isHidden = exitModal.classList.contains('hidden');
            if (isHidden) {
                state.isPlaying = false;
                exitModal.classList.remove('hidden');
            } else {
                exitModal.classList.add('hidden');
                state.isPlaying = true;
            }
            return;
        }

        if (!state.isPlaying) return;

        if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
            const prevLane = state.playerLane;
            state.playerLane = Math.min(2, state.playerLane + 1);
            // 레인이 실제로 변경되었을 때만 소리 재생
            if (prevLane !== state.playerLane) {
                const swooshSound = document.getElementById('swooshSound');
                if (swooshSound) {
                    swooshSound.currentTime = 0;
                    swooshSound.volume = 0.4;
                    swooshSound.play().catch(e => console.log('Sound play failed:', e));
                }
            }
        } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
            const prevLane = state.playerLane;
            state.playerLane = Math.max(0, state.playerLane - 1);
            // 레인이 실제로 변경되었을 때만 소리 재생
            if (prevLane !== state.playerLane) {
                const swooshSound = document.getElementById('swooshSound');
                if (swooshSound) {
                    swooshSound.currentTime = 0;
                    swooshSound.volume = 0.4;
                    swooshSound.play().catch(e => console.log('Sound play failed:', e));
                }
            }
        }
    };
    
    document.addEventListener('keydown', keyboardHandler);

    if (exitConfirmBtn) {
        exitConfirmBtn.addEventListener('click', () => {
            location.reload();
        });
    }

    if (exitCancelBtn) {
        exitCancelBtn.addEventListener('click', () => {
            if (!exitModal) return;
            exitModal.classList.add('hidden');
            state.isPlaying = true;
            gameLoop();
        });
    }

    const goHomeBtn = document.getElementById('goHomeBtn');
    if (goHomeBtn) {
        goHomeBtn.addEventListener('click', () => {
            window.location.href = '../index.html';
        });
    }
}

// 터치 스와이프 입력 (모바일)
function setupTouchControls() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    
    const canvas = state.renderer?.domElement;
    if (!canvas) return;

    // 터치 시작
    canvas.addEventListener('touchstart', (e) => {
        if (!state.isPlaying) return;
        
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
    }, { passive: true });

    // 터치 종료 (스와이프 감지)
    canvas.addEventListener('touchend', (e) => {
        if (!state.isPlaying) return;
        
        const touch = e.changedTouches[0];
        const touchEndX = touch.clientX;
        const touchEndY = touch.clientY;
        const touchEndTime = Date.now();
        
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        const deltaTime = touchEndTime - touchStartTime;
        
        // 스와이프 최소 거리와 최대 시간 설정
        const minSwipeDistance = 50; // 50px 이상 움직여야 스와이프로 인식
        const maxSwipeTime = 500; // 0.5초 이내
        
        // 좌우 스와이프만 감지 (세로 움직임보다 가로 움직임이 더 커야 함)
        if (Math.abs(deltaX) > Math.abs(deltaY) && 
            Math.abs(deltaX) > minSwipeDistance && 
            deltaTime < maxSwipeTime) {
            
            if (deltaX > 0) {
                // 오른쪽 스와이프 → 오른쪽 레인으로
                state.playerLane = Math.max(0, state.playerLane - 1);
            } else {
                // 왼쪽 스와이프 → 왼쪽 레인으로
                state.playerLane = Math.min(2, state.playerLane + 1);
            }
        }
    }, { passive: true });
}

// 달리기 애니메이션
function animateRunning(player) {
    if (!player.userData) return;
    
    // 속도 약간 완화해 자연스럽게
    player.userData.animationTime += 0.11;
    const t = player.userData.animationTime;
    const hipSway = Math.sin(t * 2) * 0.035;
    const bounce = Math.abs(Math.sin(t * 2.1)) * 0.05;
    const chestTwist = Math.sin(t * 1.5) * 0.03;
    
    // 팔 흔들기 - 팔꿈치 각도 포함하여 더 자연스럽게
    if (player.userData.leftArmGroup) {
        // 어깨 회전 (앞뒤/좌우)
        const leftArmSwing = Math.sin(t) * 0.7;
        player.userData.leftArmGroup.rotation.x = leftArmSwing;
        player.userData.leftArmGroup.rotation.z = Math.sin(t) * 0.12;
        if (player.userData.leftForearmGroup) {
            player.userData.leftForearmGroup.rotation.x = -0.45 + Math.cos(t) * 0.28;
        }
    }
    if (player.userData.rightArmGroup) {
        // 오른팔은 왼팔과 반대로
        const rightArmSwing = Math.sin(t + Math.PI) * 0.7;
        player.userData.rightArmGroup.rotation.x = rightArmSwing;
        player.userData.rightArmGroup.rotation.z = Math.sin(t + Math.PI) * 0.12;
        if (player.userData.rightForearmGroup) {
            player.userData.rightForearmGroup.rotation.x = -0.45 + Math.cos(t + Math.PI) * 0.28;
        }
    }
    
    // 왼쪽 다리 - 허벅지와 무릎 (더 자연스러운 관절 움직임)
    if (player.userData.leftLegGroup) {
        // 허벅지 각도
        const leftThighAngle = Math.sin(t + Math.PI) * 0.8;
        player.userData.leftLegGroup.rotation.x = leftThighAngle;
        player.userData.leftLegGroup.rotation.z = hipSway;
        if (player.userData.leftKneeGroup) {
            // 무릎은 다리가 뒤로 갈 때 많이 굽혀지고, 앞으로 갈 때는 펴짐
            const phase = Math.sin(t + Math.PI);
            const leftKneeAngle = phase < 0 ? Math.abs(phase) * 1.0 : phase * 0.25;
            player.userData.leftKneeGroup.rotation.x = leftKneeAngle;
        }
        if (player.userData.leftAnkleGroup) {
            player.userData.leftAnkleGroup.rotation.x = -0.08 + Math.sin(t + Math.PI) * 0.2;
        }
    }
    
    // 오른쪽 다리 - 허벅지와 무릎 (왼쪽과 반대 위상)
    if (player.userData.rightLegGroup) {
        // 허벅지 각도
        const rightThighAngle = Math.sin(t) * 0.8;
        player.userData.rightLegGroup.rotation.x = rightThighAngle;
        player.userData.rightLegGroup.rotation.z = -hipSway;
        if (player.userData.rightKneeGroup) {
            // 무릎은 다리가 뒤로 갈 때 많이 굽혀지고, 앞으로 갈 때는 펴짐
            const phase = Math.sin(t);
            const rightKneeAngle = phase < 0 ? Math.abs(phase) * 1.0 : phase * 0.25;
            player.userData.rightKneeGroup.rotation.x = rightKneeAngle;
        }
        if (player.userData.rightAnkleGroup) {
            player.userData.rightAnkleGroup.rotation.x = -0.08 + Math.sin(t) * 0.2;
        }
    }
    
    // 몸통 상하 움직임 (달리기에 맞춰 자연스럽게)
    if (player.userData.body) {
        const baseY = player.userData.bodyBaseY || player.userData.body.position.y;
        player.userData.body.position.y = baseY + bounce;
        player.userData.body.rotation.z = hipSway * 1.0;
        player.userData.body.rotation.x = -0.04 + Math.cos(t * 2) * 0.02;
    }

    if (player.userData.pelvis) {
        player.userData.pelvis.rotation.z = hipSway * 0.7;
        player.userData.pelvis.rotation.x = Math.cos(t * 2) * 0.02;
    }

    if (player.userData.backpackGroup) {
        player.userData.backpackGroup.position.y = (player.userData.backpackBaseY || player.userData.backpackGroup.position.y) + bounce * 0.45;
        player.userData.backpackGroup.rotation.x = -0.04 + Math.sin(t) * 0.04;
        player.userData.backpackGroup.rotation.z = hipSway * 0.45;
    }
    
    if (player.userData.head) {
        player.userData.head.rotation.z = hipSway * 0.2;
        player.userData.head.rotation.x = -0.01 + chestTwist * 0.25;
    }
    
    // 몸 전체 약간 앞으로 기울이기 (달리는 자세)
    player.rotation.x = -0.16;
    player.position.y = 1.03 + Math.sin(t * 2) * 0.015;
}

// 메인 게임 루프
let lastHudUpdate = 0;
function gameLoop() {
    if (!state.isPlaying) return;
    state.animationId = requestAnimationFrame(gameLoop);

    // 시간
    state.gameTime += 1 / 60;
    
    // HUD는 매 프레임이 아닌 0.1초마다만 업데이트 (성능 향상)
    const now = Date.now();
    if (now - lastHudUpdate > 100) {
        updateHUD();
        lastHudUpdate = now;
    }
    
    if (state.gameTime >= state.gameTimeLimit) {
        endGame();
        return;
    }

    // 플레이어 레인 이동(보간)
    const targetX = state.lanes[state.playerLane];
    state.player.position.x += (targetX - state.player.position.x) * 0.2;

    // 달리기 애니메이션
    animateRunning(state.player);

    // 플레이어를 앞으로 이동 (z+ 방향으로 계속 전진)
    state.player.position.z += state.gameSpeed;

    // 플레이어 위치 기준으로 도로 세그먼트를 재배치해서 무한 도로처럼 보이게 함
    // 단, trackEndZ를 넘어가면 도로를 더 이상 앞에 배치하지 않음
    const maxRoadZ = state.trackEndZ ? state.trackEndZ + 50 : 999999;
    const halfSegments = Math.floor(state.roadSegments.length / 2);
    const baseIndex = Math.floor(state.player.position.z / state.roadLength) - halfSegments;
    state.roadSegments.forEach((seg, i) => {
        const index = baseIndex + i;
        const newZ = index * state.roadLength;
        // 도로 세그먼트가 maxRoadZ를 넘지 않도록 제한
        if (newZ <= maxRoadZ) {
            seg.position.z = newZ;
            seg.visible = true;
        } else {
            seg.visible = false;
        }
    });

    // 차선 라인도 동일하게 제한
    state.laneLines.forEach((line) => {
        if (line.baseZ <= maxRoadZ) {
            line.mesh.visible = true;
        } else {
            line.mesh.visible = false;
        }
    });

    // 카메라 위치 보정: 캐릭터 뒤쪽·위에서 따라가기
    state.camera.position.x += (state.player.position.x - state.camera.position.x) * 0.1;
    state.camera.position.y = 6;
    state.camera.position.z = state.player.position.z - 10;
    state.camera.lookAt(state.player.position.x, 2, state.player.position.z + 20);

    // 여러 세트 중, 플레이어 근처를 지나는 세트마다 한 번씩 판정
    const thresholdZ = state.player.position.z + 2;
    state.problemSets.forEach((set) => {
        if (set.resolved) return;
        if (!Array.isArray(set.bins) || set.bins.length !== 3) return;
        const leadBin = set.bins[0];
        if (!leadBin.mesh) return;

        // 세트의 선두 쓰레기통이 플레이어 z 근처에 도달했을 때 판정
        if (leadBin.mesh.position.z <= thresholdZ) {
            const chosenLane = state.playerLane;
            const chosenBin = set.bins[chosenLane];
            const correctId = set.problem.answer;
            const isCorrect = chosenBin.id === correctId;

            if (isCorrect) {
                state.score += 10;
                showScoreEffect(10);
                showFeedback(t('feedbackCorrect'), true);
                // 정답 사운드 재생
                const correctSound = document.getElementById('correctSound');
                if (correctSound) {
                    correctSound.currentTime = 0;
                    correctSound.volume = 0.5;
                    correctSound.play().catch(e => console.log('Sound play failed:', e));
                }
            } else {
                state.score -= 10;
                showScoreEffect(-10);
                // 오답 사운드 재생
                const failSound = document.getElementById('failSound');
                if (failSound) {
                    failSound.currentTime = 0;
                    failSound.volume = 0.5;
                    failSound.play().catch(e => console.log('Sound play failed:', e));
                }
                const correctBin =
                    state.regionData.bins.find((b) => b.id === correctId) || {};
                const localizedQuestion =
                    state.language === 'en' && set.problem.question_en
                        ? set.problem.question_en
                        : set.problem.question;
                const localizedYourAnswer =
                    state.language === 'en' && chosenBin.name_en
                        ? chosenBin.name_en
                        : chosenBin.name;
                const localizedCorrectAnswer =
                    state.language === 'en' && correctBin.name_en
                        ? correctBin.name_en
                        : correctBin.name || correctId;
                const localizedExplanation =
                    state.language === 'en' && set.problem.explanation_en
                        ? set.problem.explanation_en
                        : set.problem.explanation || '';
                state.incorrectAnswers.push({
                    question: localizedQuestion,
                    yourAnswer: localizedYourAnswer,
                    correctAnswer: localizedCorrectAnswer,
                    explanation: localizedExplanation,
                });
                showFeedback(t('feedbackWrong'), false);
                // 오답 말풍선 표시 (문제에 나온 쓰레기 이름을 함께 보여주기 위해 질문 텍스트도 전달)
                showWrongAnswerBubble(localizedQuestion, localizedYourAnswer, localizedCorrectAnswer);
            }

            set.resolved = true;

            // 다음 미해결 세트를 기준으로 상단 문제 패널 텍스트 갱신
            updateQuestionPanelForNextSet();
            
            // 점수 변경 즉시 HUD 업데이트
            updateHUD();
        }
    });

    // 모든 세트가 판정 완료되면 게임 종료 (0.5초 지연)
    const allResolved =
        state.problemSets.length > 0 && state.problemSets.every((s) => s.resolved);
    if (allResolved) {
        state.isPlaying = false;
        setTimeout(() => {
            endGame();
        }, 500);
        return;
    }

    // 렌더링
    if (state.renderer && state.scene && state.camera) {
        try {
            state.renderer.render(state.scene, state.camera);
        } catch (e) {
            console.error('Rendering error:', e);
            state.isPlaying = false;
        }
    }
}

// 게임 시작
async function startGame() {
    try {
        console.log('Starting game...');
        
        // 이전 게임이 있었다면 상태/씬을 정리
        resetGameState();
        console.log('Game state reset');

        initThreeJS();
        console.log('Three.js initialized');
        
        await loadRegionData();
        console.log('Region data loaded');
        
        createRoad();
        console.log('Road created');
        
        createPlayer();
        console.log('Player created');
        
        // JSON의 모든 문제를 세트로 만들어, 간격을 두고 배치
        createAllProblemSets();
        console.log('Problem sets created');
        
        // 문제 세트 생성 후 trackEndZ가 설정되므로 여기서 배경 생성
        createEnvironment();
        console.log('Environment created');
        
        setupKeyboardControls();
        setupTouchControls(); // 모바일 터치 지원
        console.log('Controls setup');

        state.score = 0;
        state.gameTime = 0;
        state.incorrectAnswers = [];
        state.isPlaying = true;

        // 배경음악 재생
        const bgm = document.getElementById('bgm');
        if (bgm) {
            bgm.currentTime = 0;
            bgm.volume = 0.3;
            bgm.play().catch(e => console.log('BGM play failed:', e));
        }

        document.getElementById('intro').style.display = 'none';
        document.getElementById('ending').style.display = 'none';
        document.getElementById('scoreBox').style.display = 'block';
        document.getElementById('settingsBtn').style.display = 'block'; // 설정 버튼 표시
        
        // 상단 문제 패널에서 현재/다음 문제 텍스트를 보여준다
        updateQuestionPanelForNextSet();
        updateHUD();
        
        console.log('Starting game loop...');
        gameLoop();
    } catch (error) {
        console.error('Error starting game:', error);
        alert('게임 시작 중 오류가 발생했습니다. 페이지를 새로고침해주세요.');
    }
}

// 다시 시작 시 이전 Three.js 씬/렌더러 및 상태 정리
function resetGameState() {
    // 애니메이션 루프 정지
    if (state.animationId) {
        cancelAnimationFrame(state.animationId);
        state.animationId = null;
    }

    // 기존 렌더러 캔버스 제거
    const container = document.getElementById('gameContainer');
    if (state.renderer && container && state.renderer.domElement.parentNode === container) {
        container.removeChild(state.renderer.domElement);
    }

    // Three.js 리소스 정리 (간단 버전)
    if (state.scene) {
        while (state.scene.children.length > 0) {
            state.scene.remove(state.scene.children[0]);
        }
    }

    state.scene = null;
    state.camera = null;
    state.renderer = null;
    state.player = null;
    state.roadSegments = [];
    state.environmentObjects = [];
    state.problemSets = [];
    state.incorrectAnswers = [];
    state.finishLineZ = 0;
    state.playerLane = 1;
    state.isPlaying = false;
    state.gameTime = 0;
}

// 창 크기 변경
function handleResize() {
    if (!state.camera || !state.renderer) return;
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
}

// 공유 결과 링크로 진입했을 때, 바로 엔딩 결과 화면을 보여주는 모드 적용
function applySharedResultMode() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('shared') !== '1') return;

    const rawScore = params.get('score');
    const score = parseInt(rawScore || '0', 10);
    if (Number.isNaN(score)) {
        return;
    }

    const nameParam = params.get('name') || '';
    const regionParam = params.get('region') || '';
    const langParam = params.get('lang');

    state.score = score;
    if (nameParam) state.playerName = nameParam;
    if (regionParam) state.regionName = regionParam;

    if (langParam === 'en') {
        state.language = 'en';
    } else if (langParam === 'ko') {
        state.language = 'ko';
    }

    // 공유 전용 결과 화면 모드 플래그 (스타일 분리용)
    if (document && document.body) {
        document.body.classList.add('shared-result');
    }

    // 언어 설정 적용 (공유 카드 라벨 등)
    applyLanguageToUI();

    // 인트로/게임 HUD 숨기기
    const introVideoScreen = document.getElementById('introVideoScreen');
    const introScreen = document.getElementById('intro');
    const gameContainer = document.getElementById('gameContainer');
    const scoreBox = document.getElementById('scoreBox');
    const timerBox = document.getElementById('timerBox');
    const questionPanel = document.getElementById('questionPanel');
    const settingsBtn = document.getElementById('settingsBtn');
    const feedbackMessage = document.getElementById('feedbackMessage');

    if (introVideoScreen) introVideoScreen.style.display = 'none';
    if (introScreen) introScreen.style.display = 'none';
    if (gameContainer) gameContainer.style.display = 'none';
    if (scoreBox) scoreBox.style.display = 'none';
    if (timerBox) timerBox.style.display = 'none';
    if (questionPanel) questionPanel.style.display = 'none';
    if (settingsBtn) settingsBtn.style.display = 'none';
    if (feedbackMessage) feedbackMessage.style.display = 'none';

    // 공유 모드에서는 기본 엔딩 UI(게임 종료 화면)를 사용하지 않고
    // 결과 카드만 보여주므로 엔딩 요소는 건드리지 않는다.

    const endingMessage = getEndingMessage(state.score);
    const endingMessageWrapper = document.getElementById('endingMessageText');
    const endingMessageTitle = document.getElementById('endingMessageTitle');
    const endingMessageBody = document.getElementById('endingMessageBody');
    const endingBadgeIcon = document.getElementById('endingBadgeIcon');
    const endingPlayerSummary = document.getElementById('endingPlayerSummary');

    // 기본 엔딩 배지 섹션은 공유 모드에서는 숨김 (카드형 결과만 사용)
    if (endingMessageWrapper) {
        endingMessageWrapper.style.display = 'none';
    }

    // 공유 카드(shareSummaryModal)를 두 번째 이미지처럼 구성
    const shareModal = document.getElementById('shareSummaryModal');
    const shareBadgeImg = document.getElementById('shareBadgeIcon');
    const shareBadgeTitleEl = document.getElementById('shareBadgeTitle');
    const shareBadgeBodyEl = document.getElementById('shareBadgeBody');
    const sharePlayerLine = document.getElementById('sharePlayerLine');
    const shareRegionLine = document.getElementById('shareRegionLine');
    const shareScoreLine = document.getElementById('shareScoreLine');

    if (shareBadgeImg && endingMessage && endingMessage.iconPath) {
        shareBadgeImg.src = endingMessage.iconPath;
    }
    if (shareBadgeTitleEl && endingMessage) {
        shareBadgeTitleEl.textContent = endingMessage.title;
    }
    if (shareBadgeBodyEl && endingMessage) {
        shareBadgeBodyEl.textContent = endingMessage.body;
    }

    if (sharePlayerLine) {
        if (state.playerName) {
            sharePlayerLine.textContent =
                state.language === 'en'
                    ? `${t('shareLabelNickname')} : ${state.playerName}`
                    : `${t('shareLabelNickname')} : ${state.playerName}`;
        } else {
            sharePlayerLine.textContent = '';
        }
    }
    if (shareRegionLine) {
        const regionLabel =
            state.language === 'en'
                ? (() => {
                      switch (state.regionId) {
                          case 'kr_seoul':
                              return t('regionLabelSeoul');
                          case 'kr_busan':
                              return t('regionLabelBusan');
                          case 'kr_incheon':
                              return t('regionLabelIncheon');
                          case 'kr_cheonan':
                              return t('regionLabelCheonan');
                          default:
                              return state.regionName || '';
                      }
                  })()
                : state.regionName || '';

        if (regionLabel) {
            shareRegionLine.textContent = `${t('shareLabelRegion')} : ${regionLabel}`;
        } else {
            shareRegionLine.textContent = '';
        }
    }
    if (shareScoreLine) {
        shareScoreLine.textContent = `${t('shareLabelScore')} : ${state.score}`;
    }

    if (shareModal) {
        shareModal.classList.remove('hidden');
    }
}

// DOM 준비 후
document.addEventListener('DOMContentLoaded', () => {
    // 카카오 SDK 초기화
    if (window.Kakao && !Kakao.isInitialized()) {
        // TODO: 실제 카카오 JavaScript 키로 변경 필요
        Kakao.init('YOUR_KAKAO_JAVASCRIPT_KEY');
        console.log('Kakao SDK initialized:', Kakao.isInitialized());
    }

    // 초기 언어를 UI에 반영
    applyLanguageToUI();

    // 언어 토글 버튼 이벤트
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
        languageSelect.value = state.language;
        languageSelect.addEventListener('change', (e) => {
            state.language = e.target.value;
            applyLanguageToUI();
        });
    }

    // 인트로 영상 → 프리게임 화면 전환
    const regionSelectEl = document.getElementById('regionSelect');
    const regionCards = document.querySelectorAll('.region-card');

    function setActiveRegion(card) {
        if (!card || !regionSelectEl) return;
        regionCards.forEach((btn) => btn.classList.remove('active'));
        card.classList.add('active');
        const file = card.dataset.file;
        if (file) {
            regionSelectEl.value = file;
        }
    }

    if (regionCards.length && regionSelectEl) {
        regionCards.forEach((card) => {
            card.addEventListener('click', () => setActiveRegion(card));
        });

        const initialActive = document.querySelector('.region-card.active') || regionCards[0];
        if (initialActive) {
            setActiveRegion(initialActive);
        }
    }

    const introVideo = document.getElementById('introVideo');
    const introVideoScreen = document.getElementById('introVideoScreen');
    const introScreen = document.getElementById('intro');

    let introScreenShown = false;

    function showIntroScreen() {
        if (introScreenShown) return;
        introScreenShown = true;
        if (introVideoScreen) introVideoScreen.style.display = 'none';
        if (introScreen) introScreen.style.display = 'flex';
    }

    if (introVideo) {
        introVideo.addEventListener('ended', showIntroScreen);
        introVideo.addEventListener('error', showIntroScreen);
    } else {
        // 영상이 없거나 로딩 실패 시 바로 인트로 화면 표시
        showIntroScreen();
    }

    if (introVideoScreen) {
        introVideoScreen.addEventListener('click', showIntroScreen);
        setTimeout(showIntroScreen, 7000);
    }

    // 로그인 없이 게임 시작 버튼
    const startGameBtn = document.getElementById('startGameBtn');
    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            if (introScreen) {
                introScreen.classList.add('fade-out');
            }
            setTimeout(() => {
                if (introScreen) {
                    introScreen.style.display = 'none';
                }
                startGame();
            }, 700);
        });
    }

    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const signupConfirmBtn = document.getElementById('signupConfirmBtn');
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    const loginCheck = document.getElementById('loginCheck');
    const loginMessage = document.getElementById('loginMessage');

    function getPlayerNameFromEmail(email) {
        if (!email) return '';
        const atIndex = email.indexOf('@');
        if (atIndex > 0) {
            return email.slice(0, atIndex);
        }
        return email;
    }

    async function mockLogin() {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        if (!email || !password) {
            alert('이메일과 비밀번호를 입력해주세요.');
            return false;
        }

        // TODO: Cloudflare API 연동 시 실제 로그인 요청으로 교체
        await new Promise((resolve) => setTimeout(resolve, 400));
        return true;
    }

    async function mockSignup() {
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value.trim();
        const passwordConfirm = document
            .getElementById('signupPasswordConfirm')
            .value.trim();

        if (!email || !password || !passwordConfirm) {
            alert('이메일과 비밀번호를 모두 입력해주세요.');
            return false;
        }
        if (password !== passwordConfirm) {
            alert('비밀번호가 일치하지 않습니다.');
            return false;
        }

        // TODO: Cloudflare API 연동 시 실제 회원가입 요청으로 교체
        await new Promise((resolve) => setTimeout(resolve, 600));
        return true;
    }

    function showLoginSuccessAndStartGame() {
        if (loginCheck && loginMessage) {
            loginCheck.classList.remove('hidden');
            loginCheck.classList.add('login-success-anim');
            loginMessage.textContent = '로그인 완료! 곧 게임이 시작됩니다.';
        }

        setTimeout(() => {
            if (loginCheck) {
                loginCheck.classList.remove('login-success-anim');
            }
            startGame();
        }, 800);
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const email = document.getElementById('loginEmail').value.trim();
            const ok = await mockLogin();
            if (!ok) return;
            state.playerName = getPlayerNameFromEmail(email);
            showLoginSuccessAndStartGame();
        });
    }

    if (signupBtn) {
        signupBtn.addEventListener('click', () => {
            if (!signupForm || !loginForm) return;
            // 로그인 폼 대신 회원가입 폼을 보여줌
            loginForm.classList.remove('active');
            signupForm.classList.add('active');
        });
    }

    if (signupConfirmBtn) {
        signupConfirmBtn.addEventListener('click', async () => {
            const ok = await mockSignup();
            if (!ok) return;

            const email = document.getElementById('signupEmail').value.trim();
            state.playerName = getPlayerNameFromEmail(email);

            if (loginCheck && loginMessage) {
                loginCheck.classList.remove('hidden');
                loginCheck.classList.add('login-success-anim');
                loginMessage.textContent = '회원가입이 완료되었습니다! 곧 게임이 시작됩니다.';
            }

            setTimeout(() => {
                if (loginCheck) {
                    loginCheck.classList.remove('login-success-anim');
                }
                startGame();
            }, 800);
        });
    }

    if (forgotPasswordBtn) {
        forgotPasswordBtn.addEventListener('click', () => {
            alert('비밀번호 찾기 기능은 Cloudflare 연동 후 제공될 예정입니다.');
        });
    }

    // 인게임 설정 버튼
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const quitGameBtn = document.getElementById('quitGameBtn');
    const resumeGameBtn = document.getElementById('resumeGameBtn');
    const quitConfirmModal = document.getElementById('quitConfirmModal');
    const quitConfirmBtn = document.getElementById('quitConfirmBtn');
    const quitCancelBtn = document.getElementById('quitCancelBtn');

    if (settingsBtn && settingsModal) {
        // 설정 버튼 클릭 → 모달 열기
        settingsBtn.addEventListener('click', () => {
            state.isPlaying = false; // 게임 일시정지
            settingsModal.classList.remove('hidden');
        });

        // 게임 종료 버튼 → 확인 모달 표시
        if (quitGameBtn && quitConfirmModal) {
            quitGameBtn.addEventListener('click', () => {
                settingsModal.classList.add('hidden');
                quitConfirmModal.classList.remove('hidden');
            });
        }

        // 게임 종료 확인 → 인트로로 이동
        if (quitConfirmBtn) {
            quitConfirmBtn.addEventListener('click', () => {
                quitConfirmModal.classList.add('hidden');
                
                // 게임 상태 정리
                if (state.animationId) {
                    cancelAnimationFrame(state.animationId);
                    state.animationId = null;
                }
                state.isPlaying = false;
                
                // 모든 HUD 숨기기
                document.getElementById('scoreBox').style.display = 'none';
                document.getElementById('timerBox').style.display = 'none';
                document.getElementById('questionPanel').style.display = 'none';
                document.getElementById('settingsBtn').style.display = 'none';
                document.getElementById('feedbackMessage').style.display = 'none';
                
                // 엔딩 화면 숨기기
                const ending = document.getElementById('ending');
                if (ending) ending.style.display = 'none';
                
                // 인트로 화면 표시
                const intro = document.getElementById('intro');
                if (intro) {
                    intro.style.display = 'flex';
                    intro.classList.remove('fade-out');
                }
                
                // Three.js 씬 정리
                resetGameState();
            });
        }

        // 게임 종료 취소 → 설정 모달로 돌아가기
        if (quitCancelBtn) {
            quitCancelBtn.addEventListener('click', () => {
                quitConfirmModal.classList.add('hidden');
                settingsModal.classList.remove('hidden');
            });
        }

        // 계속하기 버튼 → 모달 닫고 게임 재개
        if (resumeGameBtn) {
            resumeGameBtn.addEventListener('click', () => {
                settingsModal.classList.add('hidden');
                state.isPlaying = true;
                gameLoop(); // 게임 루프 재개
            });
        }

        // 모달 배경 클릭 시 계속하기
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.add('hidden');
                state.isPlaying = true;
                gameLoop();
            }
        });

        // 확인 모달 배경 클릭 시 취소 (설정으로 돌아가기)
        if (quitConfirmModal) {
            quitConfirmModal.addEventListener('click', (e) => {
                if (e.target === quitConfirmModal) {
                    quitConfirmModal.classList.add('hidden');
                    settingsModal.classList.remove('hidden');
                }
            });
        }
    }

    // 점수 저장 버튼
    const submitScoreBtn = document.getElementById('submitScoreBtn');
    if (submitScoreBtn) {
        submitScoreBtn.addEventListener('click', async () => {
            const nameInput = document.getElementById('endingPlayerName');
            const nameError = document.getElementById('nameError');
            const playerName = nameInput ? nameInput.value.trim() : '';

            if (nameError) nameError.textContent = '';

            if (!playerName) {
                if (nameError) {
                    nameError.textContent = t('nameRequiredError');
                }
                return;
            }

            // 닉네임 욕설/비속어 필터링
            if (!isNicknameAllowed(playerName)) {
                if (nameError) {
                    nameError.textContent = t('profanityError');
                }
                return;
            }

            // 점수 저장
            state.playerName = playerName;
            await saveScore(playerName, state.score, state.regionId, state.regionName);

            // 버튼들 활성화 (이름이 저장된 이후에만 동작)
            const reviewBtnEl = document.getElementById('reviewBtn');
            const rankingBtnEl = document.getElementById('rankingBtn');
            const restartBtnEl = document.getElementById('restartBtn');
            const shareBtnEl = document.getElementById('shareBtn');
            const endingActions = document.getElementById('endingActions');

            if (reviewBtnEl) reviewBtnEl.disabled = false;
            if (rankingBtnEl) rankingBtnEl.disabled = false;
            if (restartBtnEl) restartBtnEl.disabled = false;
            if (shareBtnEl) shareBtnEl.disabled = false;
            if (endingActions) endingActions.style.display = 'flex';

            // 이름 입력 섹션 숨기기
            const nameSection = document.getElementById('nameInputSection');
            if (nameSection) nameSection.style.display = 'none';

            const endingMessage = getEndingMessage(state.score);
            const endingMessageWrapper = document.getElementById('endingMessageText');
            const endingMessageTitle = document.getElementById('endingMessageTitle');
            const endingMessageBody = document.getElementById('endingMessageBody');
            const endingBadgeIcon = document.getElementById('endingBadgeIcon');
            const endingPlayerSummary = document.getElementById('endingPlayerSummary');
            if (endingMessageWrapper) {
                endingMessageWrapper.style.display = 'flex';
            }
            if (endingMessageTitle) {
                endingMessageTitle.textContent = endingMessage.title;
            }
            if (endingMessageBody) {
                endingMessageBody.textContent = endingMessage.body;
            }
            if (endingBadgeIcon && endingMessage.iconPath) {
                endingBadgeIcon.src = endingMessage.iconPath;
            }
            if (endingPlayerSummary) {
                endingPlayerSummary.textContent = `${state.playerName} · ${state.score}`;
            }

            // 점수 저장 완료 모달 표시
            const scoreSavedModal = document.getElementById('scoreSavedModal');
            if (scoreSavedModal) {
                scoreSavedModal.classList.remove('hidden');
            }
        });
    }

    const restartBtn = document.getElementById('restartBtn');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            // 요구사항: 인트로로 가지 않고 바로 게임 플레이 화면으로 재시작
            const ending = document.getElementById('ending');
            if (ending) ending.style.display = 'none';
            
            // 인트로 화면과 인트로 비디오 완전히 숨기기
            const intro = document.getElementById('intro');
            if (intro) intro.style.display = 'none';
            
            const introVideoScreen = document.getElementById('introVideoScreen');
            if (introVideoScreen) {
                introVideoScreen.style.display = 'none';
                const video = document.getElementById('introVideo');
                if (video) {
                    video.pause();
                    video.currentTime = 0;
                }
            }

            startGame();
        });
    }

    const reviewBtn = document.getElementById('reviewBtn');
    if (reviewBtn) {
        reviewBtn.addEventListener('click', () => {
            showReviewScreen();
        });
    }
    
    const rankingBtn = document.getElementById('rankingBtn');
    if (rankingBtn) {
        rankingBtn.addEventListener('click', () => {
            const ending = document.getElementById('ending');
            const ranking = document.getElementById('ranking');
            if (!ranking || !ending) return;

            ending.style.display = 'none';
            
            // 지역별 랭킹 표시 (기본 탭)
            displayRegionRanking();
            displayPersonalRanking();
            displayStatsView();
            
            // 첫 번째 탭 활성화
            const tabs = ranking.querySelectorAll('.tab-btn');
            const contents = ranking.querySelectorAll('.tab-content');
            tabs.forEach((t) => t.classList.remove('active'));
            contents.forEach((c) => c.classList.remove('active'));
            
            const regionTab = document.getElementById('regionTabBtn');
            const regionContent = document.getElementById('regionRanking');
            if (regionTab) regionTab.classList.add('active');
            if (regionContent) regionContent.classList.add('active');

            // 랭킹 화면을 실제로 표시
            ranking.style.display = 'flex';
        });
    }

    // 엔딩 화면 공유 버튼 (링크 공유)
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            if (shareBtn.disabled) return;

            const regionName = state.regionName || '';
            const playerName = state.playerName || '';
            const score = state.score || 0;
            const endingMessage = getEndingMessage(score);

            const modal = document.getElementById('shareSummaryModal');
            const badgeImg = document.getElementById('shareBadgeIcon');
            const badgeTitleEl = document.getElementById('shareBadgeTitle');
            const badgeBodyEl = document.getElementById('shareBadgeBody');
            const playerLine = document.getElementById('sharePlayerLine');
            const regionLine = document.getElementById('shareRegionLine');
            const scoreLine = document.getElementById('shareScoreLine');

            if (badgeImg && endingMessage && endingMessage.iconPath) {
                badgeImg.src = endingMessage.iconPath;
            }

            if (badgeTitleEl && endingMessage) {
                badgeTitleEl.textContent = endingMessage.title;
            }
            if (badgeBodyEl && endingMessage) {
                badgeBodyEl.textContent = endingMessage.body;
            }

            if (playerLine) {
                playerLine.textContent = playerName
                    ? `${t('shareLabelNickname')} : ${playerName}`
                    : '';
            }
            if (regionLine) {
                let displayRegion = regionName;
                if (state.language === 'en') {
                    switch (regionId) {
                        case 'kr_seoul':
                            displayRegion = t('regionLabelSeoul');
                            break;
                        case 'kr_busan':
                            displayRegion = t('regionLabelBusan');
                            break;
                        case 'kr_incheon':
                            displayRegion = t('regionLabelIncheon');
                            break;
                        case 'kr_cheonan':
                            displayRegion = t('regionLabelCheonan');
                            break;
                        default:
                            break;
                    }
                }
                regionLine.textContent = displayRegion
                    ? `${t('shareLabelRegion')} : ${displayRegion}`
                    : '';
            }
            if (scoreLine) {
                const suffix = state.language === 'en' ? t('finalScoreUnit') : t('rankingScoreSuffix');
                scoreLine.textContent = `${t('shareLabelScore')} : ${score}${suffix ? ` ${suffix}` : ''}`;
            }

            if (modal) {
                modal.classList.remove('hidden');
            }

            // 공유용 결과 링크 생성 (?shared=1&name=...&score=...&region=...&lang=...)
            const baseUrl = window.location.origin + window.location.pathname;
            const params = new URLSearchParams();
            params.set('shared', '1');
            if (playerName) params.set('name', playerName);
            if (regionName) params.set('region', regionName);
            params.set('score', String(score));
            params.set('lang', state.language || 'ko');
            const shareUrl = `${baseUrl}?${params.toString()}`;

            const shareText = state.language === 'en'
                ? `🌍 ${t('shareTitle')}\n` +
                  `📊 ${t('shareLabelScore')}: ${score} ${t('finalScoreUnit')}\n` +
                  (regionName ? `📍 ${t('shareLabelRegion')}: ${regionName}\n` : '') +
                  (playerName ? `👤 ${t('shareLabelNickname')}: ${playerName}\n` : '') +
                  `${endingMessage.title}: ${endingMessage.body}`
                : `🌍 ${t('shareTitle')}\n` +
                  `📊 ${t('shareLabelScore')}: ${score}${t('finalScoreUnit')}\n` +
                  (regionName ? `📍 ${t('shareLabelRegion')}: ${regionName}\n` : '') +
                  (playerName ? `👤 ${t('shareLabelNickname')}: ${playerName}\n` : '') +
                  `${endingMessage.title}: ${endingMessage.body}`;

            // Web Share API 지원 시 시스템 공유 사용
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: t('shareTitle'),
                        text: shareText,
                        url: shareUrl,
                    });
                    return;
                } catch (err) {
                    if (err && err.name === 'AbortError') {
                        return;
                    }
                    console.log('Web Share failed, falling back to clipboard:', err);
                }
            }

            // 그 외 환경에서는 클립보드로 복사
            if (typeof copyToClipboard === 'function') {
                copyToClipboard(shareUrl);
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                try {
                    await navigator.clipboard.writeText(shareUrl);
                } catch (err) {
                    console.warn('Failed to copy share URL:', err);
                }
            }

            alert(t('shareLinkCopied'));
        });
    }

    const shareSummaryCloseBtn = document.getElementById('shareSummaryCloseBtn');
    if (shareSummaryCloseBtn) {
        shareSummaryCloseBtn.addEventListener('click', () => {
            const modal = document.getElementById('shareSummaryModal');
            if (modal) {
                modal.classList.add('hidden');
            }
        });
    }

    // 점수 저장 완료 모달 닫기 버튼
    const scoreSavedOkBtn = document.getElementById('scoreSavedOkBtn');
    if (scoreSavedOkBtn) {
        scoreSavedOkBtn.addEventListener('click', () => {
            const scoreSavedModal = document.getElementById('scoreSavedModal');
            if (scoreSavedModal) {
                scoreSavedModal.classList.add('hidden');
            }
        });
    }
    
    // 랭킹 탭 전환
    const regionTabBtn = document.getElementById('regionTabBtn');
    const personalTabBtn = document.getElementById('personalTabBtn');
    const statsTabBtn = document.getElementById('statsTabBtn');
    
    if (regionTabBtn) {
        regionTabBtn.addEventListener('click', () => {
            switchTab('region');
        });
    }
    
    if (personalTabBtn) {
        personalTabBtn.addEventListener('click', () => {
            switchTab('personal');
        });
    }
    
    if (statsTabBtn) {
        statsTabBtn.addEventListener('click', () => {
            switchTab('stats');
        });
    }
    
    function switchTab(tabName) {
        const tabs = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');
        
        tabs.forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        // 모든 탭 컨텐츠 숨기기
        contents.forEach(content => {
            content.classList.remove('active');
        });
        
        // 선택한 탭만 표시
        let targetContent = null;
        if (tabName === 'region') {
            targetContent = document.getElementById('regionRanking');
            displayRegionRanking();
        } else if (tabName === 'personal') {
            targetContent = document.getElementById('personalRanking');
            displayPersonalRanking();
        } else if (tabName === 'stats') {
            targetContent = document.getElementById('statsView');
            displayStatsView();
        }
        
        if (targetContent) {
            targetContent.classList.add('active');
        }
    }

    const reviewRestartBtn = document.getElementById('reviewRestartBtn');
    if (reviewRestartBtn) {
        reviewRestartBtn.addEventListener('click', () => {
            const review = document.getElementById('review');
            if (review) review.style.display = 'none';
            
            // 인트로 화면과 인트로 비디오 완전히 숨기기
            const intro = document.getElementById('intro');
            if (intro) intro.style.display = 'none';
            
            const introVideoScreen = document.getElementById('introVideoScreen');
            if (introVideoScreen) {
                introVideoScreen.style.display = 'none';
                const video = document.getElementById('introVideo');
                if (video) {
                    video.pause();
                    video.currentTime = 0;
                }
            }
            
            startGame();
        });
    }

    const reviewBackBtn = document.getElementById('reviewBackBtn');
    if (reviewBackBtn) {
        reviewBackBtn.addEventListener('click', () => {
            const review = document.getElementById('review');
            if (review) review.style.display = 'none';
        });
    }

    // 카카오톡 공유 버튼
    const kakaoShareBtn = document.getElementById('kakaoShareBtn');
    if (kakaoShareBtn) {
        kakaoShareBtn.addEventListener('click', () => {
            if (!window.Kakao || !Kakao.isInitialized()) {
                alert(state.language === 'ko' 
                    ? '카카오톡 공유 기능을 사용할 수 없습니다.\n관리자에게 문의하세요.' 
                    : 'Kakao share is not available.\nPlease contact admin.');
                return;
            }

            const endingMessage = getEndingMessage(state.score);
            const shareUrl = window.location.href.split('?')[0];
            
            // 디버깅: 공유할 URL 확인
            console.log('💬 카카오톡 공유 링크:', shareUrl);
            console.log('📊 점수:', state.score, '| 지역:', state.regionName, '| 평가:', endingMessage.title);
            
            Kakao.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title: 'EcoChaser - 친환경 분리수거 게임 🌍',
                    description: state.language === 'ko'
                        ? `점수: ${state.score}점 | 지역: ${state.regionName}\n${endingMessage.title}: ${endingMessage.body}`
                        : `Score: ${state.score} pts | Region: ${state.regionName}\n${endingMessage.title}: ${endingMessage.body}`,
                    imageUrl: 'https://your-domain.com/preview.jpg', // TODO: 실제 이미지 URL로 변경
                    link: {
                        mobileWebUrl: shareUrl,
                        webUrl: shareUrl,
                    },
                },
                buttons: [
                    {
                        title: state.language === 'ko' ? '게임 하러 가기' : 'Play Game',
                        link: {
                            mobileWebUrl: shareUrl,
                            webUrl: shareUrl,
                        },
                    },
                ],
            });
        });
    }

    // 일반 공유하기 버튼
    const shareRankingBtn = document.getElementById('shareRankingBtn');
    if (shareRankingBtn) {
        shareRankingBtn.addEventListener('click', async () => {
            const endingMessage = getEndingMessage(state.score);
            const shareText = state.language === 'ko'
                ? `🌍 EcoChaser 게임 결과\n` +
                  `📊 점수: ${state.score}점\n` +
                  `📍 지역: ${state.regionName}\n` +
                  `🏅 평가: ${endingMessage.title}\n` +
                  `${endingMessage.body}\n\n` +
                  `친환경 분리수거 게임에 도전해보세요!`
                : `🌍 EcoChaser Game Result\n` +
                  `📊 Score: ${state.score} pts\n` +
                  `📍 Region: ${state.regionName}\n` +
                  `🏅 Rank: ${endingMessage.title}\n` +
                  `${endingMessage.body}\n\n` +
                  `Challenge yourself in eco-friendly waste sorting!`;
            
            const shareUrl = window.location.href.split('?')[0];
            
            // 디버깅: 공유할 URL 확인
            console.log('📤 공유할 링크:', shareUrl);
            console.log('📝 공유할 텍스트:', shareText);
            
            // 모바일: Web Share API 사용
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'EcoChaser Game Result',
                        text: shareText,
                        url: shareUrl
                    });
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.log('Share failed:', err);
                        copyToClipboard(shareText + '\n' + shareUrl);
                    }
                }
            } else {
                // PC: 클립보드에 복사
                copyToClipboard(shareText + '\n' + shareUrl);
            }
        });
    }

    const rankingBackBtn = document.getElementById('rankingBackBtn');
    if (rankingBackBtn) {
        rankingBackBtn.addEventListener('click', () => {
            const ranking = document.getElementById('ranking');
            const ending = document.getElementById('ending');
            if (ranking) ranking.style.display = 'none';
            if (ending) ending.style.display = 'flex';
        });
    }

    const reviewScreen = document.getElementById('reviewScreen');
    if (reviewScreen) {
        reviewScreen.addEventListener('click', () => {
            const review = document.getElementById('review');
            if (review) review.style.display = 'block';
        });
    }

    const rankingScreen = document.getElementById('rankingScreen');
    if (rankingScreen) {
        rankingScreen.addEventListener('click', () => {
            const ranking = document.getElementById('ranking');
            if (ranking) ranking.style.display = 'block';
        });
    }

    // 공유 링크로 진입한 경우, 바로 결과 전용 엔딩 화면을 표시
    applySharedResultMode();

    window.addEventListener('resize', handleResize);
});