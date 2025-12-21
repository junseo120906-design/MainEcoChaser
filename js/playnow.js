// playnow.js - 게임 초기화 및 실행

// DOM이 완전히 로드된 후 실행
document.addEventListener('DOMContentLoaded', function() {
    // 게임 영역 설정
    const gameArea = document.getElementById('gameCanvas');
    // gameArea가 null일 경우를 대비한 방어 코드
    if (!gameArea) {
        console.error("오류: gameCanvas 요소를 찾을 수 없습니다. playnow.html 파일을 확인하세요.");
        return;
    }
    gameArea.innerHTML = '<canvas id="gameCanvasElement" width="800" height="600"></canvas>';
    const canvas = document.getElementById('gameCanvasElement');
    const ctx = canvas.getContext('2d');
    
    // 게임 컨테이너 설정 (없으면 gameArea 사용)
    const gameContainer = document.getElementById('game-container') || gameArea;

    // UI 요소
    const scoreEl = document.getElementById('score');
    const botScoreEl = document.getElementById('bot-score');
    const trashHeldEl = document.getElementById('trash-held');
    const stageEl = document.getElementById('ui-stage'); // (NEW) 스테이지 UI

    const tutorialModal = document.getElementById('tutorial-modal');
    const tutorialNextBtn = document.getElementById('tutorial-next-btn');

    const modeModal = document.getElementById('mode-modal');
    const modeCoopBtn = document.getElementById('mode-coop-btn');
    const modeCompeteBtn = document.getElementById('mode-compete-btn');

    const startModal = document.getElementById('start-modal');
    const startTitle = document.getElementById('start-title'); // (NEW)
    const startText = document.getElementById('start-text');   // (NEW)
    const startGameBtn = document.getElementById('start-game-btn');

    const infoModal = document.getElementById('info-modal');
    const infoTitle = document.getElementById('info-title');
    const infoText = document.getElementById('info-text');
    const closeModalBtn = document.getElementById('close-modal-btn');

    const stageClearModal = document.getElementById('stage-clear-modal'); // (NEW)
    const stageClearText = document.getElementById('stage-clear-text'); // (NEW)
    const nextStageBtn = document.getElementById('next-stage-btn'); // (NEW)

    const endModal = document.getElementById('end-modal');
    const endTitle = document.getElementById('end-title');
    const endScoreText = document.getElementById('end-score-text');
    const endResultText = document.getElementById('end-result-text');
    const endFeedbackText = document.getElementById('end-feedback-text');
    const endTipText = document.getElementById('end-tip-text');
    const restartGameBtn = document.getElementById('restart-game-btn');

    const muteButton = document.getElementById('mute-button');
    const iconSoundOn = document.getElementById('icon-sound-on');
    const iconSoundOff = document.getElementById('icon-sound-off');

    // 오디오 객체
    const audio = {
        bgMusic: new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'),
        jump: new Audio('https://cdn.glitch.global/c4d0d079-a436-41f7-a359-0f73f30f55c2/jump.mp3?v=1730240409090'),
        pickup: new Audio('https://cdn.glitch.global/c4d0d079-a436-41f7-a359-0f73f30f55c2/pickup.mp3?v=1730240411130'),
        drop: new Audio('https://cdn.glitch.global/c4d0d079-a436-41f7-a359-0f73f30f55c2/drop.mp3?v=1730240406833'),
        success: new Audio('https://cdn.glitch.global/c4d0d079-a436-41f7-a359-0f73f30f55c2/success.mp3?v=1730240412850'),
        hit: new Audio('https://cdn.glitch.global/c4d0d079-a436-41f7-a359-0f73f30f55c2/hit.mp3?v=1730240407987'),
        stageClear: new Audio('https://cdn.glitch.global/c4d0d079-a436-41f7-a359-0f73f30f55c2/success.mp3?v=1730240412850') // (NEW) 스테이지 클리어 소리
    };
    // 오디오 볼륨 설정
    audio.bgMusic.volume = 0.3;
    audio.jump.volume = 0.6;
    audio.pickup.volume = 0.7;
    audio.drop.volume = 0.7;
    audio.success.volume = 0.8;
    audio.hit.volume = 0.7;
    audio.stageClear.volume = 0.8;
    audio.bgMusic.loop = true;

    let isMuted = false;
    let score = 0;
    let botScore = 0;
    let gamePaused = true;
    let trashCanLidOpen = false;
    let animationFrameId;

    // --- (NEW) 스테이지 관리 ---
    let currentStage = 0;
    let currentBackgroundDraw = null;
    // -------------------------

    // 게임 설정
    const gravity = 0.6;
    const friction = 0.8;
    const interactionRadius = 40;

    // 플레이어
    const player = {
        x: 100, y: 500, width: 32, height: 48,
        dx: 0, dy: 0, speed: 4, jumpPower: 13,
        isOnGround: false, heldTrash: null, direction: 1, isJumping: false,
    };

    // AI 봇
    const bot = {
        x: 700, y: 500, width: 32, height: 48,
        dx: 0, dy: 0, speed: 3.5, jumpPower: 13,
        isOnGround: false, heldTrash: null, direction: 1, isJumping: false,
        colorBody: '#5DADE2', colorOveralls: '#2874A6', colorHat: '#5DADE2',
        target: null, interactionCooldown: 0
    };

    const keys = { w: false, a: false, d: false, s: false };

    // --- (NEW) 스테이지 데이터 ---
    let platforms = [];
    let trashItems = [];
    let obstacles = [];
    // -------------------------

    // 쓰레기 정보 (공통)
    const trashTypes = {
        plastic: { 
            name: '플라스틱 병', 
            info: '플라스틱은 재활용이 가능합니다. 깨끗이 씻어서 라벨을 제거한 후 배출해주세요!',
            tip: '페트병 라벨을 떼고 밟아서 버리면 부피가 줄어들어요!',
            draw: (ctx, x, y, width, height) => {
                ctx.fillStyle = '#3498db';
                ctx.fillRect(x, y + height * 0.2, width, height * 0.8);
                ctx.fillRect(x + width * 0.2, y, width * 0.6, height * 0.2);
            }
        },
        can: { 
            name: '캔', 
            info: '알루미늄 캔은 재활용 가치가 높습니다. 내용물을 비우고 찌그러트려 배출하면 부피를 줄일 수 있어요.',
            tip: '캔 안에 담배꽁초 등 이물질을 넣으면 재활용이 불가능해요!',
            draw: (ctx, x, y, width, height) => {
                ctx.fillStyle = '#bdc3c7';
                ctx.fillRect(x, y + height * 0.1, width, height * 0.8);
                ctx.fillStyle = '#7f8c8d';
                ctx.fillRect(x, y + height * 0.9, width, height * 0.1);
                ctx.fillRect(x + width * 0.1, y, width * 0.8, height * 0.1);
            }
        },
        paper: { 
            name: '종이 상자', 
            info: '종이 상자는 테이프와 운송장을 제거한 후, 접어서 배출해야 합니다.',
            tip: '상자의 테이프, 철심, 운송장은 모두 일반 쓰레기입니다!',
            draw: (ctx, x, y, width, height) => {
                ctx.fillStyle = '#f1c40f';
                ctx.fillRect(x, y, width, height);
                ctx.fillStyle = '#e67e22';
                ctx.fillRect(x, y + height / 2 - 2, width, 4);
            }
        }
    };

    const educationTips = [
        trashTypes.plastic.tip, trashTypes.can.tip, trashTypes.paper.tip,
        "꿀팁: 유리병도 색깔별로 분리해야 재활용이 쉬워집니다!",
        "                                                                                                                                                                                                                                                                                                                                                           꿀팁: 스티로폼은 깨끗이 씻어 흰색만 따로 배출해야 합니다."
    ];

    let collectedTrashTypes = new Set();

    const trashCan = {
        x: 700, y: 520, width: 40, height: 60,
        color: '#2ecc71', lidColor: '#27ae60', recycledSymbolColor: '#ecf0f1'
    };

    // --- (NEW) 스테이지 데이터 정의 ---
    const stageData = [
        { // 스테이지 1: 도시
            levelName: '도시',
            bgColor: '#d0e8ff',
            platforms: [
                { x: 0, y: 580, width: canvas.width, height: 20, color: '#8b4513' },
                { x: 200, y: 480, width: 150, height: 20, color: '#a9a9a9' },
                { x: 450, y: 400, width: 200, height: 20, color: '#a9a9a9' },
                { x: 100, y: 350, width: 100, height: 20, color: '#a9a9a9' },
                { x: 50, y: 450, width: 80, height: 20, color: '#a9a9a9' }
            ],
            trashItems: [
                { x: 250, y: 460, width: 15, height: 20, type: 'plastic' },
                { x: 500, y: 380, width: 15, height: 15, type: 'can' },
                { x: 120, y: 330, width: 20, height: 20, type: 'paper' },
                { x: 70, y: 430, width: 15, height: 15, type: 'can' },
                { x: 600, y: 560, width: 20, height: 20, type: 'paper' }
            ],
            obstacles: [
                { x: 300, y: 560, width: 20, height: 20, dx: 1.5, color: '#8e44ad', minX: 250, maxX: 400 }
            ],
            startPos: { player: { x: 100, y: 500 }, bot: { x: 700, y: 500 } },
            // 쓰레기통은 아래 안전 좌표 중 하나에서 랜덤 배치
            trashCanCandidates: [
                { x: 700, y: 520 },
                { x: 620, y: 520 },
                { x: 540, y: 520 }
            ],
            bgDrawFunc: drawCityBackground
        },
        { // 스테이지 2: 학교 (MODIFIED)
            levelName: '학교',
            bgColor: '#E3F2FD', // 더 밝은 하늘색
            platforms: [
                { x: 0, y: 580, width: canvas.width, height: 20, color: '#795548' }, // 갈색 바닥
                { x: 100, y: 480, width: 100, height: 20, color: '#B0BEC5' }, // 사물함 1
                { x: 250, y: 400, width: 100, height: 20, color: '#B0BEC5' }, // 사물함 2
                { x: 150, y: 300, width: 100, height: 20, color: '#CFD8DC' }, // (NEW) 중간 발판
                { x: 350, y: 320, width: 100, height: 20, color: '#B0BEC5' }, // 사물함 3
                { x: 500, y: 240, width: 200, height: 20, color: '#CFD8DC' }, // 높은 책장
                { x: 50, y: 200, width: 80, height: 20, color: '#CFD8DC' }  // 왼쪽 위 발판
            ],
            trashItems: [
                { x: 150, y: 460, width: 15, height: 20, type: 'plastic' }, // 사물함 1 위
                { x: 300, y: 380, width: 15, height: 15, type: 'can' },   // 사물함 2 위
                { x: 400, y: 300, width: 20, height: 20, type: 'paper' },  // 사물함 3 위
                { x: 550, y: 220, width: 15, height: 20, type: 'plastic' }, // 높은 책장 위
                { x: 70, y: 180, width: 15, height: 15, type: 'can' },    // 왼쪽 위 발판 위
                { x: 30, y: 560, width: 20, height: 20, type: 'paper' },  // 바닥 (왼쪽)
                { x: 650, y: 560, width: 15, height: 15, type: 'can' }   // 바닥 (오른쪽)
            ],
            obstacles: [
                { x: 100, y: 560, width: 20, height: 20, dx: 2, color: '#8e44ad', minX: 50, maxX: 300 }, // 바닥 장애물 1
                { x: 400, y: 560, width: 20, height: 20, dx: -1.5, color: '#8e44ad', minX: 350, maxX: 700 }, // 바닥 장애물 2
                { x: 400, y: 280, width: 20, height: 20, dx: 2, color: '#8e44ad', minX: 350, maxX: 550 } // (MOVED) 공중 장애물
            ],
            startPos: { player: { x: 50, y: 500 }, bot: { x: 750, y: 500 } },
            // 쓰레기통은 아래 안전 좌표 중 하나에서 랜덤 배치
            trashCanCandidates: [
                { x: 730, y: 520 },
                { x: 640, y: 520 },
                { x: 560, y: 520 }
            ],
            bgDrawFunc: drawSchoolBackground
        }
    ];

    // --- 그리기 함수 ---
    function drawCharacter(entity) {
        // (MODIFIED) 플레이어와 봇을 그리는 로직을 분리
        let colorBody, colorOveralls, colorSkin, colorHat;
        if (entity === player) {
            colorBody = '#e74c3c';
            colorOveralls = '#2c3e50';
            colorSkin = '#fce4c4';
            colorHat = '#e74c3c';
        } else {
            colorBody = entity.colorBody;
            colorOveralls = entity.colorOveralls;
            colorSkin = '#fce4c4'; // 봇도 피부색 통일
            colorHat = entity.colorHat;
        }

        ctx.save();
        ctx.translate(entity.x + entity.width / 2, entity.y + entity.height / 2);
        ctx.scale(entity.direction, 1);
        ctx.translate(-(entity.x + entity.width / 2), -(entity.y + entity.height / 2));
        const drawX = entity.x + (entity.direction === -1 ? entity.width : 0);
        ctx.fillStyle = colorOveralls;
        ctx.fillRect(drawX, entity.y + entity.height * 0.3, entity.width, entity.height * 0.7);
        ctx.fillStyle = colorSkin;
        ctx.fillRect(drawX + entity.width * 0.2, entity.y, entity.width * 0.6, entity.height * 0.35);
        ctx.fillStyle = colorHat;
        ctx.fillRect(drawX + entity.width * 0.1, entity.y - 5, entity.width * 0.8, entity.height * 0.15);
        ctx.fillRect(drawX + entity.width * 0.2, entity.y - 10, entity.width * 0.6, entity.height * 0.15);
        ctx.fillStyle = colorBody;
        ctx.fillRect(drawX - 5, entity.y + entity.height * 0.4, 10, entity.height * 0.4);
        ctx.fillRect(drawX + entity.width - 5, entity.y + entity.height * 0.4, 10, entity.height * 0.4);
        ctx.restore();
        if (entity.heldTrash) {
            const trashDrawX = entity.x + (entity.width / 2) - (entity.heldTrash.width / 2);
            const trashDrawY = entity.y - entity.heldTrash.height - 10;
            const trashType = trashTypes[entity.heldTrash.type];
            if (trashType && trashType.draw) {
                trashType.draw(ctx, trashDrawX, trashDrawY, entity.heldTrash.width, entity.heldTrash.height);
            }
        }
    }

    // (MODIFIED) 1단계 배경
    function drawCityBackground() {
        // 구름
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.arc(100, 80, 25, 0, Math.PI * 2); ctx.arc(130, 80, 20, 0, Math.PI * 2); ctx.arc(115, 60, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(canvas.width - 150, 120, 30, 0, Math.PI * 2); ctx.arc(canvas.width - 120, 120, 25, 0, Math.PI * 2); ctx.arc(canvas.width - 135, 100, 35, 0, Math.PI * 2);
        ctx.fill();
        // 먼 건물
        ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.fillRect(50, 300, 80, 150); ctx.fillRect(200, 250, 70, 200);
        ctx.fillRect(350, 320, 60, 130); ctx.fillRect(600, 280, 90, 170);
    }

    // (NEW) 2단계 배경
    function drawSchoolBackground() {
        // 칠판
        ctx.fillStyle = '#34495E';
        ctx.fillRect(200, 100, 400, 200);
        ctx.strokeStyle = '#8b4513';
        ctx.lineWidth = 10;
        ctx.strokeRect(195, 95, 410, 210);
        
        // 칠판 글씨
        ctx.fillStyle = 'white';
        ctx.font = "16px 'Press Start 2P'";
        ctx.fillText("Recycle!", 220, 140);
        ctx.fillText("Save the Earth!", 220, 180);

        // 창문
        ctx.fillStyle = '#AED6F1';
        ctx.fillRect(700, 100, 80, 80);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 4;
        ctx.strokeRect(700, 100, 80, 80);
        ctx.beginPath();
        ctx.moveTo(740, 100); ctx.lineTo(740, 180);
        ctx.moveTo(700, 140); ctx.lineTo(780, 140);
        ctx.stroke();
    }

    function drawPlatforms() {
        platforms.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.width, p.height);
            ctx.strokeStyle = '#6a3410';
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x, p.y, p.width, p.height);
        });
    }

    function drawTrashItems() {
        trashItems.forEach(trash => {
            const trashType = trashTypes[trash.type];
            if (trashType && trashType.draw) {
                trashType.draw(ctx, trash.x, trash.y, trash.width, trash.height);
            }
        });
    }

    function drawTrashCan() {
        ctx.fillStyle = trashCan.color;
        ctx.fillRect(trashCan.x, trashCan.y + (trashCanLidOpen ? 10 : 0), trashCan.width, trashCan.height);
        ctx.fillStyle = trashCan.lidColor;
        ctx.fillRect(trashCan.x - 5, trashCan.y, trashCan.width + 10, 10);
        if (!trashCanLidOpen) ctx.fillRect(trashCan.x, trashCan.y - 5, trashCan.width, 10);
        const symbolSize = trashCan.width * 0.4;
        const symbolX = trashCan.x + (trashCan.width - symbolSize) / 2;
        const symbolY = trashCan.y + trashCan.height * 0.4;
        ctx.fillStyle = trashCan.recycledSymbolColor;
        ctx.beginPath();
        ctx.moveTo(symbolX, symbolY + symbolSize / 2);
        ctx.lineTo(symbolX + symbolSize / 2, symbolY);
        ctx.lineTo(symbolX + symbolSize, symbolY + symbolSize / 2);
        ctx.lineTo(symbolX + symbolSize * 0.7, symbolY + symbolSize * 0.5);
        ctx.lineTo(symbolX + symbolSize * 0.7, symbolY + symbolSize * 0.8);
        ctx.lineTo(symbolX + symbolSize * 0.3, symbolY + symbolSize * 0.8);
        ctx.lineTo(symbolX + symbolSize * 0.3, symbolY + symbolSize * 0.5);
        ctx.closePath();
        ctx.fill();
    }

    function drawObstacles() {
        obstacles.forEach(obs => {
            ctx.fillStyle = obs.color;
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            ctx.fillStyle = 'white';
            ctx.fillRect(obs.x + 4, obs.y + 4, 4, 4);
            ctx.fillRect(obs.x + 12, obs.y + 4, 4, 4);
        });
    }

    function drawUI() {
        // UI 요소가 존재하는지 확인 후 업데이트
        if (scoreEl) scoreEl.textContent = `점수: ${score}`;
        if (botScoreEl) botScoreEl.textContent = `BOT 점수: ${botScore}`;
        if (stageEl) stageEl.textContent = `STAGE ${currentStage + 1}: ${stageData[currentStage].levelName}`;
        
        let heldText = '없음';
        if (player.heldTrash) heldText = trashTypes[player.heldTrash.type].name;
        if (trashHeldEl) trashHeldEl.textContent = `들고 있는 쓰레기: ${heldText}`;
    }

    // --- 업데이트 함수 ---
    function updateCharacter(entity, isBot = false) {
        // 1. 속도/점프 (플레이어)
        if (!isBot) {
             if (keys.a) { entity.dx = -entity.speed; entity.direction = -1; }
             else if (keys.d) { entity.dx = entity.speed; entity.direction = 1; }
             else { entity.dx *= friction; if (Math.abs(entity.dx) < 0.1) entity.dx = 0; }
             
             if (keys.w && entity.isOnGround) {
                entity.dy = -entity.jumpPower;
                entity.isOnGround = false;
                entity.isJumping = true;
                if (!isMuted) audio.jump.play().catch(e => {});
             }
             if (!keys.w && entity.isJumping && entity.dy < -entity.jumpPower * 0.5) {
                entity.dy = -entity.jumpPower * 0.5;
             }
        } else {
             entity.dx *= friction;
             if (Math.abs(entity.dx) < 0.1) entity.dx = 0;
        }

        // 2. 중력
        entity.dy += gravity;

        // 3. 충돌 (플랫폼)
        entity.isOnGround = false;
        entity.isJumping = entity.dy !== 0;

        entity.y += entity.dy;
        platforms.forEach(p => {
            if (AABBCollision(entity, p)) {
                if (entity.dy > 0 && entity.y + entity.height - entity.dy <= p.y) {
                     entity.y = p.y - entity.height; entity.dy = 0; entity.isOnGround = true; entity.isJumping = false;
                } else if (entity.dy < 0 && entity.y - entity.dy >= p.y + p.height) {
                     entity.y = p.y + p.height; entity.dy = 0;
                }
            }
        });

        entity.x += entity.dx;
        platforms.forEach(p => {
            if (AABBCollision(entity, p)) {
                if (entity.dx > 0 && entity.x + entity.width - entity.dx <= p.x) {
                     entity.x = p.x - entity.width; entity.dx = 0;
                } else if (entity.dx < 0 && entity.x - entity.dx >= p.x + p.width) {
                     entity.x = p.x + p.width; entity.dx = 0;
                }
            }
        });

        // 4. 화면 경계
        if (entity.x < 0) entity.x = 0;
        if (entity.x + entity.width > canvas.width) entity.x = canvas.width - entity.width;
        if (entity.y + entity.height > canvas.height) {
            entity.y = canvas.height - entity.height; entity.dy = 0; entity.isOnGround = true; entity.isJumping = false;
        }

        // 5. 장애물
        obstacles.forEach(obs => {
            if (!isBot) { // 장애물 이동 (플레이어 업데이트 시 한 번만)
                obs.x += obs.dx;
                if (obs.x <= obs.minX || obs.x + obs.width >= obs.maxX) obs.dx *= -1;
            }
            
            if (AABBCollision(entity, obs)) {
                if (!isMuted) audio.hit.play().catch(e => {});
                entity.dy = -5; entity.dx = (entity.x < obs.x ? -5 : 5); entity.isOnGround = false;
                if (entity.heldTrash) {
                    entity.heldTrash.x = entity.x;
                    entity.heldTrash.y = entity.y - entity.heldTrash.height;
                    trashItems.push(entity.heldTrash);
                    entity.heldTrash = null;
                }
            }
        });
    }

    function updateBotAI() {
        if (bot.interactionCooldown > 0) bot.interactionCooldown--;
        if (!bot.heldTrash) bot.target = findClosestTrash(bot);
        else bot.target = trashCan;

        if (bot.target) {
            const targetX = bot.target.x + (bot.target.width || 0) / 2;
            const botCenterX = bot.x + bot.width / 2;
            if (targetX > botCenterX + 5) { bot.dx = bot.speed; bot.direction = 1; }
            else if (targetX < botCenterX - 5) { bot.dx = -bot.speed; bot.direction = -1; }
            else bot.dx = 0;

            if (bot.target.y < bot.y - bot.height && bot.isOnGround) {
                bot.dy = -bot.jumpPower; bot.isOnGround = false; bot.isJumping = true;
                if (!isMuted) audio.jump.play().catch(e => {});
            }
            
            if (bot.interactionCooldown === 0) {
                const distance = getDistance(bot, bot.target);
                if (!bot.heldTrash && distance < interactionRadius) {
                    bot.heldTrash = bot.target;
                    trashItems = trashItems.filter(t => t !== bot.target);
                    bot.target = null; bot.interactionCooldown = 30;
                    if (!isMuted) audio.pickup.play().catch(e => {});
                }
                else if (bot.heldTrash && distance < interactionRadius + 20) {
                    botScore += 10;
                    collectedTrashTypes.add(bot.heldTrash.type);
                    bot.heldTrash = null; bot.target = null; bot.interactionCooldown = 30;
                    if (!isMuted) audio.drop.play().catch(e => {});
                    checkGameEnd();
                }
            }
        } else bot.dx = 0;
    }

    function update() {
        if (gamePaused) return;
        updateCharacter(player, false);
        updateBotAI();
        updateCharacter(bot, true);
        drawUI();
    }

    // --- 유틸리티 함수 ---
    function AABBCollision(rect1, rect2) {
        return (
            rect1.x < rect2.x + rect2.width && rect1.x + rect1.width > rect2.x &&
            rect1.y < rect2.y + rect2.height && rect1.y + rect1.height > rect2.y
        );
    }

    function getDistance(obj1, obj2) {
        const centerX1 = obj1.x + obj1.width / 2;
        const centerY1 = obj1.y + obj1.height / 2;
        const obj2Width = obj2.width || 0;
        const obj2Height = obj2.height || 0;
        const centerX2 = obj2.x + obj2Width / 2;
        const centerY2 = obj2.y + obj2Height / 2;
        return Math.hypot(centerX1 - centerX2, centerY1 - centerY2);
    }

    function findClosestTrash(entity) {
        let closest = null; let minDistance = Infinity;
        trashItems.forEach(trash => {
            const distance = getDistance(entity, trash);
            if (distance < minDistance) { closest = trash; minDistance = distance; }
        });
        return closest;
    }

    // --- 상호작용 및 게임 흐름 ---
    function handleInteraction() {
        if (gamePaused) return;
        if (!player.heldTrash) {
            const closestTrash = findClosestTrash(player);
            if (closestTrash && getDistance(player, closestTrash) < interactionRadius) {
                player.heldTrash = closestTrash;
                if (!isMuted) audio.pickup.play().catch(e => {});
                trashItems = trashItems.filter(t => t !== closestTrash);
            }
        } 
        else {
            const distanceToCan = getDistance(player, trashCan);
            if (distanceToCan < interactionRadius + 20) {
                score += 10;
                const trashInfo = trashTypes[player.heldTrash.type];
                collectedTrashTypes.add(player.heldTrash.type);
                trashCanLidOpen = true;
                setTimeout(() => trashCanLidOpen = false, 300);
                if (!isMuted) audio.drop.play().catch(e => {});
                showInfoModal(trashInfo.name, trashInfo.info);
                player.heldTrash = null;
                checkGameEnd();
            }
        }
    }

    function checkGameEnd() {
        if (gamePaused) return; // 정보 모달이 뜬 상태에서 중복 호출 방지
        
        if (trashItems.length === 0 && !player.heldTrash && !bot.heldTrash) {
            // 현재 스테이지가 마지막 스테이지인지 확인
            if (currentStage < stageData.length - 1) {
                // (NEW) 다음 스테이지로
                setTimeout(() => showStageClearModal(), 500);
            } else {
                // (MODIFIED) 최종 게임 종료
                setTimeout(() => {
                   if (!isMuted) audio.success.play().catch(e => {});
                   showEndModal();
                }, 500);
            }
        }
    }

    // --- 모달 관리 ---
    function showTutorialModal() {
        if (tutorialModal) tutorialModal.style.display = 'block';
        gamePaused = true;
        if (!isMuted) audio.bgMusic.play().catch(e => console.log("배경 음악 재생 실패"));
    }

    if(tutorialNextBtn) tutorialNextBtn.addEventListener('click', () => {
        if (tutorialModal) tutorialModal.style.display = 'none';
        showModeModal();
    });

    function showModeModal() {
        if (modeModal) modeModal.style.display = 'block';
        gamePaused = true;
    }

    if(modeCompeteBtn) modeCompeteBtn.addEventListener('click', () => {
        if (modeModal) modeModal.style.display = 'none';
        // (MODIFIED) 게임 시작 모달을 스테이지 정보로 채움
        const stage = stageData[currentStage];
        if (startTitle) startTitle.textContent = `시작! (STAGE ${currentStage + 1}: ${stage.levelName})`;
        if (startText) startText.innerHTML = `<b>${stage.levelName}</b>의 쓰레기를 수거해주세요!<br><br><b>이동: A/D, 점프: W</b><br><b>줍기/버리기: S</b>`;
        showGameStartModal();
    });
    
    // modeCoopBtn에 대한 이벤트 리스너 (경쟁 버튼과 동일하게 작동하도록 임시 추가)
    if(modeCoopBtn) modeCoopBtn.addEventListener('click', () => {
        if (modeModal) modeModal.style.display = 'none';
        const stage = stageData[currentStage];
        if (startTitle) startTitle.textContent = `시작! (STAGE ${currentStage + 1}: ${stage.levelName})`;
        if (startText) startText.innerHTML = `<b>${stage.levelName}</b>의 쓰레기를 수거해주세요!<br><br><b>이동: A/D, 점프: W</b><br><b>줍기/버리기: S</b>`;
        showGameStartModal();
    });


    function showGameStartModal() {
        if (startModal) startModal.style.display = 'block';
        gamePaused = true;
    }

    if(startGameBtn) startGameBtn.addEventListener('click', () => {
        if (startModal) startModal.style.display = 'none';
        gamePaused = false;
        // (MODIFIED) resetGame은 이제 loadStage(0)을 호출함
        if (currentStage === 0) resetGame(); 
        gameLoop();
    });

    function showInfoModal(title, text) {
        if (infoTitle) infoTitle.textContent = title; 
        if (infoText) infoText.textContent = text;
        if (infoModal) infoModal.style.display = 'block';
        gamePaused = true;
        cancelAnimationFrame(animationFrameId);
    }

    if(closeModalBtn) closeModalBtn.addEventListener('click', () => {
        if (infoModal) infoModal.style.display = 'none';
        gamePaused = false;
        checkGameEnd(); // 모달 닫을 때 게임 끝났는지 체크
        if (!gamePaused) gameLoop();
    });

    // (NEW) 스테이지 클리어 모달
    function showStageClearModal() {
        if (!isMuted) audio.stageClear.play().catch(e => {});
        const nextStageName = stageData[currentStage + 1].levelName;
        if (stageClearText) stageClearText.innerHTML = `<b>${stageData[currentStage].levelName}</b>을(를) 깨끗하게 만들었습니다! <br>다음 장소인 <b>${nextStageName}</b>(으)로 이동합니다.`;
        if (stageClearModal) stageClearModal.style.display = 'block';
        gamePaused = true;
        cancelAnimationFrame(animationFrameId);
    }

    // (NEW) 다음 스테이지 버튼
    if(nextStageBtn) nextStageBtn.addEventListener('click', () => {
        if (stageClearModal) stageClearModal.style.display = 'none';
        currentStage++; // 다음 스테이지로
        loadStage(currentStage); // 새 스테이지 로드
        gamePaused = false;
        gameLoop();
    });

    function showEndModal() {
        if (endScoreText) endScoreText.textContent = `플레이어: ${score} 점 | BOT: ${botScore} 점`;
        if (score > botScore) {
            if (endTitle) endTitle.textContent = "승리!";
            if (endResultText) endResultText.textContent = "모든 스테이지를 완료했습니다! 축하합니다!";
        } else if (botScore > score) {
            if (endTitle) endTitle.textContent = "패배";
            if (endResultText) endResultText.textContent = "봇이 당신보다 더 빨랐네요. 다시 도전해보세요!";
        } else {
            if (endTitle) endTitle.textContent = "무승부!";
            if (endResultText) endResultText.textContent = "봇과 함께 모든 곳을 깨끗하게 만들었습니다!";
        }
        
        if (endFeedbackText) endFeedbackText.innerHTML = "<strong>게임 피드백:</strong> 모든 쓰레기를 올바르게 분리수거했습니다. 완벽해요!";
        
        let tip = educationTips[Math.floor(Math.random() * educationTips.length)];
        if (collectedTrashTypes.size > 0) {
             const lastCollected = Array.from(collectedTrashTypes).pop();
             tip = trashTypes[lastCollected].tip;
        }
        if (endTipText) endTipText.innerHTML = `<strong>분리수거 꿀팁:</strong> ${tip}`;

        if (endModal) endModal.style.display = 'block';
        gamePaused = true;
        cancelAnimationFrame(animationFrameId);
    }

    if(restartGameBtn) restartGameBtn.addEventListener('click', () => {
        if (endModal) endModal.style.display = 'none';
        // (MODIFIED) 재시작 시 0단계부터 다시 시작
        currentStage = 0;
        score = 0;
        botScore = 0;
        collectedTrashTypes.clear();
        showModeModal(); // 모드 선택부터 다시
    });

    // --- (NEW) 스테이지 로드 함수 ---
    function loadStage(stageIndex) {
        const stage = stageData[stageIndex];
        
        // 맵 데이터 로드
        platforms = stage.platforms;
        obstacles = JSON.parse(JSON.stringify(stage.obstacles)); // 장애물은 복사 (위치 초기화)
        createInitialTrash(stage.trashItems);
        
        // 배경 설정
        currentBackgroundDraw = stage.bgDrawFunc;
        canvas.style.backgroundColor = stage.bgColor;
        gameContainer.style.backgroundColor = stage.bgColor;
        
        // 위치 리셋
        resetPlayerPosition(stage.startPos.player);
        resetBotPosition(stage.startPos.bot);
        
        // 쓰레기통 위치: 후보 좌표 중에서 플랫폼/장애물과 겹치지 않는 위치를 랜덤 선택
        const candidates = Array.isArray(stage.trashCanCandidates) && stage.trashCanCandidates.length
            ? [...stage.trashCanCandidates]
            : (stage.trashCanPos ? [stage.trashCanPos] : [{ x: trashCan.x, y: trashCan.y }]);

        // 후보 순서를 랜덤 셔플
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = candidates[i];
            candidates[i] = candidates[j];
            candidates[j] = tmp;
        }

        function isValidTrashCanPos(pos) {
            const rect = { x: pos.x, y: pos.y, width: trashCan.width, height: trashCan.height };
            // 플랫폼과 겹치지 않도록 검사
            for (const p of platforms) {
                if (AABBCollision(rect, p)) return false;
            }
            // 장애물과도 겹치지 않도록 검사
            for (const obs of obstacles) {
                if (AABBCollision(rect, obs)) return false;
            }
            return true;
        }

        let chosen = candidates[0];
        for (const cand of candidates) {
            if (isValidTrashCanPos(cand)) {
                chosen = cand;
                break;
            }
        }

        trashCan.x = chosen.x;
        trashCan.y = chosen.y;

        // UI 업데이트
        if (stageEl) stageEl.textContent = `STAGE ${currentStage + 1}: ${stage.levelName}`;
    }

    // (MODIFIED) 게임 초기화
    function resetGame() {
        score = 0;
        botScore = 0;
        player.heldTrash = null;
        bot.heldTrash = null;
        trashCanLidOpen = false;
        collectedTrashTypes.clear();
        currentStage = 0; // (NEW)
        loadStage(currentStage); // (NEW)
        gamePaused = false;
    }

    // (MODIFIED) 쓰레기 생성
    function createInitialTrash(trashTemplate) {
        // 템플릿을 복사하여 새 배열 생성 (스테이지 리셋 시 필요)
        trashItems = JSON.parse(JSON.stringify(trashTemplate));
    }

    // (MODIFIED) 위치 리셋
    function resetPlayerPosition(pos) {
        player.x = pos.x; player.y = pos.y; player.dx = 0; player.dy = 0;
        player.isOnGround = false; player.isJumping = false; player.direction = 1;
    }
    function resetBotPosition(pos) {
        bot.x = pos.x; bot.y = pos.y; bot.dx = 0; bot.dy = 0;
        bot.isOnGround = false; bot.isJumping = false; bot.direction = -1;
        bot.target = null; bot.interactionCooldown = 0;
    }
    // -------------------------

    // --- 게임 루프 ---
    function gameLoop() {
        if (gamePaused) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (currentBackgroundDraw) currentBackgroundDraw(); // (MODIFIED)
        
        drawPlatforms();
        drawTrashCan();
        drawObstacles();
        drawTrashItems();
        drawCharacter(player);
        drawCharacter(bot);
        update();
        animationFrameId = requestAnimationFrame(gameLoop);
    }

    // --- 이벤트 리스너 ---
    document.addEventListener('keydown', (e) => {
        if (gamePaused && e.key.toLowerCase() !== 's') return;
        const key = e.key.toLowerCase();
        if (key === 'w') keys.w = true;
        if (key === 'a') keys.a = true;
        if (key === 'd') keys.d = true;
        if (key === 's') {
            if (!keys.s) handleInteraction();
            keys.s = true;
        }
    });
    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (key === 'w') keys.w = false;
        if (key === 'a') keys.a = false;
        if (key === 'd') keys.d = false;
        if (key === 's') keys.s = false;
    });

    if(muteButton) muteButton.addEventListener('click', () => {
        isMuted = !isMuted;
        if (isMuted) {
            if (iconSoundOn) iconSoundOn.style.display = 'none'; 
            if (iconSoundOff) iconSoundOff.style.display = 'block';
        } else {
            if (iconSoundOn) iconSoundOn.style.display = 'block'; 
            if (iconSoundOff) iconSoundOff.style.display = 'none';
        }
        for (let key in audio) audio[key].muted = isMuted;
        if (!isMuted && gamePaused && tutorialModal && tutorialModal.style.display === 'block') {
             audio.bgMusic.play().catch(e => {});
        }
    });

    // 게임 초기화 및 시작
    showTutorialModal();
});