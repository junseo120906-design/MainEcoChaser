/**
 * js/script.js
 * Eco Chaser 프로젝트 공통 스크립트
 */

// [3] 랭킹 조회 및 표시 (index.html의 #ranking 모드용)
/**
 * [랭킹 데이터를 불러와서 화면에 표시하는 함수]
 * 이 함수는 [4]번의 applyModeFromHash에 의해 호출됩니다.
 */
async function loadRanking() {
    // 랭킹을 표시할 곳이 '.leaderboard-list'가 맞는지 확인
    const leaderboardList = document.querySelector('.leaderboard-list');
    
    // 랭킹 리스트 div가 없으면 함수 종료
    if (!leaderboardList) return; 

    leaderboardList.innerHTML = '<div class="loading">랭킹을 불러오는 중...</div>';

    try {
        // ★ Cloudflare Workers용 경로로 변경: /api/ranking
        const response = await fetch('/api/ranking');
        const data = await response.json();

        if (!data.success) {
            leaderboardList.innerHTML = `<div>랭킹 로드 실패: ${data.message}</div>`;
            return;
        }

        const scores = data.ranking;
        // 서버에서 이미 정렬해서 보내주므로 클라이언트에서 정렬할 필요가 없습니다。

        leaderboardList.innerHTML = '';

        if (scores.length === 0) {
            leaderboardList.innerHTML = '<div>아직 랭킹 데이터가 없습니다.</div>';
            return;
        }

        const header = document.createElement('div');
        header.className = 'leaderboard-header';
        header.innerHTML = `
            <span>카테고리</span>
            <span>순위</span>
            <span>닉네임</span>
            <span>오답</span>
            <span style="text-align: right;">점수</span>
        `;
        leaderboardList.appendChild(header);

        scores.forEach((entry, index) => {
            const rankItem = document.createElement('div');
            rankItem.className = 'leaderboard-entry';

            if (index === 0) rankItem.classList.add('gold');
            if (index === 1) rankItem.classList.add('silver');
            if (index === 2) rankItem.classList.add('bronze');

            const trophy = index < 3 ? ' <span class="trophy">🏆</span>' : '';
            const category = entry.category ?? (
              entry.score >= 1400 ? '레전드' :
              entry.score >= 1200 ? '마스터' :
              entry.score >= 900  ? '다이아'  :
              entry.score >= 700  ? '플래티넘' :
              entry.score >= 500  ? '골드' : '브론즈'
            );

            rankItem.innerHTML = `
                <span class="category">${category}</span>
                <span class="rank">${index + 1}${trophy}</span>
                <span class="nickname">${entry.nickname}</span>
                <span class="mistakes">${Number(entry.mistakes ?? 0)}</span>
                <span class="score">${entry.score}</span>
            `;
            leaderboardList.appendChild(rankItem);
        });
    } catch (error) {
        console.error('랭킹 요청 실패:', error);
        leaderboardList.innerHTML = '<div>서버 통신에 실패했습니다.</div>';
    }
} // [랭킹 조회 함수 끝]

// 게임 종료 시 서버에 결과를 제출하는 전역 헬퍼
window.submitGameResult = async function submitGameResult(userId, score, wrongItems) {
    try {
        const mistakes = Array.isArray(wrongItems) ? wrongItems.length : 0;
        // ★ Cloudflare Workers용 경로로 변경: /api/submit-score
        const res = await fetch('/api/submit-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: Number(userId),
                score: Number(score),
                mistakes,
                wrongItems: Array.isArray(wrongItems) ? wrongItems : []
            })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || '제출 실패');
        return data;
    } catch (e) {
        console.error('게임 결과 제출 실패:', e);
        throw e;
    }
};

// ------------------------------
// 지역별 통계 그래프 (D1 연동)
// ------------------------------
let regionStatsFromServer = [];

// D1에서 지역별 평균 점수 가져오기
async function loadRegionStats() {
    try {
        const res = await fetch('/api/scores/regions');
        const raw = await res.json();

        if (!Array.isArray(raw)) {
            console.warn('지역 통계 응답 형식이 배열이 아닙니다:', raw);
            regionStatsFromServer = [];
            return;
        }

        // average_score가 높을수록 오답률이 낮다고 가정하고 0~1 범위의 "추정 오답률"로 변환
        const MAX_SCORE = 1500; // 점수 상한 가정값 (필요하면 조정)
        regionStatsFromServer = raw.map((row) => {
            const avg = Number(row.average_score ?? 0);
            const clamped = Math.max(0, Math.min(avg, MAX_SCORE));
            const wrongRate = 1 - clamped / MAX_SCORE; // 0~1 (1에 가까울수록 오답률 높음)

            return {
                id: row.region_id ?? 'unknown',
                label: row.region_name ?? '기타',
                count: Number(row.count ?? 0),
                averageScore: avg,
                wrongRate,
            };
        });
    } catch (err) {
        console.error('지역 통계 불러오기 실패:', err);
        regionStatsFromServer = [];
    }
}

// 더미 데이터: 분리배출 항목별 오답률 (아직 D1 스키마가 없어 placeholder 유지)
const demoWasteTypeStats = {
    all: [
        { label: '일반', wrongRate: 0.35 },
        { label: '플라스틱', wrongRate: 0.48 },
        { label: '종이', wrongRate: 0.22 },
        { label: '유리', wrongRate: 0.3 },
        { label: '음식물', wrongRate: 0.55 },
    ],
};

// 선택된 지역 키에 따라 막대 그래프 렌더링
async function renderRegionCharts(selectedRegionKey = 'all') {
    const regionBarsContainer = document.querySelector('.stats-chart-bars[data-chart="regions"]');
    const wasteBarsContainer = document.querySelector('.stats-chart-bars[data-chart="waste-types"]');

    if (!regionBarsContainer || !wasteBarsContainer) return;

    if (regionStatsFromServer.length === 0) {
        await loadRegionStats();
    }

    // 1) 왼쪽: 지역별 평균 오답률 (모든 지역 비교)
    regionBarsContainer.innerHTML = '';
    (regionStatsFromServer.length ? regionStatsFromServer : []).forEach((region) => {
        const heightPct = Math.round(region.wrongRate * 100);
        const bar = document.createElement('div');
        bar.className = 'stats-bar';
        bar.innerHTML = `
            <div class="stats-bar-column" style="height:${heightPct}%;"></div>
            <div class="stats-bar-value">${heightPct}%</div>
            <div class="stats-bar-label">${region.label}</div>
        `;
        regionBarsContainer.appendChild(bar);
    });

    // 2) 오른쪽: 분리배출 항목별 오답률 (지금은 데모 데이터)
    const wasteData = demoWasteTypeStats[selectedRegionKey] || demoWasteTypeStats.all;
    wasteBarsContainer.innerHTML = '';
    wasteData.forEach((item) => {
        const heightPct = Math.round(item.wrongRate * 100);
        const bar = document.createElement('div');
        bar.className = 'stats-bar';
        bar.innerHTML = `
            <div class="stats-bar-column" style="height:${heightPct}%;"></div>
            <div class="stats-bar-value">${heightPct}%</div>
            <div class="stats-bar-label">${item.label}</div>
        `;
        wasteBarsContainer.appendChild(bar);
    });
}

// Scroll reveal & hero load-in animations
document.addEventListener('DOMContentLoaded', () => {
    const revealEls = document.querySelectorAll('.reveal');
    const hero = document.querySelector('.hero');

    if (hero) {
        requestAnimationFrame(() => {
            hero.classList.add('hero-loaded');
        });
    }

    if (!('IntersectionObserver' in window)) {
        revealEls.forEach(el => el.classList.add('reveal-active'));
    } else {
        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('reveal-active');
                    obs.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.2
        });

        revealEls.forEach(el => observer.observe(el));
    }

    // Intro cards → fullscreen detail slider overlay
    const introCards = document.querySelectorAll('.intro-card[data-intro-index]');
    const introOverlay = document.getElementById('introDetailOverlay');
    const introOverlayTrack = introOverlay?.querySelector('.intro-overlay-track');
    const introOverlaySlides = introOverlay ? introOverlay.querySelectorAll('.intro-overlay-slide') : [];
    const introOverlayTitleEl = introOverlay?.querySelector('#introOverlayTitle');
    const introPrevBtn = introOverlay?.querySelector('.intro-overlay-arrow--prev');
    const introNextBtn = introOverlay?.querySelector('.intro-overlay-arrow--next');
    const introDots = introOverlay ? introOverlay.querySelectorAll('.intro-overlay-dot') : [];
    const introCloseBtn = introOverlay?.querySelector('.intro-overlay-close');

    let introCurrentIndex = 0;

    const syncIntroOverlay = () => {
        if (!introOverlayTrack) return;
        introOverlayTrack.style.transform = `translateX(-${introCurrentIndex * 100}%)`;

        // 헤더 제목은 현재 슬라이드 h3 텍스트로 동기화
        const activeSlide = introOverlaySlides[introCurrentIndex];
        const slideTitle = activeSlide?.querySelector('strong');
        if (introOverlayTitleEl && slideTitle) {
            introOverlayTitleEl.textContent = slideTitle.textContent || '';
        }

        introDots.forEach((dot, idx) => {
            dot.classList.toggle('is-active', idx === introCurrentIndex);
        });
    };

    const openIntroOverlay = (index) => {
        if (!introOverlay) return;
        introCurrentIndex = index;
        introOverlay.classList.add('is-active');
        document.body.classList.add('no-scroll');
        syncIntroOverlay();
    };

    const closeIntroOverlay = () => {
        if (!introOverlay) return;
        introOverlay.classList.remove('is-active');
        document.body.classList.remove('no-scroll');
    };

    introCards.forEach(card => {
        const idx = Number(card.getAttribute('data-intro-index')) || 0;
        card.tabIndex = 0;

        const activate = () => openIntroOverlay(idx);

        card.addEventListener('click', activate);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activate();
            }
        });
    });

    if (introPrevBtn && introNextBtn) {
        introPrevBtn.addEventListener('click', () => {
            introCurrentIndex = (introCurrentIndex + introOverlaySlides.length - 1) % introOverlaySlides.length;
            syncIntroOverlay();
        });

        introNextBtn.addEventListener('click', () => {
            introCurrentIndex = (introCurrentIndex + 1) % introOverlaySlides.length;
            syncIntroOverlay();
        });
    }

    introDots.forEach((dot, idx) => {
        dot.addEventListener('click', () => {
            introCurrentIndex = idx;
            syncIntroOverlay();
        });
    });

    if (introCloseBtn) {
        introCloseBtn.addEventListener('click', closeIntroOverlay);
    }

    if (introOverlay) {
        introOverlay.addEventListener('click', (e) => {
            if (e.target === introOverlay || e.target.classList.contains('intro-overlay-backdrop')) {
                closeIntroOverlay();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (!introOverlay.classList.contains('is-active')) return;

            if (e.key === 'Escape') {
                closeIntroOverlay();
            } else if (e.key === 'ArrowRight') {
                introCurrentIndex = (introCurrentIndex + 1) % introOverlaySlides.length;
                syncIntroOverlay();
            } else if (e.key === 'ArrowLeft') {
                introCurrentIndex = (introCurrentIndex + introOverlaySlides.length - 1) % introOverlaySlides.length;
                syncIntroOverlay();
            }
        });
    }
});

// localStorage의 로그인 사용자로 제출하는 헬퍼
window.submitGameResultFromLocal = async function submitGameResultFromLocal(score, wrongItems) {
    const userIdStr = localStorage.getItem('userId');
    if (!userIdStr) {
        throw new Error('로그인 필요: 사용자 ID가 없습니다.');
    }
    const userId = Number(userIdStr);
    return window.submitGameResult(userId, score, wrongItems);
};


// [4] 페이지 모드 전환 (index.html용)
/**
 * [페이지 모드(해시)가 변경될 때마다 실행되는 함수]
 */
function applyModeFromHash() {
    const isIndexPage = document.body.classList.contains('mode-home') || 
                        document.body.classList.contains('mode-ranking');

    if (!isIndexPage) return; // index.html 아니면 실행 안 함
    
    if (location.hash === '#ranking') {
        document.body.classList.remove('mode-home');
        document.body.classList.add('mode-ranking');
        
        // 랭킹 모드가 되면, 랭킹 데이터를 불러오는 함수 실행
        loadRanking(); 
    } else {
        document.body.classList.remove('mode-ranking');
        document.body.classList.add('mode-home');
    }
}


// [5] (★최종 수정★) 모든 페이지 공통 초기화 작업
// ---------------------------------------------
// DOMContentLoaded는 페이지 로딩이 끝나면 딱 한 번 실행됩니다.

document.addEventListener('DOMContentLoaded', () => {

    // --- (C) 페이지별 초기화 로직 ---
    
    // 1. index.html인지 확인
    const isIndexPage = document.body.classList.contains('mode-home') || 
                        document.body.classList.contains('mode-ranking');

    // 2. 랭킹 리스트(.leaderboard-list)가 페이지에 있는지 확인
    const leaderboardList = document.querySelector('.leaderboard-list');

    if (isIndexPage) {
        // index.html 이면? -> 해시(#) 기반 모드 전환 실행
        applyModeFromHash();

        // 지역별 통계 그래프 초기 렌더링 (전체 기준)
        renderRegionCharts('all');

        const regionSelect = document.getElementById('regionSelect');
        if (regionSelect) {
            regionSelect.addEventListener('change', async () => {
                const selectedRegion = regionSelect.value || 'all';
                // 선택 값에 맞춰 그래프만 다시 그림 (API 호출은 내부 loadRegionStats에서 수행)
                renderRegionCharts(selectedRegion);
            });
        }
    } else if (leaderboardList) {
        // index.html이 아닌데 랭킹 리스트가 있다면? 
        // -> ranking.html 이므로 랭킹을 즉시 로드! (지금은 거의 사용 안 함)
        loadRanking();
    }
    
}); // [공통 초기화 작업 끝]


// [6] 해시 변경 이벤트 감지 (index.html에서만 사용)
window.addEventListener('hashchange', applyModeFromHash);