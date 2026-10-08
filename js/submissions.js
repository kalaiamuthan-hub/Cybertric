/**
 * CYBERTRIX - Participant Submissions & Dashboard Controller
 * Populates dashboard stats, progress bars, solved vs unsolved, and submission history.
 */

(function () {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initParticipantDashboard);
  } else {
    initParticipantDashboard();
  }

  async function initParticipantDashboard() {
    const userGreeting = document.getElementById('user-greeting');
    if (!userGreeting) return; // Not on participant dashboard

    const user = window.CYBERTRIX_DB.auth.getCurrentUser();
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    let renderDebounceTimer = null;
    function scheduleRender(u) {
      if (!u) return;
      if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
      renderDebounceTimer = setTimeout(() => {
        renderDashboardMetrics(u).catch(() => {});
      }, 50);
    }

    // Initial render on load
    scheduleRender(user);

    // Real-time synchronization for participant metrics
    window.CYBERTRIX_DB.auth.onAuthStateChanged((freshUser) => {
      if (!freshUser) {
        window.location.href = 'login.html';
        return;
      }
      scheduleRender(freshUser);
    });

    window.CYBERTRIX_DB.challenges.onSnapshot(() => {
      const u = window.CYBERTRIX_DB.auth.getCurrentUser();
      if (u) scheduleRender(u);
    });

    window.addEventListener('cybertrix_user_updated', (e) => {
      if (e.detail && e.detail.user) scheduleRender(e.detail.user);
    });
  }

  async function renderDashboardMetrics(user) {
    // Disabled banner check (Requirement 3)
    const banner = document.getElementById('account-disabled-banner');
    if (banner) {
      const isDisabled = user && (user.disabled === true || user.status === 'disabled');
      banner.style.display = isDisabled ? 'block' : 'none';
    }

    // Greeting
    const greetingEl = document.getElementById('user-greeting');
    if (greetingEl) greetingEl.textContent = (user.name || user.username).toUpperCase();

    const emailEl = document.getElementById('user-email');
    if (emailEl) emailEl.textContent = user.email;

    const uidEl = document.getElementById('user-uid');
    if (uidEl) uidEl.textContent = user.uid;

    const collegeEl = document.getElementById('user-college');
    if (collegeEl) collegeEl.textContent = user.collegeName || 'N/A';

    // Total points
    const pointsEl = document.getElementById('dash-total-points');
    if (pointsEl) pointsEl.textContent = (user.score !== undefined ? user.score : user.points) || 0;

    // Solved challenges
    const solvedList = Array.from(new Set([
      ...((user.solvedChallenges) || []),
      ...((user.completedChallenges) || [])
    ]));
    const solvedEl = document.getElementById('dash-solved-count');
    if (solvedEl) solvedEl.textContent = (user.solvedCount !== undefined ? user.solvedCount : solvedList.length);

    const solvedEl2 = document.getElementById('dash-solved-count-2');
    if (solvedEl2) solvedEl2.textContent = (user.solvedCount !== undefined ? user.solvedCount : solvedList.length);

    // Total challenges available
    const allCh = await window.CYBERTRIX_DB.challenges.getAll(false);
    const totalCount = allCh.length || 1;
    const availableEl = document.getElementById('dash-available-count');
    if (availableEl) availableEl.textContent = totalCount;

    // Completion %
    const completionPct = Math.min(100, Math.round((solvedList.length / totalCount) * 100));
    const completionEl = document.getElementById('dash-completion-pct');
    if (completionEl) completionEl.textContent = completionPct + '%';

    const progressBar = document.getElementById('dash-progress-bar');
    if (progressBar) progressBar.style.width = completionPct + '%';

    // Current Rank
    const rankings = await window.CYBERTRIX_DB.leaderboard.getRankings();
    const myRankItem = rankings.find(r => r.uid === user.uid);
    const rankEl = document.getElementById('dash-current-rank');
    if (rankEl) {
      rankEl.textContent = myRankItem ? `#${myRankItem.rank}` : '#--';
    }

    // Solved Challenges breakdown tags
    const solvedContainer = document.getElementById('dash-solved-breakdown');
    if (solvedContainer) {
      if (solvedList.length === 0) {
        solvedContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">NO FLAGS CAPTURED YET. HEAD TO THE ARENA!</span>';
      } else {
        const solvedChs = allCh.filter(c => solvedList.includes(c.id));
        solvedContainer.innerHTML = solvedChs.map(c => `
          <div class="cyber-badge badge-green" style="padding: 0.4rem 0.8rem; margin: 0.25rem;">
            ✓ ${escapeHTML(c.title)} (+${c.points} PTS)
          </div>
        `).join('');
      }
    }

    // Recent Submissions
    renderUserSubmissions(user.uid);
  }

  async function renderUserSubmissions(userId) {
    const tableBody = document.getElementById('user-submissions-tbody');
    if (!tableBody) return;

    const subs = await window.CYBERTRIX_DB.submissions.getUserSubmissions(userId);
    if (!subs || subs.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
            NO RECORDED SUBMISSIONS YET
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = subs.slice(0, 10).map(s => {
      const timeStr = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `
        <tr>
          <td><strong style="color: #fff;">${escapeHTML(s.challengeTitle || s.challengeId)}</strong></td>
          <td style="font-family: var(--font-code); color: var(--text-secondary); font-size: 0.85rem;">
            ${escapeHTML(s.submittedFlag.length > 25 ? s.submittedFlag.slice(0, 22) + '...' : s.submittedFlag)}
          </td>
          <td>
            ${s.correct ? 
              '<span class="cyber-badge badge-green">✓ GRANTED</span>' : 
              '<span class="cyber-badge badge-red">✗ DENIED</span>'}
          </td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${timeStr}</td>
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
