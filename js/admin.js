/**
 * CYBERTRIX - Administrative Control Center Controller
 * Manages privileged operations: challenges CRUD, player inspections,
 * announcements, event settings, and submission audits.
 */

(function () {
  function bootAdmin() {
    initAdminGuard();
    initAdminClock();
    initAdminMobileNav();
    initAdminDashboardStats();
    initAdminPlayers();
    initAdminChallenges();
    initAdminSubmissions();
    initAdminAnnouncements();
    initAdminSettings();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootAdmin);
  } else {
    bootAdmin();
  }

  // Admin Route Authorization Guard (Requirement 1 & 7)
  async function initAdminGuard() {
    const isLoginPage = window.location.pathname.endsWith('admin/index.html') || window.location.pathname.endsWith('admin/');
    const user = window.CYBERTRIX_DB.auth.getCurrentUser();

    if (!isLoginPage) {
      if (!user) {
        window.location.href = 'index.html';
        return;
      }
      try {
        const check = await window.CYBERTRIX_DB.auth.verifyAdminAccess(user.uid, user.email);
        if (!check || !check.authorized) {
          throw new Error("This account is not an active admin.");
        }
      } catch (err) {
        if (window.showCyberToast) {
          window.showCyberToast("ACCESS DENIED: This account is not an active admin.", "error");
        }
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 400);
        return;
      }
    }

    // Admin Logout buttons
    const logoutBtns = document.querySelectorAll('.btn-admin-logout');
    logoutBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await window.CYBERTRIX_DB.auth.logout();
        window.location.href = 'index.html';
      });
    });
  }

  // Live Digital Clock
  function initAdminClock() {
    const clockEl = document.getElementById('admin-clock');
    if (!clockEl) return;
    function updateClock() {
      const now = new Date();
      clockEl.textContent = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    }
    updateClock();
    setInterval(updateClock, 1000);
  }

  // Mobile Sidebar Toggle
  function initAdminMobileNav() {
    const toggle = document.querySelector('.admin-mobile-toggle');
    const sidebar = document.querySelector('.admin-sidebar');
    if (toggle && sidebar) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }
  }

  // =========================================================================
  // ADMIN DASHBOARD STATS
  // =========================================================================
  async function initAdminDashboardStats() {
    const statPlayers = document.getElementById('stat-total-players');
    if (!statPlayers) return; // Not on dashboard page

    async function refresh() {
      const players = await window.CYBERTRIX_DB.players.getAll();
      const challenges = await window.CYBERTRIX_DB.challenges.getAll(true);
      const submissions = await window.CYBERTRIX_DB.submissions.getAll();

      // Total players
      statPlayers.textContent = players.length;

      // Active players (players with at least 1 solve or submission)
      const activeCount = players.filter(p => (p.solvedChallenges && p.solvedChallenges.length > 0) || p.points > 0).length;
      const elActive = document.getElementById('stat-active-players');
      if (elActive) elActive.textContent = activeCount;

      // Total challenges
      const elChallenges = document.getElementById('stat-total-challenges');
      if (elChallenges) elChallenges.textContent = challenges.length;

      // Total submissions
      const elSubmissions = document.getElementById('stat-total-submissions');
      if (elSubmissions) elSubmissions.textContent = submissions.length;

      // Solved challenges count
      const totalSolves = submissions.filter(s => s.correct).length;
      const elSolves = document.getElementById('stat-total-solves');
      if (elSolves) elSolves.textContent = totalSolves;

      // Points awarded
      const totalPoints = players.reduce((sum, p) => sum + (p.points || 0), 0);
      const elPoints = document.getElementById('stat-points-awarded');
      if (elPoints) elPoints.textContent = totalPoints;

      // Recent Platform Activity table
      const activityTbody = document.getElementById('admin-recent-activity-tbody');
      if (activityTbody) {
        activityTbody.innerHTML = submissions.slice(0, 8).map(s => `
          <tr>
            <td><strong style="color: #fff;">${escapeHTML(s.username)}</strong></td>
            <td>${escapeHTML(s.challengeTitle || s.challengeId)}</td>
            <td>
              ${s.correct ? 
                '<span class="status-pill status-active">✓ SOLVED</span>' : 
                '<span class="status-pill status-hidden">✗ INCORRECT</span>'}
            </td>
            <td style="color: var(--text-muted); font-size: 0.8rem;">
              ${new Date(s.timestamp).toLocaleTimeString()}
            </td>
          </tr>
        `).join('');
      }
    }

    refresh();
    window.addEventListener('cybertrix_data_changed', refresh);
  }

  // =========================================================================
  // ADMIN PLAYER MANAGEMENT (Section 3: Enable / Disable Players)
  // =========================================================================
  async function initAdminPlayers() {
    const tbody = document.getElementById('admin-players-tbody');
    if (!tbody) return;

    let playersList = [];
    let search = '';

    async function loadPlayers() {
      // Admin player management must inspect ALL registered operatives (active and disabled)
      const all = await window.CYBERTRIX_DB.players.getAll();
      all.sort((a, b) => (b.points || 0) - (a.points || 0));
      playersList = all.map((p, idx) => ({ ...p, rank: idx + 1 }));
      const totalCountEl = document.getElementById('admin-total-players-count');
      if (totalCountEl) totalCountEl.textContent = playersList.length;
      render();
    }

    function render() {
      const filtered = playersList.filter(p => !search ||
        (p.username && p.username.toLowerCase().includes(search)) ||
        (p.name && p.name.toLowerCase().includes(search)) ||
        (p.email && p.email.toLowerCase().includes(search)) ||
        (p.collegeName && p.collegeName.toLowerCase().includes(search))
      );

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">NO PLAYERS FOUND</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(p => {
        const isDisabled = p.active === false || p.disabled === true || p.status === 'disabled';
        return `
          <tr>
            <td style="font-weight: 800; color: var(--cyan);">${String(p.rank).padStart(2, '0')}</td>
            <td>
              <strong style="color: #fff;">${escapeHTML(p.name || p.username)}</strong>
              ${p.name && p.username && p.name !== p.username ? `<small style="display:block; color:var(--text-muted); font-size:0.75rem;">@${escapeHTML(p.username)}</small>` : ''}
            </td>
            <td style="color: var(--text-secondary); font-family: var(--font-code); font-size: 0.85rem;">${escapeHTML(p.email)}</td>
            <td style="color: var(--cyan); font-family: var(--font-tech);">${escapeHTML(p.collegeName || 'N/A')}</td>
            <td style="font-family: var(--font-cyber); font-weight: 700; color: var(--green);">${p.points} <small style="font-size:0.65rem; color:var(--text-muted);">PTS</small></td>
            <td>
              ${isDisabled ? 
                '<span class="status-pill status-disabled">● DISABLED</span>' : 
                '<span class="status-pill status-active">● ACTIVE</span>'}
            </td>
            <td>
              <div class="table-actions">
                ${isDisabled ? 
                  `<button type="button" class="btn-cyber btn-cyber-green btn-cyber-xs" onclick="window.togglePlayerStatus('${p.uid}', false)">ENABLE</button>` : 
                  `<button type="button" class="btn-cyber btn-cyber-danger btn-cyber-xs" onclick="window.togglePlayerStatus('${p.uid}', true)">DISABLE</button>`
                }
                <button type="button" class="btn-cyber btn-cyber-sm" onclick="window.inspectPlayer('${p.uid}')">DOSSIER</button>
                <button type="button" class="btn-cyber btn-cyber-danger btn-cyber-xs" onclick="window.removePlayer('${p.uid}', '${escapeHTML(p.name || p.username)}')">REMOVE</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    const searchInput = document.getElementById('search-players');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        search = e.target.value.toLowerCase().trim();
        render();
      });
    }

    window.togglePlayerStatus = async function (uid, shouldDisable) {
      try {
        const updated = await window.CYBERTRIX_DB.players.toggleStatus(uid, shouldDisable);
        const actionWord = shouldDisable ? 'DISABLED' : 'ENABLED';
        window.showCyberToast(`Operative [${updated.name || updated.username}] is now ${actionWord}.`, shouldDisable ? "info" : "success");
        if (window.cyberSound) window.cyberSound.playClick();
        await loadPlayers();
      } catch (err) {
        window.showCyberToast(err.message, "error");
        if (window.cyberSound) window.cyberSound.playError();
      }
    };

    window.removePlayer = async function (uid, playerName) {
      const confirmRemove = window.confirm(`CONFIRM REMOVAL: Are you sure you want to permanently remove operative [${playerName || uid}]?\n\nThis will remove their account and all submission records from the platform. Total player count will reduce.`);
      if (!confirmRemove) return;

      try {
        const removed = await window.CYBERTRIX_DB.players.delete(uid);
        window.showCyberToast(`Operative [${removed.name || removed.username}] removed. Player count reduced.`, "warning");
        if (window.cyberSound) window.cyberSound.playClick();

        const modal = document.getElementById('player-detail-modal');
        if (modal && modal.dataset.currentUid === uid) {
          modal.classList.remove('active');
        }

        await loadPlayers();
      } catch (err) {
        window.showCyberToast(err.message, "error");
        if (window.cyberSound) window.cyberSound.playError();
      }
    };

    window.inspectPlayer = async function (uid) {
      const player = await window.CYBERTRIX_DB.players.getById(uid);
      if (!player) return;

      const submissions = await window.CYBERTRIX_DB.submissions.getUserSubmissions(uid);
      const modal = document.getElementById('player-detail-modal');
      if (!modal) return;

      modal.dataset.currentUid = uid;

      const modalDeleteBtn = document.getElementById('modal-player-delete-btn');
      if (modalDeleteBtn) {
        modalDeleteBtn.onclick = () => {
          window.removePlayer(uid, player.name || player.username);
        };
      }

      const isDisabled = player.active === false || player.disabled === true || player.status === 'disabled';

      document.getElementById('modal-player-username').textContent = player.name || player.username;
      document.getElementById('modal-player-email').textContent = player.email;
      document.getElementById('modal-player-points').textContent = `${player.points || 0} PTS`;
      
      const collegeEl = document.getElementById('modal-player-college');
      if (collegeEl) collegeEl.textContent = player.collegeName || player.college || "N/A";

      const statusEl = document.getElementById('modal-player-status');
      if (statusEl) {
        statusEl.innerHTML = isDisabled ? 
          '<span class="status-pill status-disabled">● DISABLED</span>' : 
          '<span class="status-pill status-active">● ACTIVE</span>';
      }

      document.getElementById('modal-player-joined').textContent = new Date(player.createdAt).toLocaleString();

      const solvedEl = document.getElementById('modal-player-solved');
      solvedEl.innerHTML = (player.solvedChallenges && player.solvedChallenges.length > 0)
        ? player.solvedChallenges.map(id => `<span class="cyber-badge badge-green" style="margin:2px;">${escapeHTML(id)}</span>`).join('')
        : '<span style="color: var(--text-muted);">None</span>';

      const historyEl = document.getElementById('modal-player-history');
      historyEl.innerHTML = submissions.map(s => `
        <div style="display:flex; justify-content:space-between; padding:0.4rem 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.8rem;">
          <span>${escapeHTML(s.challengeTitle || s.challengeId)}</span>
          <span style="color:${s.correct ? 'var(--green)' : 'var(--red)'}">${s.correct ? '✓ CORRECT' : '✗ INCORRECT'}</span>
          <span style="color:var(--text-muted)">${new Date(s.timestamp).toLocaleTimeString()}</span>
        </div>
      `).join('') || '<div style="color:var(--text-muted);">No submissions recorded.</div>';

      modal.classList.add('active');
    };

    loadPlayers();
    window.addEventListener('cybertrix_data_changed', loadPlayers);
  }

  // =========================================================================
  // ADMIN CHALLENGE MANAGEMENT (Requirements 6, 9, 10, 11, 14, 23, 28)
  // =========================================================================
  async function initAdminChallenges() {
    const tbody = document.getElementById('admin-challenges-tbody');
    if (!tbody) return;

    let challenges = [];

    const KEYBOARD_MIRROR_CONFIG = {
      // Uppercase QWERTY Rows
      'Q': 'P', 'P': 'Q',
      'W': 'O', 'O': 'W',
      'E': 'I', 'I': 'E',
      'R': 'U', 'U': 'R',
      'T': 'Y', 'Y': 'T',
      'A': 'L', 'L': 'A',
      'S': 'K', 'K': 'S',
      'D': 'J', 'J': 'D',
      'F': 'H', 'H': 'F',
      'G': 'G',
      'Z': 'M', 'M': 'Z',
      'X': 'N', 'N': 'X',
      'C': 'B', 'B': 'C',
      'V': 'V',

      // Lowercase QWERTY Rows
      'q': 'p', 'p': 'q',
      'w': 'o', 'o': 'w',
      'e': 'i', 'i': 'e',
      'r': 'u', 'u': 'r',
      't': 'y', 'y': 't',
      'a': 'l', 'l': 'a',
      's': 'k', 'k': 's',
      'd': 'j', 'j': 'd',
      'f': 'h', 'h': 'f',
      'g': 'g',
      'z': 'm', 'm': 'z',
      'x': 'n', 'n': 'x',
      'c': 'b', 'b': 'c',
      'v': 'v',

      // Numbers
      '1': '0', '0': '1',
      '2': '9', '9': '2',
      '3': '8', '8': '3',
      '4': '7', '7': '4',
      '5': '6', '6': '5',

      // Shift Symbols
      '!': ')', ')': '!',
      '@': '(', '(': '@',
      '#': '*', '*': '#',
      '$': '&', '&': '$',
      '%': '^', '^': '%',

      // Punctuation
      '[': ']', ']': '[',
      '{': '}', '}': '{',
      '<': '>', '>': '<',
      ',': '.', '.': ',',
      ';': ':', ':': ';',
      '/': '?', '?': '/',
      '-': '_', '_': '-',
      ' ': ' '
    };

    function getMirroredChar(sourceChar) {
      if (KEYBOARD_MIRROR_CONFIG[sourceChar] !== undefined) {
        return KEYBOARD_MIRROR_CONFIG[sourceChar];
      }
      const upper = sourceChar.toUpperCase();
      if (KEYBOARD_MIRROR_CONFIG[upper] !== undefined) {
        const mapped = KEYBOARD_MIRROR_CONFIG[upper];
        return (sourceChar === sourceChar.toLowerCase()) ? mapped.toLowerCase() : mapped;
      }
      return sourceChar;
    }

    function generateMirroredSentence(text) {
      if (!text) return '';
      return Array.from(text).map(c => getMirroredChar(c)).join('');
    }

    function updateTypeFields(type) {
      const gMk = document.getElementById('group-mirror-keyboard-config');
      const gTarget = document.getElementById('group-targetword');
      const gAscii = document.getElementById('group-asciivalues');
      const gVault = document.getElementById('group-vault-fields');
      const gGhost = document.getElementById('group-ghost-fields');
      const gMirrorRef = document.getElementById('modal-mirror-reference');
      const gHints = document.getElementById('admin-hints-box');
      const gSubtasks = document.getElementById('group-subtasks-editor');
      const btnSubmit = document.getElementById('btn-submit-challenge-modal');

      const isMk = (type === 'mirror-keyboard');
      if (gMk) gMk.style.display = isMk ? 'block' : 'none';
      if (btnSubmit) {
        btnSubmit.textContent = isMk ? '[ SAVE MIRROR KEYBOARD ]' : '[ SAVE CHALLENGE ]';
      }

      // Subtasks used for both mirror-keyboard and ascii-hunt
      const hasSubtasks = (type === 'mirror-keyboard' || type === 'ascii-hunt');
      if (gSubtasks) {
        gSubtasks.style.display = hasSubtasks ? 'block' : 'none';
        if (hasSubtasks) {
          const currentCards = document.querySelectorAll('.admin-subtask-card');
          if (currentCards.length === 0 || currentAdminSubtaskType !== type) {
            renderAdminSubtasksEditor(type);
          }
        }
      }

      if (gTarget) gTarget.style.display = 'none';
      if (gMirrorRef) gMirrorRef.style.display = isMk ? 'block' : 'none';
      if (gAscii) gAscii.style.display = (type === 'ascii-hunt') ? 'block' : 'none';
      if (gVault) {
        gVault.style.display = (type === 'hidden-vault') ? 'block' : 'none';
        if (type === 'hidden-vault') {
          setTimeout(() => updateHvPreview('sync'), 0);
        }
      }
      if (gGhost) gGhost.style.display = (type === 'metadata-ghost') ? 'block' : 'none';

      // Hints for Hidden Vault
      if (gHints) gHints.style.display = (type === 'hidden-vault') ? 'block' : 'none';
    }

    // Mirror Keyboard preview live updater with two-way sync
    const btnMkPreview = document.getElementById('btn-mk-preview');
    const mkMirrorInput = document.getElementById('edit-mk-mirrorword');
    const mkTargetInput = document.getElementById('edit-mk-targetsentence');
    const mkPreviewText = document.getElementById('admin-mk-preview-text');
    const mkPreviewFlag = document.getElementById('admin-mk-preview-flag');
    const mkFlagInput = document.getElementById('edit-mk-flag');
    const mkQuestionInput = document.getElementById('edit-mk-question');

    let mkAutoSyncTimer = null;
    function triggerMkAutoSync() {
      if (mkAutoSyncTimer) clearTimeout(mkAutoSyncTimer);
      mkAutoSyncTimer = setTimeout(async () => {
        try {
          const chId = document.getElementById('edit-ch-id')?.value || 'mirror-keyboard';
          const type = document.getElementById('edit-ch-type')?.value;
          if (type !== 'mirror-keyboard' && chId !== 'mirror-keyboard') return;

          const freshChallenges = (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges && window.CYBERTRIX_DB.challenges.getAllSync
            ? window.CYBERTRIX_DB.challenges.getAllSync(true)
            : (await window.CYBERTRIX_DB.challenges.getAll(true))) || [];
          const existingCh = freshChallenges.find(c => c.id === chId) || null;
          const targetVal = document.getElementById('edit-mk-targetsentence')?.value?.trim() || existingCh?.targetSentence || existingCh?.targetWord || 'PYTHON';
          const qVal = document.getElementById('edit-mk-question')?.value?.trim() || '';
          if (!targetVal && !qVal) return;

          const finalTarget = targetVal;
          const finalMirror = generateMirroredSentence(finalTarget);
          const finalFlag = document.getElementById('edit-mk-flag')?.value?.trim() || `CYBERTRIX{${finalTarget}}`;

          const updates = {
            mirrorWord: finalMirror,
            mirroredSentence: finalMirror,
            targetSentence: finalTarget,
            targetWord: finalTarget,
            answer: finalTarget,
            flag: finalFlag
          };
          if (qVal) {
            updates.question = qVal;
            updates.description = qVal;
          }

          const subtaskCards = document.querySelectorAll('.admin-subtask-card');
          if (subtaskCards.length > 0) {
            const subtasksArr = [];
            const subtaskSecObj = {};
            subtaskCards.forEach((card, idx) => {
              const stId = card.getAttribute('data-subtask-id') || `task_${idx + 1}`;
              const stTitle = (card.querySelector('.subtask-edit-title')?.value || `Sub-task ${idx + 1}`).trim();
              const stPoints = parseInt(card.querySelector('.subtask-edit-points')?.value, 10) || 100;
              const stQuestion = (card.querySelector('.subtask-edit-question')?.value || '').trim();
              const stDesc = (card.querySelector('.subtask-edit-desc')?.value || '').trim();
              const t = (card.querySelector('.subtask-edit-target')?.value || (idx === 0 ? finalTarget : (idx === 1 ? 'CIPHER' : 'NETWORK'))).trim();
              const fm = generateMirroredSentence(t);
              const fl = (card.querySelector('.subtask-edit-flag')?.value || `CYBERTRIX{${t}}`).trim();

              const calculatedQ = stQuestion || stDesc || (idx === 0 && qVal ? qVal : `Type the target word ${t} using the reciprocal mirror keyboard.`);
              subtasksArr.push({
                id: stId,
                title: stTitle,
                name: `MIRROR KEYBOARD — Task ${idx + 1}`,
                order: idx + 1,
                points: stPoints,
                question: calculatedQ,
                description: calculatedQ,
                instructions: stDesc || calculatedQ,
                mirrorWord: fm,
                targetSentence: t,
                targetWord: t,
                answer: t,
                flag: fl,
                status: 'ACTIVE',
                enabled: true
              });

              subtaskSecObj[stId] = {
                question: calculatedQ,
                mirrorWord: fm,
                targetSentence: t,
                targetWord: t,
                answer: t,
                flag: fl,
                aliases: [t, t.toUpperCase(), t.toLowerCase(), fl, fl.toUpperCase(), `CYBERTRIX{${t}}`, `CYBERTRIX{${t.toUpperCase()}}`, fm, fm.toUpperCase()]
              };
            });
            updates.subtasks = subtasksArr;
            updates.subtaskSecrets = subtaskSecObj;
            if (subtasksArr[0]) {
              updates.question = qVal || subtasksArr[0].question;
              updates.description = qVal || subtasksArr[0].description;
            }
          }

          await window.CYBERTRIX_DB.challenges.update(chId, updates);
        } catch (e) {
          console.warn("Auto-sync mirror keyboard error:", e);
        }
      }, 300);
    }

    function updateMkPreview(source) {
      const normalVal = (mkTargetInput && mkTargetInput.value.trim()) || 'PYTHON';
      const mirrorVal = generateMirroredSentence(normalVal);
      if (mkMirrorInput) mkMirrorInput.value = mirrorVal;
      if (mkFlagInput) mkFlagInput.value = `CYBERTRIX{${normalVal}}`;
      if (mkPreviewText) mkPreviewText.textContent = normalVal;
      if (mkPreviewFlag) mkPreviewFlag.textContent = `CYBERTRIX{${normalVal}}`;

      const newQ = `Type the target word ${normalVal} using the reciprocal mirror keyboard.`;
      if (mkQuestionInput && (!mkQuestionInput.value.trim() || mkQuestionInput.value.includes('mirror word'))) {
        mkQuestionInput.value = newQ;
      }

      const firstCardTarget = document.querySelector('.admin-subtask-card .subtask-edit-target');
      const firstCardFlag = document.querySelector('.admin-subtask-card .subtask-edit-flag');
      const firstCardQ = document.querySelector('.admin-subtask-card .subtask-edit-question');
      if (firstCardTarget) firstCardTarget.value = normalVal;
      if (firstCardFlag) firstCardFlag.value = `CYBERTRIX{${normalVal}}`;
      if (firstCardQ && (!firstCardQ.value.trim() || firstCardQ.value.includes('mirror word'))) {
        firstCardQ.value = (mkQuestionInput && mkQuestionInput.value.trim()) || newQ;
      }
      triggerMkAutoSync();
    }

    if (btnMkPreview) {
      btnMkPreview.addEventListener('click', () => updateMkPreview('target'));
    }
    if (mkTargetInput) {
      mkTargetInput.addEventListener('input', () => updateMkPreview('target'));
    }
    if (mkFlagInput) {
      mkFlagInput.addEventListener('input', (e) => {
        const firstCardFlag = document.querySelector('.admin-subtask-card .subtask-edit-flag');
        if (firstCardFlag) firstCardFlag.value = e.target.value;
        if (mkPreviewFlag) mkPreviewFlag.textContent = e.target.value;
        triggerMkAutoSync();
      });
    }
    if (mkQuestionInput) {
      mkQuestionInput.addEventListener('input', (e) => {
        const firstCardQ = document.querySelector('.admin-subtask-card .subtask-edit-question');
        if (firstCardQ) firstCardQ.value = e.target.value;
        triggerMkAutoSync();
      });
    }
    // =========================================================================
    // HIDDEN VAULT LIVE PREVIEW & TWO-WAY ASCII ACCESS CODE CONVERTER
    // (Admin controls: changing word changes ASCII bytes, and vice versa)
    // =========================================================================
    function getAdminAsciiData() {
      if (window.ASCII_CODE_COM_DATA && Array.isArray(window.ASCII_CODE_COM_DATA) && window.ASCII_CODE_COM_DATA.length > 0) {
        return window.ASCII_CODE_COM_DATA;
      }
      // Fallback 0-255 generator
      const fallback = [];
      for (let c = 0; c <= 255; c++) {
        fallback.push({
          dec: c,
          oct: c.toString(8).padStart(3, '0'),
          hex: c.toString(16).toUpperCase().padStart(2, '0'),
          bin: c.toString(2).padStart(8, '0'),
          symbol: String.fromCharCode(c),
          desc: `ASCII ${c}`
        });
      }
      return fallback;
    }

    function stringToHexStream(str) {
      if (!str) return '';
      const asciiData = getAdminAsciiData();
      return Array.from(str).map(c => {
        const found = asciiData.find(item => item.symbol === c);
        if (found) return found.hex;
        return c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
      }).join(' ');
    }

    function hexStreamToString(stream) {
      if (!stream) return '';
      const asciiData = getAdminAsciiData();
      return stream.split(/\s+/).filter(Boolean).map(tok => {
        const clean = tok.trim().toUpperCase().replace(/^0X/, '');
        if (!clean) return '';
        // 1. Match by HEX in asciiData (e.g. "56" -> V)
        let found = asciiData.find(item => item.hex.toUpperCase() === clean);
        if (!found) {
          // 2. If token is pure decimal (e.g. "86" without letters A-F), check dec
          const decVal = parseInt(clean, 10);
          if (!isNaN(decVal) && decVal >= 0 && decVal <= 255) {
            found = asciiData.find(item => item.dec === decVal);
          }
        }
        if (found) {
          if (found.dec < 32 || found.dec === 127) return '';
          return found.symbol;
        }
        const hexCode = parseInt(clean, 16);
        return (!isNaN(hexCode) && hexCode >= 32 && hexCode <= 255) ? String.fromCharCode(hexCode) : '';
      }).join('');
    }

    const stringToDecimalStream = stringToHexStream;
    const decimalStreamToString = hexStreamToString;

    let hvAutoSyncTimer = null;
    function triggerHvAutoSync() {
      if (hvAutoSyncTimer) clearTimeout(hvAutoSyncTimer);
      hvAutoSyncTimer = setTimeout(async () => {
        try {
          const chId = document.getElementById('edit-ch-id')?.value || 'hidden-vault';
          const type = document.getElementById('edit-ch-type')?.value;
          if (type !== 'hidden-vault' && chId !== 'hidden-vault') return;

          const freshChallenges = (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges && window.CYBERTRIX_DB.challenges.getAllSync
            ? window.CYBERTRIX_DB.challenges.getAllSync(true)
            : (await window.CYBERTRIX_DB.challenges.getAll(true))) || [];
          const existingCh = freshChallenges.find(c => c.id === chId) || null;
          const kw = (document.getElementById('edit-ch-vaultkeyword')?.value || existingCh?.vaultKeyword || existingCh?.vaultPassword || 'VAULT').trim().toUpperCase();
          const cipher = (document.getElementById('edit-ch-ciphersequence')?.value || stringToDecimalStream(kw)).trim();
          const flag = (document.getElementById('edit-ch-flag')?.value || (existingCh && existingCh.flag) || `CYBERTRIX{${kw}}`).trim();
          const logoUrl = (document.getElementById('edit-ch-logourl')?.value || (existingCh && existingCh.logoUrl) || 'assets/logo/logo.svg').trim();

          const updates = {
            vaultPassword: kw,
            vaultKeyword: kw,
            cipherSequence: cipher,
            accessCode: cipher,
            flag: flag,
            eventLogo: logoUrl,
            logoUrl: logoUrl
          };

          const ff1 = document.getElementById('edit-ch-fakefile1-name')?.value?.trim();
          if (ff1) {
            updates.fakeFiles = [
              {
                name: document.getElementById('edit-ch-fakefile1-name')?.value?.trim() || 'system_report.log',
                size: document.getElementById('edit-ch-fakefile1-size')?.value?.trim() || '4.2 KB',
                type: 'LOG',
                content: document.getElementById('edit-ch-fakefile1-content')?.value || ''
              },
              {
                name: document.getElementById('edit-ch-fakefile2-name')?.value?.trim() || 'access_notes.txt',
                size: document.getElementById('edit-ch-fakefile2-size')?.value?.trim() || '1.1 KB',
                type: 'TEXT',
                content: document.getElementById('edit-ch-fakefile2-content')?.value || ''
              },
              {
                name: document.getElementById('edit-ch-fakefile3-name')?.value?.trim() || 'recovery_data.dat',
                size: document.getElementById('edit-ch-fakefile3-size')?.value?.trim() || '8.7 KB',
                type: 'DATA',
                content: document.getElementById('edit-ch-fakefile3-content')?.value || ''
              }
            ];
          }

          const hf1 = document.getElementById('edit-ch-hiddenfile1-name')?.value?.trim();
          if (hf1) {
            updates.hiddenDirectory = document.getElementById('edit-ch-hiddendir')?.value?.trim() || '.hidden/';
            updates.hiddenFiles = [
              {
                name: document.getElementById('edit-ch-hiddenfile1-name')?.value?.trim() || 'evidence.dat',
                size: document.getElementById('edit-ch-hiddenfile1-size')?.value?.trim() || '16.4 KB',
                type: 'DATA',
                content: document.getElementById('edit-ch-hiddenfile1-content')?.value || ''
              },
              {
                name: document.getElementById('edit-ch-hiddenfile2-name')?.value?.trim() || 'classified.txt',
                size: document.getElementById('edit-ch-hiddenfile2-size')?.value?.trim() || '2.3 KB',
                type: 'TEXT',
                content: document.getElementById('edit-ch-hiddenfile2-content')?.value || ''
              },
              {
                name: document.getElementById('edit-ch-hiddenfile3-name')?.value?.trim() || 'final_message.txt',
                size: document.getElementById('edit-ch-hiddenfile3-size')?.value?.trim() || '0.8 KB',
                type: 'FLAG',
                content: document.getElementById('edit-ch-hiddenfile3-content')?.value || ''
              }
            ];
          }

          await window.CYBERTRIX_DB.challenges.update(chId, updates);
        } catch (e) {
          console.warn("Auto-sync hidden vault error:", e);
        }
      }, 300);
    }

    let adminHvAsciiRange = 'all';

    function populateAdminHvAsciiTable(filterQuery = '') {
      const tbody = document.getElementById('admin-hv-ascii-tbody');
      if (!tbody) return;

      const asciiData = getAdminAsciiData();
      const searchInp = document.getElementById('admin-hv-ascii-search');
      const q = (filterQuery !== undefined ? filterQuery : (searchInp ? searchInp.value : '')).trim().toLowerCase();

      const filtered = asciiData.filter(item => {
        // Range filter
        if (adminHvAsciiRange === 'control' && !(item.dec >= 0 && item.dec <= 31)) return false;
        if (adminHvAsciiRange === 'printable' && !(item.dec >= 32 && item.dec <= 127)) return false;
        if (adminHvAsciiRange === 'extended' && !(item.dec >= 128 && item.dec <= 255)) return false;

        // Query filter
        if (!q) return true;
        return String(item.dec).includes(q) ||
          String(item.oct).toLowerCase().includes(q) ||
          String(item.hex).toLowerCase().includes(q) ||
          String(item.bin).includes(q) ||
          String(item.symbol).toLowerCase().includes(q) ||
          String(item.desc || '').toLowerCase().includes(q);
      });

      tbody.innerHTML = filtered.map(item => `
        <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
          <td style="padding: 4px 6px; color: var(--green); font-weight: 700; font-size: 0.85rem;">${item.hex}</td>
          <td style="padding: 4px 6px; color: var(--cyan); font-weight: 700;">${item.dec}</td>
          <td style="padding: 4px 6px; color: var(--text-muted);">${item.oct}</td>
          <td style="padding: 4px 6px; color: rgba(0,243,255,0.7); font-size: 0.65rem;">${item.bin}</td>
          <td style="padding: 4px 6px; color: #fff; font-weight: 700;">
            ${item.dec < 32 || item.dec === 127 ? `<span class="ascii-ctrl-char">${escapeHTML(item.symbol)}</span>` : `<span style="color: var(--cyan);">${escapeHTML(item.symbol)}</span>`}
          </td>
          <td style="padding: 4px 6px; text-align: left; color: var(--text-secondary); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(item.desc || '')}</td>
          <td style="padding: 4px 6px;">
            <button type="button" class="btn-cyber btn-cyber-sm btn-admin-append-ascii" data-hex="${item.hex}" data-dec="${item.dec}" style="padding: 2px 6px; font-size: 0.62rem; color: var(--green); border-color: rgba(0,255,157,0.4); cursor: pointer;">
              + USE
            </button>
          </td>
        </tr>
      `).join('');

      // Attach click to [+ USE] buttons (appends HEX)
      tbody.querySelectorAll('.btn-admin-append-ascii').forEach(btn => {
        btn.addEventListener('click', () => {
          const hex = btn.getAttribute('data-hex');
          const cipherInput = document.getElementById('edit-ch-ciphersequence');
          if (cipherInput) {
            const current = cipherInput.value.trim();
            cipherInput.value = current ? `${current} ${hex}` : `${hex}`;
            updateHvPreview('cipher');
          }
        });
      });
    }

    function initAdminHvAsciiTableEvents() {
      const searchInp = document.getElementById('admin-hv-ascii-search');
      if (searchInp && !searchInp._hasAdminAsciiListener) {
        searchInp._hasAdminAsciiListener = true;
        searchInp.addEventListener('input', (e) => {
          populateAdminHvAsciiTable(e.target.value);
        });
      }

      const rangeBtns = document.querySelectorAll('.admin-hv-range-btn');
      if (rangeBtns) {
        rangeBtns.forEach(btn => {
          if (!btn._hasAdminRangeListener) {
            btn._hasAdminRangeListener = true;
            btn.addEventListener('click', () => {
              rangeBtns.forEach(b => {
                b.classList.remove('active');
                b.style.background = 'rgba(0,243,255,0.05)';
                b.style.color = 'var(--text-muted)';
              });
              btn.classList.add('active');
              btn.style.background = 'rgba(0,243,255,0.2)';
              btn.style.color = 'var(--cyan)';
              adminHvAsciiRange = btn.getAttribute('data-range') || 'all';
              populateAdminHvAsciiTable();
            });
          }
        });
      }

      const toggleBtn = document.getElementById('btn-admin-toggle-ascii-table');
      const tableContainer = document.getElementById('admin-hv-ascii-table-container');
      if (toggleBtn && tableContainer && !toggleBtn._hasToggleListener) {
        toggleBtn._hasToggleListener = true;
        toggleBtn.addEventListener('click', () => {
          if (tableContainer.style.display === 'none') {
            tableContainer.style.display = 'block';
            populateAdminHvAsciiTable();
          } else {
            tableContainer.style.display = 'none';
          }
        });
      }
    }

    function updateHvPreview(source) {
      const hvKeywordInput = document.getElementById('edit-ch-vaultkeyword');
      const hvCipherInput = document.getElementById('edit-ch-ciphersequence');
      const hvFlagInput = document.getElementById('edit-ch-flag');
      const hvChipsContainer = document.getElementById('admin-vault-chips-preview');
      const hvWordPreview = document.getElementById('admin-vault-word-preview');
      const hvByteCount = document.getElementById('admin-vault-bytecount');

      if (!hvKeywordInput || !hvCipherInput) return;

      if (source === 'keyword') {
        const word = hvKeywordInput.value.trim().toUpperCase();
        const cipher = stringToHexStream(word);
        hvCipherInput.value = cipher;
        if (hvFlagInput && (!hvFlagInput.value.trim() || hvFlagInput.value.includes('CYBERTRIX{'))) {
          hvFlagInput.value = word ? `CYBERTRIX{${word}}` : 'CYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}';
        }
      } else if (source === 'cipher') {
        const cipher = hvCipherInput.value.trim();
        const word = hexStreamToString(cipher).toUpperCase();
        if (word) {
          hvKeywordInput.value = word;
          if (hvFlagInput && (!hvFlagInput.value.trim() || hvFlagInput.value.includes('CYBERTRIX{'))) {
            hvFlagInput.value = `CYBERTRIX{${word}}`;
          }
        }
      }

      const currentWord = hvKeywordInput.value.trim().toUpperCase() || 'VAULT';
      const currentCipher = hvCipherInput.value.trim() || stringToHexStream(currentWord);
      const bytes = currentCipher.split(/\s+/).filter(Boolean);
      const asciiData = getAdminAsciiData();

      if (hvByteCount) {
        hvByteCount.textContent = `${bytes.length} BYTES (HEX)`;
      }
      if (hvWordPreview) {
        hvWordPreview.textContent = `DECODES TO: ${currentWord} // HEX ASCII-CODE.COM MAPPED`;
      }
      if (hvChipsContainer) {
        hvChipsContainer.innerHTML = bytes.map((b, i) => {
          const clean = b.trim().toUpperCase().replace(/^0X/, '');
          let found = asciiData.find(item => item.hex.toUpperCase() === clean);
          if (!found) {
            const decVal = parseInt(clean, 10);
            if (!isNaN(decVal)) found = asciiData.find(item => item.dec === decVal);
          }
          const hex = found ? found.hex : clean;
          const dec = found ? found.dec : parseInt(clean, 16);
          const sym = found ? found.symbol : (!isNaN(dec) ? String.fromCharCode(dec) : '?');
          return `
            <div style="background: rgba(0, 243, 255, 0.08); border: 1px solid rgba(0, 255, 157, 0.35); border-radius: 4px; padding: 4px 8px; font-family: var(--font-code); font-size: 0.72rem; text-align: center; min-width: 52px;">
              <div style="font-size: 0.6rem; color: var(--text-muted); letter-spacing: 0.5px;">BYTE ${i + 1}</div>
              <div style="color: var(--green); font-weight: 700; font-size: 0.95rem;">${escapeHTML(hex)}</div>
              <div style="font-size: 0.62rem; color: var(--cyan); font-weight: 700;">DEC: ${escapeHTML(String(dec))}</div>
              <div style="font-size: 0.72rem; color: #ffffff; font-weight: 700; margin-top: 2px;">'${escapeHTML(sym)}'</div>
            </div>
          `;
        }).join('');
      }

      initAdminHvAsciiTableEvents();
      populateAdminHvAsciiTable();

      if (source !== 'sync') {
        triggerHvAutoSync();
      }
    }

    const hvKeywordInput = document.getElementById('edit-ch-vaultkeyword');
    const hvCipherInput = document.getElementById('edit-ch-ciphersequence');
    const btnHvSync = document.getElementById('btn-hv-preview-sync');

    if (hvKeywordInput) {
      hvKeywordInput.addEventListener('input', () => updateHvPreview('keyword'));
    }
    if (hvCipherInput) {
      hvCipherInput.addEventListener('input', () => updateHvPreview('cipher'));
    }
    if (btnHvSync) {
      btnHvSync.addEventListener('click', () => updateHvPreview('keyword'));
    }

    ['fakefile1', 'fakefile2', 'fakefile3', 'hiddenfile1', 'hiddenfile2', 'hiddenfile3'].forEach(prefix => {
      ['name', 'size', 'content'].forEach(field => {
        const inp = document.getElementById(`edit-ch-${prefix}-${field}`);
        if (inp) {
          inp.addEventListener('input', triggerHvAutoSync);
        }
      });
    });
    const hvDirInput = document.getElementById('edit-ch-hiddendir');
    if (hvDirInput) hvDirInput.addEventListener('input', triggerHvAutoSync);

    // Helper to compress an image using HTML5 Canvas to prevent QuotaExceededError
    function compressImageFile(file, maxWidth = 1000, maxHeight = 1000, quality = 0.82) {
      return new Promise((resolve, reject) => {
        if (!file) return reject(new Error("No file selected."));
        if (file.type === 'image/svg+xml') {
          const reader = new FileReader();
          reader.onload = (re) => resolve(re.target.result);
          reader.onerror = () => reject(new Error("Failed to read SVG file."));
          reader.readAsDataURL(file);
          return;
        }
        const reader = new FileReader();
        reader.onload = (re) => {
          const img = new Image();
          img.onload = () => {
            let width = img.width;
            let height = img.height;
            if (width > maxWidth || height > maxHeight) {
              if (width / height > maxWidth / maxHeight) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              } else {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(dataUrl);
          };
          img.onerror = () => reject(new Error("Failed to parse image data."));
          img.src = re.target.result;
        };
        reader.onerror = () => reject(new Error("Failed to read file."));
        reader.readAsDataURL(file);
      });
    }

    function stringToHexStream(str) {
      return Array.from(str).map(c => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join(' ');
    }

    function hexStreamToString(hex) {
      if (!hex) return '';
      return hex.split(/\s+/).filter(Boolean).map(h => {
        const clean = h.trim().toUpperCase().replace(/^0X/, '');
        if (/^[0-9]+$/.test(clean) && !/^[0-9A-Fa-f]{2}$/.test(clean)) {
          const dec = parseInt(clean, 10);
          return (!isNaN(dec) && dec >= 32 && dec <= 255) ? String.fromCharCode(dec) : '';
        }
        const code = parseInt(clean, 16);
        return (!isNaN(code) && code >= 32 && code <= 255) ? String.fromCharCode(code) : '';
      }).join('');
    }

    // Keep active subtasks in state for dynamic addition/deletion
    let currentAdminSubtasks = [];
    let currentAdminSubtaskSecrets = {};
    let currentAdminSubtaskType = 'mirror-keyboard';

    function readSubtasksFromDOM() {
      const container = document.getElementById('admin-subtasks-list-container');
      if (!container) return currentAdminSubtasks;
      const cards = container.querySelectorAll('.admin-subtask-card');
      const updated = [];
      cards.forEach((card, idx) => {
        const stId = card.getAttribute('data-subtask-id') || `task_${idx + 1}`;
        const title = (card.querySelector('.subtask-edit-title')?.value || `Sub-task ${idx + 1}`).trim();
        const order = parseInt(card.querySelector('.subtask-edit-order')?.value, 10) || (idx + 1);
        const points = parseInt(card.querySelector('.subtask-edit-points')?.value, 10) || 100;
        const status = card.querySelector('.subtask-edit-status')?.value || 'ACTIVE';
        const desc = (card.querySelector('.subtask-edit-desc')?.value || '').trim();
        const question = (card.querySelector('.subtask-edit-question')?.value || '').trim();

        const stObj = {
          id: stId,
          title: title,
          order: order,
          points: points,
          question: question || desc,
          description: question || desc,
          instructions: desc,
          status: status,
          enabled: status === 'ACTIVE'
        };

        if (currentAdminSubtaskType === 'mirror-keyboard') {
          const mirror = (card.querySelector('.subtask-edit-mirror')?.value || '').trim();
          const target = (card.querySelector('.subtask-edit-target')?.value || (mirror ? generateMirroredSentence(mirror) : 'PYTHON')).trim();
          const finalMirror = mirror || generateMirroredSentence(target);
          const flag = (card.querySelector('.subtask-edit-flag')?.value || `CYBERTRIX{${target}}`).trim();
          stObj.mirrorWord = finalMirror;
          stObj.targetSentence = target;
          stObj.targetWord = target;
          stObj.answer = target;
          stObj.flag = flag;
          currentAdminSubtaskSecrets[stId] = {
            question: question || desc,
            mirrorWord: finalMirror,
            targetSentence: target,
            targetWord: target,
            answer: target,
            flag: flag,
            aliases: [target, target.toUpperCase(), target.toLowerCase(), flag, flag.toUpperCase(), `CYBERTRIX{${target}}`, `CYBERTRIX{${target.toUpperCase()}}`, finalMirror, finalMirror.toUpperCase()]
          };
        } else if (currentAdminSubtaskType === 'ascii-hunt') {
          const asciiVal = (card.querySelector('.subtask-edit-ascii')?.value || '43 59 42 45 52 21').trim();
          const answer = (card.querySelector('.subtask-edit-answer')?.value || hexStreamToString(asciiVal) || 'CYBER!').trim();
          const flag = (card.querySelector('.subtask-edit-flag')?.value || `CYBERTRIX{${answer}}`).trim();
          stObj.asciiHex = asciiVal;
          stObj.asciiValues = asciiVal;
          stObj.targetWord = answer;
          stObj.answer = answer;
          stObj.flag = flag;
          currentAdminSubtaskSecrets[stId] = {
            asciiHex: asciiVal,
            asciiValues: asciiVal,
            targetWord: answer,
            answer: answer,
            flag: flag,
            aliases: [
              answer,
              answer.toUpperCase(),
              flag,
              flag.toUpperCase(),
              `CYBERTRIX{${answer}}`,
              `CYBERTRIX{${answer.toUpperCase()}}`
            ]
          };
        }

        updated.push(stObj);
      });
      currentAdminSubtasks = updated;
      return updated;
    }

    function renderAdminSubtasksEditor(type, existingSubtasks, subtaskSecrets = {}) {
      currentAdminSubtaskType = type;
      if (existingSubtasks) {
        currentAdminSubtasks = Array.isArray(existingSubtasks) && existingSubtasks.length > 0
          ? JSON.parse(JSON.stringify(existingSubtasks))
          : [];
      }
      if (subtaskSecrets) {
        currentAdminSubtaskSecrets = JSON.parse(JSON.stringify(subtaskSecrets || {}));
      }

      const container = document.getElementById('admin-subtasks-list-container');
      const summaryBadge = document.getElementById('admin-subtasks-summary-badge');
      if (!container) return;

      if (currentAdminSubtasks.length === 0) {
        if (type === 'mirror-keyboard') {
          currentAdminSubtasks = [
            { id: "task_1", title: "Sub-task 1", order: 1, points: 100, mirrorWord: "QTYFWX", targetSentence: "PYTHON", targetWord: "PYTHON", question: "Left is Right, Right is left. Type what you see, not what you mean.", description: "Left is Right, Right is left. Type what you see, not what you mean." },
            { id: "task_2", title: "Sub-task 2", order: 2, points: 100, mirrorWord: "BEQFIU", targetSentence: "CIPHER", targetWord: "CIPHER", description: "Task 2 of 3: Decipher the mirror word BEQFIU to find the normal word." },
            { id: "task_3", title: "Sub-task 3", order: 3, points: 100, mirrorWord: "XIYOWUS", targetSentence: "NETWORK", targetWord: "NETWORK", description: "Task 3 of 3: Decipher the mirror word XIYOWUS to find the normal word." }
          ];
        } else if (type === 'ascii-hunt') {
          currentAdminSubtasks = [
            { id: "task_1", title: "Sub-task 1", order: 1, points: 200, asciiHex: "43 59 42 45 52 21", asciiValues: "43 59 42 45 52 21", targetWord: "CYBER!", description: "Task 1 of 2: Decode the ASCII hexadecimal bytes into their plaintext character representation." },
            { id: "task_2", title: "Sub-task 2", order: 2, points: 200, asciiHex: "53 33 63 75 72 31 74 79 23", asciiValues: "53 33 63 75 72 31 74 79 23", targetWord: "S3cur1ty#", description: "Task 2 of 2: A longer, more complex encrypted telemetry stream has been captured. Decode into plaintext." }
          ];
        }
      }

      function updatePointsSum() {
        const pointInputs = container.querySelectorAll('.subtask-edit-points');
        let total = 0;
        pointInputs.forEach(inp => {
          total += parseInt(inp.value, 10) || 0;
        });
        const ptsField = document.getElementById('edit-ch-points');
        if (ptsField && (type === 'mirror-keyboard' || type === 'ascii-hunt')) {
          ptsField.value = total;
        }
        if (summaryBadge) {
          summaryBadge.textContent = `${currentAdminSubtasks.length} SUB-TASKS (${total} PTS TOTAL)`;
        }
      }

      function renderCardsHTML() {
        const isMk = (currentAdminSubtaskType === 'mirror-keyboard');

        container.innerHTML = currentAdminSubtasks.map((st, idx) => {
          const stSecret = (currentAdminSubtaskSecrets && currentAdminSubtaskSecrets[st.id]) || {};
          const stTarget = st.targetSentence || st.targetWord || stSecret.targetSentence || stSecret.targetWord || (idx === 0 ? 'PYTHON' : (idx === 1 ? 'CIPHER' : 'NETWORK'));
          const stMirror = st.mirrorWord || stSecret.mirrorWord || generateMirroredSentence(stTarget);
          const stAscii = st.asciiHex || st.asciiValues || stSecret.asciiHex || stSecret.asciiValues || (idx === 0 ? '43 59 42 45 52 21' : '53 33 63 75 72 31 74 79 23');
          const stAnswer = st.answer || st.targetWord || stSecret.answer || stSecret.targetWord || (stAscii ? hexStreamToString(stAscii) : '') || (idx === 0 ? 'CYBER!' : 'S3cur1ty#');
          const defaultFlag = isMk ? `CYBERTRIX{${stTarget}}` : `CYBERTRIX{${stAnswer}}`;
          const stFlag = stSecret.flag || st.flag || defaultFlag;
          const stStatus = st.status || (st.enabled === false ? 'INACTIVE' : 'ACTIVE');

          return `
            <div class="admin-subtask-card" data-subtask-id="${escapeHTML(st.id)}" style="background: rgba(10, 16, 32, 0.85); border: 1px solid rgba(0, 243, 255, 0.25); border-radius: 6px; padding: 0.85rem; margin-bottom: 0.75rem; position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 0.4rem; flex-wrap: wrap; gap: 0.4rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span class="cyber-badge badge-cyan" style="font-family: var(--font-cyber);">SUB-TASK #${idx + 1}</span>
                  <span style="font-family: var(--font-code); font-size: 0.75rem; color: var(--text-muted);">${escapeHTML(st.id)}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.6rem;">
                  <label style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">Order:</label>
                  <input type="number" class="form-control form-control-sm subtask-edit-order" value="${st.order || (idx + 1)}" min="1" style="width: 55px; font-size: 0.8rem; padding: 0.2rem 0.4rem;">
                  <label style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">Status:</label>
                  <select class="form-control form-control-sm subtask-edit-status" style="width: 95px; font-size: 0.8rem; padding: 0.2rem 0.4rem;">
                    <option value="ACTIVE" ${stStatus === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option>
                    <option value="INACTIVE" ${stStatus === 'INACTIVE' ? 'selected' : ''}>INACTIVE</option>
                  </select>
                  ${currentAdminSubtasks.length > 1 ? `
                    <button type="button" class="btn-remove-subtask" data-index="${idx}" style="background: rgba(239, 68, 68, 0.15); border: 1px solid var(--red-neon); color: var(--red-neon); border-radius: 4px; padding: 0.18rem 0.5rem; cursor: pointer; font-size: 0.72rem;" title="Remove this sub-task">✕</button>
                  ` : ''}
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 0.75rem; margin-bottom: 0.5rem;">
                <div>
                  <label style="font-size: 0.72rem; color: var(--cyan); font-weight: 700;">Sub-Task Title</label>
                  <input type="text" class="form-control form-control-sm subtask-edit-title" value="${escapeHTML(st.title || `Sub-task ${idx + 1}`)}" placeholder="e.g. Sub-task ${idx + 1}" required>
                </div>
                <div>
                  <label style="font-size: 0.72rem; color: var(--green); font-weight: 700;">Points</label>
                  <input type="number" class="form-control form-control-sm subtask-edit-points" value="${st.points || (isMk ? 100 : 200)}" min="10" step="10" required>
                </div>
              </div>

              ${isMk ? `
                <div style="margin-bottom: 0.65rem;">
                  <label style="font-size: 0.72rem; color: #ffffff; font-weight: 700;">🎯 Sub-Task Question / Prompt (Displayed to Player)</label>
                  <input type="text" class="form-control form-control-sm subtask-edit-question" value="${escapeHTML(st.question || st.description || '')}" placeholder="e.g. Left is Right, Right is left. Type what you see, not what you mean.">
                  <small style="font-size: 0.68rem; color: var(--text-muted);">Question / objective prompt displayed to player for this sub-task</small>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.5rem;">
                  <div>
                    <label style="font-size: 0.72rem; color: var(--cyan); font-weight: 700;">✓ Target Word (Player Types)</label>
                    <input type="text" class="form-control form-control-sm subtask-edit-target" value="${escapeHTML(stTarget)}" placeholder="e.g. PYTHON" style="font-family: var(--font-code); letter-spacing: 1px;" required>
                    <small style="font-size: 0.68rem; color: var(--text-muted);">Word that player must produce</small>
                  </div>
                  <div>
                    <label style="font-size: 0.72rem; color: var(--green); font-weight: 700;">🚩 Flag (Normal Answer)</label>
                    <input type="text" class="form-control form-control-sm subtask-edit-flag" value="${escapeHTML(stFlag)}" placeholder="CYBERTRIX{...}" style="font-family: var(--font-code);" required>
                    <small style="font-size: 0.68rem; color: var(--text-muted);">Flag = Normal Answer</small>
                  </div>
                </div>
              ` : `
                <div style="display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 0.75rem; margin-bottom: 0.5rem;">
                  <div>
                    <label style="font-size: 0.72rem; color: var(--cyan); font-weight: 700;">Hex Byte Stream</label>
                    <input type="text" class="form-control form-control-sm subtask-edit-ascii" value="${escapeHTML(stAscii)}" placeholder="e.g. 43 59 42 45 52 21" style="font-family: var(--font-code);" required>
                  </div>
                  <div>
                    <label style="font-size: 0.72rem; color: var(--cyan); font-weight: 700;">Decoded Plaintext</label>
                    <input type="text" class="form-control form-control-sm subtask-edit-answer" value="${escapeHTML(stAnswer)}" placeholder="e.g. CYBER!" style="font-family: var(--font-code);" required>
                  </div>
                  <div>
                    <label style="font-size: 0.72rem; color: var(--green); font-weight: 700;">Secret Flag</label>
                    <input type="text" class="form-control form-control-sm subtask-edit-flag" value="${escapeHTML(stFlag)}" placeholder="CYBERTRIX{...}" style="font-family: var(--font-code);" required>
                  </div>
                </div>
              `}

              <div>
                <label style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">Description / Instructions</label>
                <textarea class="form-control form-control-sm subtask-edit-desc" rows="1" placeholder="Task instructions displayed to player...">${escapeHTML(st.description || st.instructions || '')}</textarea>
              </div>
            </div>
          `;
        }).join('');

        // Wire dynamic event handlers on rendered cards
        container.querySelectorAll('.admin-subtask-card').forEach((card, cardIdx) => {
          const pointsInput = card.querySelector('.subtask-edit-points');
          if (pointsInput) pointsInput.addEventListener('input', updatePointsSum);

          if (isMk) {
            const qInput = card.querySelector('.subtask-edit-question');
            const targetInput = card.querySelector('.subtask-edit-target');
            const flagInput = card.querySelector('.subtask-edit-flag');

            if (targetInput && flagInput) {
              targetInput.addEventListener('input', (e) => {
                const normalVal = e.target.value.trim();
                flagInput.value = `CYBERTRIX{${normalVal}}`;
                if (qInput && (!qInput.value.trim() || qInput.value.includes('mirror word') || qInput.value.includes('target programming language'))) {
                  qInput.value = cardIdx === 0 ? "Left is Right, Right is left. Type what you see, not what you mean." : `Type the target word ${normalVal} using the reciprocal mirror keyboard.`;
                }
                if (cardIdx === 0) {
                  const topTarget = document.getElementById('edit-mk-targetsentence');
                  const topFlag = document.getElementById('edit-mk-flag');
                  if (topTarget) topTarget.value = normalVal;
                  if (topFlag) topFlag.value = `CYBERTRIX{${normalVal}}`;
                  const previewEl = document.getElementById('admin-mk-preview-text');
                  const previewFlagEl = document.getElementById('admin-mk-preview-flag');
                  if (previewEl) previewEl.textContent = normalVal;
                  if (previewFlagEl) previewFlagEl.textContent = `CYBERTRIX{${normalVal}}`;
                }
                triggerMkAutoSync();
              });

              flagInput.addEventListener('input', (e) => {
                if (cardIdx === 0) {
                  const topFlag = document.getElementById('edit-mk-flag');
                  if (topFlag) topFlag.value = e.target.value;
                  const previewFlag = document.getElementById('admin-mk-preview-flag');
                  if (previewFlag) previewFlag.textContent = e.target.value;
                }
                triggerMkAutoSync();
              });
            }

            if (qInput) {
              qInput.addEventListener('input', (e) => {
                if (cardIdx === 0) {
                  const topQ = document.getElementById('edit-mk-question');
                  if (topQ) topQ.value = e.target.value;
                }
                triggerMkAutoSync();
              });
            }

            const descInput = card.querySelector('.subtask-edit-desc');
            if (descInput) {
              descInput.addEventListener('input', () => {
                triggerMkAutoSync();
              });
            }

            const titleInput = card.querySelector('.subtask-edit-title');
            if (titleInput) {
              titleInput.addEventListener('input', () => {
                triggerMkAutoSync();
              });
            }
          } else {
            const asciiInput = card.querySelector('.subtask-edit-ascii');
            const answerInput = card.querySelector('.subtask-edit-answer');
            const flagInput = card.querySelector('.subtask-edit-flag');

            if (answerInput && asciiInput && flagInput) {
              answerInput.addEventListener('input', (e) => {
                const text = e.target.value;
                asciiInput.value = stringToHexStream(text);
                flagInput.value = `CYBERTRIX{${text.trim()}}`;
              });
              asciiInput.addEventListener('input', (e) => {
                const hex = e.target.value.trim();
                const decoded = hexStreamToString(hex);
                if (decoded) {
                  answerInput.value = decoded;
                  flagInput.value = `CYBERTRIX{${decoded}}`;
                }
              });
            }
          }
        });

        // Wire remove buttons
        container.querySelectorAll('.btn-remove-subtask').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            readSubtasksFromDOM();
            if (currentAdminSubtasks.length > 1) {
              currentAdminSubtasks.splice(idx, 1);
              currentAdminSubtasks.forEach((s, i) => { s.order = i + 1; });
              renderCardsHTML();
            }
          });
        });

        updatePointsSum();
      }

      renderCardsHTML();
    }

    // Add Subtask button handler
    const btnAddSubtask = document.getElementById('btn-admin-add-subtask');
    if (btnAddSubtask) {
      btnAddSubtask.addEventListener('click', () => {
        readSubtasksFromDOM();
        const nextIdx = currentAdminSubtasks.length + 1;
        const newId = `task_${Date.now()}`;
        if (currentAdminSubtaskType === 'mirror-keyboard') {
          currentAdminSubtasks.push({
            id: newId,
            title: `Sub-task ${nextIdx}`,
            order: nextIdx,
            points: 100,
            targetSentence: `New Target Payload ${nextIdx}`,
            targetWord: `New Target Payload ${nextIdx}`,
            description: `Task ${nextIdx}: Decipher the reciprocal keystroke matrix to type the target sentence.`
          });
        } else {
          currentAdminSubtasks.push({
            id: newId,
            title: `Sub-task ${nextIdx}`,
            order: nextIdx,
            points: 200,
            asciiHex: stringToHexStream(`TARGET${nextIdx}`),
            asciiValues: stringToHexStream(`TARGET${nextIdx}`),
            targetWord: `TARGET${nextIdx}`,
            answer: `TARGET${nextIdx}`,
            flag: `CYBERTRIX{TARGET${nextIdx}}`,
            description: `Task ${nextIdx}: Decode the hexadecimal telemetry stream into plaintext.`
          });
        }
        renderAdminSubtasksEditor(currentAdminSubtaskType, currentAdminSubtasks, currentAdminSubtaskSecrets);
      });
    }

    // Logo upload handler for Hidden Vault
    const logoFileInput = document.getElementById('edit-ch-logofile');
    const logoUrlInput = document.getElementById('edit-ch-logourl');
    if (logoFileInput) {
      logoFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          try {
            const compressed = await compressImageFile(file, 400, 400, 0.85);
            if (logoUrlInput) logoUrlInput.value = compressed;
            window.showCyberToast("Logo asset processed.", "success");
          } catch (err) {
            console.error("Logo upload error:", err);
            window.showCyberToast("Failed to process logo: " + err.message, "error");
          }
        }
      });
    }

    // Image upload and preview handlers for Metadata Ghost (Requirement 4)
    const imageFileInput = document.getElementById('edit-ch-imagefile');
    const imageUrlInput = document.getElementById('edit-ch-imageurl');
    const imagePreview = document.getElementById('edit-ch-image-preview');
    const imageUploadStatus = document.getElementById('edit-ch-image-upload-status');

    if (imageFileInput) {
      imageFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          try {
            if (imageUploadStatus) {
              imageUploadStatus.style.display = 'block';
              imageUploadStatus.style.color = 'var(--cyan)';
              imageUploadStatus.textContent = "⏳ Optimizing image for instant public synchronization...";
            }
            window.showCyberToast("Optimizing image...", "info");
            const compressedDataUrl = await compressImageFile(file, 1000, 1000, 0.82);
            if (imageUrlInput) imageUrlInput.value = compressedDataUrl;
            if (imagePreview) imagePreview.src = compressedDataUrl;

            const sizeKb = Math.round((compressedDataUrl.length * 3 / 4) / 1024);
            if (imageUploadStatus) {
              imageUploadStatus.style.display = 'block';
              imageUploadStatus.style.color = 'var(--green)';
              imageUploadStatus.textContent = `✓ IMAGE READY (${sizeKb} KB) — Click [SAVE CHALLENGE] to deploy live!`;
            }
            window.showCyberToast(`Image ready (${sizeKb} KB). Click Save to deploy to Public Arena.`, "success");
          } catch (err) {
            console.error("Image upload error:", err);
            if (imageUploadStatus) {
              imageUploadStatus.style.display = 'block';
              imageUploadStatus.style.color = 'var(--red-neon)';
              imageUploadStatus.textContent = `✗ Upload error: ${err.message}`;
            }
            window.showCyberToast("Failed to process image: " + err.message, "error");
          }
        }
      });
    }

    if (imageUrlInput) {
      imageUrlInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (imagePreview) {
          imagePreview.src = val ? (val.startsWith('../') || val.startsWith('http') || val.startsWith('data:') ? val : '../' + val) : '../assets/metadata-ghost-01.png';
        }
        if (imageUploadStatus) {
          imageUploadStatus.style.display = val ? 'block' : 'none';
          imageUploadStatus.style.color = 'var(--cyan)';
          imageUploadStatus.textContent = val ? `Image URL set. Click [SAVE CHALLENGE] to update public site.` : '';
        }
      });
    }

    // Timer quick preset handler (Requirement 13)
    const timerPresetSelect = document.getElementById('edit-ch-timer-preset');
    if (timerPresetSelect) {
      timerPresetSelect.addEventListener('change', (e) => {
        const totalSec = parseInt(e.target.value, 10);
        if (!isNaN(totalSec)) {
          const m = Math.floor(totalSec / 60);
          const s = totalSec % 60;
          if (document.getElementById('edit-ch-timer-mins')) document.getElementById('edit-ch-timer-mins').value = m;
          if (document.getElementById('edit-ch-timer-secs')) document.getElementById('edit-ch-timer-secs').value = s;
        }
      });
    }

    // Reset attempts button handler (Requirement 3: Reset active attempts for edited challenge)
    const btnResetGhostAttempts = document.getElementById('btn-reset-ghost-attempts');
    if (btnResetGhostAttempts) {
      btnResetGhostAttempts.addEventListener('click', async () => {
        const id = document.getElementById('edit-ch-id').value;
        if (!id) {
          window.showCyberToast("Please select an existing challenge to reset attempts.", "info");
          return;
        }
        if (confirm(`Reset all active attempts for challenge [${id}]? Players will start with the configured timer duration.`)) {
          try {
            await window.CYBERTRIX_DB.attempts.resetAttempts(id);
            window.showCyberToast(`All active attempts for challenge [${id}] have been reset.`, "success");
          } catch (err) {
            window.showCyberToast(err.message, "error");
          }
        }
      });
    }

    const typeSelect = document.getElementById('edit-ch-type');
    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => updateTypeFields(e.target.value));
    }

    async function loadChallenges() {
      const all = await window.CYBERTRIX_DB.challenges.getAll(true);
      // Filter out subtask pseudo-challenges so admin table manages parent challenges
      challenges = all.filter(c => !/^(mirror-keyboard|ascii-hunt)-\d+$/.test(c.id));
      render();
    }

    function render() {
      challenges.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));

      tbody.innerHTML = challenges.map((c, idx) => {
        let statusClass = 'status-active';
        const isGloballyLocked = !!(c.isLocked || c.adminLocked || c.status === 'LOCKED');
        if (isGloballyLocked) statusClass = 'status-locked';
        else if (c.status === 'HIDDEN') statusClass = 'status-hidden';

        const isFirst = idx === 0;
        const isLast = idx === challenges.length - 1;

        return `
          <tr>
            <td style="font-weight: 800; color: var(--cyan); text-align: center; white-space: nowrap;">
              <div class="order-control-cell" style="display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
                <button type="button" class="btn-order-arrow ${isFirst ? 'disabled' : ''}" title="Move Up" onclick="window.moveChallengeOrder('${c.id}', -1)" ${isFirst ? 'disabled' : ''}>▲</button>
                <span class="order-num" style="min-width: 24px; text-align: center;">#${c.order || (idx + 1)}</span>
                <button type="button" class="btn-order-arrow ${isLast ? 'disabled' : ''}" title="Move Down" onclick="window.moveChallengeOrder('${c.id}', 1)" ${isLast ? 'disabled' : ''}>▼</button>
              </div>
            </td>
            <td><strong style="color: #fff;">${escapeHTML(c.title)}</strong></td>
            <td><span class="cyber-badge badge-cyan">${escapeHTML(c.type || 'mirror-keyboard')}</span></td>
            <td><span class="cyber-badge badge-purple">${escapeHTML(c.category)}</span></td>
            <td><span class="cyber-badge badge-cyan">${escapeHTML(c.difficulty)}</span></td>
            <td style="font-family: var(--font-cyber); font-weight: 700; color: var(--cyan);">${c.points}</td>
            <td><span class="status-pill ${statusClass}">${isGloballyLocked ? '🔒 LOCKED' : c.status}</span></td>
            <td>
              <div class="table-actions">
                <button class="btn-icon" title="Move Up" onclick="window.moveChallengeOrder('${c.id}', -1)" ${isFirst ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>▲</button>
                <button class="btn-icon" title="Move Down" onclick="window.moveChallengeOrder('${c.id}', 1)" ${isLast ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>▼</button>
                <button class="btn-icon" title="${isGloballyLocked ? 'Unlock Challenge (Global Lock Active)' : 'Lock Challenge (Global Lock)'}" onclick="window.adminToggleChallengeLock('${c.id}', ${!isGloballyLocked})" style="color: ${isGloballyLocked ? 'var(--red-neon)' : 'var(--cyan)'}; font-size: 0.95rem;">${isGloballyLocked ? '🔒' : '🔓'}</button>
                <button class="btn-icon" title="Edit" onclick="window.editChallenge('${c.id}')">✎</button>
                <button class="btn-icon danger" title="Delete" onclick="window.deleteChallenge('${c.id}')">🗑</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    window.adminToggleChallengeLock = async function (id, shouldLock) {
      try {
        if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges && window.CYBERTRIX_DB.challenges.toggleLock) {
          await window.CYBERTRIX_DB.challenges.toggleLock(id, shouldLock);
          if (window.cyberSound) window.cyberSound.playClick();
          await loadChallenges();
          if (window.showCyberToast) {
            window.showCyberToast(
              `Challenge ${shouldLock ? 'LOCKED' : 'UNLOCKED'} globally for all players.`,
              shouldLock ? "warning" : "success"
            );
          }
        }
      } catch (err) {
        console.error("Lock toggle error:", err);
        if (window.showCyberToast) {
          window.showCyberToast("Failed to toggle challenge lock: " + err.message, "error");
        }
      }
    };

    window.moveChallengeOrder = async function (id, direction) {
      try {
        if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges && window.CYBERTRIX_DB.challenges.reorder) {
          await window.CYBERTRIX_DB.challenges.reorder(id, direction);
          if (window.cyberSound) window.cyberSound.playClick();
          await loadChallenges();
          if (window.showCyberToast) {
            window.showCyberToast(`Challenge position shifted ${direction < 0 ? 'UP' : 'DOWN'}.`, "success");
          }
        }
      } catch (err) {
        console.error("Order update error:", err);
        if (window.showCyberToast) {
          window.showCyberToast("Failed to reorder challenges: " + err.message, "error");
        }
      }
    };

    // Modal open for ADD CHALLENGE
    const btnAdd = document.getElementById('btn-open-add-challenge');
    const modal = document.getElementById('challenge-edit-modal');
    const form = document.getElementById('challenge-admin-form');

    if (btnAdd && modal && form) {
      btnAdd.addEventListener('click', () => {
        form.reset();
        document.getElementById('edit-ch-id').value = '';
        if (document.getElementById('edit-ch-order')) {
          document.getElementById('edit-ch-order').value = challenges.length + 1;
        }
        if (typeSelect) {
          typeSelect.value = 'mirror-keyboard';
          updateTypeFields('mirror-keyboard');
          renderAdminSubtasksEditor('mirror-keyboard');
        }
        const targetInput = document.getElementById('edit-ch-targetword');
        if (targetInput) targetInput.value = 'PYTHON';
        if (document.getElementById('edit-ch-asciivalues')) document.getElementById('edit-ch-asciivalues').value = '67 89 66 69 82';
        if (document.getElementById('edit-ch-codesnippet')) {
          document.getElementById('edit-ch-codesnippet').value = 'const a = "CYBER";\nconst b = "SECURITY";\nconst result = a + " " + b;\n\nconsole.log(result);';
        }
        if (document.getElementById('edit-ch-expectedsentence')) {
          document.getElementById('edit-ch-expectedsentence').value = 'CYBER SECURITY';
        }
        if (document.getElementById('edit-ch-hint1')) document.getElementById('edit-ch-hint1').value = '';
        if (document.getElementById('edit-ch-hint2')) document.getElementById('edit-ch-hint2').value = '';
        if (document.getElementById('edit-ch-hint3')) document.getElementById('edit-ch-hint3').value = '';
        if (document.getElementById('edit-ch-flag')) document.getElementById('edit-ch-flag').value = '';
        if (document.getElementById('edit-ch-timer-enabled')) document.getElementById('edit-ch-timer-enabled').value = 'true';
        if (document.getElementById('edit-ch-timer-mins')) document.getElementById('edit-ch-timer-mins').value = 5;
        if (document.getElementById('edit-ch-timer-secs')) document.getElementById('edit-ch-timer-secs').value = 0;
        if (document.getElementById('edit-ch-timer-preset')) document.getElementById('edit-ch-timer-preset').value = '300';
        if (document.getElementById('edit-ch-imageurl')) document.getElementById('edit-ch-imageurl').value = 'assets/metadata-ghost-01.png';
        if (document.getElementById('edit-ch-image-preview')) document.getElementById('edit-ch-image-preview').src = '../assets/metadata-ghost-01.png';
        const stEl = document.getElementById('edit-ch-image-upload-status');
        if (stEl) { stEl.style.display = 'none'; stEl.textContent = ''; }
        if (document.getElementById('edit-ch-evidence-enabled')) document.getElementById('edit-ch-evidence-enabled').value = 'true';
        if (document.getElementById('edit-ch-evidence-name')) document.getElementById('edit-ch-evidence-name').value = 'evidence.txt';
        if (document.getElementById('edit-ch-evidence-size')) document.getElementById('edit-ch-evidence-size').value = '1.8 KB';
        if (document.getElementById('edit-ch-evidence-content')) document.getElementById('edit-ch-evidence-content').value = '';
        updateModalLockUI(false);
        document.getElementById('modal-challenge-heading').textContent = 'ADD NEW CYBER CHALLENGE';
        modal.classList.add('active');
      });
    }

    // Challenge Lock modal helper (Section 6)
    function updateModalLockUI(isLocked) {
      const lockSelect = document.getElementById('edit-ch-islocked');
      const lockBadge = document.getElementById('edit-ch-lock-badge');
      const btnLockModal = document.getElementById('btn-admin-modal-toggle-lock');
      if (lockSelect) lockSelect.value = isLocked ? 'true' : 'false';
      if (lockBadge) {
        lockBadge.textContent = isLocked ? 'LOCKED' : 'UNLOCKED';
        lockBadge.className = isLocked ? 'cyber-badge badge-red' : 'cyber-badge badge-green';
      }
      if (btnLockModal) {
        btnLockModal.textContent = isLocked ? '[ 🔓 UNLOCK CHALLENGE ]' : '[ 🔒 LOCK CHALLENGE ]';
      }
    }

    const btnLockModal = document.getElementById('btn-admin-modal-toggle-lock');
    const lockSelect = document.getElementById('edit-ch-islocked');
    if (btnLockModal && lockSelect) {
      btnLockModal.addEventListener('click', () => {
        const nextLocked = lockSelect.value !== 'true';
        updateModalLockUI(nextLocked);
      });
      lockSelect.addEventListener('change', () => {
        updateModalLockUI(lockSelect.value === 'true');
      });
    }

    // Real-time synchronization between Section 4 and Section 5 evidence.txt fields
    const evContentEl = document.getElementById('edit-ch-evidence-content');
    const hf1ContentEl = document.getElementById('edit-ch-hiddenfile1-content');
    if (evContentEl && hf1ContentEl) {
      evContentEl.addEventListener('input', () => {
        hf1ContentEl.value = evContentEl.value;
      });
      hf1ContentEl.addEventListener('input', () => {
        evContentEl.value = hf1ContentEl.value;
      });
    }

    // Modal Close
    if (modal) {
      modal.querySelectorAll('.modal-close, .btn-modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => modal.classList.remove('active'));
      });
    }

    // Save Challenge Form (Add or Edit) - Requirements 8, 16, 26
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-ch-id').value;
        const type = (document.getElementById('edit-ch-type') ? document.getElementById('edit-ch-type').value : 'mirror-keyboard');
        const orderVal = document.getElementById('edit-ch-order') ? parseInt(document.getElementById('edit-ch-order').value, 10) : 1;
        const targetWordVal = (document.getElementById('edit-ch-targetword') ? document.getElementById('edit-ch-targetword').value : 'PYTHON').trim().toUpperCase();
        const asciiValuesVal = (document.getElementById('edit-ch-asciivalues') ? document.getElementById('edit-ch-asciivalues').value : '67 89 66 69 82').trim();
        const vaultKeywordVal = (document.getElementById('edit-ch-vaultkeyword') ? document.getElementById('edit-ch-vaultkeyword').value : 'CYBERVAULT').trim().toUpperCase();
        const cipherSequenceVal = (document.getElementById('edit-ch-ciphersequence') ? document.getElementById('edit-ch-ciphersequence').value : '56 41 55 4C 54').trim();
        const logoUrlVal = (document.getElementById('edit-ch-logourl') ? document.getElementById('edit-ch-logourl').value : 'assets/logo/logo.svg').trim();
        const logoAnimationVal = (document.getElementById('edit-ch-logoanim') ? document.getElementById('edit-ch-logoanim').value : 'glitch-decrypt');
        const secretFileNameVal = (document.getElementById('edit-ch-secretfilename') ? document.getElementById('edit-ch-secretfilename').value : '/secure/cybertrix_event.dat').trim();
        const secretFileTitleVal = (document.getElementById('edit-ch-secretfiletitle') ? document.getElementById('edit-ch-secretfiletitle').value : 'CYBERTRIX SECURE STORAGE // NODE: SEC-09').trim();
        const secretContentVal = document.getElementById('edit-ch-secretcontent') ? document.getElementById('edit-ch-secretcontent').value : '';
        const successMessageVal = (document.getElementById('edit-ch-successmessage') ? document.getElementById('edit-ch-successmessage').value : 'OPERATION COMPLETE // +250 POINTS AWARDED // STATUS: SOLVED ✓').trim();
        const caseSensitiveVal = document.getElementById('edit-ch-casesensitive') ? document.getElementById('edit-ch-casesensitive').value === 'true' : false;

        // Hidden Vault specific configuration (fake files, hidden files, hidden directory)
        let fakeFilesVal = undefined;
        let hiddenDirectoryVal = undefined;
        let hiddenFilesVal = undefined;

        if (type === 'hidden-vault') {
          fakeFilesVal = [
            {
              name: (document.getElementById('edit-ch-fakefile1-name') ? document.getElementById('edit-ch-fakefile1-name').value : 'readme.txt').trim() || 'readme.txt',
              size: (document.getElementById('edit-ch-fakefile1-size') ? document.getElementById('edit-ch-fakefile1-size').value : '2.4 KB').trim() || '2.4 KB',
              type: 'TEXT',
              content: document.getElementById('edit-ch-fakefile1-content') ? document.getElementById('edit-ch-fakefile1-content').value : ''
            },
            {
              name: (document.getElementById('edit-ch-fakefile2-name') ? document.getElementById('edit-ch-fakefile2-name').value : 'system.log').trim() || 'system.log',
              size: (document.getElementById('edit-ch-fakefile2-size') ? document.getElementById('edit-ch-fakefile2-size').value : '4.8 KB').trim() || '4.8 KB',
              type: 'LOG',
              content: document.getElementById('edit-ch-fakefile2-content') ? document.getElementById('edit-ch-fakefile2-content').value : ''
            },
            {
              name: (document.getElementById('edit-ch-fakefile3-name') ? document.getElementById('edit-ch-fakefile3-name').value : 'notes.txt').trim() || 'notes.txt',
              size: (document.getElementById('edit-ch-fakefile3-size') ? document.getElementById('edit-ch-fakefile3-size').value : '1.2 KB').trim() || '1.2 KB',
              type: 'TEXT',
              content: document.getElementById('edit-ch-fakefile3-content') ? document.getElementById('edit-ch-fakefile3-content').value : ''
            }
          ];

          hiddenDirectoryVal = (document.getElementById('edit-ch-hiddendir') ? document.getElementById('edit-ch-hiddendir').value : '.hidden/').trim() || '.hidden/';

          const evidenceEnabledVal = document.getElementById('edit-ch-evidence-enabled') ? document.getElementById('edit-ch-evidence-enabled').value === 'true' : true;
          const evidenceSizeVal = (document.getElementById('edit-ch-evidence-size') ? document.getElementById('edit-ch-evidence-size').value : (document.getElementById('edit-ch-hiddenfile1-size') ? document.getElementById('edit-ch-hiddenfile1-size').value : '1.8 KB')).trim() || '1.8 KB';
          const evInput1 = document.getElementById('edit-ch-evidence-content') ? document.getElementById('edit-ch-evidence-content').value : '';
          const evInput2 = document.getElementById('edit-ch-hiddenfile1-content') ? document.getElementById('edit-ch-hiddenfile1-content').value : '';
          const evidenceContentVal = document.getElementById('edit-ch-evidence-content') ? document.getElementById('edit-ch-evidence-content').value : evInput2;

          hiddenFilesVal = [
            {
              name: 'evidence.txt',
              size: evidenceSizeVal,
              type: 'FLAG',
              content: evidenceContentVal,
              enabled: evidenceEnabledVal
            },
            {
              name: (document.getElementById('edit-ch-hiddenfile2-name') ? document.getElementById('edit-ch-hiddenfile2-name').value : 'classified.txt').trim() || 'classified.txt',
              size: (document.getElementById('edit-ch-hiddenfile2-size') ? document.getElementById('edit-ch-hiddenfile2-size').value : '2.3 KB').trim() || '2.3 KB',
              type: 'TEXT',
              content: document.getElementById('edit-ch-hiddenfile2-content') ? document.getElementById('edit-ch-hiddenfile2-content').value : ''
            },
            {
              name: (document.getElementById('edit-ch-hiddenfile3-name') ? document.getElementById('edit-ch-hiddenfile3-name').value : 'final_message.txt').trim() || 'final_message.txt',
              size: (document.getElementById('edit-ch-hiddenfile3-size') ? document.getElementById('edit-ch-hiddenfile3-size').value : '0.8 KB').trim() || '0.8 KB',
              type: 'FLAG',
              content: document.getElementById('edit-ch-hiddenfile3-content') ? document.getElementById('edit-ch-hiddenfile3-content').value : ''
            }
          ];
        }

        // Hints for Mirror Keyboard and Hidden Vault
        let hint1Val = '';
        let hint2Val = '';
        let hint3Val = '';
        if (type === 'mirror-keyboard' || type === 'hidden-vault') {
          hint1Val = document.getElementById('edit-ch-hint1') ? document.getElementById('edit-ch-hint1').value.trim() : '';
          hint2Val = document.getElementById('edit-ch-hint2') ? document.getElementById('edit-ch-hint2').value.trim() : '';
          hint3Val = document.getElementById('edit-ch-hint3') ? document.getElementById('edit-ch-hint3').value.trim() : '';
        }

        const imageUrlVal = document.getElementById('edit-ch-imageurl') ? document.getElementById('edit-ch-imageurl').value.trim() : '';
        const hiddenAnswerVal = document.getElementById('edit-ch-hiddenanswer') ? document.getElementById('edit-ch-hiddenanswer').value.trim() : '';
        const timerEnabledVal = document.getElementById('edit-ch-timer-enabled') ? document.getElementById('edit-ch-timer-enabled').value === 'true' : true;
        const tmVal = parseInt(document.getElementById('edit-ch-timer-mins') ? document.getElementById('edit-ch-timer-mins').value : 5, 10) || 0;
        const tsVal = parseInt(document.getElementById('edit-ch-timer-secs') ? document.getElementById('edit-ch-timer-secs').value : 0, 10) || 0;
        const timerSecondsVal = tmVal * 60 + tsVal;

        const isLockedVal = document.getElementById('edit-ch-islocked') ? document.getElementById('edit-ch-islocked').value === 'true' : (document.getElementById('edit-ch-status').value === 'LOCKED');
        const evidenceEnabledVal = (type === 'hidden-vault') ? (document.getElementById('edit-ch-evidence-enabled') ? document.getElementById('edit-ch-evidence-enabled').value === 'true' : true) : true;
        const evInput1b = document.getElementById('edit-ch-evidence-content') ? document.getElementById('edit-ch-evidence-content').value : '';
        const evInput2b = document.getElementById('edit-ch-hiddenfile1-content') ? document.getElementById('edit-ch-hiddenfile1-content').value : '';
        let evidenceContentVal = (type === 'hidden-vault') ? (document.getElementById('edit-ch-evidence-content') ? document.getElementById('edit-ch-evidence-content').value : evInput2b) : '';

        const evidenceFlagInput = document.getElementById('edit-ch-evidence-flag');
        const evidenceFlagVal = (evidenceFlagInput && evidenceFlagInput.value.trim()) || (document.getElementById('edit-ch-flag') ? document.getElementById('edit-ch-flag').value.trim() : '');
        if (type === 'hidden-vault' && evidenceFlagVal) {
          if (!evidenceContentVal || evidenceContentVal.trim() === '' || /^flag\s*:/i.test(evidenceContentVal.trim()) || evidenceContentVal.includes('RESTRICTED ACCESS ARCHIVE') || !evidenceContentVal.includes(evidenceFlagVal)) {
            evidenceContentVal = `flag:${evidenceFlagVal}`;
          } else if (/CYBERTRIX\{[^}]+\}/i.test(evidenceContentVal)) {
            evidenceContentVal = evidenceContentVal.replace(/CYBERTRIX\{[^}]+\}/gi, evidenceFlagVal);
          }
          if (hiddenFilesVal && hiddenFilesVal[0]) {
            hiddenFilesVal[0].content = evidenceContentVal;
          }
        }

        const data = {
          order: orderVal,
          title: document.getElementById('edit-ch-title').value.trim(),
          type: type,
          targetWord: targetWordVal,
          asciiValues: asciiValuesVal,
          vaultPassword: vaultKeywordVal,
          vaultKeyword: vaultKeywordVal,
          cipherSequence: cipherSequenceVal,
          accessCode: cipherSequenceVal,
          eventLogo: logoUrlVal,
          logoUrl: logoUrlVal,
          logoAnimation: logoAnimationVal,
          secretFileName: (type === 'hidden-vault') ? 'evidence.txt' : secretFileNameVal,
          secretFileTitle: (type === 'hidden-vault') ? 'CYBERTRIX SECURE VAULT // evidence.txt' : secretFileTitleVal,
          secretContent: (type === 'hidden-vault') ? evidenceContentVal : secretContentVal,
          evidenceContent: (type === 'hidden-vault') ? evidenceContentVal : undefined,
          evidenceEnabled: evidenceEnabledVal,
          isLocked: isLockedVal,
          adminLocked: isLockedVal,
          successMessage: successMessageVal,
          imageUrl: imageUrlVal || 'assets/metadata-ghost-01.png',
          timerEnabled: timerEnabledVal,
          timerSeconds: timerSecondsVal,
          hiddenAnswer: hiddenAnswerVal,
          caseSensitive: caseSensitiveVal,
          ...(fakeFilesVal ? { fakeFiles: fakeFilesVal } : {}),
          ...(hiddenDirectoryVal ? { hiddenDirectory: hiddenDirectoryVal } : {}),
          ...(hiddenFilesVal ? { hiddenFiles: hiddenFilesVal } : {}),
          category: document.getElementById('edit-ch-category').value,
          difficulty: document.getElementById('edit-ch-difficulty').value,
          points: parseInt(document.getElementById('edit-ch-points').value, 10) || (type === 'hidden-vault' ? 250 : 100),
          description: document.getElementById('edit-ch-desc').value.trim(),
          hint1: hint1Val,
          hint2: hint2Val,
          hint3: hint3Val,
          hint: hint1Val,
          flag: (type === 'hidden-vault' && evidenceFlagVal)
            ? evidenceFlagVal
            : (document.getElementById('edit-ch-flag') ? document.getElementById('edit-ch-flag').value.trim() : ''),
          status: isLockedVal ? 'LOCKED' : document.getElementById('edit-ch-status').value,
          enabled: isLockedVal ? true : (document.getElementById('edit-ch-status').value !== 'HIDDEN')
        };

        // Extract subtasks and subtaskSecrets if editing mirror-keyboard or ascii-hunt
        if (type === 'mirror-keyboard' || type === 'ascii-hunt') {
          const subtaskCards = document.querySelectorAll('.admin-subtask-card');
          if (subtaskCards.length > 0) {
            const subtasksArr = [];
            const subtaskSecObj = {};

            subtaskCards.forEach((card, idx) => {
              const stId = card.getAttribute('data-subtask-id') || `task_${idx + 1}`;
              const stTitle = (card.querySelector('.subtask-edit-title')?.value || `Sub-task ${idx + 1}`).trim();
              const stOrder = parseInt(card.querySelector('.subtask-edit-order')?.value, 10) || (idx + 1);
              const stPts = parseInt(card.querySelector('.subtask-edit-points')?.value, 10) || (type === 'mirror-keyboard' ? 100 : 200);
              const stStatus = card.querySelector('.subtask-edit-status')?.value || 'ACTIVE';
              const stDesc = (card.querySelector('.subtask-edit-desc')?.value || '').trim();
              const stQuestion = (card.querySelector('.subtask-edit-question')?.value || '').trim();

              const stObj = {
                id: stId,
                title: stTitle,
                name: `${data.title || 'Challenge'} — Sub-task ${stOrder}`,
                order: stOrder,
                points: stPts,
                question: stQuestion || stDesc,
                description: stQuestion || stDesc,
                instructions: stDesc,
                status: stStatus,
                enabled: stStatus === 'ACTIVE'
              };

              const secObj = {
                question: stQuestion || stDesc
              };
              if (type === 'mirror-keyboard') {
                const mirror = (card.querySelector('.subtask-edit-mirror')?.value || '').trim();
                const target = (card.querySelector('.subtask-edit-target')?.value || (mirror ? generateMirroredSentence(mirror) : 'PYTHON')).trim();
                const finalMirror = mirror || generateMirroredSentence(target);
                const flag = (card.querySelector('.subtask-edit-flag')?.value || `CYBERTRIX{${target}}`).trim();
                stObj.mirrorWord = finalMirror;
                stObj.targetSentence = target;
                stObj.targetWord = target;
                stObj.answer = target;
                stObj.flag = flag;
                secObj.mirrorWord = finalMirror;
                secObj.targetSentence = target;
                secObj.targetWord = target;
                secObj.answer = target;
                secObj.flag = flag;
                secObj.aliases = [
                  target,
                  target.toUpperCase(),
                  target.toLowerCase(),
                  flag,
                  flag.toUpperCase(),
                  `CYBERTRIX{${target}}`,
                  `CYBERTRIX{${target.toUpperCase()}}`,
                  finalMirror,
                  finalMirror.toUpperCase()
                ];
              } else {
                const asciiVal = (card.querySelector('.subtask-edit-ascii')?.value || '43 59 42 45 52 21').trim();
                const answer = (card.querySelector('.subtask-edit-answer')?.value || hexStreamToString(asciiVal) || 'CYBER!').trim();
                const flag = (card.querySelector('.subtask-edit-flag')?.value || `CYBERTRIX{${answer}}`).trim();
                stObj.asciiHex = asciiVal;
                stObj.asciiValues = asciiVal;
                stObj.targetWord = answer;
                stObj.answer = answer;
                stObj.flag = flag;
                secObj.asciiHex = asciiVal;
                secObj.asciiValues = asciiVal;
                secObj.targetWord = answer;
                secObj.answer = answer;
                secObj.flag = flag;
                secObj.aliases = [
                  answer,
                  answer.toUpperCase(),
                  flag,
                  flag.toUpperCase(),
                  `CYBERTRIX{${answer}}`,
                  `CYBERTRIX{${answer.toUpperCase()}}`
                ];
              }

              subtasksArr.push(stObj);
              subtaskSecObj[stId] = secObj;
            });

            data.subtasks = subtasksArr;
            data.subtaskSecrets = subtaskSecObj;
            data.points = subtasksArr.reduce((sum, st) => sum + (Number(st.points) || 0), 0);
            if (subtasksArr[0]) {
              if (type === 'mirror-keyboard') {
                data.mirrorWord = subtasksArr[0].mirrorWord;
                data.mirroredSentence = subtasksArr[0].mirrorWord;
                data.targetSentence = subtasksArr[0].targetSentence;
                data.targetWord = subtasksArr[0].targetWord;
                data.answer = subtasksArr[0].targetSentence;
                data.flag = subtasksArr[0].flag;
                data.question = subtasksArr[0].question || subtasksArr[0].description;
              } else {
                data.asciiHex = subtasksArr[0].asciiHex;
                data.asciiValues = subtasksArr[0].asciiValues;
                data.targetWord = subtasksArr[0].targetWord;
                data.answer = subtasksArr[0].answer || subtasksArr[0].targetWord;
                data.flag = subtasksArr[0].flag;
                data.question = subtasksArr[0].question || subtasksArr[0].description;
              }
            }
          }
        }

        if (type === 'mirror-keyboard') {
          const qInputVal = document.getElementById('edit-mk-question')?.value?.trim();
          const mirrorInputVal = document.getElementById('edit-mk-mirrorword')?.value?.trim();
          const targetInputVal = document.getElementById('edit-mk-targetsentence')?.value?.trim();
          const flagInputVal = document.getElementById('edit-mk-flag')?.value?.trim();

          const finalTarget = targetInputVal || (mirrorInputVal ? generateMirroredSentence(mirrorInputVal) : (data.targetSentence || 'PYTHON'));
          const finalMirror = mirrorInputVal || generateMirroredSentence(finalTarget);
          const finalFlag = flagInputVal || `CYBERTRIX{${finalTarget}}`;

          let finalQuestion = qInputVal || (data.subtasks && data.subtasks[0] && (data.subtasks[0].question || data.subtasks[0].description)) || data.question;
          if (!finalQuestion || finalQuestion.includes('mirror word') || finalQuestion.includes('target programming language')) {
            finalQuestion = "Left is Right, Right is left. Type what you see, not what you mean.";
          }

          data.question = finalQuestion;
          data.description = finalQuestion;
          data.mirrorWord = finalMirror;
          data.mirroredSentence = finalMirror;
          data.targetSentence = finalTarget;
          data.targetWord = finalTarget;
          data.answer = finalTarget;
          data.flag = finalFlag;

          if (data.subtasks && data.subtasks[0]) {
            if (!data.subtasks[0].question || qInputVal) {
              data.subtasks[0].question = finalQuestion;
              data.subtasks[0].description = finalQuestion;
            }
          }

          if (!data.subtasks || data.subtasks.length === 0) {
            const freshChallenges = (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges && window.CYBERTRIX_DB.challenges.getAllSync
              ? window.CYBERTRIX_DB.challenges.getAllSync(true)
              : (await window.CYBERTRIX_DB.challenges.getAll(true))) || [];
            const existingCh = freshChallenges.find(c => c.id === id) || null;
            if (existingCh && Array.isArray(existingCh.subtasks) && existingCh.subtasks.length > 0) {
              data.subtasks = JSON.parse(JSON.stringify(existingCh.subtasks));
            } else {
              data.subtasks = [
                {
                  id: "task_1",
                  title: "Sub-task 1",
                  name: `${data.title || 'MIRROR KEYBOARD'} — Task 1`,
                  order: 1,
                  points: 100,
                  question: finalQuestion,
                  description: finalQuestion,
                  mirrorWord: finalMirror,
                  targetSentence: finalTarget,
                  targetWord: finalTarget,
                  answer: finalTarget,
                  flag: finalFlag,
                  status: "ACTIVE",
                  enabled: true
                }
              ];
            }
          }

          if (data.subtasks && data.subtasks[0]) {
            if (qInputVal) {
              data.subtasks[0].question = finalQuestion;
              data.subtasks[0].description = finalQuestion;
            }
            data.subtasks[0].mirrorWord = finalMirror;
            data.subtasks[0].targetSentence = finalTarget;
            data.subtasks[0].targetWord = finalTarget;
            data.subtasks[0].answer = finalTarget;
            data.subtasks[0].flag = finalFlag;
            const st0Id = data.subtasks[0].id || 'task_1';
            if (!data.subtaskSecrets) data.subtaskSecrets = {};
            if (!data.subtaskSecrets[st0Id]) data.subtaskSecrets[st0Id] = {};
            data.subtaskSecrets[st0Id].question = data.subtasks[0].question;
            data.subtaskSecrets[st0Id].mirrorWord = finalMirror;
            data.subtaskSecrets[st0Id].targetSentence = finalTarget;
            data.subtaskSecrets[st0Id].targetWord = finalTarget;
            data.subtaskSecrets[st0Id].answer = finalTarget;
            data.subtaskSecrets[st0Id].flag = finalFlag;
            if (!data.subtaskSecrets[st0Id].aliases) data.subtaskSecrets[st0Id].aliases = [];
            [finalTarget, finalTarget.toUpperCase(), finalTarget.toLowerCase(), finalFlag, finalFlag.toUpperCase(), `CYBERTRIX{${finalTarget}}`, `CYBERTRIX{${finalTarget.toUpperCase()}}`, finalMirror, finalMirror.toUpperCase()].forEach(al => {
              if (!data.subtaskSecrets[st0Id].aliases.includes(al)) data.subtaskSecrets[st0Id].aliases.push(al);
            });
          }
          if (document.getElementById('edit-mk-casesensitive')) {
            data.caseSensitive = document.getElementById('edit-mk-casesensitive').value === 'true';
          }
          if (document.getElementById('edit-mk-ignoreextraspaces')) {
            data.ignoreExtraSpaces = document.getElementById('edit-mk-ignoreextraspaces').value === 'true';
          }
          if (document.getElementById('edit-mk-trimspaces')) {
            data.trimSpaces = document.getElementById('edit-mk-trimspaces').value === 'true';
          }
          if (document.getElementById('edit-mk-flagenabled')) {
            data.flagEnabled = document.getElementById('edit-mk-flagenabled').value === 'true';
          }
        }

        try {
          if (id) {
            await window.CYBERTRIX_DB.challenges.update(id, data);
            if (type === 'mirror-keyboard' || id === 'mirror-keyboard') {
              window.showCyberToast("MIRROR KEYBOARD UPDATED SUCCESSFULLY", "success");
            } else {
              window.showCyberToast(`Challenge updated successfully!`, "success");
            }
          } else {
            await window.CYBERTRIX_DB.challenges.create(data);
            if (type === 'mirror-keyboard') {
              window.showCyberToast("MIRROR KEYBOARD UPDATED SUCCESSFULLY", "success");
            } else {
              window.showCyberToast("New challenge deployed to the Arena!", "success");
            }
          }
          modal.classList.remove('active');
          loadChallenges();
        } catch (err) {
          window.showCyberToast(err.message, "error");
        }
      });
    }

    window.editChallenge = async function (id) {
      const c = challenges.find(ch => ch.id === id);
      if (!c) return;

      document.getElementById('edit-ch-id').value = c.id;
      if (document.getElementById('edit-ch-order')) document.getElementById('edit-ch-order').value = c.order || 1;
      document.getElementById('edit-ch-title').value = c.title;
      if (typeSelect) {
        typeSelect.value = c.type || 'mirror-keyboard';
        updateTypeFields(c.type || 'mirror-keyboard');
      }
      document.getElementById('edit-ch-category').value = c.category;
      document.getElementById('edit-ch-difficulty').value = c.difficulty;
      document.getElementById('edit-ch-points').value = c.points;
      document.getElementById('edit-ch-desc').value = c.description;

      if (document.getElementById('edit-ch-hint1')) document.getElementById('edit-ch-hint1').value = c.hint1 || c.hint || '';
      if (document.getElementById('edit-ch-hint2')) document.getElementById('edit-ch-hint2').value = c.hint2 || '';
      if (document.getElementById('edit-ch-hint3')) document.getElementById('edit-ch-hint3').value = c.hint3 || '';

      document.getElementById('edit-ch-status').value = c.status;

      // Populate Challenge Settings -> Challenge Lock (Section 6)
      const isLocked = !!(c.isLocked || c.adminLocked || c.status === 'LOCKED');
      updateModalLockUI(isLocked);

      const targetInput = document.getElementById('edit-ch-targetword');
      if (targetInput) targetInput.value = c.targetWord || 'PYTHON';

      const asciiInput = document.getElementById('edit-ch-asciivalues');
      if (asciiInput) asciiInput.value = c.asciiValues || '67 89 66 69 82';

      const vKw = c.vaultPassword || c.vaultKeyword || 'VAULT';
      const vCs = c.cipherSequence || c.accessCode || stringToDecimalStream(vKw);
      if (document.getElementById('edit-ch-vaultkeyword')) document.getElementById('edit-ch-vaultkeyword').value = vKw;
      if (document.getElementById('edit-ch-ciphersequence')) document.getElementById('edit-ch-ciphersequence').value = vCs;
      if (document.getElementById('edit-ch-logourl')) document.getElementById('edit-ch-logourl').value = c.eventLogo || c.logoUrl || 'assets/logo/logo.svg';
      if (document.getElementById('edit-ch-logoanim')) document.getElementById('edit-ch-logoanim').value = c.logoAnimation || 'glitch-decrypt';
      if (document.getElementById('edit-ch-secretfilename')) document.getElementById('edit-ch-secretfilename').value = c.secretFileName || 'evidence.txt';
      if (document.getElementById('edit-ch-secretfiletitle')) document.getElementById('edit-ch-secretfiletitle').value = c.secretFileTitle || 'CYBERTRIX SECURE VAULT // evidence.txt';
      if (document.getElementById('edit-ch-successmessage')) document.getElementById('edit-ch-successmessage').value = c.successMessage || 'OPERATION COMPLETE // +250 POINTS AWARDED // STATUS: SOLVED ✓';

      if (c.type === 'hidden-vault') {
        updateHvPreview('sync');
        initAdminHvAsciiTableEvents();
        populateAdminHvAsciiTable();
      }

      // Populate Hidden Vault specific fields (Admin Controls for Hidden Vault ONLY)
      if (document.getElementById('edit-ch-hiddendir')) {
        document.getElementById('edit-ch-hiddendir').value = c.hiddenDirectory || '.hidden/';
      }

      // Populate evidence.txt controls (Section 4)
      if (document.getElementById('edit-ch-evidence-enabled')) {
        document.getElementById('edit-ch-evidence-enabled').value = (c.evidenceEnabled !== false) ? 'true' : 'false';
      }
      if (document.getElementById('edit-ch-evidence-name')) {
        document.getElementById('edit-ch-evidence-name').value = 'evidence.txt';
      }

      const fakeFiles = Array.isArray(c.fakeFiles) ? c.fakeFiles : [];
      const ff1 = fakeFiles[0] || { name: 'readme.txt', size: '2.4 KB', content: '' };
      const ff2 = fakeFiles[1] || { name: 'system.log', size: '4.8 KB', content: '' };
      const ff3 = fakeFiles[2] || { name: 'notes.txt', size: '1.2 KB', content: '' };

      if (document.getElementById('edit-ch-fakefile1-name')) document.getElementById('edit-ch-fakefile1-name').value = ff1.name || '';
      if (document.getElementById('edit-ch-fakefile1-size')) document.getElementById('edit-ch-fakefile1-size').value = ff1.size || '';
      if (document.getElementById('edit-ch-fakefile1-content')) document.getElementById('edit-ch-fakefile1-content').value = ff1.content || '';

      if (document.getElementById('edit-ch-fakefile2-name')) document.getElementById('edit-ch-fakefile2-name').value = ff2.name || '';
      if (document.getElementById('edit-ch-fakefile2-size')) document.getElementById('edit-ch-fakefile2-size').value = ff2.size || '';
      if (document.getElementById('edit-ch-fakefile2-content')) document.getElementById('edit-ch-fakefile2-content').value = ff2.content || '';

      if (document.getElementById('edit-ch-fakefile3-name')) document.getElementById('edit-ch-fakefile3-name').value = ff3.name || '';
      if (document.getElementById('edit-ch-fakefile3-size')) document.getElementById('edit-ch-fakefile3-size').value = ff3.size || '';
      if (document.getElementById('edit-ch-fakefile3-content')) document.getElementById('edit-ch-fakefile3-content').value = ff3.content || '';

      const hiddenFiles = Array.isArray(c.hiddenFiles) ? c.hiddenFiles : [];
      const hf1 = hiddenFiles[0] || { name: 'evidence.txt', size: '1.8 KB', content: '' };
      const hf2 = hiddenFiles[1] || { name: 'classified.txt', size: '2.3 KB', content: '' };
      const hf3 = hiddenFiles[2] || { name: 'final_message.txt', size: '0.8 KB', content: '' };

      const evContent = (c.evidenceContent !== undefined && c.evidenceContent !== null)
        ? c.evidenceContent
        : ((hf1.content !== undefined && hf1.content !== null) ? hf1.content : (c.secretContent || ''));
      if (document.getElementById('edit-ch-evidence-content')) document.getElementById('edit-ch-evidence-content').value = evContent;
      if (document.getElementById('edit-ch-evidence-size')) document.getElementById('edit-ch-evidence-size').value = hf1.size || '1.8 KB';

      if (document.getElementById('edit-ch-hiddenfile1-name')) document.getElementById('edit-ch-hiddenfile1-name').value = hf1.name || 'evidence.txt';
      if (document.getElementById('edit-ch-hiddenfile1-size')) document.getElementById('edit-ch-hiddenfile1-size').value = hf1.size || '1.8 KB';
      if (document.getElementById('edit-ch-hiddenfile1-content')) document.getElementById('edit-ch-hiddenfile1-content').value = evContent;

      if (document.getElementById('edit-ch-hiddenfile2-name')) document.getElementById('edit-ch-hiddenfile2-name').value = hf2.name || '';
      if (document.getElementById('edit-ch-hiddenfile2-size')) document.getElementById('edit-ch-hiddenfile2-size').value = hf2.size || '';
      if (document.getElementById('edit-ch-hiddenfile2-content')) document.getElementById('edit-ch-hiddenfile2-content').value = hf2.content || '';

      if (document.getElementById('edit-ch-hiddenfile3-name')) document.getElementById('edit-ch-hiddenfile3-name').value = hf3.name || '';
      if (document.getElementById('edit-ch-hiddenfile3-size')) document.getElementById('edit-ch-hiddenfile3-size').value = hf3.size || '';
      if (document.getElementById('edit-ch-hiddenfile3-content')) document.getElementById('edit-ch-hiddenfile3-content').value = hf3.content || '';

      const caseSelect = document.getElementById('edit-ch-casesensitive');
      if (caseSelect) caseSelect.value = c.caseSensitive ? 'true' : 'false';

      // Populate metadata-ghost fields (Requirements 4, 5, 6, 13)
      const ghostImgUrl = c.imageUrl || 'assets/metadata-ghost-01.png';
      if (document.getElementById('edit-ch-imageurl')) document.getElementById('edit-ch-imageurl').value = ghostImgUrl;
      const previewEl = document.getElementById('edit-ch-image-preview');
      if (previewEl) {
        previewEl.src = ghostImgUrl.startsWith('../') || ghostImgUrl.startsWith('http') || ghostImgUrl.startsWith('data:')
          ? ghostImgUrl
          : '../' + ghostImgUrl;
      }
      const uploadStatusEl = document.getElementById('edit-ch-image-upload-status');
      if (uploadStatusEl) {
        uploadStatusEl.style.display = 'none';
        uploadStatusEl.textContent = '';
      }

      // Populate Timer Settings (Requirement 3: Admin Timer Control)
      if (document.getElementById('edit-ch-timer-enabled')) {
        document.getElementById('edit-ch-timer-enabled').value = (c.timerEnabled !== false) ? 'true' : 'false';
      }
      const totalTimerSec = (c.timerSeconds !== undefined && c.timerSeconds !== null) ? Number(c.timerSeconds) : 300;
      const tm = Math.floor(totalTimerSec / 60);
      const ts = totalTimerSec % 60;
      if (document.getElementById('edit-ch-timer-mins')) document.getElementById('edit-ch-timer-mins').value = tm;
      if (document.getElementById('edit-ch-timer-secs')) document.getElementById('edit-ch-timer-secs').value = ts;
      if (document.getElementById('edit-ch-timer-preset')) {
        const presetEl = document.getElementById('edit-ch-timer-preset');
        const presetOptions = presetEl.options ? Array.from(presetEl.options) : [];
        const presetMatch = presetOptions.find(o => Number(o.value) === totalTimerSec);
        presetEl.value = presetMatch ? totalTimerSec : '';
      }

      // Load secret flag & hidden answer from challengeSecrets (Requirements 7 & 25)
      let secret = null;
      try {
        secret = await window.CYBERTRIX_DB.challenges.getSecret(c.id);
        if (document.getElementById('edit-ch-flag')) {
          document.getElementById('edit-ch-flag').value = (secret && secret.flag) || c.flag || '';
        }
        if (document.getElementById('edit-ch-hiddenanswer')) {
          document.getElementById('edit-ch-hiddenanswer').value = (secret && secret.answer) || '';
        }
        if (document.getElementById('edit-ch-secretcontent')) {
          document.getElementById('edit-ch-secretcontent').value = (secret && secret.secretContent) || c.secretContent || '';
        }
        if (secret && secret.secretContent) {
          const finalSecretEv = (c.evidenceContent !== undefined && c.evidenceContent !== null)
            ? c.evidenceContent
            : ((hf1 && hf1.content !== undefined && hf1.content !== null)
                ? hf1.content
                : secret.secretContent);
          if (document.getElementById('edit-ch-evidence-content')) {
            document.getElementById('edit-ch-evidence-content').value = finalSecretEv;
          }
          if (document.getElementById('edit-ch-hiddenfile1-content')) {
            document.getElementById('edit-ch-hiddenfile1-content').value = finalSecretEv;
          }
        }
      } catch (e) {
        if (document.getElementById('edit-ch-flag')) {
          document.getElementById('edit-ch-flag').value = c.flag || '';
        }
      }

      if (c.type === 'hidden-vault') {
        const hvCurrentFlag = (secret && secret.flag) || c.flag || 'CYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}';
        const evFlagInput = document.getElementById('edit-ch-evidence-flag');
        if (evFlagInput) {
          evFlagInput.value = hvCurrentFlag;
          evFlagInput.oninput = function () {
            const flgVal = evFlagInput.value.trim();
            const mainFlag = document.getElementById('edit-ch-flag');
            if (mainFlag) mainFlag.value = flgVal;
            const evContent = document.getElementById('edit-ch-evidence-content');
            if (evContent) {
              evContent.value = `flag:${flgVal}`;
            }
          };
        }
        const mainFlagInput = document.getElementById('edit-ch-flag');
        if (mainFlagInput) {
          mainFlagInput.value = hvCurrentFlag;
          mainFlagInput.oninput = function () {
            const flgVal = mainFlagInput.value.trim();
            if (evFlagInput) evFlagInput.value = flgVal;
          };
        }
      }

      if (c.type === 'mirror-keyboard') {
        const mkQuestion = c.question || c.description || (c.subtasks && c.subtasks[0] && (c.subtasks[0].question || c.subtasks[0].description)) || (secret && secret.question) || '';
        const mkTarget = (secret && (secret.targetSentence || secret.targetWord || secret.answer)) || c.targetSentence || (c.subtasks && c.subtasks[0] && (c.subtasks[0].targetSentence || c.subtasks[0].targetWord || c.subtasks[0].answer)) || 'PYTHON';
        const mkMirror = (secret && (secret.mirrorWord || secret.mirroredSentence)) || c.mirrorWord || c.mirroredSentence || (c.subtasks && c.subtasks[0] && c.subtasks[0].mirrorWord) || generateMirroredSentence(mkTarget);
        const mkFlag = (secret && secret.flag) || c.flag || (c.subtasks && c.subtasks[0] && c.subtasks[0].flag) || `CYBERTRIX{${mkTarget}}`;
        if (document.getElementById('edit-mk-question')) {
          document.getElementById('edit-mk-question').value = mkQuestion;
        }
        if (document.getElementById('edit-mk-mirrorword')) {
          document.getElementById('edit-mk-mirrorword').value = mkMirror;
        }
        if (document.getElementById('edit-mk-targetsentence')) {
          document.getElementById('edit-mk-targetsentence').value = mkTarget;
        }
        if (document.getElementById('edit-mk-flag')) {
          document.getElementById('edit-mk-flag').value = mkFlag;
        }
        if (document.getElementById('edit-mk-casesensitive')) {
          const isCase = c.caseSensitive || (secret && secret.caseSensitive);
          document.getElementById('edit-mk-casesensitive').value = isCase ? 'true' : 'false';
        }
        if (document.getElementById('edit-mk-ignoreextraspaces')) {
          const ignoreSp = c.ignoreExtraSpaces !== false && (!secret || secret.ignoreExtraSpaces !== false);
          document.getElementById('edit-mk-ignoreextraspaces').value = ignoreSp ? 'true' : 'false';
        }
        if (document.getElementById('edit-mk-trimspaces')) {
          const trimSp = c.trimSpaces !== false && (!secret || secret.trimSpaces !== false);
          document.getElementById('edit-mk-trimspaces').value = trimSp ? 'true' : 'false';
        }
        if (document.getElementById('edit-mk-flagenabled')) {
          const flagEn = c.flagEnabled !== false && (!secret || secret.flagEnabled !== false);
          document.getElementById('edit-mk-flagenabled').value = flagEn ? 'true' : 'false';
        }
        const previewEl = document.getElementById('admin-mk-preview-text');
        const previewFlagEl = document.getElementById('admin-mk-preview-flag');
        if (previewEl) {
          previewEl.textContent = mkTarget;
        }
        if (previewFlagEl) {
          previewFlagEl.textContent = mkFlag;
        }
        document.getElementById('modal-challenge-heading').textContent = 'MIRROR KEYBOARD CONFIGURATION';
        const submitBtn = document.getElementById('btn-submit-challenge-modal') || document.querySelector('#challenge-modal button[type="submit"]');
        if (submitBtn) submitBtn.textContent = '[ SAVE MIRROR KEYBOARD ]';
      } else {
        document.getElementById('modal-challenge-heading').textContent = 'EDIT CHALLENGE // ' + c.title;
        const submitBtn = document.getElementById('btn-submit-challenge-modal') || document.querySelector('#challenge-modal button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'SAVE CHALLENGE CONFIGURATION';
      }

      // Populate subtasks editor if challenge has subtasks
      if (c.type === 'mirror-keyboard' || c.type === 'ascii-hunt') {
        const secSubtasks = (secret && secret.subtasks) || {};
        renderAdminSubtasksEditor(c.type, c.subtasks, secSubtasks);
      }
      modal.classList.add('active');
    };

    window.deleteChallenge = async function (id) {
      if (confirm("CONFIRMATION: Are you sure you want to permanently delete this challenge from CYBERTRIX?")) {
        try {
          await window.CYBERTRIX_DB.challenges.delete(id);
          window.showCyberToast("Challenge deleted.", "info");
          loadChallenges();
        } catch (err) {
          window.showCyberToast(err.message, "error");
        }
      }
    };

    loadChallenges();
    window.addEventListener('cybertrix_data_changed', loadChallenges);
  }

  // =========================================================================
  // ADMIN ANNOUNCEMENTS
  // =========================================================================
  async function initAdminAnnouncements() {
    const tbody = document.getElementById('admin-announcements-tbody');
    if (!tbody) return;

    let announcements = [];

    async function loadAnnouncements() {
      announcements = await window.CYBERTRIX_DB.announcements.getAll(false);
      render();
    }

    function render() {
      tbody.innerHTML = announcements.map(a => `
        <tr>
          <td><strong style="color: #fff;">${escapeHTML(a.title)}</strong></td>
          <td style="color: var(--text-secondary); max-width: 300px;">${escapeHTML(a.message)}</td>
          <td>
            ${a.important ? 
              '<span class="cyber-badge badge-red badge-pulse">YES</span>' : 
              '<span class="cyber-badge badge-cyan">NO</span>'}
          </td>
          <td>
            ${a.published !== false ? 
              '<span class="status-pill status-active">PUBLISHED</span>' : 
              '<span class="status-pill status-hidden">DRAFT</span>'}
          </td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">
            ${new Date(a.createdAt).toLocaleString()}
          </td>
          <td>
            <div class="table-actions">
              <button class="btn-icon" title="Edit" onclick="window.editAnnouncement('${a.id}')">✎</button>
              <button class="btn-icon danger" title="Delete" onclick="window.deleteAnnouncement('${a.id}')">🗑</button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    const btnAdd = document.getElementById('btn-open-add-announcement');
    const modal = document.getElementById('announcement-modal');
    const form = document.getElementById('announcement-form');

    if (btnAdd && modal && form) {
      btnAdd.addEventListener('click', () => {
        form.reset();
        document.getElementById('edit-ann-id').value = '';
        document.getElementById('modal-ann-heading').textContent = 'BROADCAST NEW ANNOUNCEMENT';
        modal.classList.add('active');
      });
    }

    if (modal) {
      modal.querySelectorAll('.modal-close, .btn-modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => modal.classList.remove('active'));
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-ann-id').value;
        const data = {
          title: document.getElementById('edit-ann-title').value,
          message: document.getElementById('edit-ann-message').value,
          important: document.getElementById('edit-ann-important').checked,
          published: document.getElementById('edit-ann-published').checked
        };

        try {
          if (id) {
            await window.CYBERTRIX_DB.announcements.update(id, data);
            window.showCyberToast("Announcement updated.", "success");
          } else {
            await window.CYBERTRIX_DB.announcements.create(data);
            window.showCyberToast("Transmission broadcasted to public feed.", "success");
          }
          modal.classList.remove('active');
          loadAnnouncements();
        } catch (err) {
          window.showCyberToast(err.message, "error");
        }
      });
    }

    window.editAnnouncement = function (id) {
      const a = announcements.find(item => item.id === id);
      if (!a) return;

      document.getElementById('edit-ann-id').value = a.id;
      document.getElementById('edit-ann-title').value = a.title;
      document.getElementById('edit-ann-message').value = a.message;
      document.getElementById('edit-ann-important').checked = Boolean(a.important);
      document.getElementById('edit-ann-published').checked = a.published !== false;

      document.getElementById('modal-ann-heading').textContent = 'EDIT ANNOUNCEMENT';
      modal.classList.add('active');
    };

    window.deleteAnnouncement = async function (id) {
      if (confirm("Delete this announcement broadcast?")) {
        try {
          await window.CYBERTRIX_DB.announcements.delete(id);
          window.showCyberToast("Announcement deleted.", "info");
          loadAnnouncements();
        } catch (err) {
          window.showCyberToast(err.message, "error");
        }
      }
    };

    loadAnnouncements();
    window.addEventListener('cybertrix_data_changed', loadAnnouncements);
  }

  // =========================================================================
  // ADMIN SUBMISSIONS MANAGEMENT
  // =========================================================================
  async function initAdminSubmissions() {
    const tbody = document.getElementById('admin-submissions-tbody');
    if (!tbody) return;

    let submissions = [];
    let filterStatus = 'ALL';
    let filterSearch = '';

    async function loadSubs() {
      submissions = await window.CYBERTRIX_DB.submissions.getAll();
      render();
    }

    function render() {
      const filtered = submissions.filter(s => {
        if (filterStatus === 'CORRECT' && !s.correct) return false;
        if (filterStatus === 'INCORRECT' && s.correct) return false;
        if (filterSearch && !s.username.toLowerCase().includes(filterSearch) && !(s.challengeTitle || '').toLowerCase().includes(filterSearch)) return false;
        return true;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-muted);">NO SUBMISSIONS MATCHING FILTERS</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(s => `
        <tr>
          <td><strong style="color: #fff;">${escapeHTML(s.username)}</strong></td>
          <td>${escapeHTML(s.challengeTitle || s.challengeId)}</td>
          <td><code style="color: ${s.correct ? 'var(--green)' : 'var(--red)'}; font-size: 0.85rem;">${escapeHTML(s.submittedFlag)}</code></td>
          <td>
            ${s.correct ? 
              '<span class="status-pill status-active">✓ CORRECT</span>' : 
              '<span class="status-pill status-hidden">✗ INCORRECT</span>'}
          </td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${new Date(s.timestamp).toLocaleString()}</td>
        </tr>
      `).join('');
    }

    const selectStatus = document.getElementById('filter-sub-status');
    if (selectStatus) {
      selectStatus.addEventListener('change', (e) => {
        filterStatus = e.target.value;
        render();
      });
    }

    const searchInput = document.getElementById('search-submissions');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        filterSearch = e.target.value.toLowerCase().trim();
        render();
      });
    }

    loadSubs();
    window.addEventListener('cybertrix_data_changed', loadSubs);
  }

  // =========================================================================
  // ADMIN EVENT CONTROL & SETTINGS (Requirements 4, 5, 11, 12, 13, 16)
  // =========================================================================
  async function initAdminSettings() {
    initAdminTimerControls();

    const form = document.getElementById('event-control-form');
    if (form) {
      async function loadConfig() {
        const config = await window.CYBERTRIX_DB.event.getConfig();
        document.getElementById('event-name-input').value = config.eventName || '';
        document.getElementById('event-status-select').value = config.status || 'LIVE';
        document.getElementById('event-start-input').value = (config.startDate || '').substring(0, 16);
        document.getElementById('event-end-input').value = (config.endDate || '').substring(0, 16);
        document.getElementById('event-reg-open').checked = config.registrationOpen !== false;
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const updates = {
          eventName: document.getElementById('event-name-input').value,
          status: document.getElementById('event-status-select').value,
          startDate: document.getElementById('event-start-input').value,
          endDate: document.getElementById('event-end-input').value,
          registrationOpen: document.getElementById('event-reg-open').checked
        };

        try {
          await window.CYBERTRIX_DB.event.updateConfig(updates);
          window.showCyberToast("Event configurations saved.", "success");
        } catch (err) {
          window.showCyberToast(err.message, "error");
        }
      });

      loadConfig();
    }

    // Reset database to initial state button
    const btnReset = document.getElementById('btn-reset-db');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (confirm("DANGER: This will reset all challenges, announcements, submissions, and players back to default template. Proceed?")) {
          window.CYBERTRIX_DB.resetToDefaults();
        }
      });
    }
  }

  // Event Timer Control Handlers (Settings & Dashboard)
  function initAdminTimerControls() {
    if (!window.CYBERTRIX_DB || !window.CYBERTRIX_DB.timer) return;

    // Presets
    const presetBtns = document.querySelectorAll('.btn-timer-preset');
    const inputH = document.getElementById('timer-hours');
    const inputM = document.getElementById('timer-minutes');
    const inputS = document.getElementById('timer-seconds');

    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (inputH && inputM && inputS) {
          inputH.value = btn.getAttribute('data-h') || '0';
          inputM.value = btn.getAttribute('data-m') || '0';
          inputS.value = btn.getAttribute('data-s') || '0';
        }
        if (window.cyberSound) window.cyberSound.playClick();
      });
    });

    // Custom duration input listeners
    [inputH, inputM, inputS].forEach(inp => {
      if (inp) {
        inp.addEventListener('input', () => {
          presetBtns.forEach(b => b.classList.remove('active'));
        });
      }
    });

    // Scheduled Start mode toggle
    const radioSched = document.getElementById('start-mode-scheduled');
    const radioImmed = document.getElementById('start-mode-immediate');
    const schedContainer = document.getElementById('scheduled-start-container');

    function updateSchedVisibility() {
      if (schedContainer && radioSched) {
        schedContainer.style.display = radioSched.checked ? 'block' : 'none';
      }
    }

    if (radioSched && radioImmed) {
      radioSched.addEventListener('change', updateSchedVisibility);
      radioImmed.addEventListener('change', updateSchedVisibility);
    }

    // Timer Action Buttons (Settings page & Dashboard)
    const btnStart = document.getElementById('btn-timer-start');
    const btnPause = document.getElementById('btn-timer-pause');
    const btnResume = document.getElementById('btn-timer-resume');
    const btnReset = document.getElementById('btn-timer-reset');

    const dashBtnStart = document.getElementById('dash-btn-timer-start');
    const dashBtnPause = document.getElementById('dash-btn-timer-pause');
    const dashBtnReset = document.getElementById('dash-btn-timer-reset');

    const handleStart = async () => {
      try {
        await window.CYBERTRIX_DB.timer.startEvent();
        window.showCyberToast("CTF Event is now LIVE! Countdown active.", "success");
      } catch (err) {
        window.showCyberToast(err.message, "error");
      }
    };

    const handlePause = async () => {
      try {
        await window.CYBERTRIX_DB.timer.pauseEvent();
        window.showCyberToast("CTF Event PAUSED. Countdown frozen.", "info");
      } catch (err) {
        window.showCyberToast(err.message, "error");
      }
    };

    const handleResume = async () => {
      try {
        await window.CYBERTRIX_DB.timer.resumeEvent();
        window.showCyberToast("CTF Event RESUMED. Countdown active.", "success");
      } catch (err) {
        window.showCyberToast(err.message, "error");
      }
    };

    const handleReset = async () => {
      if (confirm("Are you sure you want to reset the event timer?")) {
        try {
          await window.CYBERTRIX_DB.timer.resetTimer();
          window.showCyberToast("Event timer reset to configured duration.", "info");
        } catch (err) {
          window.showCyberToast(err.message, "error");
        }
      }
    };

    if (btnStart) btnStart.addEventListener('click', handleStart);
    if (dashBtnStart) dashBtnStart.addEventListener('click', handleStart);

    if (btnPause) btnPause.addEventListener('click', handlePause);
    if (dashBtnPause) dashBtnPause.addEventListener('click', handlePause);

    if (btnResume) btnResume.addEventListener('click', handleResume);

    if (btnReset) btnReset.addEventListener('click', handleReset);
    if (dashBtnReset) dashBtnReset.addEventListener('click', handleReset);

    // Save Timer Settings Form
    const timerForm = document.getElementById('admin-timer-control-form');
    if (timerForm) {
      timerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const h = parseInt(document.getElementById('timer-hours').value) || 0;
        const m = parseInt(document.getElementById('timer-minutes').value) || 0;
        const s = parseInt(document.getElementById('timer-seconds').value) || 0;
        const totalDuration = h * 3600 + m * 60 + s;

        if (totalDuration <= 0) {
          window.showCyberToast("Event duration must be greater than 0 seconds.", "error");
          return;
        }

        const enabled = document.getElementById('timer-enabled-toggle').checked;
        const startMode = document.querySelector('input[name="start-mode"]:checked')?.value || 'immediate';
        const scheduledTime = document.getElementById('timer-scheduled-time')?.value || null;

        const updates = {
          enabled,
          durationSeconds: totalDuration,
          hours: h,
          minutes: m,
          seconds: s,
          startMode,
          scheduledStartTime: startMode === 'scheduled' ? scheduledTime : null
        };

        try {
          await window.CYBERTRIX_DB.timer.updateTimerConfig(updates);
          window.showCyberToast("Event timer configuration saved successfully.", "success");
        } catch (err) {
          window.showCyberToast(err.message, "error");
        }
      });
    }

    // Initial load & real-time sync for form fields
    window.CYBERTRIX_DB.timer.onSnapshot((cfg) => {
      if (!cfg) return;

      const toggle = document.getElementById('timer-enabled-toggle');
      if (toggle && !toggle.matches(':focus')) {
        toggle.checked = cfg.enabled !== false;
      }

      if (inputH && !inputH.matches(':focus')) inputH.value = cfg.hours !== undefined ? cfg.hours : Math.floor((cfg.durationSeconds || 7200) / 3600);
      if (inputM && !inputM.matches(':focus')) inputM.value = cfg.minutes !== undefined ? cfg.minutes : Math.floor(((cfg.durationSeconds || 7200) % 3600) / 60);
      if (inputS && !inputS.matches(':focus')) inputS.value = cfg.seconds !== undefined ? cfg.seconds : ((cfg.durationSeconds || 7200) % 60);

      if (cfg.startMode === 'scheduled' && radioSched) {
        radioSched.checked = true;
      } else if (radioImmed) {
        radioImmed.checked = true;
      }
      updateSchedVisibility();

      const timeInput = document.getElementById('timer-scheduled-time');
      if (timeInput && cfg.scheduledStartTime && !timeInput.matches(':focus')) {
        timeInput.value = cfg.scheduledStartTime.substring(0, 16);
      }
    });
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
