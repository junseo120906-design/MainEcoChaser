// API 설정 - Workers URL이 준비되면 여기에 입력
const API_BASE_URL = '';  // ''이면 fetch('/api/...') 형태
const USE_API = true;     // D1에 바로 보내려면 true

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

const state = {
    scene: null,
    camera: null,
    renderer: null,
    player: null,
    lanes: [-4, 0, 4], // 3 레인 (왼/중/오)
    playerLane: 1,
    roadSegments: [],
    roadLength: 80,
    gameSpeed: 0.18,
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
};

// 키보드 컨트롤이 중복으로 설치되는 것을 방지하는 플래그
let keyboardInitialized = false;

function updateTierHud() {
    const badge = document.getElementById('tierBadgeHud');
    if (!badge) return;

    const score = state.score || 0;

    // 간단한 티어 계산 (getTierInfo와 동일한 기준)
    let tierId = 'bronze';
    let tierName = '브론즈';
    if (score >= 400) {
        tierId = 'diamond';
        tierName = '다이아';
    } else if (score >= 300) {
        tierId = 'platinum';
        tierName = '플래티넘';
    } else if (score >= 200) {
        tierId = 'gold';
        tierName = '골드';
    } else if (score >= 100) {
        tierId = 'silver';
        tierName = '실버';
    }

    badge.style.display = 'block';
    // 요구사항: 상단에는 티어만 표시 (점수 숫자는 숨김)
    badge.textContent = `${tierName}`;

    let borderColor = '#795548';
    if (tierId === 'silver') borderColor = '#b0bec5';
    else if (tierId === 'gold') borderColor = '#ffd54f';
    else if (tierId === 'platinum') borderColor = '#b3e5fc';
    else if (tierId === 'diamond') borderColor = '#b39ddb';
    badge.style.border = `1px solid ${borderColor}`;
}

// 간단한 UI 다국어(i18n) 문자열
const i18n = {
    ko: {
        scoreLabel: '점수:',
        timerLabel: '남은 시간:',
        timerUnit: '초',
        introDescription:
            '달리면서 쓰레기를 올바른 통에 넣어 보는 러너 게임입니다. 기숙사·지역별 분리배출 규칙을 자연스럽게 익혀 보세요.',
        introLanguageLabel: '언어',
        introRegionLabel: '지역 선택',
        playerNamePlaceholder: '이름을 입력하세요',
        startButton: '게임 시작',
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
        endingOkButton: '확인',
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
        endingOkButton: 'OK',
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

    const timerLabelEl = document.getElementById('timerLabel');
    if (timerLabelEl) timerLabelEl.textContent = t('timerLabel');

    const timerUnitEl = document.getElementById('timeUnit');
    if (timerUnitEl) timerUnitEl.textContent = t('timerUnit');

    const introDescEl = document.getElementById('introDescription');
    if (introDescEl) introDescEl.textContent = t('introDescription');

    // 인트로 언어/지역 라벨
    const introLanguageLabelEl = document.querySelector('label[for="languageSelect"]');
    if (introLanguageLabelEl) introLanguageLabelEl.textContent = t('introLanguageLabel');

    const introRegionLabelEl = document.querySelector('label[for="regionSelect"]');
    if (introRegionLabelEl) introRegionLabelEl.textContent = t('introRegionLabel');

    const playerNameInput = document.getElementById('playerName');
    if (playerNameInput) playerNameInput.placeholder = t('playerNamePlaceholder');

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

        // 카드형 지역 선택 UI와 동기화
        const regionCards = document.querySelectorAll('.region-card');
        regionCards.forEach((card) => {
            card.addEventListener('click', () => {
                const value = card.getAttribute('data-region');
                if (!value) return;

                // select 값 변경 (기존 로직과 호환)
                regionSelect.value = value;

                // active 스타일 갱신
                regionCards.forEach((c) => c.classList.remove('active'));
                card.classList.add('active');
            });
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
    state.renderer = new THREE.WebGLRenderer({ 
        antialias: false, // 성능 향상 (안티앨리어싱 끄기)
        powerPreference: 'high-performance' // 고성능 GPU 우선
    });
    state.renderer.setSize(container.clientWidth, container.clientHeight);
    state.renderer.shadowMap.enabled = false; // 그림자 끄기 (큰 성능 향상)
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 고해상도 제한
    container.appendChild(state.renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    state.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(10, 30, 10);
    dir.castShadow = true;
    state.scene.add(dir);
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
    for (let z = 0; z < state.roadLength * 10; z += 6) {
        const left = new THREE.Mesh(lineGeo, laneMat);
        left.rotation.x = -Math.PI / 2;
        left.position.set(-2, 0.01, z);
        state.scene.add(left);

        const right = new THREE.Mesh(lineGeo, laneMat);
        right.rotation.x = -Math.PI / 2;
        right.position.set(2, 0.01, z);
        state.scene.add(right);
    }
    
    // 배경 요소 추가
    createEnvironment();
}

// 배경 환경 생성 (나무, 건물, 구름 등)
function createEnvironment() {
    // 트랙 끝 기준으로 더 큰 여유를 두어 도로와 배경이 충분히 길게 느껴지도록 함
    const baseLength = state.trackEndZ && state.trackEndZ > 0 ? state.trackEndZ + 260 : state.roadLength * 14;
    const envLength = baseLength;
    // 잔디 바닥 (도로 양옆)
    const grassGeo = new THREE.PlaneGeometry(30, envLength);
    const grassMat = new THREE.MeshStandardMaterial({
        color: 0x4a8c2a, // 진한 초록색 잔디
        roughness: 0.9,
        side: THREE.DoubleSide,
    });
    
    // 왼쪽 잔디
    const grassLeft = new THREE.Mesh(grassGeo, grassMat);
    grassLeft.rotation.x = -Math.PI / 2;
    grassLeft.position.set(-23, -0.01, envLength / 2);
    state.scene.add(grassLeft);
    
    // 오른쪽 잔디
    const grassRight = new THREE.Mesh(grassGeo, grassMat);
    grassRight.rotation.x = -Math.PI / 2;
    grassRight.position.set(23, -0.01, envLength / 2);
    state.scene.add(grassRight);
    
    // 나무 생성 (30 → 12개로 감소)
    for (let i = 0; i < 12; i++) {
        const z = Math.random() * envLength - 20;
        const side = Math.random() > 0.5 ? 1 : -1;
        const x = side * (10 + Math.random() * 10);
        createTree(x, z);
    }
    
    // 건물 생성 (12 → 6개로 감소)
    for (let i = 0; i < 6; i++) {
        const z = i * (envLength / 5) - 20;
        const side = Math.random() > 0.5 ? 1 : -1;
        const x = side * (18 + Math.random() * 8);
        const height = 8 + Math.random() * 12;
        createBuilding(x, z, height);
    }
    
    // 구름 생성 (15 → 8개로 감소)
    for (let i = 0; i < 8; i++) {
        const x = (Math.random() - 0.5) * 100;
        const y = 25 + Math.random() * 15;
        const z = Math.random() * state.roadLength * 3 - 20;
        createCloud(x, y, z);
    }
    
    // 도로 표지판 (12 → 6개로 감소)
    for (let i = 0; i < 3; i++) {
        const z = i * 50;
        createRoadSign(-9, z);
        createRoadSign(9, z + 25);
    }
    
    // 분리수거 테마 요소들 추가
    
    // 재활용 마크 조형물 (4 → 2개로 감소)
    for (let i = 0; i < 2; i++) {
        const z = i * 80 + 30;
        const side = i % 2 === 0 ? 1 : -1;
        createRecycleSymbol(side * 12, z);
    }
    
    // 가로등 (간격을 넓혀서 개수 감소)
    for (let i = 0; i < Math.ceil(envLength / 40); i++) {
        const z = i * 40 - 10;
        createSolarStreetLight(-11, z);
        createSolarStreetLight(11, z + 20);
    }

    // 공원 벤치 & 쓰레기통 세트 (간격 증가)
    for (let i = 0; i < Math.ceil(envLength / 80); i++) {
        const z = i * 80 + 20;
        const side = i % 2 === 0 ? 1 : -1;
        createParkBenchSet(side * 11, z);
    }

    // 재활용 센터 미니 건물 (1개만)
    createRecycleCenter(25, envLength * 0.5);
    
    // 환경 보호 광고판 (6 → 3개로 감소)
    for (let i = 0; i < 3; i++) {
        const z = i * (envLength / 3) + 40;
        const side = i % 2 === 0 ? 1 : -1;
        createEcoBillboard(side * 15, z);
    }
    
    // 풍력 발전기 (멀리, 도로와 충분히 떨어진 위치에 배치)
    // 도로 레인(-4, 0, 4)에서 한참 벗어나도록 x 좌표를 크게 잡음
    createWindTurbine(-40, envLength * 0.5);
    createWindTurbine(40, envLength * 0.6);
    
    // 화단 (도로변 꽃)
    for (let i = 0; i < Math.ceil(envLength / 25); i++) {
        const z = i * 25;
        const side = Math.random() > 0.5 ? 1 : -1;
        createFlowerBed(side * 9.5, z);
    }

    // 도로 끝을 막는 건물 배리어는 사용하지 않음 (도로를 열린 형태로 유지)
}

// 나무 생성
function createTree(x, z) {
    const tree = new THREE.Group();
    
    // 나무 줄기
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.5;
    trunk.castShadow = true;
    tree.add(trunk);
    
    // 나뭇잎 (원뿔 3개 겹치기)
    const foliageGeo = new THREE.ConeGeometry(1.5, 3, 8);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2d5016 });
    
    const foliage1 = new THREE.Mesh(foliageGeo, foliageMat);
    foliage1.position.y = 4;
    foliage1.castShadow = true;
    tree.add(foliage1);
    
    const foliage2 = new THREE.Mesh(foliageGeo, foliageMat);
    foliage2.position.y = 5.5;
    foliage2.scale.set(0.8, 0.8, 0.8);
    foliage2.castShadow = true;
    tree.add(foliage2);
    
    const foliage3 = new THREE.Mesh(foliageGeo, foliageMat);
    foliage3.position.y = 6.5;
    foliage3.scale.set(0.6, 0.6, 0.6);
    foliage3.castShadow = true;
    tree.add(foliage3);
    
    tree.position.set(x, 0, z);
    state.scene.add(tree);
    state.environmentObjects.push(tree);
}

// 건물 생성
function createBuilding(x, z, height) {
    const building = new THREE.Group();
    
    // 다양한 건물 색상 배열 (환경 친화적인 파스텔톤)
    const buildingColors = [
        0xe8f5e9, // 연한 초록
        0xe3f2fd, // 연한 파랑
        0xfff3e0, // 연한 주황
        0xf3e5f5, // 연한 보라
        0xfce4ec, // 연한 핑크
        0xe0f2f1, // 연한 청록
    ];
    
    const buildingColor = buildingColors[Math.floor(Math.random() * buildingColors.length)];
    
    // 메인 건물
    const buildingGeo = new THREE.BoxGeometry(4, height, 4);
    const buildingMat = new THREE.MeshStandardMaterial({
        color: buildingColor,
        roughness: 0.7,
        metalness: 0.1,
    });
    const buildingMesh = new THREE.Mesh(buildingGeo, buildingMat);
    buildingMesh.position.y = height / 2;
    buildingMesh.castShadow = true;
    buildingMesh.receiveShadow = true;
    building.add(buildingMesh);
    
    // 옥상 테두리
    const roofEdgeGeo = new THREE.BoxGeometry(4.2, 0.3, 4.2);
    const roofEdgeMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(buildingColor).multiplyScalar(0.7),
    });
    const roofEdge = new THREE.Mesh(roofEdgeGeo, roofEdgeMat);
    roofEdge.position.y = height;
    building.add(roofEdge);
    
    // 입구 (1층 중앙)
    const entranceGeo = new THREE.BoxGeometry(1.2, 2, 0.1);
    const entranceMat = new THREE.MeshStandardMaterial({
        color: 0x795548, // 갈색 문
        roughness: 0.8,
    });
    const entrance = new THREE.Mesh(entranceGeo, entranceMat);
    entrance.position.set(0, 1, 2.05);
    building.add(entrance);
    
    // 창문들
    const windowGeo = new THREE.BoxGeometry(0.6, 0.8, 0.15);
    const windowColors = [
        { base: 0x64b5f6, emissive: 0x1976d2 }, // 파랑
        { base: 0x81c784, emissive: 0x388e3c }, // 초록
        { base: 0xffb74d, emissive: 0xf57c00 }, // 주황
    ];
    const windowColor = windowColors[Math.floor(Math.random() * windowColors.length)];
    
    const windowMat = new THREE.MeshStandardMaterial({
        color: windowColor.base,
        emissive: windowColor.emissive,
        emissiveIntensity: 0.4,
        roughness: 0.2,
        metalness: 0.5,
    });
    
    const floors = Math.floor(height / 2);
    // 앞면 창문
    for (let f = 1; f < floors; f++) { // 1층은 입구가 있으므로 제외
        for (let w = 0; w < 3; w++) {
            if (f === 1 && w === 1) continue; // 입구 위치 피하기
            
            const window1 = new THREE.Mesh(windowGeo, windowMat);
            window1.position.set(
                (w - 1) * 1.2,
                f * 2 + 1,
                2.05
            );
            building.add(window1);
            
            // 창틀
            const frameGeo = new THREE.BoxGeometry(0.7, 0.9, 0.1);
            const frameMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
            });
            const frame = new THREE.Mesh(frameGeo, frameMat);
            frame.position.set(
                (w - 1) * 1.2,
                f * 2 + 1,
                2.0
            );
            building.add(frame);
        }
    }
    
    // 옆면 창문 (간단히)
    for (let f = 1; f < floors; f++) {
        const sideWindow1 = new THREE.Mesh(windowGeo, windowMat);
        sideWindow1.position.set(2.05, f * 2 + 1, 0);
        sideWindow1.rotation.y = Math.PI / 2;
        building.add(sideWindow1);
        
        const sideWindow2 = new THREE.Mesh(windowGeo, windowMat);
        sideWindow2.position.set(-2.05, f * 2 + 1, 0);
        sideWindow2.rotation.y = Math.PI / 2;
        building.add(sideWindow2);
    }
    
    // 에어컨 실외기 (랜덤 배치)
    if (Math.random() > 0.5) {
        const acGeo = new THREE.BoxGeometry(0.3, 0.2, 0.4);
        const acMat = new THREE.MeshStandardMaterial({ color: 0xbdbdbd });
        const ac = new THREE.Mesh(acGeo, acMat);
        ac.position.set(1.5, height * 0.3, 2.2);
        building.add(ac);
    }
    
    // 옥상 안테나/위성접시
    if (Math.random() > 0.6) {
        const antennaGroup = new THREE.Group();
        
        // 안테나 기둥
        const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x424242 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 0.75;
        antennaGroup.add(pole);
        
        // 접시
        const dishGeo = new THREE.SphereGeometry(0.3, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const dishMat = new THREE.MeshStandardMaterial({ 
            color: 0xeeeeee,
            metalness: 0.8,
            roughness: 0.2,
        });
        const dish = new THREE.Mesh(dishGeo, dishMat);
        dish.position.y = 1.5;
        dish.rotation.x = Math.PI / 4;
        antennaGroup.add(dish);
        
        antennaGroup.position.set(
            (Math.random() - 0.5) * 1.5,
            height,
            (Math.random() - 0.5) * 1.5
        );
        building.add(antennaGroup);
    }
    
    // 발코니 (중간층에)
    const balconyFloor = Math.floor(floors / 2);
    if (floors > 3 && Math.random() > 0.4) {
        for (let w = 0; w < 3; w++) {
            const balconyGeo = new THREE.BoxGeometry(0.8, 0.05, 0.4);
            const balconyMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(buildingColor).multiplyScalar(0.8),
            });
            const balcony = new THREE.Mesh(balconyGeo, balconyMat);
            balcony.position.set(
                (w - 1) * 1.2,
                balconyFloor * 2 + 0.5,
                2.25
            );
            building.add(balcony);
            
            // 발코니 난간
            const railingGeo = new THREE.BoxGeometry(0.8, 0.3, 0.02);
            const railingMat = new THREE.MeshStandardMaterial({ color: 0x757575 });
            const railing = new THREE.Mesh(railingGeo, railingMat);
            railing.position.set(
                (w - 1) * 1.2,
                balconyFloor * 2 + 0.8,
                2.45
            );
            building.add(railing);
        }
    }
    
    // 건물 외벽 라인 장식 (수평선)
    for (let i = 1; i <= 3; i++) {
        const lineHeight = (height / 4) * i;
        const lineGeo = new THREE.BoxGeometry(4.1, 0.1, 4.1);
        const lineMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(buildingColor).multiplyScalar(0.85),
        });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.y = lineHeight;
        building.add(line);
    }
    
    // 간판 (일부 건물에만)
    if (Math.random() > 0.6) {
        const signGeo = new THREE.BoxGeometry(2, 0.5, 0.1);
        const signColors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3];
        const signColor = signColors[Math.floor(Math.random() * signColors.length)];
        const signMat = new THREE.MeshStandardMaterial({
            color: signColor,
            emissive: signColor,
            emissiveIntensity: 0.5,
        });
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.set(0, height * 0.2, 2.1);
        building.add(sign);
    }
    
    // 옥상 정원 (일부 건물에)
    if (Math.random() > 0.7) {
        // 나무 화분들
        for (let i = 0; i < 3; i++) {
            const potGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.2, 8);
            const potMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });
            const pot = new THREE.Mesh(potGeo, potMat);
            pot.position.set(
                (Math.random() - 0.5) * 2,
                height + 0.1,
                (Math.random() - 0.5) * 2
            );
            building.add(pot);
            
            // 작은 나무
            const treeGeo = new THREE.ConeGeometry(0.2, 0.5, 6);
            const treeMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
            const tree = new THREE.Mesh(treeGeo, treeMat);
            tree.position.set(
                pot.position.x,
                height + 0.4,
                pot.position.z
            );
            building.add(tree);
        }
    }
    
    // 건물 코너 기둥 장식
    const pillarGeo = new THREE.BoxGeometry(0.15, height, 0.15);
    const pillarMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(buildingColor).multiplyScalar(0.6),
        roughness: 0.8,
    });
    
    const corners = [
        [1.93, 1.93],
        [-1.93, 1.93],
        [1.93, -1.93],
        [-1.93, -1.93]
    ];
    
    corners.forEach(([cx, cz]) => {
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(cx, height / 2, cz);
        building.add(pillar);
    });
    
    building.position.set(x, 0, z);
    state.scene.add(building);
    state.environmentObjects.push(building);
}

// 구름 생성
function createCloud(x, y, z) {
    const cloud = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
    });
    
    // 여러 구체로 구름 만들기
    for (let i = 0; i < 5; i++) {
        const sphereGeo = new THREE.SphereGeometry(1 + Math.random() * 0.5, 8, 8);
        const sphere = new THREE.Mesh(sphereGeo, cloudMat);
        sphere.position.set(
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 1,
            (Math.random() - 0.5) * 2
        );
        cloud.add(sphere);
    }
    
    cloud.position.set(x, y, z);
    state.scene.add(cloud);
    state.environmentObjects.push(cloud);
}

// 재활용 마크 조형물
function createRecycleSymbol(x, z) {
    const group = new THREE.Group();
    
    // 받침대
    const baseGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.3, 8);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x757575 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.15;
    group.add(base);
    
    // 재활용 마크 (3개의 화살표를 원형으로)
    const arrowMat = new THREE.MeshStandardMaterial({
        color: 0x4caf50,
        emissive: 0x2e7d32,
        emissiveIntensity: 0.3,
    });
    
    for (let i = 0; i < 3; i++) {
        const arrow = new THREE.Group();
        
        // 화살표 몸통
        const bodyGeo = new THREE.BoxGeometry(0.15, 0.6, 0.1);
        const body = new THREE.Mesh(bodyGeo, arrowMat);
        body.position.y = 0.3;
        arrow.add(body);
        
        // 화살표 머리
        const headGeo = new THREE.ConeGeometry(0.2, 0.3, 3);
        const head = new THREE.Mesh(headGeo, arrowMat);
        head.position.y = 0.75;
        head.rotation.z = Math.PI;
        arrow.add(head);
        
        arrow.rotation.y = (i * Math.PI * 2) / 3;
        arrow.position.y = 1.5;
        arrow.rotation.x = Math.PI / 6;
        group.add(arrow);
    }
    
    group.position.set(x, 0, z);
    state.scene.add(group);
    state.environmentObjects.push(group);
}

// 점수 이펙트 표시 (+10 / -10)
function showScoreEffect(amount) {
    const el = document.getElementById('scoreEffect');
    if (!el) return;

    el.textContent = amount > 0 ? `+${amount}` : `${amount}`;

    el.classList.remove('negative');
    if (amount < 0) {
        el.classList.add('negative');
    }

    el.classList.remove('show');
    // 리플로우 강제해서 애니메이션 재적용
    void el.offsetWidth;
    el.classList.add('show');
}

// 태양광 가로등
function createSolarStreetLight(x, z) {
    const group = new THREE.Group();
    
    // 기둥
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 4, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x616161 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 2;
    group.add(pole);
    
    // 태양광 패널
    const panelGeo = new THREE.BoxGeometry(0.6, 0.05, 0.4);
    const panelMat = new THREE.MeshStandardMaterial({
        color: 0x1a237e,
        metalness: 0.8,
        roughness: 0.2,
    });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.y = 4.2;
    panel.rotation.x = -Math.PI / 6;
    group.add(panel);
    
    // 조명
    const lightGeo = new THREE.BoxGeometry(0.3, 0.15, 0.3);
    const lightMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffeb3b,
        emissiveIntensity: 0.5,
    });
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.position.y = 3.8;
    group.add(light);
    
    group.position.set(x, 0, z);
    state.scene.add(group);
}

// 공원 벤치 & 쓰레기통 세트
function createParkBenchSet(x, z) {
    const group = new THREE.Group();
    
    // 벤치
    const benchBackGeo = new THREE.BoxGeometry(1.5, 0.6, 0.1);
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });
    const benchBack = new THREE.Mesh(benchBackGeo, benchMat);
    benchBack.position.set(0, 0.8, -0.3);
    group.add(benchBack);
    
    const benchSeatGeo = new THREE.BoxGeometry(1.5, 0.1, 0.5);
    const benchSeat = new THREE.Mesh(benchSeatGeo, benchMat);
    benchSeat.position.set(0, 0.5, -0.15);
    group.add(benchSeat);
    
    // 벤치 다리
    const legGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1);
    const legPositions = [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.1], [0.6, 0.1]];
    legPositions.forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(legGeo, benchMat);
        leg.position.set(lx, 0.25, lz);
        group.add(leg);
    });
    
    // 작은 쓰레기통
    const binGeo = new THREE.CylinderGeometry(0.2, 0.18, 0.5, 8);
    const binMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
    const bin = new THREE.Mesh(binGeo, binMat);
    bin.position.set(1.2, 0.25, 0);
    group.add(bin);
    
    group.position.set(x, 0, z);
    state.scene.add(group);
}

// 재활용 센터
function createRecycleCenter(x, z) {
    const group = new THREE.Group();
    
    // 건물
    const buildingGeo = new THREE.BoxGeometry(6, 4, 5);
    const buildingMat = new THREE.MeshStandardMaterial({
        color: 0xe8f5e9,
        roughness: 0.7,
    });
    const building = new THREE.Mesh(buildingGeo, buildingMat);
    building.position.y = 2;
    building.castShadow = true;
    group.add(building);
    
    // 지붕
    const roofGeo = new THREE.ConeGeometry(4.5, 1.5, 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 4.75;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    
    // 큰 재활용 마크
    const markGeo = new THREE.CircleGeometry(0.8, 32);
    const markMat = new THREE.MeshStandardMaterial({
        color: 0x4caf50,
        emissive: 0x2e7d32,
        emissiveIntensity: 0.5,
    });
    const mark = new THREE.Mesh(markGeo, markMat);
    mark.position.set(0, 2.5, 2.51);
    group.add(mark);
    
    group.position.set(x, 0, z);
    state.scene.add(group);
}

// 환경 보호 광고판
function createEcoBillboard(x, z) {
    const group = new THREE.Group();
    
    // 지주 2개
    const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, 5, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x424242 });
    
    const pole1 = new THREE.Mesh(poleGeo, poleMat);
    pole1.position.set(-1.5, 2.5, 0);
    group.add(pole1);
    
    const pole2 = new THREE.Mesh(poleGeo, poleMat);
    pole2.position.set(1.5, 2.5, 0);
    group.add(pole2);
    
    // 광고판
    const boardGeo = new THREE.BoxGeometry(3.5, 2, 0.1);
    const boardMat = new THREE.MeshStandardMaterial({
        color: 0x81c784,
        emissive: 0x66bb6a,
        emissiveIntensity: 0.3,
    });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.y = 4;
    group.add(board);
    
    // "ECO" 텍스트 표현 (간단한 박스들로)
    const textMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.5,
    });
    
    // E
    const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.05), textMat);
    e1.position.set(-0.8, 4, 0.1);
    group.add(e1);
    
    // C
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16, Math.PI * 1.5), textMat);
    c.position.set(0, 4, 0.1);
    c.rotation.y = Math.PI;
    group.add(c);
    
    // O
    const o = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16), textMat);
    o.position.set(0.8, 4, 0.1);
    group.add(o);
    
    group.position.set(x, 0, z);
    state.scene.add(group);
}

// 풍력 발전기
function createWindTurbine(x, z) {
    const group = new THREE.Group();
    
    // 타워
    const towerGeo = new THREE.CylinderGeometry(0.3, 0.5, 15, 8);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.y = 7.5;
    group.add(tower);
    
    // 나셀 (본체)
    const nacelleGeo = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
    const nacelleMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const nacelle = new THREE.Mesh(nacelleGeo, nacelleMat);
    nacelle.rotation.z = Math.PI / 2;
    nacelle.position.set(0, 15, 0.5);
    group.add(nacelle);
    
    // 블레이드 3개
    const bladeMat = new THREE.MeshStandardMaterial({
        color: 0xfafafa,
        side: THREE.DoubleSide,
    });
    
    for (let i = 0; i < 3; i++) {
        const bladeGeo = new THREE.BoxGeometry(0.1, 4, 0.5);
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.position.y = 2;
        
        const bladeArm = new THREE.Group();
        bladeArm.add(blade);
        bladeArm.rotation.z = (i * Math.PI * 2) / 3;
        bladeArm.position.set(0, 15, 1.5);
        group.add(bladeArm);
    }
    
    group.position.set(x, 0, z);
    state.scene.add(group);
}

// 화단
function createFlowerBed(x, z) {
    const group = new THREE.Group();
    
    // 화단 틀
    const bedGeo = new THREE.BoxGeometry(1.5, 0.3, 0.8);
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x795548 });
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.position.y = 0.15;
    group.add(bed);
    
    // 흙
    const soilGeo = new THREE.BoxGeometry(1.4, 0.1, 0.7);
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    const soil = new THREE.Mesh(soilGeo, soilMat);
    soil.position.y = 0.35;
    group.add(soil);
    
    // 꽃들
    const flowerColors = [0xff1744, 0xff9100, 0xffea00, 0xe91e63, 0x9c27b0];
    for (let i = 0; i < 5; i++) {
        const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4);
        const stemMat = new THREE.MeshStandardMaterial({ color: 0x33691e });
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.set((i - 2) * 0.25, 0.55, (Math.random() - 0.5) * 0.3);
        group.add(stem);
        
        const flowerGeo = new THREE.SphereGeometry(0.08, 6, 6);
        const flowerMat = new THREE.MeshStandardMaterial({
            color: flowerColors[i % flowerColors.length],
            emissive: flowerColors[i % flowerColors.length],
            emissiveIntensity: 0.3,
        });
        const flower = new THREE.Mesh(flowerGeo, flowerMat);
        flower.position.set((i - 2) * 0.25, 0.75, (Math.random() - 0.5) * 0.3);
        group.add(flower);
    }
    
    group.position.set(x, 0, z);
    state.scene.add(group);
    state.environmentObjects.push(group);
}

// 도로 표지판 생성
function createRoadSign(x, z) {
    const group = new THREE.Group();
    
    // 기둥
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 3, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.5;
    pole.castShadow = true;
    group.add(pole);
    
    // 표지판
    const signGeo = new THREE.BoxGeometry(1, 1, 0.1);
    const signMat = new THREE.MeshStandardMaterial({
        color: 0x32cd32, // 환경 테마에 맞게 초록색
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.y = 3.5;
    sign.castShadow = true;
    group.add(sign);
    
    group.position.set(x, 0, z);
    state.scene.add(group);
    state.environmentObjects.push(group);
}

// 3D 쓰레기통 생성 (뚜껑 + 몸통 + 디테일 + 텍스트)
function createTrashBin(color, labelText = '') {
    const bin = new THREE.Group();
    
    // 몸통용 캔버스 텍스처 생성 (텍스트 포함)
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    
    // 배경색 (쓰레기통 색상)
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, 2048, 2048);
    
    // 텍스트 그리기
    if (labelText) {
        // 검은색 배경 박스 (상단으로 이동)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.fillRect(200, 400, 1648, 648);
        
        // 텍스트 선명도를 위한 설정
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // 텍스트 외곽선 추가로 선명도 향상
        ctx.font = 'bold 280px Noto Sans KR, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 외곽선 (더 선명하게)
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 8;
        ctx.strokeText(labelText, 1024, 724);
        
        // 텍스트 본체
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(labelText, 1024, 724);
    }
    
    const bodyTexture = new THREE.CanvasTexture(canvas);
    bodyTexture.anisotropy = 16; // 텍스처 선명도 향상
    bodyTexture.needsUpdate = true;
    
    // 몸통 (아래가 약간 좁은 원기둥) - 크기 증가
    const bodyGeo = new THREE.CylinderGeometry(1.2, 1.05, 2.5, 32);
    const bodyMat = new THREE.MeshStandardMaterial({
        map: bodyTexture,
        roughness: 0.6,
        metalness: 0.1,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0;
    body.castShadow = true;
    body.receiveShadow = true;
    bin.add(body);
    
    // 뚜껑 (윗부분) - 크기 증가
    const lidGeo = new THREE.CylinderGeometry(1.35, 1.25, 0.4, 16);
    const lidMat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
        metalness: 0.2,
    });
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.y = 1.45;
    lid.castShadow = true;
    bin.add(lid);
    
    // 뚜껑 손잡이 - 크기 증가
    const handleGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.2, 8);
    const handleMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).multiplyScalar(0.7), // 약간 어두운 색
        roughness: 0.8,
    });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = 1.8;
    handle.castShadow = true;
    bin.add(handle);
    
    // 쓰레기통 입구 표시 (어두운 원형 테두리) - 크기 증가
    const openingGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.07, 16);
    const openingMat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.9,
    });
    const opening = new THREE.Mesh(openingGeo, openingMat);
    opening.position.y = 1.28;
    bin.add(opening);
    
    // 쓰레기통 바닥 테두리 - 크기 증가
    const rimGeo = new THREE.TorusGeometry(1.06, 0.07, 8, 16);
    const rimMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).multiplyScalar(0.6),
        roughness: 0.7,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -1.25;
    bin.add(rim);
    
    return bin;
}

// 플레이어 (단순 박스)
function createPlayer() {
    const player = new THREE.Group();
    
    // 머리 (구형)
    const headGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdbac }); // 살구색
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 1.45, 0);
    head.castShadow = true;
    player.add(head);
    
    // 머리카락 (뒤통수 보이도록)
    const hairGeo = new THREE.SphereGeometry(0.36, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.7);
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x2c1810 }); // 갈색 머리
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.set(0, 1.55, 0);
    hair.castShadow = true;
    player.add(hair);
    
    // 목
    const neckGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.15, 8);
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.set(0, 1.15, 0);
    player.add(neck);
    
    // 몸통 (티셔츠)
    const bodyGeo = new THREE.BoxGeometry(0.7, 0.9, 0.4);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2196f3 }); // 파란색 티셔츠
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0.6, 0);
    body.castShadow = true;
    player.add(body);
    player.userData.body = body;
    
    // 왼팔 그룹
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.45, 0.95, 0);
    player.add(leftArmGroup);
    
    const armGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.6, 8);
    const leftArm = new THREE.Mesh(armGeo, bodyMat);
    leftArm.position.y = -0.3;
    leftArm.castShadow = true;
    leftArmGroup.add(leftArm);
    
    const handGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const leftHand = new THREE.Mesh(handGeo, skinMat);
    leftHand.position.y = -0.65;
    leftArmGroup.add(leftHand);
    player.userData.leftArmGroup = leftArmGroup;
    
    // 오른팔 그룹
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.45, 0.95, 0);
    player.add(rightArmGroup);
    
    const rightArm = new THREE.Mesh(armGeo, bodyMat);
    rightArm.position.y = -0.3;
    rightArm.castShadow = true;
    rightArmGroup.add(rightArm);
    
    const rightHand = new THREE.Mesh(handGeo, skinMat);
    rightHand.position.y = -0.65;
    rightArmGroup.add(rightHand);
    player.userData.rightArmGroup = rightArmGroup;
    
    // 왼쪽 다리 그룹
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.18, 0.15, 0);
    player.add(leftLegGroup);
    
    const thighGeo = new THREE.CylinderGeometry(0.12, 0.11, 0.5, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1565c0 });
    const leftThigh = new THREE.Mesh(thighGeo, legMat);
    leftThigh.position.y = -0.25;
    leftThigh.castShadow = true;
    leftLegGroup.add(leftThigh);
    
    const leftKneeGroup = new THREE.Group();
    leftKneeGroup.position.y = -0.5;
    leftLegGroup.add(leftKneeGroup);
    
    const calfGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.5, 8);
    const leftCalf = new THREE.Mesh(calfGeo, legMat);
    leftCalf.position.y = -0.25;
    leftCalf.castShadow = true;
    leftKneeGroup.add(leftCalf);
    
    const shoeGeo = new THREE.BoxGeometry(0.16, 0.12, 0.28);
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x212121 });
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.55, 0.06);
    leftShoe.castShadow = true;
    leftKneeGroup.add(leftShoe);
    
    player.userData.leftLegGroup = leftLegGroup;
    player.userData.leftKneeGroup = leftKneeGroup;
    
    // 오른쪽 다리 그룹
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.18, 0.15, 0);
    player.add(rightLegGroup);
    
    const rightThigh = new THREE.Mesh(thighGeo, legMat);
    rightThigh.position.y = -0.25;
    rightThigh.castShadow = true;
    rightLegGroup.add(rightThigh);
    
    const rightKneeGroup = new THREE.Group();
    rightKneeGroup.position.y = -0.5;
    rightLegGroup.add(rightKneeGroup);
    
    const rightCalf = new THREE.Mesh(calfGeo, legMat);
    rightCalf.position.y = -0.25;
    rightCalf.castShadow = true;
    rightKneeGroup.add(rightCalf);
    
    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.55, 0.06);
    rightShoe.castShadow = true;
    rightKneeGroup.add(rightShoe);
    
    player.userData.rightLegGroup = rightLegGroup;
    player.userData.rightKneeGroup = rightKneeGroup;
    
    // 가방 (등에)
    const bagGeo = new THREE.BoxGeometry(0.5, 0.6, 0.2);
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
    const bag = new THREE.Mesh(bagGeo, bagMat);
    bag.position.set(0, 0.6, -0.35);
    bag.castShadow = true;
    player.add(bag);
    
    // 애니메이션 시간
    player.userData.animationTime = 0;
    
    player.position.set(state.lanes[state.playerLane], 1, 5);
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

        const setBins = [];
        for (let i = 0; i < 3; i++) {
            const binData = binsData[i];
            // 게임 분위기에 맞는 밝고 선명한 색상 팔레트에서 랜덤 선택
            const colorPalette = [
                0xff6b6b, // 밝은 빨강
                0x4ecdc4, // 청록색
                0xffe66d, // 노란색
                0x95e1d3, // 민트색
                0xf38181, // 연한 빨강
                0xaa96da, // 라벤더
                0xfcbad3, // 핑크
                0xa8e6cf, // 연한 초록
                0xff8b94, // 코랄
                0x6c5ce7, // 보라색
                0x74b9ff, // 하늘색
                0xfdcb6e, // 주황색
                0x55efc4, // 밝은 민트
                0xfd79a8, // 핫핑크
                0x81ecec  // 아쿠아
            ];
            const randomColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            
            // 라벨 텍스트 준비
            const binLabelText =
                state.language === 'en' && binData.name_en
                    ? binData.name_en
                    : binData.name;
            
            const bin = createTrashBin(randomColor, binLabelText);
            bin.castShadow = true;
            bin.position.set(state.lanes[i], 1, baseZ);

            // 쓰레기통 크기 설정
            bin.scale.set(1.1, 1.1, 1.1);

            // 타입별 간단한 아이콘을 통 앞쪽에 추가
            const iconGroup = new THREE.Group();
            iconGroup.position.set(0, -0.6, 1.25);

            if (binData.id === 'recycle') {
                // 재활용: PET 병 느낌의 실린더 + 뚜껑
                const bottleBodyGeo = new THREE.CylinderGeometry(0.12, 0.11, 0.5, 8);
                const bottleBodyMat = new THREE.MeshStandardMaterial({
                    color: 0x90caf9,
                    metalness: 0.1,
                    roughness: 0.4,
                });
                const bottleBody = new THREE.Mesh(bottleBodyGeo, bottleBodyMat);
                bottleBody.position.set(0, 0.25, 0);
                iconGroup.add(bottleBody);

                const bottleCapGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 8);
                const bottleCapMat = new THREE.MeshStandardMaterial({ color: 0x1565c0 });
                const bottleCap = new THREE.Mesh(bottleCapGeo, bottleCapMat);
                bottleCap.position.set(0, 0.55, 0);
                iconGroup.add(bottleCap);
            } else if (binData.id === 'food') {
                // 음식물: 반쯤 먹은 음식 느낌의 원뿔 + 작은 접시
                const plateGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 12);
                const plateMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
                const plate = new THREE.Mesh(plateGeo, plateMat);
                plate.position.set(0, 0.02, 0);
                iconGroup.add(plate);

                const foodGeo = new THREE.ConeGeometry(0.16, 0.25, 12);
                const foodMat = new THREE.MeshStandardMaterial({ color: 0xffb74d });
                const food = new THREE.Mesh(foodGeo, foodMat);
                food.position.set(0, 0.2, 0);
                iconGroup.add(food);
            } else if (binData.id === 'general') {
                // 일반: 검은 봉투 모양 아이콘
                const bagGeo = new THREE.SphereGeometry(0.18, 12, 12);
                const bagMat = new THREE.MeshStandardMaterial({ color: 0x424242 });
                const bag = new THREE.Mesh(bagGeo, bagMat);
                bag.scale.y = 1.2;
                bag.position.set(0, 0.22, 0);
                iconGroup.add(bag);

                const tieGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6);
                const tieMat = new THREE.MeshStandardMaterial({ color: 0x212121 });
                const tie = new THREE.Mesh(tieGeo, tieMat);
                tie.position.set(0, 0.5, 0);
                iconGroup.add(tie);
            }

            bin.add(iconGroup);
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
function updateHud() {
    document.getElementById('score').textContent = state.score;
    const timeLeft = Math.max(0, Math.ceil(state.gameTimeLimit - state.gameTime));
    document.getElementById('timeLeft').textContent = timeLeft;
    updateTierHud();
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
function showWrongAnswerBubble(yourAnswer, correctAnswer) {
    const bubble = document.getElementById('wrongAnswerBubble');
    const bubbleText = document.getElementById('bubbleText');
    
    if (!bubble || !bubbleText) return;
    
    // 말풍선 텍스트 생성
    const message = state.language === 'ko' 
        ? `이건 ${correctAnswer}예요!\n${yourAnswer}이(가) 아니에요.`
        : `This is ${correctAnswer}!\nNot ${yourAnswer}.`;
    
    bubbleText.textContent = message;
    
    // 말풍선 표시
    bubble.classList.remove('hidden', 'fade-out');
    
    // 2초 후 사라짐
    setTimeout(() => {
        bubble.classList.add('fade-out');
        setTimeout(() => {
            bubble.classList.add('hidden');
        }, 300);
    }, 2000);
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

// 기존 랭킹 함수들은 새로운 지역별 랭킹 시스템으로 대체됨 (삭제됨)

function getTierInfo(score) {
    const tiers = [
        { id: 'bronze', name: '브론즈', min: 0 },
        { id: 'silver', name: '실버', min: 100 },
        { id: 'gold', name: '골드', min: 200 },
        { id: 'platinum', name: '플래티넘', min: 300 },
        { id: 'diamond', name: '다이아', min: 400 },
    ];

    const current = tiers
        .slice()
        .reverse()
        .find((t) => score >= t.min) || tiers[0];

    const nextIndex = tiers.findIndex((t) => t.id === current.id) + 1;
    const next = nextIndex < tiers.length ? tiers[nextIndex] : null;

    const tierBase = current.min;
    const withinTier = Math.max(0, Math.min(100, score - tierBase));
    const progressPercent = Math.max(0, Math.min(100, withinTier));

    return {
        current,
        next,
        withinTier,
        progressPercent,
    };
}

function getEndingMessage(score) {
    const clamped = Math.max(0, Math.min(100, score));
    let title = '';
    let body = '';

    if (clamped <= 20) {
        title = '초심자';
        body = '아쉽네요... 더 노력하시면 좋겠어요. 다음번에는 꼭 더 많은 문제를 맞춰봐요!';
    } else if (clamped <= 40) {
        title = '도전 중';
        body = '좋은 시작이에요! 기초를 더 다지면 성과가 확실히 올라갈 거예요. 계속 도전해 보세요.';
    } else if (clamped <= 60) {
        title = '중간 수준';
        body = '잘하셨어요! 반 이상은 맞췄습니다. 조금만 더 연습하면 더 높은 점수를 받을 수 있어요.';
    } else if (clamped <= 80) {
        title = '우수';
        body = '아주 훌륭해요! 실력이 탄탄하네요. 몇 가지만 더 보완하면 만점도 무난할 거예요.';
    } else {
        title = '만점/최고';
        body = '대단해요! 거의(또는 완전히) 정답을 맞추셨습니다. 축하드려요 — 훌륭한 성과예요!';
    }

    return {
        clamped,
        title,
        body,
    };
}

function updateEndingTierAndMessage() {
    const tierSummary = document.getElementById('tierSummary');
    const badge = document.getElementById('tierBadgeEnding');
    const tierNameText = document.getElementById('tierNameText');
    const bar = document.getElementById('tierProgressBar');
    const progressText = document.getElementById('tierProgressText');
    const msgEl = document.getElementById('endingMessageText');

    if (!tierSummary || !badge || !tierNameText || !bar || !progressText || !msgEl) return;

    const score = state.score;
    const tier = getTierInfo(score);
    const msg = getEndingMessage(score);

    badge.textContent = tier.current.name.charAt(0);

    let badgeColor = '#795548';
    if (tier.current.id === 'silver') badgeColor = '#b0bec5';
    else if (tier.current.id === 'gold') badgeColor = '#ffd54f';
    else if (tier.current.id === 'platinum') badgeColor = '#b3e5fc';
    else if (tier.current.id === 'diamond') badgeColor = '#b39ddb';
    badge.style.background = badgeColor;

    const nextName = tier.next ? tier.next.name : '최고 티어';
    const remain = tier.next ? Math.max(0, tier.next.min - score) : 0;

    tierNameText.textContent = `${tier.current.name} 티어`;
    bar.style.width = `${tier.progressPercent}%`;
    progressText.textContent = tier.next
        ? `다음 티어(${nextName})까지 ${remain}점 남았습니다.`
        : `최고 티어에 도달했습니다!`;

    // 엔딩 메시지를 아이콘 + 제목 + 설명이 있는 작은 카드 형태로 표시
    msgEl.innerHTML = `
        <span class="ending-msg-icon">🎮</span>
        <div class="ending-msg-text">
            <span class="ending-msg-title">${msg.title}</span>
            <span class="ending-msg-body">${msg.body}</span>
        </div>
    `;
}

// 게임 종료
function endGame() {
    state.isPlaying = false;
    if (state.animationId) cancelAnimationFrame(state.animationId);

    // HUD 점수/타이머를 마지막으로 한 번 더 업데이트하여 화면 표시와 팝업 점수를 동기화
    updateHud();

    document.getElementById('finalScore').textContent = state.score;

    // 게임 종료 시 상단 문제 패널 숨기기
    const panel = document.getElementById('questionPanel');
    if (panel) panel.style.display = 'none';

    // 엔딩 진입 시에는 티어 요약/메시지를 숨기고,
    // 이름 저장 이후에만 보여준다
    const tierSummary = document.getElementById('tierSummary');
    const endingMsg = document.getElementById('endingMessageText');
    if (tierSummary) tierSummary.style.display = 'none';
    if (endingMsg) {
        endingMsg.style.display = 'none';
        endingMsg.innerHTML = '';
    }

    // 이름 입력 섹션 표시, 버튼들 비활성화
    const nameInput = document.getElementById('endingPlayerName');
    const nameSection = document.getElementById('nameInputSection');
    const reviewBtn = document.getElementById('reviewBtn');
    const rankingBtn = document.getElementById('rankingBtn');
    const submitScoreBtnEl = document.getElementById('submitScoreBtn');
    
    if (nameInput) nameInput.value = '';
    if (nameSection) nameSection.style.display = 'block';
    if (reviewBtn) reviewBtn.disabled = true;
    if (rankingBtn) rankingBtn.disabled = true;
    if (submitScoreBtnEl) submitScoreBtnEl.disabled = true;

    document.getElementById('ending').style.display = 'flex';
}

// 점수 저장 (D1 DB API + localStorage 백업)
async function saveScore(playerName, score, regionId, regionName) {
    const timestamp = new Date().toISOString();
    const scoreData = {
        playerName,
        score,
        regionId,
        regionName,
        timestamp,
    };

    // localStorage에 백업 저장 (오프라인 대비)
    let allScores = JSON.parse(safeLocalStorage.getItem('ecoGameScores') || '[]');
    allScores.push(scoreData);
    
    // 최근 1000개만 유지
    if (allScores.length > 1000) {
        allScores = allScores.slice(-1000);
    }
    
    safeLocalStorage.setItem('ecoGameScores', JSON.stringify(allScores));

    // D1 DB API 호출 (USE_API가 true일 때만)
    if (USE_API) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(scoreData)
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
async function calculateRegionStats() {
    // API 사용 시 서버에서 가져오기
    if (USE_API) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/scores/regions`);
            if (response.ok) {
                const regions = await response.json();
                
                // API 응답을 기존 포맷으로 변환
                const regionStats = {};
                regions.forEach(region => {
                    regionStats[region.region_id] = {
                        regionId: region.region_id,
                        regionName: region.region_name,
                        count: region.count,
                        averageScore: Math.round(region.average_score),
                        totalScore: Math.round(region.average_score * region.count),
                        scores: []
                    };
                });
                
                console.log('Region stats loaded from API');
                return regionStats;
            }
        } catch (error) {
            console.error('Error fetching region stats from API:', error);
            // 실패 시 localStorage로 폴백
        }
    }
    
    // localStorage 사용 (API 미사용 또는 실패 시)
    const allScores = JSON.parse(safeLocalStorage.getItem('ecoGameScores') || '[]');
    const regionStats = {};

    allScores.forEach(entry => {
        if (!regionStats[entry.regionId]) {
            regionStats[entry.regionId] = {
                regionId: entry.regionId,
                regionName: entry.regionName,
                totalScore: 0,
                count: 0,
                scores: []
            };
        }
        regionStats[entry.regionId].totalScore += entry.score;
        regionStats[entry.regionId].count += 1;
        regionStats[entry.regionId].scores.push(entry.score);
    });

    // 평균 계산
    Object.keys(regionStats).forEach(regionId => {
        const stat = regionStats[regionId];
        stat.averageScore = stat.count > 0 ? Math.round(stat.totalScore / stat.count) : 0;
    });

    console.log('Region stats loaded from localStorage');
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

    let html = '<table style="width: 100%; text-align: left; border-collapse: collapse;">';
    html += '<thead><tr><th>순위</th><th>지역</th><th>평균 점수</th><th>플레이 수</th></tr></thead><tbody>';
    
    regions.forEach((region, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
        const highlight = region.regionId === state.regionId ? 'style="background: rgba(76, 175, 80, 0.15);"' : '';
        html += `<tr ${highlight}>
            <td style="padding: 8px;">${medal}</td>
            <td style="padding: 8px;">${region.regionName}</td>
            <td style="padding: 8px; font-weight: 700;">${region.averageScore}점</td>
            <td style="padding: 8px;">${region.count}회</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    listEl.innerHTML = html;
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
    html += '<thead><tr><th>순위</th><th>이름</th><th>점수</th><th>날짜</th></tr></thead><tbody>';
    
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

// 전체 사용자 글로벌 랭킹 표시 (D1 /api/ranking 사용)
async function displayGlobalRanking() {
    const listEl = document.getElementById('globalRankingList');
    if (!listEl) return; // 해당 영역이 없으면 아무 것도 하지 않음

    try {
        const response = await fetch(`${API_BASE_URL}/api/ranking`);
        const data = await response.json();

        if (!data || data.success === false || !Array.isArray(data.ranking)) {
            listEl.innerHTML = '<p>랭킹 데이터를 불러오지 못했습니다.</p>';
            return;
        }

        const ranking = data.ranking;
        if (ranking.length === 0) {
            listEl.innerHTML = '<p>아직 랭킹 데이터가 없습니다.</p>';
            return;
        }

        let html = '<table style="width: 100%; text-align: left; border-collapse: collapse;">';
        html += '<thead><tr><th>순위</th><th>닉네임</th><th>점수</th><th>지역</th></tr></thead><tbody>';

        ranking.forEach((row, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
            html += `<tr>
                <td style="padding: 8px;">${medal}</td>
                <td style="padding: 8px;">${row.nickname ?? ''}</td>
                <td style="padding: 8px; font-weight: 700;">${row.score ?? 0}점</td>
                <td style="padding: 8px;">${row.region ?? ''}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        listEl.innerHTML = html;
    } catch (error) {
        console.error('글로벌 랭킹 불러오기 실패:', error);
        listEl.innerHTML = '<p>서버 통신에 실패했습니다.</p>';
    }
}

// 통계 그래프 표시
function displayStatsChart() {
    const canvas = document.getElementById('statsChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const regionStats = calculateRegionStats();
    const regions = Object.values(regionStats);

    if (regions.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '14px Noto Sans KR';
        ctx.textAlign = 'center';
        ctx.fillText('아직 데이터가 없습니다.', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Chart.js 사용
    if (typeof Chart !== 'undefined') {
        // 기존 차트 제거
        if (window.statsChartInstance) {
            window.statsChartInstance.destroy();
        }

        const labels = regions.map(r => r.regionName);
        const data = regions.map(r => r.averageScore);
        const counts = regions.map(r => r.count);

        window.statsChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '평균 점수',
                    data: data,
                    backgroundColor: 'rgba(76, 175, 80, 0.6)',
                    borderColor: 'rgba(76, 175, 80, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#fff' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    },
                    x: {
                        ticks: { color: '#fff' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#fff' }
                    },
                    tooltip: {
                        callbacks: {
                            afterLabel: function(context) {
                                const idx = context.dataIndex;
                                return `플레이 수: ${counts[idx]}회`;
                            }
                        }
                    }
                }
            }
        });
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
        const p = document.createElement('p');
        p.textContent = t('allCorrect');
        reviewList.appendChild(p);
    } else {
        state.incorrectAnswers.forEach((item, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'review-item';

            // 문제 문장 한 줄
            const q = document.createElement('p');
            q.textContent = `${t('questionPrefix')} ${index + 1}. ${item.question}`;
            wrapper.appendChild(q);

            // 내가 선택한 답과 정답 여부 표시 (오답노트에는 모두 틀린 문제만 담기므로 항상 오답)
            const yourLine = document.createElement('p');
            yourLine.textContent = `${t('selectedAnswerLabel')} ${item.yourAnswer} (오답)`;
            wrapper.appendChild(yourLine);

            // 정답은 별도 줄로 표시
            const correctLine = document.createElement('p');
            correctLine.textContent = `${t('correctAnswerLabel')} ${item.correctAnswer}`;
            wrapper.appendChild(correctLine);

            // 설명은 선택적으로 짧게 한 줄만
            if (item.explanation) {
                const exp = document.createElement('p');
                exp.textContent = `${t('explanationLabel')} ${item.explanation}`;
                wrapper.appendChild(exp);
            }

            reviewList.appendChild(wrapper);
        });
    }

    review.style.display = 'flex';
}

// 키보드 입력
function setupKeyboardControls() {
    // 여러 번 호출되어도 이벤트 리스너가 중복 등록되지 않도록 보호
    if (keyboardInitialized) return;
    keyboardInitialized = true;

    const exitModal = document.getElementById('exitModal');
    const exitConfirmBtn = document.getElementById('exitConfirmBtn');
    const exitCancelBtn = document.getElementById('exitCancelBtn');

    document.addEventListener('keydown', (e) => {
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
            state.playerLane = Math.min(2, state.playerLane + 1);
        } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
            state.playerLane = Math.max(0, state.playerLane - 1);
        }
    });

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
    
    // 달리기 주기를 조금 더 빠르게 해서 역동적인 느낌 강화
    player.userData.animationTime += 0.25;
    const t = player.userData.animationTime;
    
    // 팔 흔들기
    if (player.userData.leftArmGroup) {
        player.userData.leftArmGroup.rotation.x = Math.sin(t) * 0.8;
        player.userData.leftArmGroup.rotation.z = Math.sin(t) * 0.1;
    }
    if (player.userData.rightArmGroup) {
        player.userData.rightArmGroup.rotation.x = Math.sin(t + Math.PI) * 0.8;
        player.userData.rightArmGroup.rotation.z = Math.sin(t + Math.PI) * 0.1;
    }
    
    // 왼쪽 다리 - 허벅지와 무릎
    if (player.userData.leftLegGroup) {
        const leftThighAngle = Math.sin(t + Math.PI) * 0.6;
        player.userData.leftLegGroup.rotation.x = leftThighAngle;
        
        if (player.userData.leftKneeGroup) {
            const leftKneeAngle = Math.max(0, -Math.sin(t + Math.PI) * 1.0);
            player.userData.leftKneeGroup.rotation.x = leftKneeAngle;
        }
    }
    
    // 오른쪽 다리 - 허벅지와 무릎
    if (player.userData.rightLegGroup) {
        const rightThighAngle = Math.sin(t) * 0.6;
        player.userData.rightLegGroup.rotation.x = rightThighAngle;
        
        if (player.userData.rightKneeGroup) {
            const rightKneeAngle = Math.max(0, -Math.sin(t) * 1.0);
            player.userData.rightKneeGroup.rotation.x = rightKneeAngle;
        }
    }
    
    // 몸통 상하 움직임
    if (player.userData.body) {
        // 상하 움직임 폭을 조금 키워서 뛰는 느낌을 강조
        player.userData.body.position.y = 0.6 + Math.abs(Math.sin(t * 2)) * 0.07;
    }
    
    // 몸 전체 약간 앞으로 기울이기
    player.rotation.x = -0.05;
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
        updateHud();
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
    const halfSegments = Math.floor(state.roadSegments.length / 2);
    const baseIndex = Math.floor(state.player.position.z / state.roadLength) - halfSegments;
    state.roadSegments.forEach((seg, i) => {
        const index = baseIndex + i;
        seg.position.z = index * state.roadLength;
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
            } else {
                state.score -= 10;
                showScoreEffect(-10);
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
                // 오답 말풍선 표시
                showWrongAnswerBubble(localizedYourAnswer, localizedCorrectAnswer);
            }

            set.resolved = true;

            // 다음 미해결 세트를 기준으로 상단 문제 패널 텍스트 갱신
            updateQuestionPanelForNextSet();
        }
    });

    // 모든 세트가 판정 완료되면 게임 종료
    const allResolved =
        state.problemSets.length > 0 && state.problemSets.every((s) => s.resolved);
    if (allResolved) {
        endGame();
        return;
    }

    state.renderer.render(state.scene, state.camera);
}

// 게임 시작
async function startGame() {
    // 이전 게임이 있었다면 상태/씬을 정리
    resetGameState();

    initThreeJS();
    await loadRegionData();
    createRoad();
    createPlayer();
    // JSON의 모든 문제를 세트로 만들어, 간격을 두고 배치
    createAllProblemSets();
    setupKeyboardControls();
    setupTouchControls(); // 모바일 터치 지원

    state.score = 0;
    state.gameTime = 0;
    state.incorrectAnswers = [];
    state.isPlaying = true;

    document.getElementById('intro').style.display = 'none';
    document.getElementById('scoreBox').style.display = 'block';
    document.getElementById('settingsBtn').style.display = 'block'; // 설정 버튼 표시
    // 상단 문제 패널에서 현재/다음 문제 텍스트를 보여준다
    updateQuestionPanelForNextSet();
    updateHud();
    gameLoop();
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
        setTimeout(showIntroScreen, 15000);
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
                document.getElementById('tierBadgeHud').style.display = 'none';
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

    // 점수 저장 버튼 및 이름 입력 필수화 처리
    const submitScoreBtn = document.getElementById('submitScoreBtn');
    const endingNameInput = document.getElementById('endingPlayerName');

    if (submitScoreBtn && endingNameInput) {
        // 초기에는 이름이 없으므로 비활성화
        submitScoreBtn.disabled = true;

        // 이름 입력 시, 공백이 아닌 값이 있으면 점수 저장 버튼만 활성화
        endingNameInput.addEventListener('input', () => {
            const value = endingNameInput.value.trim();
            submitScoreBtn.disabled = value.length === 0;
        });

        submitScoreBtn.addEventListener('click', async () => {
            const playerName = endingNameInput.value.trim();
            
            if (!playerName) {
                alert('이름을 입력해주세요!');
                return;
            }
            
            // 점수 저장
            state.playerName = playerName;
            await saveScore(playerName, state.score, state.regionId, state.regionName);

            // 점수 저장 후 티어/엔딩 메시지 계산 및 표시
            updateEndingTierAndMessage();
            const tierSummary = document.getElementById('tierSummary');
            const endingMsg = document.getElementById('endingMessageText');
            if (tierSummary) tierSummary.style.display = 'flex';
            if (endingMsg) endingMsg.style.display = 'flex';
            
            // 버튼들 활성화 (저장 이후에만 리뷰/랭킹 접근 가능)
            const reviewBtn = document.getElementById('reviewBtn');
            const rankingBtn = document.getElementById('rankingBtn');
            if (reviewBtn) reviewBtn.disabled = false;
            if (rankingBtn) rankingBtn.disabled = false;
            
            // 이름 입력 섹션 숨기기
            const nameSection = document.getElementById('nameInputSection');
            if (nameSection) nameSection.style.display = 'none';
            
            alert('점수가 저장되었습니다!');
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
            
            // 랭킹 화면 초기화
            displayRegionRanking();
            displayPersonalRanking();
            displayGlobalRanking();
            displayStatsChart();
            
            // 첫 번째 탭 활성화 (기본: 지역별 랭킹)
            const tabs = ranking.querySelectorAll('.tab-btn');
            const contents = ranking.querySelectorAll('.tab-content');
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            const regionTab = ranking.querySelector('.tab-btn[data-tab="region"]');
            const regionContent = ranking.querySelector('.tab-content[data-tab="region"]');
            if (regionTab) regionTab.classList.add('active');
            if (regionContent) regionContent.classList.add('active');

            ranking.style.display = 'flex';
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
            displayStatsChart();
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

            const tierInfo = getTierInfo(state.score);
            const shareUrl = window.location.href.split('?')[0];
            
            // 디버깅: 공유할 URL 확인
            console.log('💬 카카오톡 공유 링크:', shareUrl);
            console.log('📊 점수:', state.score, '| 지역:', state.regionName, '| 티어:', tierInfo.current.name);
            
            Kakao.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title: 'EcoChaser - 친환경 분리수거 게임 🌍',
                    description: state.language === 'ko'
                        ? `점수: ${state.score}점 | 지역: ${state.regionName} | 티어: ${tierInfo.current.name}\n친환경 분리수거 게임에 도전해보세요!`
                        : `Score: ${state.score} pts | Region: ${state.regionName} | Tier: ${tierInfo.current.name}\nChallenge yourself!`,
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
            const tierInfo = getTierInfo(state.score);
            const shareText = state.language === 'ko'
                ? `🌍 EcoChaser 게임 결과\n` +
                  `📊 점수: ${state.score}점\n` +
                  `📍 지역: ${state.regionName}\n` +
                  `🏆 티어: ${tierInfo.current.name}\n\n` +
                  `친환경 분리수거 게임에 도전해보세요!`
                : `🌍 EcoChaser Game Result\n` +
                  `📊 Score: ${state.score} pts\n` +
                  `📍 Region: ${state.regionName}\n` +
                  `🏆 Tier: ${tierInfo.current.name}\n\n` +
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

    window.addEventListener('resize', handleResize);
});