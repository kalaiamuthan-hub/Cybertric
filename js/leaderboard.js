/**
 * CYBERTRIX - Live Leaderboard Controller
 * Calculates ranks, tie-breakers, top 3 podium, user highlight, and real-time updates.
 */

(function () {
  let rankingsCache = [];
  let searchQuery = '';

  function bootLeaderboard() {
    initLeaderboard();
    initSearch();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootLeaderboard);
  } else {
    bootLeaderboard();
  }

  function initLeaderboard() {
    const tableBody = document.getElementById('leaderboard-tbody');
    const podiumContainer = document.getElementById('leaderboard-podium');

    window.CYBERTRIX_DB.leaderboard.onSnapshot((rankings) => {
      // Requirement 2: The public leaderboard must show ONLY players where active == true
      rankingsCache = (rankings || []).filter(r => r.active === true && !r.disabled && r.status !== 'disabled');
      renderLeaderboard();
      updateMetrics(rankingsCache);
    });

    window.CYBERTRIX_DB.auth.onAuthStateChanged(() => {
      renderLeaderboard();
    });
  }

  function initSearch() {
    const searchInput = document.getElementById('search-leaderboard');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderLeaderboard();
      });
    }
  }

  function updateMetrics(rankings) {
    const activeRankings = (rankings || []).filter(r => r.active === true && !r.disabled && r.status !== 'disabled');

    const totalParticipantsEl = document.getElementById('stats-total-players');
    if (totalParticipantsEl) {
      // Count only active/enabled players (Requirement 3)
      totalParticipantsEl.textContent = activeRankings.length;
    }

    const totalSolvesEl = document.getElementById('stats-total-solves');
    if (totalSolvesEl) {
      const sumSolves = activeRankings.reduce((acc, r) => acc + (r.solvedCount || 0), 0);
      totalSolvesEl.textContent = sumSolves;
    }
  }

  function renderLeaderboard() {
    renderPodium();
    renderTable();
  }

  function renderPodium() {
    const podiumContainer = document.getElementById('leaderboard-podium');
    if (!podiumContainer) return;

    if (rankingsCache.length === 0) {
      podiumContainer.innerHTML = '';
      return;
    }

    const first = rankingsCache[0] || null;
    const second = rankingsCache[1] || null;
    const third = rankingsCache[2] || null;

    podiumContainer.innerHTML = `
      <!-- Rank 2 -->
      <div class="podium-card podium-2 cyber-card-corner">
        <div class="podium-rank-badge">02</div>
        <div class="podium-username">${second ? escapeHTML(second.username) : '---'}</div>
        <div class="podium-points">${second ? second.points : 0} <small style="font-size:0.6rem; color:var(--text-muted);">PTS</small></div>
        <div style="font-family: var(--font-code); font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem;">
          ${second ? second.solvedCount : 0} Solved
        </div>
      </div>

      <!-- Rank 1 -->
      <div class="podium-card podium-1 cyber-card-corner">
        <div style="color: var(--yellow); font-size: 1.5rem; margin-bottom: 0.25rem;">👑</div>
        <div class="podium-rank-badge">01</div>
        <div class="podium-username" style="font-size: 1.5rem; color: #fff;">${first ? escapeHTML(first.username) : '---'}</div>
        <div class="podium-points" style="font-size: 1.8rem; color: var(--yellow);">${first ? first.points : 0} <small style="font-size:0.65rem; color:var(--text-muted);">PTS</small></div>
        <div style="font-family: var(--font-code); font-size: 0.85rem; color: var(--cyan); margin-top: 0.5rem;">
          ${first ? first.solvedCount : 0} Solved
        </div>
      </div>

      <!-- Rank 3 -->
      <div class="podium-card podium-3 cyber-card-corner">
        <div class="podium-rank-badge">03</div>
        <div class="podium-username">${third ? escapeHTML(third.username) : '---'}</div>
        <div class="podium-points">${third ? third.points : 0} <small style="font-size:0.6rem; color:var(--text-muted);">PTS</small></div>
        <div style="font-family: var(--font-code); font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem;">
          ${third ? third.solvedCount : 0} Solved
        </div>
      </div>
    `;
  }

  function renderTable() {
    const tableBody = document.getElementById('leaderboard-tbody');
    if (!tableBody) return;

    const currentUser = window.CYBERTRIX_DB.auth.getCurrentUser();

    const filtered = rankingsCache.filter(r => {
      if (r.disabled || r.status === 'disabled' || r.active === false) return false;
      if (searchQuery && !r.username.toLowerCase().includes(searchQuery) && !(r.name && r.name.toLowerCase().includes(searchQuery))) {
        return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            NO OPERATIVES FOUND
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(row => {
      const isCurrentUser = currentUser && currentUser.uid === row.uid;
      const rankPad = String(row.rank).padStart(2, '0');

      let rankColor = 'var(--text-secondary)';
      if (row.rank === 1) rankColor = 'var(--yellow)';
      else if (row.rank === 2) rankColor = 'var(--cyan)';
      else if (row.rank === 3) rankColor = '#cd7f32';

      return `
        <tr class="${isCurrentUser ? 'current-user' : ''}">
          <td style="font-weight: 800; color: ${rankColor}; font-size: 1.05rem;">
            ${rankPad}
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
              <span style="font-family: var(--font-tech); font-weight: 700; font-size: 1.05rem; color: #ffffff;">
                ${escapeHTML(row.name || row.username)}
              </span>
              ${isCurrentUser ? '<span class="cyber-badge badge-green" style="font-size: 0.65rem;">YOU</span>' : ''}
            </div>
          </td>
          <td style="color: var(--cyan); font-weight: 600;">
            ${row.solvedCount}
          </td>
          <td style="font-family: var(--font-cyber); font-weight: 800; color: var(--text-main); font-size: 1.1rem;">
            ${row.points}
          </td>
          <td style="font-size: 0.78rem; color: var(--text-muted);">
            ${row.lastSolvedAt ? new Date(row.lastSolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A'}
          </td>
        </tr>
      `;
    }).join('');
  }

  function escapeHTML(str) {
    return (str || '').replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }
})();
