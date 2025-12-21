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
        // 서버에서 이미 정렬해서 보내주므로 클라이언트에서 정렬할 필요가 없습니다.

        // 이전 랭킹 데이터를 보관해서, 변경된 항목에만 하이라이트를 줄 수 있도록 함
        const prevRanking = Array.isArray(window.__prevRanking)
            ? window.__prevRanking
            : [];

        leaderboardList.innerHTML = '';

        if (scores.length === 0) {
            leaderboardList.innerHTML = '<div>아직 랭킹 데이터가 없습니다.</div>';
            return;
        }

        const header = document.createElement('div');
        header.className = 'leaderboard-header';
        header.innerHTML = `
            <span>순위</span>
            <span>닉네임</span>
            <span>점수</span>
            <span>시도(회)</span>
            <span style="text-align: right;">기록 시각</span>
        `;
        leaderboardList.appendChild(header);

        let prevTopKey = null;
        if (prevRanking.length > 0) {
            const p0 = prevRanking[0];
            if (p0) prevTopKey = `${p0.nickname || ''}|${p0.score || 0}`;
        }

        const currentNickname =
            localStorage.getItem('nickname') ||
            localStorage.getItem('userNickname') ||
            localStorage.getItem('loggedInNickname') ||
            null;

        scores.forEach((entry, index) => {
            const rankItem = document.createElement('div');
            rankItem.className = 'leaderboard-entry';

            if (index === 0) rankItem.classList.add('gold');
            if (index === 1) rankItem.classList.add('silver');
            if (index === 2) rankItem.classList.add('bronze');

            if (currentNickname && entry.nickname === currentNickname) {
                rankItem.classList.add('is-current-user');
            }

            let trophy = '';
            if (index === 0) trophy = ' <span class="trophy trophy-gold">🥇</span>';
            else if (index === 1) trophy = ' <span class="trophy trophy-silver">🥈</span>';
            else if (index === 2) trophy = ' <span class="trophy trophy-bronze">🥉</span>';

            const attempts = Number(entry.attempts ?? entry.plays ?? 0);
            let bestTimeText = '-';
            if (entry.bestTime) {
                const d = new Date(entry.bestTime);
                if (!isNaN(d.getTime())) {
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    const hh = String(d.getHours()).padStart(2, '0');
                    const mi = String(d.getMinutes()).padStart(2, '0');
                    bestTimeText = `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
                }
            }

            rankItem.innerHTML = `
                <span class="rank">${index + 1}${trophy}</span>
                <span class="nickname">${entry.nickname}</span>
                <span class="score">${entry.score}</span>
                <span class="plays">${attempts.toLocaleString('ko-KR')}회</span>
                <span class="time">${bestTimeText}</span>
            `;

            // 이전 랭킹과 비교해서 내용이 바뀐 경우만 하이라이트
            const prev = prevRanking[index];
            const isSame =
                prev &&
                prev.nickname === entry.nickname &&
                Number(prev.score) === Number(entry.score);

            if (!isSame && prevRanking.length > 0) {
                rankItem.classList.add('is-new');

                // 1등이 바뀐 경우에는 추가로 bounce 효과
                if (index === 0) {
                    const newTopKey = `${entry.nickname || ''}|${entry.score || 0}`;
                    if (newTopKey !== prevTopKey) {
                        rankItem.classList.add('top-changed');
                    }
                }
            }
            leaderboardList.appendChild(rankItem);
        });

        // 이번 랭킹을 다음 비교를 위해 저장
        window.__prevRanking = scores.map((s) => ({
            nickname: s.nickname,
            score: Number(s.score),
        }));

        // 메타 정보 (동점 기준 및 마지막 업데이트 시간)
        const meta = document.createElement('div');
        meta.className = 'leaderboard-meta';
        const now = new Date();
        const formatted = now.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
        meta.innerHTML = `
            <div class="leaderboard-meta-text">동점일 경우 오답 수가 적은 순, 그다음 기록 시간이 빠른 순으로 순위가 결정됩니다.</div>
            <div class="leaderboard-meta-updated">마지막 업데이트: ${formatted}</div>
        `;
        leaderboardList.appendChild(meta);
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
        const MAX_SCORE = 100; // 실제 게임 점수 상한 (0~100점)

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

// 분리배출 항목별 오답률은 이제 D1의 game_waste_stats 테이블을 사용하는
// /api/stats/region-waste 엔드포인트에서 직접 불러옵니다.

// 선택된 지역 키에 따라 그래프 렌더링 (왼쪽: 순위형 수평 막대, 오른쪽: 수직 막대)
async function renderRegionCharts(selectedRegionKey = 'all') {
    const regionRankingContainer = document.querySelector('.stats-hbar-list[data-chart="region-ranking"]');
    const wasteBarsContainer = document.querySelector('.stats-chart-bars[data-chart="waste-types"]');

    if (!regionRankingContainer || !wasteBarsContainer) return;

    if (regionStatsFromServer.length === 0) {
        await loadRegionStats();
    }

    // 1) 왼쪽: 지역별 평균 오답률 → 순위형 수평 막대 그래프 (실천률 기준)
    const regionsToShow = regionStatsFromServer.length ? [...regionStatsFromServer] : [];

    regionRankingContainer.innerHTML = '';

    if (!regionsToShow.length) {
        const msg = document.createElement('div');
        msg.textContent = '지역 통계 데이터가 아직 없습니다.';
        msg.style.color = '#9ca3af';
        msg.style.fontSize = '0.9rem';
        regionRankingContainer.appendChild(msg);
    } else {
        // 실천률이 높은 순(정답률이 높은 순)으로 정렬
        regionsToShow.sort((a, b) => {
            const aw = Math.max(0, Math.min(1, a.wrongRate ?? 0));
            const bw = Math.max(0, Math.min(1, b.wrongRate ?? 0));
            const ac = 1 - aw;
            const bc = 1 - bw;
            return bc - ac; // 실천률 높은 순
        });

        const correctPercents = regionsToShow.map((r) => {
            const wrong = Math.max(0, Math.min(1, r.wrongRate ?? 0));
            const correct = 1 - wrong;
            return Math.round(correct * 100);
        });
        const minCorrect = Math.min(...correctPercents);
        const maxCorrect = Math.max(...correctPercents);

        const toDisplayWidth = (value) => {
            if (!Number.isFinite(value)) return 0;
            if (maxCorrect === minCorrect) return 60; // 전부 같으면 적당한 길이
            const ratio = (value - minCorrect) / (maxCorrect - minCorrect); // 0~1 (실천률 낮은 곳이 0)
            return 30 + ratio * 70; // 30% ~ 100%
        };

        regionsToShow.forEach((region, idx) => {
            const correct = correctPercents[idx];
            const displayWidth = toDisplayWidth(correct);

            const row = document.createElement('div');
            row.className = 'stats-hbar-row';

            if (correct === maxCorrect) {
                row.classList.add('is-best-region');
            }
            if (correct === minCorrect) {
                row.classList.add('is-worst-region');
            }

            const count = Number(region.count ?? 0);

            row.innerHTML = `
                <div class="stats-hbar-label">${region.label}</div>
                <div class="stats-hbar-bar-wrap">
                    <div class="stats-hbar-bar"></div>
                </div>
                <div class="stats-hbar-value">
                    <span class="stats-hbar-main">실천률 ${correct}%</span>
                    <span class="stats-hbar-sub">플레이 N=${count.toLocaleString('ko-KR')}</span>
                </div>
            `;

            regionRankingContainer.appendChild(row);

            const barEl = row.querySelector('.stats-hbar-bar');
            if (barEl) {
                barEl.style.setProperty('--target-width', `${displayWidth}%`);
                barEl.classList.remove('is-active');
                barEl.style.transitionDelay = `${idx * 60}ms`;
                requestAnimationFrame(() => {
                    barEl.classList.add('is-active');
                });
            }
        });
    }

    // 2) 오른쪽: 분리배출 항목별 오답률 (D1 기반)
    wasteBarsContainer.innerHTML = '';

    try {
        const params = selectedRegionKey && selectedRegionKey !== 'all'
            ? `?regionId=${encodeURIComponent(selectedRegionKey)}`
            : '';
        const res = await fetch(`/api/stats/region-waste${params}`);
        const rawWaste = await res.json();

        const wasteData = Array.isArray(rawWaste) ? rawWaste : [];

        if (!wasteData.length) {

            const msg = document.createElement('div');
            msg.textContent = '선택한 지역의 오답 통계가 아직 없습니다.';
            msg.style.color = '#9ca3af';
            msg.style.fontSize = '0.9rem';
            wasteBarsContainer.appendChild(msg);
        } else {
            // 오답률 70~100% 구간을 확대해서 보여주기 위해, 70%를 기준선으로 사용
            const BASE = 70;
            const rawPercents = wasteData.map((item) => {
                const rate = Number(item.wrongRate ?? 0);
                return Math.max(0, Math.min(100, Math.round(rate * 100)));
            });
            const maxRate = Math.max(...rawPercents);

            const toDisplayHeight = (value) => {
                if (!Number.isFinite(value)) return 0;
                const clamped = Math.max(BASE, Math.min(100, value));
                const ratio = (clamped - BASE) / (100 - BASE); // 0~1 (70~100%)
                return 15 + ratio * 85; // 15%~100%
            };

            wasteData.forEach((item, idx) => {
                const label = item.wasteType || item.label || '기타';
                const percent = rawPercents[idx];
                const displayHeight = toDisplayHeight(percent);

                const bar = document.createElement('div');
                bar.className = 'stats-bar';
                if (percent === maxRate) {
                    bar.classList.add('is-worst-waste');
                }

                bar.innerHTML = `
                    <div class="stats-bar-column"></div>
                    <div class="stats-bar-value">${percent}%</div>
                    <div class="stats-bar-label">${label}</div>
                `;
                wasteBarsContainer.appendChild(bar);

                const column = bar.querySelector('.stats-bar-column');
                if (column) {
                    column.style.setProperty('--target-height', `${displayHeight}%`);
                    column.classList.remove('is-active');
                    column.style.transitionDelay = `${idx * 40}ms`;
                    requestAnimationFrame(() => {
                        column.classList.add('is-active');
                    });
                }
            });
        }
    } catch (err) {
        console.error('분리배출 항목별 오답률 불러오기 실패:', err);
        const msg = document.createElement('div');
        msg.textContent = '오답 통계를 불러오는 중 오류가 발생했습니다.';
        msg.style.color = '#f97316';
        msg.style.fontSize = '0.9rem';
        wasteBarsContainer.appendChild(msg);
    }
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
    // hero 섹션이나 지역 통계 섹션이 있으면 index.html 로 간주
    const isIndexPage = !!document.getElementById('region-stats-section') ||
                        !!document.querySelector('.hero');

    if (!isIndexPage) return; // index.html 아니면 실행 안 함

    // 초기 진입 시 body에 모드 클래스가 없으면 기본을 mode-home으로 설정
    if (!document.body.classList.contains('mode-home') &&
        !document.body.classList.contains('mode-ranking')) {
        document.body.classList.add('mode-home');
    }
    
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
    
    // 1. index.html인지 확인 (지역 통계 섹션이 있으면 index 페이지로 간주)
    const isIndexPage = !!document.getElementById('region-stats-section');

    // 2. 랭킹 리스트(.leaderboard-list)가 페이지에 있는지 확인
    const leaderboardList = document.querySelector('.leaderboard-list');

    if (isIndexPage) {
        // index.html 이면? -> 해시(#) 기반 모드 전환 실행
        applyModeFromHash();

        // 통합 랭킹 섹션이 있다면, 페이지 진입 시 랭킹 데이터를 바로 로드
        if (leaderboardList) {
            loadRanking();
            // 일정 주기로 랭킹을 다시 불러와 실시간 느낌을 줌
            setInterval(() => {
                if (document.body.contains(leaderboardList)) {
                    loadRanking();
                }
            }, 15000); // 15초마다 갱신
        }

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