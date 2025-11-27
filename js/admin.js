function renderTable(data, title, options = {}) {
  const output = document.getElementById('adminOutput');
  if (!output) return;

  if (!Array.isArray(data) || data.length === 0) {
    output.innerHTML = `<div>${title}<br/><strong>결과가 없습니다.</strong></div>`;
    return;
  }

  const keys = Object.keys(data[0]);
  const enableSelection = !!options.enableSelection;
  const enableRowDelete = !!options.enableRowDelete;
  const rowIdKey = options.rowIdKey || null; // 예: 'id' 또는 'nickname'
  const footerHtml = options.footerHtml || '';

  const headerCells = [];
  if (enableSelection) {
    headerCells.push('<th><input type="checkbox" id="chkAllRows" /></th>');
  }
  headerCells.push(...keys.map((k) => `<th>${k}</th>`));
  if (enableRowDelete) {
    headerCells.push('<th>삭제</th>');
  }

  const rows = data
    .map((row, rowIndex) => {
      const cells = [];
      if (enableSelection) {
        const idValue = rowIdKey && row[rowIdKey] != null ? row[rowIdKey] : rowIndex;
        cells.push(
          `<td><input type="checkbox" class="chkRow" data-row-id="${String(
            idValue
          )}" /></td>`
        );
      }
      cells.push(
        ...keys.map((k) => `<td>${row[k] ?? ''}</td>`)
      );

      if (enableRowDelete) {
        const idValue = rowIdKey && row[rowIdKey] != null ? row[rowIdKey] : rowIndex;
        cells.push(
          `<td><button class="btnRowDelete" data-row-id="${String(
            idValue
          )}" style="background:#b91c1c; color:#f9fafb; padding:2px 8px; border-radius:999px; border:none; cursor:pointer; font-size:0.75rem;">삭제</button></td>`
        );
      }

      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');

  const extraControls = enableSelection
    ? `<div style="margin-top:8px; margin-bottom:4px; display:flex; gap:8px; align-items:center;">
        <button id="btnDeleteSelected" style="background:#ef4444; color:#f9fafb;">선택한 사용자 삭제</button>
        <span style="font-size:0.75rem; color:#9ca3af;">체크한 행만 삭제 요청을 보냅니다.</span>
      </div>`
    : '';

  output.innerHTML = `
    <div>${title}</div>
    ${extraControls}
    <table>
      <thead><tr>${headerCells.join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${footerHtml}
  `;

  if (enableSelection) {
    const chkAll = document.getElementById('chkAllRows');
    const rowCheckboxes = Array.from(output.querySelectorAll('.chkRow'));
    if (chkAll) {
      chkAll.addEventListener('change', () => {
        rowCheckboxes.forEach((cb) => {
          cb.checked = chkAll.checked;
        });
      });
    }

    const btnDeleteSelected = document.getElementById('btnDeleteSelected');
    if (btnDeleteSelected) {
      btnDeleteSelected.addEventListener('click', async () => {
        const selected = rowCheckboxes
          .filter((cb) => cb.checked)
          .map((cb) => cb.getAttribute('data-row-id'))
          .filter((v) => v != null);

        if (selected.length === 0) {
          alert('삭제할 사용자를 선택해 주세요.');
          return;
        }

        if (!confirm(`정말로 선택한 ${selected.length}개 사용자를 삭제하시겠습니까?`)) {
          return;
        }

        try {
          const res = await fetch('/api/admin/delete-scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selected }),
          });
          const json = await res.json();
          alert(`삭제 결과: ${json.success ? '성공' : '실패'} (status ${res.status})`);
        } catch (e) {
          console.error(e);
          alert('삭제 요청 중 오류가 발생했습니다.');
        }
      });
    }
  }

  if (enableRowDelete) {
    const rowDeleteButtons = Array.from(output.querySelectorAll('.btnRowDelete'));
    rowDeleteButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-row-id');
        if (!id) return;

        if (!confirm(`정말로 이 사용자를 삭제하시겠습니까? (id: ${id})`)) {
          return;
        }

        try {
          const res = await fetch('/api/admin/delete-scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [id] }),
          });
          const json = await res.json();
          alert(`삭제 결과: ${json.success ? '성공' : '실패'} (status ${res.status})`);
        } catch (e) {
          console.error(e);
          alert('삭제 요청 중 오류가 발생했습니다.');
        }
      });
    });
  }
}

// 통합 랭킹 전용: 10개씩 페이지네이션 렌더링
function renderRankingWithPagination(allRanking, currentPage = 1, pageSize = 10) {
  if (!Array.isArray(allRanking) || allRanking.length === 0) {
    renderTable([], '통합 랭킹 (/api/ranking)');
    return;
  }

  const totalPages = Math.max(1, Math.ceil(allRanking.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageData = allRanking.slice(start, start + pageSize);

  const paginationHtml = `
    <div id="rankingPagination" style="margin-top:8px; display:flex; gap:4px; align-items:center; flex-wrap:wrap; font-size:0.8rem;">
      <button class="page-btn" data-page="${safePage - 1}" ${safePage === 1 ? 'disabled' : ''} style="padding:2px 8px; border-radius:999px; border:none; background:#1f2937; color:#e5e7eb; cursor:${safePage === 1 ? 'default' : 'pointer'};">‹</button>
      ${Array.from({ length: totalPages }, (_, i) => {
        const page = i + 1;
        const isCurrent = page === safePage;
        return `<button class="page-btn" data-page="${page}" style="padding:2px 8px; border-radius:999px; border:none; background:${
          isCurrent ? '#22c55e' : '#111827'
        }; color:${isCurrent ? '#022c22' : '#e5e7eb'}; cursor:${
          isCurrent ? 'default' : 'pointer'
        }">${page}</button>`;
      }).join('')}
      <button class="page-btn" data-page="${safePage + 1}" ${safePage === totalPages ? 'disabled' : ''} style="padding:2px 8px; border-radius:999px; border:none; background:#1f2937; color:#e5e7eb; cursor:${
        safePage === totalPages ? 'default' : 'pointer'
      };">›</button>
      <span style="margin-left:8px; color:#9ca3af;">총 ${allRanking.length}명 · 페이지 ${safePage}/${totalPages}</span>
    </div>
  `;

  renderTable(pageData, '통합 랭킹 (/api/ranking)', {
    enableSelection: true,
    enableRowDelete: true,
    rowIdKey: 'nickname',
    footerHtml: paginationHtml,
  });

  const output = document.getElementById('adminOutput');
  const pagination = output && output.querySelector('#rankingPagination');
  if (!pagination) return;

  pagination.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const pageAttr = target.getAttribute('data-page');
    if (!pageAttr) return;
    const nextPage = Number(pageAttr);
    if (!Number.isFinite(nextPage)) return;
    if (nextPage < 1 || nextPage > totalPages) return;
    renderRankingWithPagination(allRanking, nextPage, pageSize);
  });
}

async function safeFetchJson(url, statusEl) {
  if (statusEl) {
    statusEl.textContent = `요청 중: ${url}`;
  }
  const res = await fetch(url);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    const output = document.getElementById('adminOutput');
    if (output) {
      output.innerHTML = `<div><strong>${url}</strong> 응답이 JSON이 아닙니다.<pre>${text}</pre></div>`;
    }
    throw e;
  }
  if (statusEl) {
    statusEl.textContent = `status ${res.status}, ${Array.isArray(json) ? json.length : 1}개 행`;
  }
  return json;
}

document.addEventListener('DOMContentLoaded', () => {
  const btnRanking = document.getElementById('btnLoadRanking');
  const btnRegions = document.getElementById('btnLoadRegions');
  const btnWaste = document.getElementById('btnLoadWaste');
  const btnResetScores = document.getElementById('btnResetScores');
  const btnResetWaste = document.getElementById('btnResetWaste');
  const statusRanking = document.getElementById('statusRanking');
  const statusRegions = document.getElementById('statusRegions');
  const statusWaste = document.getElementById('statusWaste');
  const statusReset = document.getElementById('statusReset');

  if (btnRanking) {
    btnRanking.addEventListener('click', async () => {
      try {
        const data = await safeFetchJson('/api/ranking', statusRanking);
        if (!data || !data.success) {
          renderTable([], '랭킹 로드 실패');
          return;
        }
        renderRankingWithPagination(data.ranking, 1, 10);
      } catch (e) {
        if (statusRanking) statusRanking.textContent = '요청 실패';
        console.error(e);
      }
    });
  }

  if (btnRegions) {
    btnRegions.addEventListener('click', async () => {
      try {
        const data = await safeFetchJson('/api/scores/regions', statusRegions);
        renderTable(data, '지역별 평균 점수 (/api/scores/regions)');
      } catch (e) {
        if (statusRegions) statusRegions.textContent = '요청 실패';
        console.error(e);
      }
    });
  }

  if (btnWaste) {
    btnWaste.addEventListener('click', async () => {
      const input = document.getElementById('wasteRegionId');
      const regionId = (input && input.value.trim()) || '';
      let url = '/api/stats/region-waste';
      if (regionId) {
        url += `?regionId=${encodeURIComponent(regionId)}`;
      }
      try {
        const data = await safeFetchJson(url, statusWaste);
        renderTable(data, `쓰레기 종류별 오답률 (${url})`);
      } catch (e) {
        if (statusWaste) statusWaste.textContent = '요청 실패';
        console.error(e);
      }
    });
  }

  if (btnResetScores) {
    btnResetScores.addEventListener('click', async () => {
      if (!confirm('정말로 모든 game_scores 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
      const output = document.getElementById('adminOutput');
      if (statusReset) statusReset.textContent = '요청 중: /api/admin/reset-scores';
      try {
        const res = await fetch('/api/admin/reset-scores', { method: 'POST' });
        const json = await res.json();
        if (output) {
          output.innerHTML = `<div><strong>game_scores 리셋 결과</strong><pre>${JSON.stringify(json, null, 2)}</pre></div>`;
        }
        if (statusReset) statusReset.textContent = `status ${res.status}, ${json.success ? '성공' : '실패'}`;
      } catch (e) {
        console.error(e);
        if (statusReset) statusReset.textContent = '요청 실패';
      }
    });
  }

  if (btnResetWaste) {
    btnResetWaste.addEventListener('click', async () => {
      if (!confirm('정말로 모든 game_waste_stats 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
      const output = document.getElementById('adminOutput');
      if (statusReset) statusReset.textContent = '요청 중: /api/admin/reset-waste';
      try {
        const res = await fetch('/api/admin/reset-waste', { method: 'POST' });
        const json = await res.json();
        if (output) {
          output.innerHTML = `<div><strong>game_waste_stats 리셋 결과</strong><pre>${JSON.stringify(json, null, 2)}</pre></div>`;
        }
        if (statusReset) statusReset.textContent = `status ${res.status}, ${json.success ? '성공' : '실패'}`;
      } catch (e) {
        console.error(e);
        if (statusReset) statusReset.textContent = '요청 실패';
      }
    });
  }
});