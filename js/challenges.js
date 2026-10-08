/**
 * CYBERTRIX - Challenges Arena Controller
 * Implements:
 * 1. Challenge List View (Default active view on page load - Req 17, 29).
 * 2. Challenge Details Modal (Shown on View Challenge, with [ START CHALLENGE ] - Req 18, 19, 20).
 * 3. Interactive Challenge Workspace (Starts only on Start Challenge, with [ ← BACK ] - Req 19).
 * 4. Sequential progression (01 Mirror Keyboard -> 02 CYBERTRIX — Hidden Vault -> 03 ASCII Hunt -> 04 Metadata Ghost).
 * 5. Mirror Keyboard single-character collapse transition & permanent correct answer display (Req 4, 5, 6, 7, 8).
 * 6. CYBERTRIX — Hidden Vault 4-stage forensic challenge with secret event logo interaction.
 * 7. ASCII Hunt with zero hints and responsive side-by-side ASCII Reference Table (Req 13, 14, 15, 16).
 * 8. Universal Flag Submission integrated with live global event timer (Req 1, 24, 25).
 */

(function () {
  'use strict';

  // Configurable Reciprocal Mirror Keyboard Mapping (Requirement 4)
  // Maps uppercase, lowercase, numbers, symbols, brackets, and punctuation.
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

    // Numbers (Mirror pairs across 1-5 and 0-6: 1<->0, 2<->9, 3<->8, 4<->7, 5<->6)
    '1': '0', '0': '1',
    '2': '9', '9': '2',
    '3': '8', '8': '3',
    '4': '7', '7': '4',
    '5': '6', '6': '5',

    // Shift Symbols corresponding to numbers
    '!': ')', ')': '!',
    '@': '(', '(': '@',
    '#': '*', '*': '#',
    '$': '&', '&': '$',
    '%': '^', '^': '%',

    // Punctuation and brackets
    '[': ']', ']': '[',
    '{': '}', '}': '{',
    '<': '>', '>': '<',
    ',': '.', '.': ',',
    ';': ':', ':': ';',
    '/': '?', '?': '/',
    '-': '_', '_': '-',

    // Space remains space
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

  // Converts a normal sentence into its mirror-encrypted display version
  // Admin sets the normal word → this is what players SEE as the puzzle
  function getMirroredDisplay(text) {
    if (!text) return '';
    return Array.from(text).map(c => getMirroredChar(c)).join('');
  }

  let challengesList = [];
  let currentDetailChallenge = null;
  let activeChallenge = null;
  let currentUser = null;
  let currentTimerConfig = null;

  // Mirror Keyboard internal state
  let mkBuffer = '';
  let mkIsCorrect = false;

  // Global Timer State
  let isTimerLive = true;
  let isTimerEnded = false;
  let isTimerPaused = false;
  let isTimerNotStarted = false;

  let isArenaBooted = false;
  function bootChallengesArena() {
    if (isArenaBooted) return;
    isArenaBooted = true;
    initArena();
    initChallengeTimerControls();
    initMirrorKeyboard();
    initHiddenVault();
    initAsciiForm();
    initFlagSubmission();
    populateAsciiReferenceTable();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootChallengesArena);
  } else {
    bootChallengesArena();
  }

  // =========================================================================
  // 1. ARENA INITIALIZATION & SUBSCRIPTIONS
  // =========================================================================
  function initArena() {
    currentUser = (window.CYBERTRIX_DB && window.CYBERTRIX_DB.auth && window.CYBERTRIX_DB.auth.getCurrentUser) ? window.CYBERTRIX_DB.auth.getCurrentUser() : null;
    if (window.CYBERTRIX_DB.challenges && window.CYBERTRIX_DB.challenges.getAllSync) {
      challengesList = window.CYBERTRIX_DB.challenges.getAllSync();
      renderChallengeList();
    }

    // 1. Auth Subscription
    if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.auth && window.CYBERTRIX_DB.auth.onAuthStateChanged) {
      window.CYBERTRIX_DB.auth.onAuthStateChanged((user) => {
        currentUser = user;
        checkUserDisabledStatus();
        renderChallengeList();
        if (activeChallenge) {
          updateWorkspaceView(activeChallenge);
        }
      });
    }

    // 2. Challenges Subscription
    if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges && window.CYBERTRIX_DB.challenges.onSnapshot) {
      window.CYBERTRIX_DB.challenges.onSnapshot((challenges) => {
        challengesList = [...challenges].sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
        renderChallengeList();

        if (activeChallenge) {
          const refreshed = challengesList.find(c => c.id === activeChallenge.id);
          if (refreshed) {
            activeChallenge = refreshed;
            updateWorkspaceView(refreshed);
          }
        } else {
        // Restore active challenge on page reload or URL parameter navigation
        try {
          const savedActiveId = sessionStorage.getItem('cybertrix_active_challenge_id') || new URLSearchParams(window.location.search).get('id');
          if (savedActiveId) {
            const savedCh = challengesList.find(c => c.id === savedActiveId);
            if (savedCh) {
              activeChallenge = savedCh;
              const listView = document.getElementById('view-challenge-list');
              const workspaceView = document.getElementById('view-challenge-workspace');
              if (listView) listView.style.display = 'none';
              if (workspaceView) workspaceView.style.display = 'block';
              updateWorkspaceView(savedCh);
            }
          }
        } catch (e) {}
      }
    });
  }

    // 3. Global Event Timer Subscription
    if (window.CYBERTRIX_DB.timer) {
      window.CYBERTRIX_DB.timer.onSnapshot((config) => {
        currentTimerConfig = config;
        handleTimerState(config);
      });
    }
  }

  // =========================================================================
  // USER STATUS & DISABLED STATE AUDIT (Requirement 3 & 5)
  // =========================================================================
  function checkUserDisabledStatus() {
    currentUser = window.CYBERTRIX_DB.auth.getCurrentUser();
    const banner = document.getElementById('account-disabled-banner');
    const isDisabled = currentUser && (currentUser.active === false || currentUser.disabled === true || currentUser.status === 'disabled');

    if (banner) {
      banner.style.display = isDisabled ? 'block' : 'none';
    }

    if (isDisabled) {
      disableChallengeInteractions(true);
      const submitBtn = document.getElementById('global-flag-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.title = "Your CYBERTRIX account has been disabled by the administrator.";
      }
      const flagInput = document.getElementById('global-flag-input');
      if (flagInput) {
        flagInput.disabled = true;
        flagInput.placeholder = "Your CYBERTRIX account has been disabled by the administrator.";
      }
    }
  }

  // =========================================================================
  // 2. GLOBAL TIMER STATE (Requirement 1, 25)
  // =========================================================================
  function handleTimerState(timerConfig) {
    if (!timerConfig) return;

    const bannerEnded = document.getElementById('flag-event-ended-banner');
    const bannerPaused = document.getElementById('flag-event-paused-banner');
    const bannerNotStarted = document.getElementById('flag-event-notstarted-banner');
    const formWrapper = document.getElementById('flag-active-form-wrapper');
    const submitBtn = document.getElementById('global-flag-submit-btn');
    const flagInput = document.getElementById('global-flag-input');

    const now = Date.now();
    const isExpired = timerConfig.status === 'LIVE' && timerConfig.endTime && (new Date(timerConfig.endTime).getTime() - now <= 0);

    isTimerEnded = !timerConfig.enabled || timerConfig.status === 'ENDED' || isExpired;
    isTimerPaused = timerConfig.status === 'PAUSED';
    isTimerNotStarted = timerConfig.status === 'NOT_STARTED';
    isTimerLive = timerConfig.enabled && timerConfig.status === 'LIVE' && !isExpired;

    if (bannerEnded) bannerEnded.style.display = isTimerEnded ? 'flex' : 'none';
    if (bannerPaused) bannerPaused.style.display = isTimerPaused ? 'flex' : 'none';
    if (bannerNotStarted) bannerNotStarted.style.display = isTimerNotStarted ? 'flex' : 'none';

    if (formWrapper) {
      formWrapper.style.display = isTimerLive ? 'block' : 'none';
    }
    if (submitBtn) {
      submitBtn.disabled = !isTimerLive;
    }
    if (flagInput) {
      flagInput.disabled = !isTimerLive;
    }
  }

  // =========================================================================
  // 3. PROGRESSION & UNLOCK STATE (Requirements 21, 22, 23)
  // =========================================================================
  function isChallengeUnlocked(ch) {
    if (!ch) return false;
    currentUser = window.CYBERTRIX_DB.auth.getCurrentUser();
    if (!challengesList || challengesList.length === 0) {
      try {
        if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges && window.CYBERTRIX_DB.challenges.getAllSync) {
          const fresh = window.CYBERTRIX_DB.challenges.getAllSync(false);
          if (Array.isArray(fresh) && fresh.length > 0) {
            challengesList = [...fresh].sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
          }
        }
      } catch (e) {}
    }
    const sorted = [...(challengesList || [])]
      .filter(c => !/^(mirror-keyboard|ascii-hunt)-\d+$/.test(c.id))
      .sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));

    const chIdx = sorted.findIndex(c => c.id === ch.id);
    if (chIdx <= 0) return true; // First challenge in sorted order is always unlocked

    const prev = sorted[chIdx - 1];
    if (!prev) return true;

    const solved = [
      ...((currentUser && currentUser.solvedChallenges) || []),
      ...((currentUser && currentUser.completedChallenges) || [])
    ];

    // 1. If previous challenge is fully solved
    if (solved.includes(prev.id)) return true;

    // 2. If previous challenge has subtasks, check if any subtask is solved
    const solvedSubtasks = (currentUser && currentUser.solvedSubtasks) || [];
    if (prev.subtasks && Array.isArray(prev.subtasks) && prev.subtasks.length > 0) {
      const hasSolvedSubtask = prev.subtasks.some(st => solvedSubtasks.includes(`${prev.id}_${st.id}`));
      if (hasSolvedSubtask) return true;
    }
    if (solvedSubtasks.some(stId => stId.startsWith(`${prev.id}_`))) {
      return true;
    }

    // 3. Check progress object if present
    if (currentUser && currentUser.progress && currentUser.progress[prev.id]) {
      const prevProg = currentUser.progress[prev.id];
      if (prevProg.solved || (Array.isArray(prevProg.completedSubtasks) && prevProg.completedSubtasks.length > 0)) {
        return true;
      }
    }

    return false;
  }

  function isChallengeSolved(ch) {
    if (!ch) return false;
    const solved = [
      ...((currentUser && currentUser.solvedChallenges) || []),
      ...((currentUser && currentUser.completedChallenges) || [])
    ];
    if (solved.includes(ch.id)) return true;
    if (currentUser && currentUser.progress && currentUser.progress[ch.id] && currentUser.progress[ch.id].solved) {
      return true;
    }
    return false;
  }

  function isChallengeGloballyLocked(ch) {
    if (!ch) return false;
    return ch.isLocked === true || ch.adminLocked === true || ch.status === 'LOCKED';
  }

  // =========================================================================
  // 4. VIEW 1: CHALLENGES LIST VIEW (Requirements 17, 23, 29)
  // =========================================================================
  function renderChallengeList() {
    const grid = document.getElementById('challenges-list-grid');
    if (!grid) return;

    if (!challengesList || challengesList.length === 0) {
      try {
        if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges && window.CYBERTRIX_DB.challenges.getAllSync) {
          const fresh = window.CYBERTRIX_DB.challenges.getAllSync(false);
          if (Array.isArray(fresh) && fresh.length > 0) {
            challengesList = [...fresh].sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
          }
        }
      } catch (e) {}
    }

    if (!challengesList || challengesList.length === 0) return;

    grid.innerHTML = challengesList.map(ch => {
      const globallyLocked = isChallengeGloballyLocked(ch);
      const solved = isChallengeSolved(ch);
      const unlocked = !globallyLocked && isChallengeUnlocked(ch);

      let cardClass = '';
      let statusBadge = '';
      let btnMarkup = '';

      if (globallyLocked) {
        cardClass = 'locked admin-locked';
        statusBadge = `<span class="cyber-badge badge-red">🔒 LOCKED BY ADMIN</span>`;
        btnMarkup = `<button type="button" class="btn-cyber challenge-card-btn" style="opacity: 0.6; cursor: not-allowed;" onclick="window.handleChallengeClick('${ch.id}')">[ 🔒 LOCKED BY ADMIN ]</button>`;
      } else if (solved) {
        cardClass = 'solved';
        statusBadge = `<span class="cyber-badge badge-green">✓ COMPLETED // LOCKED</span>`;
        btnMarkup = `<button type="button" class="btn-cyber btn-cyber-primary challenge-card-btn" onclick="window.handleChallengeClick('${ch.id}')">[ VIEW CHALLENGE ]</button>`;
      } else if (unlocked) {
        cardClass = 'available';
        let subtaskProgressInfo = '';
        if (ch.subtasks && Array.isArray(ch.subtasks) && ch.subtasks.length > 0) {
          const solvedSubs = (currentUser && currentUser.solvedSubtasks) || [];
          const doneCount = ch.subtasks.filter(st => solvedSubs.includes(`${ch.id}_${st.id}`)).length;
          if (doneCount > 0) {
            subtaskProgressInfo = ` (${doneCount}/${ch.subtasks.length})`;
          }
        }
        statusBadge = `<span class="cyber-badge badge-cyan badge-pulse">● AVAILABLE${subtaskProgressInfo}</span>`;
        btnMarkup = `<button type="button" class="btn-cyber btn-cyber-primary challenge-card-btn" onclick="window.handleChallengeClick('${ch.id}')">[ VIEW CHALLENGE ]</button>`;
      } else {
        cardClass = 'locked';
        statusBadge = `<span class="cyber-badge badge-red">🔒 LOCKED</span>`;
        btnMarkup = `<button type="button" class="btn-cyber challenge-card-btn" style="opacity: 0.6; cursor: not-allowed;" onclick="window.handleChallengeClick('${ch.id}')">[ 🔒 LOCKED ]</button>`;
      }

      const orderPadded = String(ch.order || 1).padStart(2, '0');

      return `
        <div class="challenge-list-card ${cardClass}" onclick="window.handleChallengeClick('${ch.id}')">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div class="challenge-card-num">${orderPadded}</div>
              <div>${statusBadge}</div>
            </div>
            <h3 class="challenge-card-title">${escapeHTML(ch.title)}</h3>
            <div class="challenge-card-meta">
              <span class="cyber-badge badge-purple">${escapeHTML(ch.category || 'GENERAL')}</span>
              <span class="cyber-badge badge-cyan">${escapeHTML(ch.difficulty || 'EASY')}</span>
              <span class="cyber-badge badge-green">+${ch.points || 100} POINTS</span>
            </div>
            <p class="challenge-card-desc">${escapeHTML(ch.description || '')}</p>
          </div>
          <div>
            ${btnMarkup}
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================================================
  // 5. VIEW 2: CHALLENGE DETAILS MODAL (Requirements 18, 20, 21)
  // =========================================================================
  window.handleChallengeClick = function (id) {
    currentUser = window.CYBERTRIX_DB.auth.getCurrentUser();
    if (currentUser && (currentUser.active === false || currentUser.disabled === true || currentUser.status === 'disabled')) {
      window.showCyberToast("Your CYBERTRIX account has been disabled by the administrator.", "error");
      if (window.cyberSound) window.cyberSound.playError();
      return;
    }

    if (!challengesList || challengesList.length === 0) {
      try {
        if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges && window.CYBERTRIX_DB.challenges.getAllSync) {
          const fresh = window.CYBERTRIX_DB.challenges.getAllSync(false);
          if (Array.isArray(fresh) && fresh.length > 0) {
            challengesList = [...fresh].sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
          }
        }
      } catch (e) {}
    }

    const ch = (challengesList || []).find(c => c.id === id);
    if (!ch) return;

    if (isChallengeGloballyLocked(ch)) {
      window.showCyberToast(`CHALLENGE LOCKED: [${ch.title}] has been globally locked by Administrator.`, "error");
      if (window.cyberSound) window.cyberSound.playError();
      return;
    }

    const unlocked = isChallengeUnlocked(ch);
    if (!unlocked) {
      const sorted = [...(challengesList || [])]
        .filter(c => !/^(mirror-keyboard|ascii-hunt)-\d+$/.test(c.id))
        .sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
      const chIdx = sorted.findIndex(c => c.id === ch.id);
      const prev = (chIdx > 0) ? sorted[chIdx - 1] : null;
      const prevTitle = prev ? prev.title : `Previous Challenge`;
      window.showCyberToast(`CHALLENGE LOCKED: Complete [${prevTitle}] first.`, "error");
      if (window.cyberSound) window.cyberSound.playError();
      return;
    }

    // Open Challenge Details View (Requirement 18, 20)
    currentDetailChallenge = ch;
    openChallengeDetails(ch);
  };

  function openChallengeDetails(ch) {
    const modal = document.getElementById('challenge-details-modal');
    if (!modal) return;

    const orderPadded = String(ch.order || 1).padStart(2, '0');
    const solved = isChallengeSolved(ch);

    document.getElementById('detail-ch-num').textContent = `CHALLENGE #${orderPadded}`;
    document.getElementById('detail-ch-title').textContent = ch.title;
    document.getElementById('detail-ch-category').textContent = ch.category || 'CRYPTO';
    document.getElementById('detail-ch-difficulty').textContent = ch.difficulty || 'EASY';
    document.getElementById('detail-ch-points').textContent = `${ch.points || 100} POINTS`;

    const statusEl = document.getElementById('detail-ch-status');
    if (statusEl) {
      statusEl.className = solved ? 'cyber-badge badge-green' : 'cyber-badge badge-cyan';
      statusEl.textContent = solved ? '✓ SOLVED' : '● AVAILABLE';
    }

    // Display subtask overview in details modal if challenge has subtasks
    const descEl = document.getElementById('detail-ch-desc');
    if (descEl) {
      if (ch.subtasks && Array.isArray(ch.subtasks) && ch.subtasks.length > 0) {
        const userSolved = (currentUser && currentUser.solvedSubtasks) || [];
        const isMainSolved = isChallengeSolved(ch);
        const subtaskLines = ch.subtasks.map((st, i) => {
          const isStDone = isMainSolved || userSolved.includes(`${ch.id}_${st.id}`);
          return `<div style="font-family: var(--font-code); font-size: 0.85rem; color: ${isStDone ? 'var(--green)' : 'var(--text-muted)'}; margin-top: 0.35rem; display: flex; align-items: center; justify-content: space-between;">
            <span>${isStDone ? '✓' : '🔒'} ${escapeHTML(st.title || `Sub-task ${i + 1}`)}</span>
            <span style="color: var(--cyan);">${st.points || 100} pts</span>
          </div>`;
        }).join('');

        descEl.innerHTML = `
          <div style="margin-bottom: 0.85rem;">${escapeHTML(ch.question || ch.description || 'Decipher the operational objective to acquire the flag.')}</div>
          <div style="border-top: 1px dashed rgba(0, 243, 255, 0.2); padding-top: 0.75rem; background: rgba(0, 0, 0, 0.25); padding: 0.75rem; border-radius: 4px;">
            <div style="font-family: var(--font-tech); font-size: 0.78rem; color: var(--cyan); letter-spacing: 1.5px; font-weight: 700; margin-bottom: 0.4rem;">
              ◈ SUB-TASKS PROGRESSION (${ch.subtasks.length} SEQUENTIAL TASKS)
            </div>
            ${subtaskLines}
          </div>
        `;
      } else {
        descEl.textContent = ch.question || ch.description || 'Decipher the operational objective to acquire the flag.';
      }
    }

    // Hide target word box if present in DOM (Requirement 1: Do not automatically reveal the target word)
    const targetBox = document.getElementById('detail-ch-target-box');
    if (targetBox) targetBox.style.display = 'none';

    // For challenges with timer (Requirement 2 & 3: Configurable timer for every challenge)
    const timerBox = document.getElementById('detail-ch-timer-box');
    const timerVal = document.getElementById('detail-ch-timer-val');
    if (ch.timerEnabled !== false && ch.timerSeconds && ch.timerSeconds > 0) {
      if (timerBox) timerBox.style.display = 'block';
      const duration = Number(ch.timerSeconds) || 300;
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      if (timerVal) timerVal.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
      if (timerBox) timerBox.style.display = 'none';
    }

    modal.classList.add('active');
    if (window.cyberSound) window.cyberSound.playClick();
  }

  window.closeChallengeDetails = function () {
    const modal = document.getElementById('challenge-details-modal');
    if (modal) modal.classList.remove('active');
  };

  // =========================================================================
  // 6. VIEW 3: START CHALLENGE & WORKSPACE (Requirements 14, 19, 28, 29)
  // =========================================================================
  window.startCurrentChallenge = async function () {
    if (currentUser && (currentUser.active === false || currentUser.disabled === true || currentUser.status === 'disabled')) {
      window.showCyberToast("Your CYBERTRIX account has been disabled by the administrator.", "error");
      if (window.cyberSound) window.cyberSound.playError();
      return;
    }

    if (!currentDetailChallenge) return;

    if (isChallengeGloballyLocked(currentDetailChallenge)) {
      window.showCyberToast("CHALLENGE GLOBALLY LOCKED: Access is suspended by Administrator.", "error");
      if (window.cyberSound) window.cyberSound.playError();
      return;
    }

    // Ensure operative session exists before starting challenge attempt
    if (!currentUser) {
      const allPlayers = (window.CYBERTRIX_DB && window.CYBERTRIX_DB.players && window.CYBERTRIX_DB.players.getAllSync)
        ? window.CYBERTRIX_DB.players.getAllSync()
        : null;
      if (allPlayers && allPlayers.length > 0) {
        currentUser = allPlayers[0];
        try {
          localStorage.setItem('cybertrix_active_user', JSON.stringify(currentUser));
        } catch (e) {}
        window.dispatchEvent(new CustomEvent('cybertrix_auth_state_changed', { detail: { user: currentUser } }));
      }
    }

    window.closeChallengeDetails();

    activeChallenge = currentDetailChallenge;
    clearGlobalFlagInput(true);
    try {
      sessionStorage.setItem('cybertrix_active_challenge_id', activeChallenge.id);
    } catch (e) {}

    // Requirement 14: If challenge has individual challenge timer, initiate attempt
    if (activeChallenge.type === 'metadata-ghost' || (activeChallenge.timerSeconds && activeChallenge.timerSeconds > 0)) {
      try {
        await window.CYBERTRIX_DB.attempts.startAttempt(activeChallenge.id);
      } catch (err) {
        window.showCyberToast(err.message, "error");
        const modal = document.getElementById('challenge-details-modal');
        if (modal) modal.classList.add('active');
        return;
      }
    }

    // Switch Views: Hide List, Show Workspace (Requirement 19 & 29)
    const listView = document.getElementById('view-challenge-list');
    const workspaceView = document.getElementById('view-challenge-workspace');

    if (listView) listView.style.display = 'none';
    if (workspaceView) workspaceView.style.display = 'block';

    updateWorkspaceView(activeChallenge);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.cyberSound) window.cyberSound.playClick();
  };

  window.backToChallengeList = async function () {
    if (ghostTimerInterval) {
      clearInterval(ghostTimerInterval);
      ghostTimerInterval = null;
    }
    if (challengeTimerInterval) {
      clearInterval(challengeTimerInterval);
      challengeTimerInterval = null;
    }

    // Requirement 2: Pause challenge timer when leaving/closing challenge
    if (activeChallenge && !isChallengeSolved(activeChallenge)) {
      try {
        await window.CYBERTRIX_DB.attempts.pauseAttempt(activeChallenge.id);
      } catch (e) {}
    }

    const listView = document.getElementById('view-challenge-list');
    const workspaceView = document.getElementById('view-challenge-workspace');

    if (workspaceView) workspaceView.style.display = 'none';
    if (listView) listView.style.display = 'block';

    try {
      sessionStorage.removeItem('cybertrix_active_challenge_id');
    } catch (e) {}

    clearGlobalFlagInput(true);
    activeChallenge = null;
    renderChallengeList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      if (window.cyberSound && window.cyberSound.playClick) window.cyberSound.playClick();
    } catch (e) {}
  };

  // Ensure timer is paused if participant closes browser tab or refreshes while inside challenge
  window.addEventListener('beforeunload', () => {
    if (challengeTimerInterval) {
      clearInterval(challengeTimerInterval);
      challengeTimerInterval = null;
    }
    if (ghostTimerInterval) {
      clearInterval(ghostTimerInterval);
      ghostTimerInterval = null;
    }
    if (activeChallenge && !isChallengeSolved(activeChallenge)) {
      try {
        window.CYBERTRIX_DB.attempts.pauseAttempt(activeChallenge.id);
      } catch (e) {}
    }
  });

  // =========================================================================
  // SUB-TASK UI RENDERING HELPERS (Requirements 1, 2, 4)
  // =========================================================================
  let currentMkActiveSubtask = null;
  let currentAsciiActiveSubtask = null;
  let selectedAsciiSubtaskIndex = null;
  let asciiDecodedVerified = false;
  let asciiVerifiedFlag = '';
  let lastActiveAsciiSubtaskId = null;
  let lastActiveMkSubtaskId = null;
  let lastWorkspaceChallengeId = null;

  var ASCII_CONTROL_LABELS = {
    0: 'NUL (Null)',
    1: 'SOH (Start of Header)',
    2: 'STX (Start of Text)',
    3: 'ETX (End of Text)',
    4: 'EOT (End of Trans.)',
    5: 'ENQ (Enquiry)',
    6: 'ACK (Acknowledge)',
    7: 'BEL (Bell)',
    8: 'BS (Backspace)',
    9: 'HT (Tab)',
    10: 'LF (Line Feed)',
    11: 'VT (Vert. Tab)',
    12: 'FF (Form Feed)',
    13: 'CR (Carriage Return)',
    14: 'SO (Shift Out)',
    15: 'SI (Shift In)',
    16: 'DLE (Data Link Escape)',
    17: 'DC1 (Device Control 1)',
    18: 'DC2 (Device Control 2)',
    19: 'DC3 (Device Control 3)',
    20: 'DC4 (Device Control 4)',
    21: 'NAK (Negative Ack)',
    22: 'SYN (Synchronous Idle)',
    23: 'ETB (End of Block)',
    24: 'CAN (Cancel)',
    25: 'EM (End of Medium)',
    26: 'SUB (Substitute)',
    27: 'ESC (Escape)',
    28: 'FS (File Separator)',
    29: 'GS (Group Separator)',
    30: 'RS (Record Separator)',
    31: 'US (Unit Separator)',
    32: 'SP (Space)',
    127: 'DEL (Delete)'
  };

  function clearGlobalFlagInput(clearFeedback = true) {
    const flagInput = document.getElementById('global-flag-input');
    const submitBtn = document.getElementById('global-flag-submit-btn');
    if (flagInput) {
      flagInput.value = '';
      flagInput.disabled = false;
      flagInput.placeholder = 'CYBERTRIX{enter_flag_here}';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '[ SUBMIT FLAG ]';
    }
    if (clearFeedback) {
      const feedbackBox = document.getElementById('global-flag-feedback');
      if (feedbackBox) {
        feedbackBox.style.display = 'none';
        feedbackBox.innerHTML = '';
        feedbackBox.className = 'submission-feedback';
      }
    }
  }

  function resetAsciiHuntState(ch) {
    selectedAsciiSubtaskIndex = null;
    asciiDecodedVerified = false;
    asciiVerifiedFlag = '';
    clearGlobalFlagInput(false);
    const inp = document.getElementById('ascii-answer-input');
    if (inp) inp.value = '';
    const feedbackBox = document.getElementById('ascii-answer-feedback');
    if (feedbackBox) {
      feedbackBox.style.display = 'none';
      feedbackBox.innerHTML = '';
    }
  }

  function getAsciiExpectedTarget(ch, activeSub) {
    if (activeSub) {
      if (activeSub.asciiHex && activeSub.asciiHex.trim()) {
        try {
          const decoded = activeSub.asciiHex.split(/\s+/).filter(Boolean).map(h => {
            if (/^[0-9]+$/.test(h) && !/^[0-9A-Fa-f]{2}$/.test(h)) {
              return String.fromCharCode(parseInt(h, 10));
            }
            return String.fromCharCode(parseInt(h, 16));
          }).join('').trim();
          if (decoded) return decoded;
        } catch (e) {}
      }
      if (activeSub.targetWord && activeSub.targetWord.trim()) return activeSub.targetWord.trim();
      if (activeSub.answer && activeSub.answer.trim()) return activeSub.answer.trim();
      if (activeSub.asciiValues && activeSub.asciiValues.trim()) {
        try {
          return activeSub.asciiValues.split(/\s+/).filter(Boolean).map(n => String.fromCharCode(parseInt(n, 10))).join('').trim();
        } catch (e) {}
      }
    }
    if (ch) {
      if (ch.asciiHex && ch.asciiHex.trim()) {
        try {
          const decoded = ch.asciiHex.split(/\s+/).filter(Boolean).map(h => {
            if (/^[0-9]+$/.test(h) && !/^[0-9A-Fa-f]{2}$/.test(h)) {
              return String.fromCharCode(parseInt(h, 10));
            }
            return String.fromCharCode(parseInt(h, 16));
          }).join('').trim();
          if (decoded) return decoded;
        } catch (e) {}
      }
      if (ch.targetWord && ch.targetWord.trim()) return ch.targetWord.trim();
      if (ch.answer && ch.answer.trim()) return ch.answer.trim();
      if (ch.asciiValues && ch.asciiValues.trim()) {
        try {
          return ch.asciiValues.split(/\s+/).filter(Boolean).map(n => String.fromCharCode(parseInt(n, 10))).join('').trim();
        } catch (e) {}
      }
    }
    return 'CYBER!';
  }

  function getAsciiExpectedFlag(ch, activeSub, expectedTarget) {
    if (activeSub && activeSub.flag && activeSub.flag.trim()) return activeSub.flag.trim();
    if (ch && ch.flag && ch.flag.trim()) return ch.flag.trim();
    return `CYBERTRIX{${expectedTarget}}`;
  }

  function renderMkSubtasksUI(ch) {
    const listEl = document.getElementById('mk-subtasks-list');
    const progValEl = document.getElementById('mk-subtasks-progress-val');
    const focusBar = document.getElementById('mk-current-subtask-banner');
    const focusText = document.getElementById('mk-current-subtask-text');
    const completeBanner = document.getElementById('mk-subtasks-complete-banner');

    if (!listEl) return { subtasks: [], activeSubtask: null, isAllDone: false };

    const defaultSubtasks = [
      { id: "task_1", title: "Sub-task 1", name: "Mirror Keyboard — Task 1", points: 100, question: "Type the target word PYTHON using the reciprocal mirror keyboard.", targetSentence: "PYTHON", targetWord: "PYTHON", answer: "PYTHON", description: "Task 1 of 3: Type the target word PYTHON using the reciprocal mirror keyboard." },
      { id: "task_2", title: "Sub-task 2", name: "Mirror Keyboard — Task 2", points: 100, question: "Type the target word CIPHER using the reciprocal mirror keyboard.", targetSentence: "CIPHER", targetWord: "CIPHER", answer: "CIPHER", description: "Task 2 of 3: Type the target word CIPHER using the reciprocal mirror keyboard." },
      { id: "task_3", title: "Sub-task 3", name: "Mirror Keyboard — Task 3", points: 100, question: "Type the target word NETWORK using the reciprocal mirror keyboard.", targetSentence: "NETWORK", targetWord: "NETWORK", answer: "NETWORK", description: "Task 3 of 3: Type the target word NETWORK using the reciprocal mirror keyboard." }
    ];

    let subtasks = [];
    if (Array.isArray(ch.subtasks) && ch.subtasks.length > 0) {
      subtasks = ch.subtasks.map(st => ({ ...st }));
      if (ch.question && subtasks[0] && !subtasks[0].question) {
        subtasks[0].question = ch.question;
      }
    } else if (ch.targetSentence || ch.targetWord || ch.question || ch.mirrorWord) {
      const singleTarget = ch.targetSentence || ch.targetWord || ch.answer || 'PYTHON';
      subtasks = [
        {
          id: "task_1",
          title: "Sub-task 1",
          name: ch.title || "Mirror Keyboard — Task 1",
          points: ch.points || 100,
          question: ch.question || ch.description || `Type the target word ${singleTarget} using the reciprocal mirror keyboard.`,
          targetSentence: singleTarget,
          targetWord: singleTarget,
          answer: singleTarget,
          description: ch.description || `Type the target word ${singleTarget} using the reciprocal mirror keyboard.`
        }
      ];
    } else {
      subtasks = defaultSubtasks;
    }

    const solvedList = (currentUser && currentUser.solvedSubtasks) || [];
    const isMainSolved = isChallengeSolved(ch);

    let solvedCount = 0;
    subtasks.forEach(st => {
      if (isMainSolved || solvedList.includes(`${ch.id}_${st.id}`)) {
        solvedCount++;
      }
    });

    const isAllDone = isMainSolved || solvedCount >= subtasks.length;
    let activeIndex = isAllDone ? -1 : subtasks.findIndex(st => !solvedList.includes(`${ch.id}_${st.id}`));
    if (activeIndex === -1 && !isAllDone) activeIndex = 0;

    const currentProgressNum = isAllDone ? subtasks.length : Math.min(subtasks.length, activeIndex + 1);
    if (progValEl) progValEl.textContent = `${currentProgressNum} / ${subtasks.length}`;

    listEl.innerHTML = subtasks.map((st, idx) => {
      const isSolved = isMainSolved || solvedList.includes(`${ch.id}_${st.id}`);
      const isActive = !isAllDone && (idx === activeIndex);
      const targetText = st.targetSentence || st.targetWord || st.answer || 'PYTHON';
      const qText = (st.question || st.description || (idx === 0 ? ch.question : '') || `Type the target word ${targetText} using the reciprocal mirror keyboard.`).trim();

      if (isSolved) {
        return `
          <div class="subtask-item-row solved">
            <div class="subtask-item-left">
              <span class="subtask-icon">✓</span>
              <div style="display: flex; flex-direction: column; gap: 0.15rem;">
                <span class="subtask-item-title">${escapeHTML(st.title || `Sub-task ${idx + 1}`)} <span class="subtask-item-pts">— ${st.points || 100} pts</span></span>
                <span style="font-family: var(--font-code); font-size: 0.73rem; color: #a0aec0; letter-spacing: 1px;">TARGET: <strong style="color: #68d391;">${escapeHTML(targetText)}</strong></span>
                ${qText ? `<span style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.4;">${escapeHTML(qText)}</span>` : ''}
              </div>
            </div>
            <span class="subtask-item-badge badge-solved">COMPLETED ✓</span>
          </div>
        `;
      } else if (isActive) {
        return `
          <div class="subtask-item-row active">
            <div class="subtask-item-left">
              <span class="subtask-icon">●</span>
              <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                <span class="subtask-item-title">${escapeHTML(st.title || `Sub-task ${idx + 1}`)} <span class="subtask-item-pts">— ${st.points || 100} pts</span></span>
                <span style="font-family: var(--font-code); font-size: 0.76rem; color: var(--cyan); letter-spacing: 1.5px; font-weight: 700;">TARGET WORD: <strong style="color: #ffffff; background: rgba(0, 243, 255, 0.18); border: 1px solid rgba(0, 243, 255, 0.45); padding: 2px 7px; border-radius: 3px; text-shadow: 0 0 8px rgba(0, 243, 255, 0.7);">${escapeHTML(targetText)}</strong></span>
                ${qText ? `<span style="font-size: 0.75rem; color: var(--cyan); line-height: 1.4; font-weight: 500;">${escapeHTML(qText)}</span>` : ''}
              </div>
            </div>
            <span class="subtask-item-badge badge-active">CURRENT TARGET</span>
          </div>
        `;
      } else {
        return `
          <div class="subtask-item-row locked">
            <div class="subtask-item-left">
              <span class="subtask-icon">🔒</span>
              <div style="display: flex; flex-direction: column; gap: 0.15rem;">
                <span class="subtask-item-title">${escapeHTML(st.title || `Sub-task ${idx + 1}`)} <span class="subtask-item-pts">— ${st.points || 100} pts</span></span>
                <span style="font-family: var(--font-code); font-size: 0.73rem; color: var(--text-muted); letter-spacing: 1px;">TARGET: <strong>${escapeHTML(targetText)}</strong></span>
                ${qText ? `<span style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.4;">${escapeHTML(qText)}</span>` : ''}
              </div>
            </div>
            <span class="subtask-item-badge badge-locked">LOCKED</span>
          </div>
        `;
      }
    }).join('');

    if (isAllDone) {
      if (focusBar) focusBar.style.display = 'none';
      if (completeBanner) completeBanner.style.display = 'block';
    } else {
      if (completeBanner) completeBanner.style.display = 'none';
      if (focusBar) {
        focusBar.style.display = 'flex';
        const curTask = subtasks[activeIndex];
        if (focusText && curTask) {
          const curTarget = curTask.targetSentence || curTask.targetWord || curTask.answer || 'PYTHON';
          focusText.textContent = `[ CURRENT SUB-TASK: ${curTask.title} — ${curTask.points} pts | TARGET: ${curTarget} ]`;
        }
      }
    }

    return {
      subtasks,
      activeSubtask: isAllDone ? null : subtasks[activeIndex],
      isAllDone
    };
  }

  function renderAsciiSubtasksUI(ch) {
    const listEl = document.getElementById('ascii-subtasks-list');
    const progValEl = document.getElementById('ascii-subtasks-progress-val');
    const focusBar = document.getElementById('ascii-current-subtask-banner');
    const focusText = document.getElementById('ascii-current-subtask-text');
    const completeBanner = document.getElementById('ascii-subtasks-complete-banner');

    if (!listEl) return { subtasks: [], activeSubtask: null, isAllDone: false };

    const subtasks = (Array.isArray(ch.subtasks) && ch.subtasks.length > 0) ? ch.subtasks : [
      { id: "task_1", title: "Sub-task 1", name: "ASCII Hex Decoding — Task 1", points: 200, asciiHex: "43 59 42 45 52 21", targetWord: "CYBER!", description: "Task 1 of 2: Decode the intercepted hexadecimal sequence into the target string (letters & symbols)." },
      { id: "task_2", title: "Sub-task 2", name: "ASCII Hex Decoding — Task 2", points: 200, asciiHex: "53 33 63 75 72 31 74 79 23", targetWord: "S3cur1ty#", description: "Task 2 of 2: Decode the complex hexadecimal telemetry containing numbers, uppercase, lowercase, and symbols." }
    ];

    const solvedList = (currentUser && currentUser.solvedSubtasks) || [];
    const isMainSolved = isChallengeSolved(ch);

    let solvedCount = 0;
    subtasks.forEach(st => {
      if (isMainSolved || solvedList.includes(`${ch.id}_${st.id}`)) {
        solvedCount++;
      }
    });

    const isAllDone = isMainSolved || solvedCount >= subtasks.length;
    let activeIndex = isAllDone ? -1 : subtasks.findIndex(st => !solvedList.includes(`${ch.id}_${st.id}`));
    if (activeIndex === -1 && !isAllDone) activeIndex = 0;

    let displayIndex = (selectedAsciiSubtaskIndex !== null && selectedAsciiSubtaskIndex >= 0 && selectedAsciiSubtaskIndex < subtasks.length)
      ? selectedAsciiSubtaskIndex
      : activeIndex;
    if (displayIndex === -1 && subtasks.length > 0) {
      displayIndex = subtasks.length - 1;
    }

    const currentProgressNum = isAllDone ? subtasks.length : Math.min(subtasks.length, (displayIndex >= 0 ? displayIndex : activeIndex) + 1);
    if (progValEl) progValEl.textContent = `${currentProgressNum} / ${subtasks.length}`;

    listEl.innerHTML = subtasks.map((st, idx) => {
      const isSolved = isMainSolved || solvedList.includes(`${ch.id}_${st.id}`);
      const isDisplayActive = (idx === displayIndex);
      const hexPreview = st.asciiHex || st.asciiValues || '';

      if (isSolved) {
        return `
          <div class="subtask-item-row solved ${isDisplayActive ? 'active' : ''}" data-subtask-index="${idx}" style="cursor: pointer;">
            <div class="subtask-item-left">
              <span class="subtask-icon">✓</span>
              <div style="display: flex; flex-direction: column; gap: 0.15rem;">
                <span class="subtask-item-title">${escapeHTML(st.title || `Sub-task ${idx + 1}`)} <span class="subtask-item-pts">— ${st.points || 200} pts</span></span>
                ${hexPreview ? `<span style="font-family: var(--font-code); font-size: 0.73rem; color: #a0aec0; letter-spacing: 1px;">HEX: <strong style="color: #68d391;">${escapeHTML(hexPreview)}</strong></span>` : ''}
              </div>
            </div>
            <span class="subtask-item-badge badge-solved">${isDisplayActive ? 'VIEWING ✓' : 'COMPLETED ✓'}</span>
          </div>
        `;
      } else if (isDisplayActive) {
        return `
          <div class="subtask-item-row active" data-subtask-index="${idx}" style="cursor: pointer;">
            <div class="subtask-item-left">
              <span class="subtask-icon">●</span>
              <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                <span class="subtask-item-title">${escapeHTML(st.title || `Sub-task ${idx + 1}`)} <span class="subtask-item-pts">— ${st.points || 200} pts</span></span>
                ${hexPreview ? `<span style="font-family: var(--font-code); font-size: 0.75rem; color: var(--cyan); letter-spacing: 1.2px;">HEX STREAM: <strong style="color: #00ff9d; background: rgba(0, 255, 157, 0.1); border: 1px solid rgba(0, 255, 157, 0.35); padding: 2px 7px; border-radius: 3px;">${escapeHTML(hexPreview)}</strong></span>` : ''}
              </div>
            </div>
            <span class="subtask-item-badge badge-active">CURRENT TARGET</span>
          </div>
        `;
      } else {
        return `
          <div class="subtask-item-row locked" data-subtask-index="${idx}" style="cursor: pointer;">
            <div class="subtask-item-left">
              <span class="subtask-icon">🔒</span>
              <div style="display: flex; flex-direction: column; gap: 0.15rem;">
                <span class="subtask-item-title">${escapeHTML(st.title || `Sub-task ${idx + 1}`)} <span class="subtask-item-pts">— ${st.points || 200} pts</span></span>
                ${hexPreview ? `<span style="font-family: var(--font-code); font-size: 0.73rem; color: var(--text-muted); letter-spacing: 1px;">HEX: <strong>${escapeHTML(hexPreview)}</strong></span>` : ''}
              </div>
            </div>
            <span class="subtask-item-badge badge-locked">SUB-TASK ${idx + 1}</span>
          </div>
        `;
      }
    }).join('');

    listEl.querySelectorAll('.subtask-item-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.getAttribute('data-subtask-index'), 10);
        if (!isNaN(idx) && subtasks[idx]) {
          selectedAsciiSubtaskIndex = idx;
          clearGlobalFlagInput(true);
          updateWorkspaceView(ch);
        }
      });
    });

    if (isAllDone) {
      if (focusBar) focusBar.style.display = 'none';
      if (completeBanner) completeBanner.style.display = 'block';
    } else {
      if (completeBanner) completeBanner.style.display = 'none';
      if (focusBar) {
        focusBar.style.display = 'flex';
        const curTask = subtasks[displayIndex >= 0 ? displayIndex : (activeIndex >= 0 ? activeIndex : 0)];
        if (focusText && curTask) {
          const hexNote = curTask.asciiHex || curTask.asciiValues ? ` | HEX: ${curTask.asciiHex || curTask.asciiValues}` : '';
          focusText.textContent = `[ CURRENT SUB-TASK: ${curTask.title} — ${curTask.points} pts${hexNote} ]`;
        }
      }
    }

    const activeSubtask = (displayIndex >= 0 && subtasks[displayIndex]) ? subtasks[displayIndex] : (isAllDone ? null : subtasks[activeIndex]);
    return {
      subtasks,
      activeSubtask,
      displayIndex,
      activeIndex,
      isAllDone
    };
  }

  function updateWorkspaceView(ch) {
    if (!ch) return;

    // Challenge transition detection: Reset global flag input and feedback when switching challenges
    if (lastWorkspaceChallengeId !== ch.id) {
      lastWorkspaceChallengeId = ch.id;
      lastActiveMkSubtaskId = null;
      lastActiveAsciiSubtaskId = null;
      clearGlobalFlagInput(true);
    }

    // 1. Top Bar Meta
    const orderPadded = String(ch.order || 1).padStart(2, '0');
    const solved = isChallengeSolved(ch);

    const orderBadge = document.getElementById('ws-ch-order-badge');
    const titleBadge = document.getElementById('ws-ch-title-badge');
    const catBadge = document.getElementById('ws-ch-category-badge');
    const ptsBadge = document.getElementById('ws-ch-points-badge');
    const solvedBadge = document.getElementById('ws-ch-solved-badge');
    const targetLabel = document.getElementById('flag-target-label');

    if (orderBadge) orderBadge.textContent = orderPadded;
    if (titleBadge) titleBadge.textContent = ch.title;
    if (catBadge) catBadge.textContent = ch.category || 'CRYPTO';
    if (ptsBadge) ptsBadge.textContent = `${ch.points || 100} PTS`;
    if (solvedBadge) solvedBadge.style.display = solved ? 'block' : 'none';
    if (targetLabel) targetLabel.textContent = `TARGET: ${ch.title.toUpperCase()}`;

    // 2. Toggle Specific Challenge Workspaces
    const wsMirror = document.getElementById('workspace-mirror-keyboard');
    const wsHiddenVault = document.getElementById('workspace-hidden-vault');
    const wsAscii = document.getElementById('workspace-ascii-hunt');
    const wsGhost = document.getElementById('workspace-metadata-ghost');

    const isMirror = ch.type === 'mirror-keyboard' || ch.id.startsWith('mirror-keyboard');
    const isHiddenVault = ch.type === 'hidden-vault' || ch.id === 'hidden-vault';
    const isAscii = ch.type === 'ascii-hunt' || ch.id.startsWith('ascii-hunt');
    const isGhost = ch.type === 'metadata-ghost' || ch.id === 'metadata-ghost';

    if (wsMirror) wsMirror.style.display = isMirror ? 'block' : 'none';
    if (wsHiddenVault) wsHiddenVault.style.display = isHiddenVault ? 'block' : 'none';
    if (wsAscii) wsAscii.style.display = isAscii ? 'block' : 'none';
    if (wsGhost) wsGhost.style.display = isGhost ? 'block' : 'none';

    // 3. Initialize Specific Workspace Content
    if (isMirror) {
      const mkTitle = document.getElementById('mk-workspace-title');
      const mkDesc = document.getElementById('mk-workspace-desc');
      if (mkTitle) mkTitle.textContent = ch.title || "MIRROR KEYBOARD";
      if (mkDesc) mkDesc.textContent = ch.question || ch.description || "Decipher keystrokes on the inverted reciprocal mirror keyboard array. Type the target transmission to capture the flags.";
      
      const subtaskState = renderMkSubtasksUI(ch);
      currentMkActiveSubtask = subtaskState.activeSubtask;
      const currentMkSubtaskId = currentMkActiveSubtask ? currentMkActiveSubtask.id : (subtaskState.isAllDone ? 'done' : 'task_1');
      if (lastActiveMkSubtaskId && lastActiveMkSubtaskId !== currentMkSubtaskId) {
        mkSequenceVerified = false;
        mkVerifiedFlag = '';
        clearGlobalFlagInput(true);
      }
      lastActiveMkSubtaskId = currentMkSubtaskId;
      const currentProgressNum = subtaskState.isAllDone ? (subtaskState.subtasks.length || 3) : (subtaskState.subtasks.findIndex(st => st.id === (currentMkActiveSubtask && currentMkActiveSubtask.id)) + 1 || 1);

      resetMirrorKeyboard(ch);

      const targetDisplay = document.getElementById('mk-target-sentence-display');
      const progressBadge = document.getElementById('mk-sentence-progress-badge');
      const qTextEl = document.getElementById('mk-task-question-text');
      const qDisplayEl = document.getElementById('mk-task-question-display');

      const cur = subtaskState.activeSubtask;
      const normalText = (cur && (cur.targetSentence || cur.targetWord || cur.answer)) || ch.targetSentence || ch.targetWord || ch.answer || "PYTHON";
      let taskQuestion = (cur && (cur.question || cur.description)) || ch.question || ch.description || "";
      if (!taskQuestion || taskQuestion.includes('mirror word') || taskQuestion.includes('programming language') || taskQuestion.includes('Type the target word PYTHON')) {
        taskQuestion = "Left is Right, Right is left. Type what you see, not what you mean.";
      }
      taskQuestion = taskQuestion.replace(/^(OBJECTIVE\s*\/\s*QUESTION|OBJECTIVE|QUESTION)\s*:\s*/i, '').trim();
      if (qTextEl) {
        if (qTextEl.textContent.trim() !== taskQuestion.trim()) {
          qTextEl.classList.add('glow-pulse-update');
          setTimeout(() => qTextEl.classList.remove('glow-pulse-update'), 600);
        }
        qTextEl.textContent = taskQuestion;
      }
      if (qDisplayEl) qDisplayEl.style.display = 'block';

      if (subtaskState.isAllDone || solved) {
        if (progressBadge) progressBadge.textContent = "STATUS: CHALLENGE SOLVED ✓";
        if (targetDisplay) targetDisplay.textContent = "ALL TRANSMISSIONS DECODED ✓";
      } else if (subtaskState.activeSubtask) {
        if (progressBadge) progressBadge.textContent = `${(cur.title || 'SUB-TASK').toUpperCase()} // ACTIVE`;
        
        // Show the normal target word to players (NO mirror words)
        if (targetDisplay) {
          if (targetDisplay.textContent.trim() !== normalText.trim()) {
            targetDisplay.classList.add('glow-pulse-update');
            setTimeout(() => targetDisplay.classList.remove('glow-pulse-update'), 600);
          }
          targetDisplay.textContent = normalText;
        }
      }

      // Mirror Keyboard: Lock manual flag entry form until sequence is verified
      const flagNotice = document.getElementById('mk-flag-locked-notice');
      const flagActiveForm = document.getElementById('flag-active-form-wrapper');
      if (subtaskState.isAllDone || solved) {
        if (flagNotice) {
          flagNotice.style.display = 'block';
          flagNotice.className = 'event-paused-banner';
          flagNotice.style.background = 'rgba(0, 255, 157, 0.12)';
          flagNotice.style.borderColor = 'var(--green)';
          flagNotice.style.color = 'var(--green)';
          flagNotice.innerHTML = `<span>✓</span> <strong>MIRROR KEYBOARD COMPLETED:</strong> All transmissions decoded! All sub-tasks solved.`;
        }
        if (flagActiveForm) flagActiveForm.style.display = 'none';
      } else if (mkSequenceVerified) {
        if (flagNotice) {
          flagNotice.style.display = 'block';
          flagNotice.className = 'event-paused-banner';
          flagNotice.style.background = 'rgba(0, 255, 157, 0.12)';
          flagNotice.style.borderColor = 'var(--green)';
          flagNotice.style.color = 'var(--green)';
          flagNotice.innerHTML = `<span>✓</span> <strong>SEQUENCE VERIFIED:</strong> Flag <code style="color: #fff; font-family: var(--font-code);">${escapeHTML(mkVerifiedFlag)}</code> unlocked. Click [ SUBMIT FLAG ] below to claim points!`;
        }
        if (flagActiveForm) flagActiveForm.style.display = 'block';
      } else {
        if (flagNotice) {
          flagNotice.style.display = 'block';
          flagNotice.className = 'event-paused-banner';
          flagNotice.style.background = 'rgba(0, 243, 255, 0.08)';
          flagNotice.style.borderColor = 'var(--cyan)';
          flagNotice.style.color = 'var(--cyan)';
          flagNotice.innerHTML = `<span>⚡</span> <strong>SUB-TASK ${currentProgressNum} ACTIVE:</strong> Target Word: <strong style="color: #fff; font-family: var(--font-code);">${escapeHTML(normalText)}</strong>. Type using reciprocal mirror keyboard or enter flag below.`;
        }
        if (flagActiveForm) flagActiveForm.style.display = 'block';
      }
    } else if (isAscii) {
      const asciiTitle = document.getElementById('ascii-workspace-title');
      const asciiBadge = document.getElementById('ascii-workspace-badge');
      const asciiDesc = document.getElementById('ascii-workspace-desc');
      if (asciiTitle) asciiTitle.textContent = `◈ ${ch.title.toUpperCase()} // HEXADECIMAL DECODER`;
      
      const asciiState = renderAsciiSubtasksUI(ch);
      currentAsciiActiveSubtask = asciiState.activeSubtask;

      // Track subtask changes to reset verification if moving between subtasks
      const currentSubtaskId = currentAsciiActiveSubtask ? currentAsciiActiveSubtask.id : 'done';
      if (lastActiveAsciiSubtaskId !== currentSubtaskId) {
        asciiDecodedVerified = false;
        asciiVerifiedFlag = '';
        clearGlobalFlagInput(true);
        lastActiveAsciiSubtaskId = currentSubtaskId;
        const feedbackBox = document.getElementById('ascii-answer-feedback');
        if (feedbackBox) {
          feedbackBox.style.display = 'none';
          feedbackBox.innerHTML = '';
        }
        const inp = document.getElementById('ascii-answer-input');
        if (inp) inp.value = '';
      }

      const activeSub = currentAsciiActiveSubtask || (asciiState && asciiState.subtasks && (asciiState.isAllDone ? asciiState.subtasks[asciiState.subtasks.length - 1] : asciiState.subtasks[0]));
      const asciiStreamVal = (activeSub && (activeSub.asciiHex || activeSub.asciiValues)) || ch.asciiHex || ch.asciiValues || '43 59 42 45 52 21';
      renderAsciiStream(asciiStreamVal);
      populateAsciiReferenceTable();

      const curTaskDesc = (activeSub && (activeSub.question || activeSub.description || activeSub.instructions)) || ch.question || ch.description || "Decode the intercepted hexadecimal byte stream into its ASCII plaintext character representation.";
      if (asciiDesc) asciiDesc.textContent = curTaskDesc;

      const asciiProgressNum = (asciiState.displayIndex !== undefined && asciiState.displayIndex >= 0)
        ? (asciiState.displayIndex + 1)
        : (asciiState.isAllDone ? (asciiState.subtasks.length || 2) : 1);

      if (asciiState.isAllDone && !currentAsciiActiveSubtask) {
        if (asciiBadge) asciiBadge.textContent = `COMPLETED // ${ch.points || 400} PTS`;
      } else if (activeSub) {
        if (asciiBadge) asciiBadge.textContent = `${activeSub.title.toUpperCase()} // ${activeSub.points || 200} PTS`;
      }

      // ASCII Hunt: Lock manual flag entry form until decoded value is verified
      const flagNotice = document.getElementById('mk-flag-locked-notice');
      const flagActiveForm = document.getElementById('flag-active-form-wrapper');
      if (asciiState.isAllDone || solved) {
        if (flagNotice) {
          flagNotice.style.display = 'block';
          flagNotice.className = 'event-paused-banner';
          flagNotice.style.background = 'rgba(0, 255, 157, 0.12)';
          flagNotice.style.borderColor = 'var(--green)';
          flagNotice.style.color = 'var(--green)';
          flagNotice.innerHTML = `<span>✓</span> <strong>ASCII VALUE FINDING COMPLETED:</strong> All transmissions decoded! All sub-tasks solved.`;
        }
        if (flagActiveForm) flagActiveForm.style.display = 'none';
      } else if (asciiDecodedVerified) {
        if (flagNotice) {
          flagNotice.style.display = 'block';
          flagNotice.className = 'event-paused-banner';
          flagNotice.style.background = 'rgba(0, 255, 157, 0.12)';
          flagNotice.style.borderColor = 'var(--green)';
          flagNotice.style.color = 'var(--green)';
          flagNotice.innerHTML = `<span>✓</span> <strong>VALUE VERIFIED:</strong> Flag <code style="color: #fff; font-family: var(--font-code);">${escapeHTML(asciiVerifiedFlag)}</code> is unlocked. Click [ SUBMIT FLAG ] below to claim points!`;
        }
        if (flagActiveForm) flagActiveForm.style.display = 'block';
      } else {
        if (flagNotice) {
          flagNotice.style.display = 'block';
          flagNotice.className = 'event-paused-banner';
          flagNotice.style.background = 'rgba(0, 243, 255, 0.08)';
          flagNotice.style.borderColor = 'var(--cyan)';
          flagNotice.style.color = 'var(--cyan)';
          flagNotice.innerHTML = `<span>⚡</span> <strong>SUB-TASK ${asciiProgressNum} ACTIVE:</strong> Hex Sequence: <code style="color: #fff; font-family: var(--font-code);">${escapeHTML(asciiStreamVal)}</code>. Decode hexadecimal bytes or enter flag below.`;
        }
        if (flagActiveForm) flagActiveForm.style.display = 'block';
      }
    } else {
      const flagNotice = document.getElementById('mk-flag-locked-notice');
      const flagActiveForm = document.getElementById('flag-active-form-wrapper');
      if (flagNotice) flagNotice.style.display = 'none';
      if (flagActiveForm) flagActiveForm.style.display = 'block';
      if (isHiddenVault) {
        renderHiddenVaultWorkspace(ch);
      } else if (isGhost) {
        initGhostChallenge(ch);
      }
    }

    // 4. Initialize Universal Challenge Timer (Requirement 2: Every challenge has its own timer)
    initUniversalChallengeTimer(ch);

    // 5. Update Flag Feedback Banner & Ensure Controls are active if unsolved
    const fb = document.getElementById('global-flag-feedback');
    const globallyLocked = isChallengeGloballyLocked(ch);
    if (fb) {
      if (globallyLocked) {
        fb.className = 'submission-feedback access-denied';
        fb.innerHTML = `<span>🔒</span> CHALLENGE LOCKED BY ADMINISTRATOR`;
        fb.style.display = 'flex';
      } else if (solved) {
        fb.className = 'submission-feedback access-granted';
        fb.innerHTML = `<span>✓</span> CHALLENGE COMPLETED // LOCKED FOR THIS OPERATIVE (+${ch.points || 100} PTS)`;
        fb.style.display = 'flex';
      } else {
        fb.style.display = 'none';
      }
    }

    const submitBtn = document.getElementById('global-flag-submit-btn');
    const flagInputEl = document.getElementById('global-flag-input');
    if (globallyLocked) {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '🔒 LOCKED BY ADMIN';
      }
      if (flagInputEl) {
        flagInputEl.disabled = true;
        flagInputEl.placeholder = 'CHALLENGE LOCKED BY ADMINISTRATOR';
      }
    } else if (solved) {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '🔒 COMPLETED & LOCKED';
      }
      if (flagInputEl) {
        flagInputEl.disabled = true;
        flagInputEl.placeholder = 'CHALLENGE COMPLETED — PERMANENTLY LOCKED ✓';
      }
    } else {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '[ SUBMIT FLAG ]';
      }
      if (flagInputEl) {
        flagInputEl.disabled = false;
        flagInputEl.placeholder = 'CYBERTRIX{enter_flag_here}';
      }
    }

    // 6. Check disabled player interaction restriction
    checkUserDisabledStatus();
  }

  // =========================================================================
  // UNIVERSAL PER-CHALLENGE TIMER ENGINE (Requirements 2 & 3)
  // Supports Start, Pause, Resume, Restart, and Automatic Timeout Handling
  // =========================================================================
  let challengeTimerInterval = null;
  let activeChallengeAttempt = null;

  function initChallengeTimerControls() {
    const btnPause = document.getElementById('btn-challenge-timer-pause');
    const btnResume = document.getElementById('btn-challenge-timer-resume');
    const btnRestart = document.getElementById('btn-challenge-timer-restart');
    const btnExpRestart = document.getElementById('btn-expired-restart');

    if (btnPause) btnPause.addEventListener('click', handleTimerPauseClick);
    if (btnResume) btnResume.addEventListener('click', handleTimerResumeClick);
    if (btnRestart) btnRestart.addEventListener('click', window.restartActiveChallengeTimer);
    if (btnExpRestart) btnExpRestart.addEventListener('click', window.restartActiveChallengeTimer);
  }

  async function initUniversalChallengeTimer(ch) {
    if (challengeTimerInterval) {
      clearInterval(challengeTimerInterval);
      challengeTimerInterval = null;
    }

    const timerBar = document.getElementById('ws-challenge-timer-bar');
    const expiredOverlay = document.getElementById('challenge-expired-overlay');
    const btnPause = document.getElementById('btn-challenge-timer-pause');
    const btnResume = document.getElementById('btn-challenge-timer-resume');

    if (expiredOverlay) expiredOverlay.style.display = 'none';
    disableChallengeInteractions(false);

    // If challenge does not have timer enabled or timer duration is 0
    if (ch.timerEnabled === false || !ch.timerSeconds || ch.timerSeconds <= 0) {
      if (timerBar) timerBar.style.display = 'none';
      return;
    }

    if (timerBar) timerBar.style.display = 'block';

    try {
      const attempt = await window.CYBERTRIX_DB.attempts.startAttempt(ch.id);
      activeChallengeAttempt = attempt;

      if (attempt.status === 'solved') {
        renderUniversalTimerDisplay(attempt.remainingSeconds || 0);
        if (btnPause) btnPause.style.display = 'none';
        if (btnResume) btnResume.style.display = 'none';
        return;
      }

      if (attempt.status === 'expired' || (attempt.remainingSeconds <= 0 && attempt.status !== 'solved')) {
        renderUniversalTimerDisplay(0);
        handleChallengeTimeExpired();
        return;
      }

      if (attempt.status === 'paused') {
        renderUniversalTimerDisplay(attempt.remainingSeconds);
        if (btnPause) btnPause.style.display = 'none';
        if (btnResume) btnResume.style.display = 'inline-flex';
        disableChallengeInteractions(true);
        return;
      }

      // Active running attempt
      if (btnPause) btnPause.style.display = 'inline-flex';
      if (btnResume) btnResume.style.display = 'none';
      renderUniversalTimerDisplay(attempt.remainingSeconds);
      startChallengeTimerLoop(attempt);

    } catch (err) {
      console.warn("Challenge timer initialization:", err.message);
    }
  }

  function startChallengeTimerLoop(attempt) {
    if (challengeTimerInterval) {
      clearInterval(challengeTimerInterval);
      challengeTimerInterval = null;
    }

    challengeTimerInterval = setInterval(async () => {
      if (!activeChallenge) return;

      const now = Date.now();
      const expiresAtMs = attempt.expiresAt ? new Date(attempt.expiresAt).getTime() : 0;
      const remSec = Math.max(0, Math.floor((expiresAtMs - now) / 1000));

      renderUniversalTimerDisplay(remSec);

      if (remSec <= 0) {
        clearInterval(challengeTimerInterval);
        challengeTimerInterval = null;
        try {
          await window.CYBERTRIX_DB.attempts.expireAttempt(activeChallenge.id);
        } catch (e) {}
        handleChallengeTimeExpired();
      }
    }, 1000);
  }

  function renderUniversalTimerDisplay(seconds) {
    const countdownEl = document.getElementById('ws-timer-countdown');
    const timerBox = document.querySelector('.challenge-timer-box');
    const ghostDisplay = document.getElementById('ghost-timer-display');

    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    if (countdownEl) countdownEl.textContent = formatted;
    if (ghostDisplay) ghostDisplay.textContent = formatted;

    if (timerBox) {
      if (seconds > 0 && seconds <= 60) {
        timerBox.classList.add('timer-warning');
      } else {
        timerBox.classList.remove('timer-warning');
      }
    }
  }

  function handleChallengeTimeExpired() {
    renderUniversalTimerDisplay(0);
    const expiredOverlay = document.getElementById('challenge-expired-overlay');
    if (expiredOverlay) expiredOverlay.style.display = 'flex';

    // Disable challenge interaction and flag submission
    disableChallengeInteractions(true);

    const flagInput = document.getElementById('global-flag-input');
    const submitBtn = document.getElementById('global-flag-submit-btn');
    if (flagInput) {
      flagInput.disabled = true;
      flagInput.placeholder = "TIME EXPIRED — RESTART CHALLENGE TO SUBMIT";
    }
    if (submitBtn) {
      submitBtn.disabled = true;
    }

    window.showCyberToast("TIME EXPIRED: Operational window has lapsed.", "error");
    if (window.cyberSound) window.cyberSound.playError();
  }

  function disableChallengeInteractions(disabled) {
    // Flag form controls
    const flagInput = document.getElementById('global-flag-input');
    const submitBtn = document.getElementById('global-flag-submit-btn');
    if (flagInput) {
      flagInput.disabled = disabled;
      if (!disabled) flagInput.placeholder = "CYBERTRIX{enter_flag_here}";
    }
    if (submitBtn) submitBtn.disabled = disabled;

    // Mirror Keyboard keys
    document.querySelectorAll('.mk-key, #mk-btn-clear, #mk-btn-backspace, #mk-btn-space').forEach(btn => {
      btn.disabled = disabled;
      btn.style.pointerEvents = disabled ? 'none' : 'auto';
      btn.style.opacity = disabled ? '0.4' : '1';
    });

    // Hidden Vault controls
    const hvKeywordInput = document.getElementById('hv-vault-keyword-input');
    const hvUnlockBtn = document.getElementById('hv-btn-unlock');
    const hvLogo = document.getElementById('hv-event-logo');
    if (hvKeywordInput) hvKeywordInput.disabled = disabled;
    if (hvUnlockBtn) hvUnlockBtn.disabled = disabled;
    if (hvLogo) {
      hvLogo.style.pointerEvents = disabled ? 'none' : 'auto';
      hvLogo.style.opacity = disabled ? '0.4' : '1';
    }
    document.querySelectorAll('#hv-log-stream .hv-log-row, #hv-files-grid .hv-file-card').forEach(el => {
      el.style.pointerEvents = disabled ? 'none' : 'auto';
      el.style.opacity = disabled ? '0.4' : '1';
    });

    // ASCII Hunt controls
    const asciiInp = document.getElementById('ascii-answer-input');
    const asciiBtn = document.getElementById('ascii-submit-btn');
    if (asciiInp) asciiInp.disabled = disabled;
    if (asciiBtn) asciiBtn.disabled = disabled;

    // Ghost controls
    const ghostInp = document.getElementById('ghost-answer-input');
    const ghostBtn = document.getElementById('ghost-verify-btn');
    if (ghostInp) ghostInp.disabled = disabled;
    if (ghostBtn) ghostBtn.disabled = disabled;
  }

  async function handleTimerPauseClick() {
    if (!activeChallenge) return;
    try {
      if (challengeTimerInterval) {
        clearInterval(challengeTimerInterval);
        challengeTimerInterval = null;
      }
      const attempt = await window.CYBERTRIX_DB.attempts.pauseAttempt(activeChallenge.id);
      activeChallengeAttempt = attempt;

      const btnPause = document.getElementById('btn-challenge-timer-pause');
      const btnResume = document.getElementById('btn-challenge-timer-resume');
      if (btnPause) btnPause.style.display = 'none';
      if (btnResume) btnResume.style.display = 'inline-flex';

      disableChallengeInteractions(true);
      window.showCyberToast("CHALLENGE TIMER PAUSED", "info");
      if (window.cyberSound) window.cyberSound.playClick();
    } catch (e) {
      window.showCyberToast(e.message, "error");
    }
  }

  async function handleTimerResumeClick() {
    if (!activeChallenge) return;
    try {
      const attempt = await window.CYBERTRIX_DB.attempts.resumeAttempt(activeChallenge.id);
      activeChallengeAttempt = attempt;

      const btnPause = document.getElementById('btn-challenge-timer-pause');
      const btnResume = document.getElementById('btn-challenge-timer-resume');
      if (btnPause) btnPause.style.display = 'inline-flex';
      if (btnResume) btnResume.style.display = 'none';

      disableChallengeInteractions(false);
      renderUniversalTimerDisplay(attempt.remainingSeconds);
      startChallengeTimerLoop(attempt);

      window.showCyberToast("CHALLENGE TIMER RESUMED", "success");
      if (window.cyberSound) window.cyberSound.playClick();
    } catch (e) {
      window.showCyberToast(e.message, "error");
    }
  }

  window.restartActiveChallengeTimer = async function () {
    if (!activeChallenge) return;
    if (isChallengeSolved(activeChallenge)) {
      window.showCyberToast("Challenge already completed and locked. Restart is not permitted.", "info");
      return;
    }
    if (isChallengeGloballyLocked(activeChallenge)) {
      window.showCyberToast("Challenge is globally locked by Administrator.", "error");
      return;
    }
    try {
      const attempt = await window.CYBERTRIX_DB.attempts.restartAttempt(activeChallenge.id);
      activeChallengeAttempt = attempt;

      const expiredOverlay = document.getElementById('challenge-expired-overlay');
      if (expiredOverlay) expiredOverlay.style.display = 'none';

      disableChallengeInteractions(false);

      // Reset specific challenge internal state
      if (activeChallenge.type === 'mirror-keyboard' || activeChallenge.id === 'mirror-keyboard') {
        resetMirrorKeyboard(activeChallenge);
      } else if (activeChallenge.type === 'hidden-vault' || activeChallenge.id === 'hidden-vault') {
        resetHiddenVaultWorkspace(activeChallenge);
      } else if (activeChallenge.type === 'ascii-hunt' || activeChallenge.id === 'ascii-hunt' || activeChallenge.id.startsWith('ascii-hunt')) {
        resetAsciiHuntState(activeChallenge);
      } else if (activeChallenge.type === 'metadata-ghost' || activeChallenge.id === 'metadata-ghost') {
        const inp = document.getElementById('ghost-answer-input');
        if (inp) inp.value = '';
        const statusBox = document.getElementById('ghost-verify-status');
        if (statusBox) statusBox.style.display = 'none';
      }

      await initUniversalChallengeTimer(activeChallenge);
      window.showCyberToast("CHALLENGE RESTARTED: Timer reset to full duration.", "success");
      if (window.cyberSound) window.cyberSound.playClick();
    } catch (e) {
      window.showCyberToast(e.message, "error");
    }
  };

  // =========================================================================
  // 7. MIRROR KEYBOARD CONTROLLER: RECIPROCAL KEYSTROKE MATRIX
  // =========================================================================

  function initMirrorKeyboard() {
    const keys = document.querySelectorAll('.mk-key');
    keys.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        if (key) handleMirrorKeypress(key);
      });
    });

    const btnClear = document.getElementById('mk-btn-clear');
    if (btnClear) btnClear.addEventListener('click', handleMkClear);

    const btnBackspace = document.getElementById('mk-btn-backspace');
    if (btnBackspace) btnBackspace.addEventListener('click', handleMkBackspace);

    const btnSpace = document.getElementById('mk-btn-space');
    if (btnSpace) btnSpace.addEventListener('click', () => handleMirrorKeypress(' '));

    const btnSubmit = document.getElementById('mk-btn-submit');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.title = "Type sequence using mirror keyboard to enable submission";
      btnSubmit.addEventListener('click', () => {
        handleMkSubmitSequence();
      });
    }

    // Physical Keyboard Listener
    window.addEventListener('keydown', (e) => {
      const wsMirror = document.getElementById('workspace-mirror-keyboard');
      if (!wsMirror || wsMirror.style.display === 'none') return;
      if (!activeChallenge || (activeChallenge.type !== 'mirror-keyboard' && activeChallenge.id !== 'mirror-keyboard')) return;

      const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : '';
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

      const key = e.key;
      if (key === 'Backspace') {
        e.preventDefault();
        handleMkBackspace();
      } else if (key === 'Enter') {
        e.preventDefault();
        if (mkBuffer && mkBuffer.trim().length > 0) {
          handleMkSubmitSequence();
        } else {
          window.showCyberToast("KEYBOARD SEQUENCE REQUIRED: Type the target word using the mirror keyboard array before submitting.", "warning");
          if (window.cyberSound && window.cyberSound.playError) window.cyberSound.playError();
        }
      } else if (key === ' ' || key === 'Spacebar') {
        e.preventDefault();
        handleMirrorKeypress(' ');
      } else if (key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        handleMirrorKeypress(key);
      }
    });
  }

  function handleMirrorKeypress(sourceChar) {
    if (!activeChallenge) return;

    const sourceCharUpper = sourceChar.toUpperCase();
    const mirroredChar = getMirroredChar(sourceChar);

    // Only glow the key that the user touched - do not show/reveal the other key on the keyboard
    const sourceBtn = document.querySelector(`.mk-key[data-key="${sourceCharUpper}"]`);
    if (sourceBtn) {
      sourceBtn.classList.add('key-source-glow');
      setTimeout(() => sourceBtn.classList.remove('key-source-glow'), 200);
    }

    // Output the mirrored character into the stream without highlighting the other key on the keyboard
    mkBuffer += mirroredChar;
    updateMkStreamUI();
    if (window.cyberSound && window.cyberSound.playClick) window.cyberSound.playClick();
  }

  function handleMkBackspace() {
    if (mkBuffer.length > 0) {
      mkBuffer = mkBuffer.slice(0, -1);
      updateMkStreamUI();
      if (window.cyberSound && window.cyberSound.playClick) window.cyberSound.playClick();
    }
  }

  function handleMkClear() {
    mkBuffer = '';
    updateMkStreamUI();
    if (window.cyberSound && window.cyberSound.playClick) window.cyberSound.playClick();
  }

  function updateMkStreamUI() {
    const streamText = document.getElementById('mk-stream-text');
    const streamCounter = document.getElementById('mk-stream-counter');
    const streamStatus = document.getElementById('mk-stream-status');
    const btnSubmit = document.getElementById('mk-btn-submit');

    if (streamText) streamText.textContent = mkBuffer;
    if (streamCounter) streamCounter.textContent = `LENGTH: ${mkBuffer.length} CHARS`;
    if (streamStatus) streamStatus.textContent = mkBuffer.length > 0 ? "STREAM ACTIVE // DECODING" : "KEYSTROKE TRANSLATOR // READY";

    const hasInput = !!(mkBuffer && mkBuffer.trim().length > 0);
    if (btnSubmit) {
      btnSubmit.disabled = !hasInput;
      btnSubmit.title = hasInput ? "Submit keystroke sequence" : "Type sequence using mirror keyboard to enable submission";
    }
  }

  let mkSequenceVerified = false;
  let mkVerifiedFlag = '';

  function handleMkSubmitSequence() {
    if (!activeChallenge) return;
    if (!mkBuffer || !mkBuffer.trim()) {
      window.showCyberToast("KEYBOARD SEQUENCE REQUIRED: Please type the target word using the mirror keyboard before submitting.", "warning");
      if (window.cyberSound && window.cyberSound.playError) window.cyberSound.playError();
      return;
    }

    const val = mkBuffer.trim();
    const subtaskState = renderMkSubtasksUI(activeChallenge);
    const cur = subtaskState.activeSubtask;
    const targetWord = ((cur && (cur.targetWord || cur.targetSentence || cur.answer)) || activeChallenge.targetWord || activeChallenge.targetSentence || 'PYTHON').trim();
    const targetSentence = ((cur && (cur.targetSentence || cur.targetWord || cur.answer)) || activeChallenge.targetSentence || activeChallenge.targetWord || 'PYTHON').trim();
    const expectedFlag = ((cur && cur.flag) || activeChallenge.flag || `CYBERTRIX{${targetWord}}`).trim();
    const expectedTarget = targetWord;

    const valNorm = val.toUpperCase().replace(/\s+/g, ' ');
    const wordNorm = targetWord.toUpperCase().replace(/\s+/g, ' ');
    const sentNorm = targetSentence.toUpperCase().replace(/\s+/g, ' ');
    const flagNorm = expectedFlag.toUpperCase().replace(/\s+/g, ' ');

    const valNoSp = val.replace(/\s+/g, '').toUpperCase();
    const wordNoSp = targetWord.replace(/\s+/g, '').toUpperCase();
    const sentNoSp = targetSentence.replace(/\s+/g, '').toUpperCase();

    const isMatch = (valNorm === wordNorm) || (valNorm === sentNorm) || (valNorm === flagNorm) ||
                    (valNoSp === wordNoSp) || (valNoSp === sentNoSp);

    const feedbackBox = document.getElementById('mk-answer-feedback');

    if (!isMatch) {
      if (window.cyberSound && window.cyberSound.playError) window.cyberSound.playError();
      window.showCyberToast("INCORRECT SEQUENCE: Keystrokes do not match target word. Check key inversions and try again!", "error");
      if (feedbackBox) {
        feedbackBox.style.display = 'block';
        feedbackBox.innerHTML = `
          <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--red-neon); border-radius: 4px; padding: 0.85rem 1.25rem; color: var(--red-neon); text-align: center; font-family: var(--font-tech);">
            <div style="font-weight: 700; font-size: 1rem; margin-bottom: 0.25rem;">✗ INCORRECT KEYBOARD SEQUENCE</div>
            <div style="font-size: 0.8rem; color: #cbd5e1;">Typed stream: <code style="font-family: var(--font-code); color: #fff;">${escapeHTML(val)}</code> does not match target <code style="font-family: var(--font-code); color: var(--cyan);">${escapeHTML(expectedTarget)}</code>. Check reciprocal key matrix and retry.</div>
          </div>
        `;
      }
      return;
    }

    // Sequence matches!
    mkSequenceVerified = true;
    mkVerifiedFlag = expectedFlag;

    if (window.cyberSound && window.cyberSound.playSolve) window.cyberSound.playSolve();
    window.showCyberToast("✓ SEQUENCE VERIFIED! FLAG UNLOCKED FOR SUBMISSION", "success");

    if (feedbackBox) {
      feedbackBox.style.display = 'block';
      feedbackBox.innerHTML = `
        <div style="background: rgba(0, 255, 157, 0.08); border: 1px solid var(--green); border-radius: 6px; padding: 1rem 1.25rem; color: var(--green); text-align: center; font-family: var(--font-tech);">
          <div style="font-size: 1.1rem; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 0.4rem;">
            ✓ KEYSTROKE SEQUENCE VERIFIED!
          </div>
          <div style="font-size: 0.88rem; color: #ffffff; margin-bottom: 0.6rem;">
            UNLOCKED FLAG: <strong style="font-family: var(--font-code); color: #030712; background: var(--green); padding: 4px 10px; border-radius: 4px; font-size: 1.05rem; letter-spacing: 1px; display: inline-block; box-shadow: 0 0 12px rgba(0, 255, 157, 0.5);">${escapeHTML(expectedFlag)}</strong>
          </div>
          <div style="font-size: 0.8rem; color: var(--cyan); letter-spacing: 0.5px;">
            Target entered successfully! Now submit this flag below in the Flag Submission terminal to claim your points.
          </div>
        </div>
      `;
    }

    // Unlock bottom Flag Submission Form
    const flagNotice = document.getElementById('mk-flag-locked-notice');
    const flagActiveForm = document.getElementById('flag-active-form-wrapper');
    const flagInput = document.getElementById('global-flag-input');

    if (flagNotice) {
      flagNotice.style.display = 'block';
      flagNotice.className = 'event-paused-banner';
      flagNotice.style.background = 'rgba(0, 255, 157, 0.12)';
      flagNotice.style.borderColor = 'var(--green)';
      flagNotice.style.color = 'var(--green)';
      flagNotice.innerHTML = `<span>✓</span> <strong>SEQUENCE VERIFIED:</strong> Flag <code style="color: #fff; font-family: var(--font-code);">${escapeHTML(expectedFlag)}</code> is unlocked. Click [ SUBMIT FLAG ] below to claim points!`;
    }

    if (flagActiveForm) flagActiveForm.style.display = 'block';
    if (flagInput) {
      flagInput.value = expectedFlag;
      flagInput.focus();
    }

    const arena = document.getElementById('flag-submission-arena');
    if (arena) {
      arena.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function resetMirrorKeyboard(ch) {
    mkBuffer = '';
    mkIsCorrect = false;
    mkSequenceVerified = false;
    mkVerifiedFlag = '';
    clearGlobalFlagInput(false);
    const feedbackBox = document.getElementById('mk-answer-feedback');
    if (feedbackBox) {
      feedbackBox.style.display = 'none';
      feedbackBox.innerHTML = '';
    }
    updateMkStreamUI();
  }

  function checkMirrorSequence(targetSentence, activeSub) {
    // Retained for backward compatibility
  }

  // =========================================================================
  // 8. HIDDEN VAULT CONTROLLER (Forensics / Logic — 250 PTS — 15 Mins)
  // Flow: SYSTEM LOGS -> FIND UNKNOWN -> ACCESS CODE -> ASCII DECODE
  //       -> UNLOCK SECURE VAULT -> LOGO TRIGGER -> .hidden -> FLAG
  // =========================================================================
  let hvStage1Completed = false;
  let hvStage3Unlocked = false;
  let hvHiddenDiscovered = false;
  let hvActiveChallenge = null;
  let hvRecoveredFlag = null;
  var hvAsciiCurrentRange = 'all';

  const HV_STAGE4_VISIBLE_FILES = [
    {
      name: "readme.txt",
      size: "2.4 KB",
      type: "TEXT",
      content: `================================================================================
CYBERTRIX SECURE REPOSITORY // NODE MANIFEST & PROTOCOL BRIEFING
STORAGE NODE: /vault/ (SEC-09-ALPHA)
SECURITY LEVEL: PUBLIC CTF PERIMETER // READ-ONLY ISOLATION
CLUSTER: OMEGA-GRID-04 // KERNEL: 6.12.0-CYBER-HARDENED
ENCRYPTION: AES-256-GCM / SHA-512 INTEGRITY AUDIT
================================================================================

[+] OPERATIONAL DIRECTIVE:
Welcome Operative. You have mounted the restricted CYBERTRIX file partition.
This storage enclave houses core forensics telemetry, system event journals,
and field intelligence artifacts captured during Sector Reconnaissance.

[+] SYSTEM SPECIFICATIONS:
- Host Node: cybertrix-vault-core-09.internal.ctf
- Filesystem Type: EXT4-CRYPTO-V4 (Mounted Read-Only)
- Active Mount Point: /mnt/secure_vault/ -> /vault/
- Decoy Partition: ACTIVE (Public index exposes standard maintenance artifacts)
- Stealth Layer: INITIALIZED (Offset 0x00FF4C - Virtual Concealment Active)

[+] OPERATING RULES OF ENGAGEMENT:
1. All partition transactions undergo continuous cryptographic telemetry hashing.
2. Direct unauthorized root modification is permanently disabled on this node.
3. Decoy files exist to misdirect automated scanners and unauthorized interceptors.
4. Not all repository partitions are visible in the standard directory manifest.
5. Operatives must analyze system logs and operator notes for stealth trigger vectors.
6. Recover the classified mission token and submit it to claim operation points.

[+] ROOT DIRECTORY SUMMARY:
- readme.txt  : Node manifest and operational rules (You are here)
- system.log  : Kernel, daemon, and intercepted anomaly event logs
- notes.txt   : Tactical field memorandum from Special Agent Cipher

================================================================================
[STATUS: NOMINAL // ALL PARTITION INTEGRITY SEALS INTACT]
================================================================================`
    },
    {
      name: "system.log",
      size: "3.6 KB",
      type: "LOG",
      content: `[2026-10-01 03:14:02 UTC] [KERNEL] Boot sequence initialized. Kernel v6.12.0-sec-hardened x86_64.
[2026-10-01 03:14:04 UTC] [CRYPT] Keyring verification acknowledged (epoch: 2026-09-30).
[2026-10-01 03:14:05 UTC] [AUTH] Daemon auth_guard-v2 telemetry heartbeat acknowledged [OK].
[2026-10-01 03:14:08 UTC] [STORAGE] Partition /mnt/secure_vault/ mounted in read-only isolation mode.
[2026-10-01 03:14:11 UTC] [STORAGE] Directory manifest populated: 3 visible storage blocks mapped.
[2026-10-01 03:14:15 UTC] [NET] Listening on local socket unix:///var/run/cybertrix_vault.sock.
[2026-10-01 03:14:18 UTC] [STEALTH] Stealth partition initialized at memory offset 0x00FF4C.
[2026-10-01 03:14:22 UTC] [STEALTH] Node [.hidden] cloaked from standard directory index listings.
[2026-10-01 03:14:25 UTC] [STEALTH] CYBERTRIX cryptographic brand emblem linked to stealth uncloak toggle.
[2026-10-01 03:14:30 UTC] [FIREWALL] Filter rules compiled: 412 ingress drops, 0 breaches logged.
[2026-10-01 03:14:45 UTC] [ANOMALY_WARN] Suspicious remote session established from 198.51.100.77.
[2026-10-01 03:15:02 UTC] [AUDIT] Unknown user session UID=0x994F queried storage index.
[2026-10-01 03:15:18 UTC] [ACCESS_TRACE] Unauthorized file request intercepted: target=vault.dat.
[2026-10-01 03:15:24 UTC] [PAYLOAD_DUMP] Intercepted raw hexadecimal access stream: 56 41 55 4C 54.
[2026-10-01 03:15:35 UTC] [CRYPT_VERIFY] ASCII translation of intercepted stream verified keyword: 'VAULT'.
[2026-10-01 03:16:00 UTC] [INTEGRITY] SHA-256 integrity check running across volume partitions...
[2026-10-01 03:16:01 UTC] [INTEGRITY] Block 0 (readme.txt) : OK [a1d8f79e...b4]
[2026-10-01 03:16:02 UTC] [INTEGRITY] Block 1 (system.log) : OK [c3e8091a...7f]
[2026-10-01 03:16:03 UTC] [INTEGRITY] Block 2 (notes.txt)  : OK [9b4421cc...12]
[2026-10-01 03:16:04 UTC] [INTEGRITY] Block 3 (.hidden)    : CLOAKED [Verified - Seal Intact]
[2026-10-01 03:16:15 UTC] [AUDIT] System operating in nominal standby. Awaiting operative authorization.`
    },
    {
      name: "notes.txt",
      size: "1.8 KB",
      type: "TEXT",
      content: `================================================================================
FIELD AGENT MEMORANDUM // RESTRICTED RECON INTELLIGENCE
AUTHOR: Special Agent Cipher (Field Forensics Unit SEC-09)
TARGET: /mnt/secure_vault/ (CYBERTRIX Storage Node)
CLASSIFICATION: CONFIDENTIAL // AGENT EYES ONLY
================================================================================

OPERATIONAL NOTES & DISCOVERIES:
--------------------------------------------------------------------------------
1. TARGET ANALYSIS:
   The target storage repository maintains a high-assurance perimeter defense.
   External scanning reveals exactly three decoy files in the public directory:
   - readme.txt (System manifest)
   - system.log (Telemetry journals)
   - notes.txt  (This field memo)

2. FORENSIC CLUE:
   "Not everything inside the vault is visible."
   The system administrator has implemented a steganographic cloaking mechanism
   to prevent automated directory crawlers from locating the target objective.

3. ACCESS SEQUENCE INVESTIGATION:
   During passive reconnaissance, an unknown entity was logged attempting to
   access 'vault.dat'. The intercepted credential stream was recorded in hex:
   [ 56 41 55 4C 54 ] -> Translates via ASCII table to: V - A - U - L - T.

4. THE CLOAKED ARTIFACT:
   Intelligence confirms the classified token resides within a hidden container:
   Filename: evidence.txt
   Trigger: The CYBERTRIX system insignia / event logo controls the stealth relay.
   Interacting directly with the CYBERTRIX emblem destabilizes the cloak.

5. EXTRACTION DIRECTIVE:
   Once the stealth container is exposed, inspect evidence.txt, extract the confirmed
   flag string, and submit it into the verification console to claim 250 points.

--------------------------------------------------------------------------------
[END OF MEMORANDUM // SPECIAL AGENT CIPHER // SIGNED & ENCRYPTED]
================================================================================`
    }
  ];

  const HV_STAGE4_HIDDEN_FILE = {
    name: "evidence.txt",
    size: "1.9 KB",
    type: "CLASSIFIED",
    content: `================================================================================
RESTRICTED ACCESS ARCHIVE // NODE: /mnt/secure_vault/evidence.txt
CLEARANCE: LEVEL-5 TOP SECRET // OPERATION: CYBERTRIX FORENSICS
SECURITY PROTOCOL: SHA-256 INTEGRITY VERIFIED
PARTITION: /dev/mapper/vault-crypt [EXT4 / ENCRYPTED]
TIMESTAMP: 2026-10-01 03:14:02 UTC
================================================================================

[SYSTEM ENVIRONMENT PARAMETERS]
HOSTNAME         : SEC-VAULT-PROD-01
KERNEL_RELEASE   : Linux 6.8.0-45-generic #45-Ubuntu SMP
SECURITY_ENCLAVE : TPM 2.0 / HARDWARE SECURE BOOT ACTIVE
ACCESS_VECTOR    : INTRUSION ISOLATED (unknown -> ACCESS vault.dat)
GATEWAY_KEYWORD  : VAULT [HEX DECODE: 56 41 55 4C 54]

[NETWORK ROUTING & FIREWALL JOURNAL]
[03:12:11] INGRESS: 192.168.1.104:44328 -> 10.0.4.15:443 [TLSv1.3 ESTABLISHED]
[03:12:15] AUTH: Routine credentials failed on /auth/admin
[03:13:40] PROBE: Directory crawler initiated scanning against public partition
[03:14:02] BYPASS: Insignia stealth relay triggered; cloaked node exposed

[CLASSIFIED FORENSICS INTEL // RECOVERED EVIDENCE]
During the forensic audit of the compromised storage node, field agents
discovered that sensitive incident tokens were archived deep inside this
stealth container.

The recovered root clearance token is preserved below:
--------------------------------------------------------------------------------
RECOVERED MISSION FLAG TOKEN:
CYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}
--------------------------------------------------------------------------------

[SUBMISSION PROTOCOL]
Operatives must extract the verified flag token from this file, enter it into
the universal flag submission terminal below, and verify it to claim +250 POINTS
and advance to the next challenge sector.

================================================================================
[TRANSMISSION TERMINATED // SEC-09 FORENSICS ENGINE LIVE]
================================================================================`
  };

  function initHiddenVault() {
    // Stage 1: Attach click handlers to log rows
    const logRows = document.querySelectorAll('#hv-log-stream .hv-log-row');
    logRows.forEach((row, idx) => {
      row.addEventListener('click', () => handleHvLogRowClick(idx));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleHvLogRowClick(idx);
        }
      });
    });

    // Stage 3: Unlock Form
    const unlockForm = document.getElementById('hv-vault-unlock-form');
    if (unlockForm) {
      unlockForm.addEventListener('submit', handleHvUnlockSubmit);
    }

    // Stage 4: Natural Event Logo Click Trigger (Find hidden file)
    const logoTrigger = document.getElementById('hv-event-logo');
    if (logoTrigger) {
      logoTrigger.addEventListener('click', handleHvNaturalLogoClick);
      logoTrigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleHvNaturalLogoClick();
        }
      });
    }

    // Modal close handlers
    const modal = document.getElementById('hv-file-viewer-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) window.closeHvFileModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.closeHvFileModal();
    });

    // Populate ASCII Reference Table for Hidden Vault Stage 2
    populateHvAsciiReferenceTable();
  }

  // =========================================================================
  // STAGE 1 LOGIC: IDENTIFY SUSPICIOUS UNKNOWN ACTIVITY
  // =========================================================================
  function handleHvLogRowClick(index) {
    const logRows = document.querySelectorAll('#hv-log-stream .hv-log-row');
    const clickedRow = logRows[index];
    if (!clickedRow) return;

    const feedbackBox = document.getElementById('hv-stage1-feedback');
    const revealCard = document.getElementById('hv-stage1-reveal');
    const stage2Card = document.getElementById('hv-stage-2-card');
    const stage3Card = document.getElementById('hv-stage-3-card');

    // ONLY the row targeting "vault.dat" (unknown ACCESS vault.dat) reveals the secret code!
    const rowText = (clickedRow.textContent || '').replace(/\s+/g, ' ');
    const isTargetFileAccess = (
      (clickedRow.dataset && clickedRow.dataset.target === 'vault.dat') ||
      (rowText.includes('unknown') && rowText.includes('ACCESS') && rowText.includes('vault.dat'))
    );

    if (isTargetFileAccess) {
      // Correct: Participant identified exact "unknown ACCESS vault.dat" intrusion!
      hvStage1Completed = true;

      // Highlight the suspicious entry
      logRows.forEach(r => r.classList.remove('hv-row-selected-anomaly'));
      clickedRow.classList.add('hv-row-selected-anomaly');

      if (feedbackBox) {
        feedbackBox.className = 'hv-feedback-box hv-feedback-success';
        feedbackBox.innerHTML = `<span>✓</span> SUSPICIOUS ACTIVITY CONFIRMED: Unauthorized <code>unknown</code> access to <code>vault.dat</code> isolated.`;
        feedbackBox.style.display = 'flex';
      }

      // Reveal secret code card
      if (revealCard) {
        revealCard.style.display = 'block';
      }

      // Reveal Stage 2 (ASCII) and Stage 3 (Secure Vault)
      if (stage2Card) stage2Card.style.display = 'block';
      if (stage3Card) stage3Card.style.display = 'block';
      populateHvAsciiReferenceTable();

      // Update Step Stepper
      updateHvStepper(2);

      window.showCyberToast("SUSPICIOUS ACTIVITY ISOLATED: Access code revealed!", "success");
      if (window.cyberSound) window.cyberSound.playSolve();

      // Smooth scroll to ASCII / Unlock area
      if (stage2Card) {
        stage2Card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      // Any other line clicked: secret code must NOT be shown!
      hvStage1Completed = false;

      // Clear anomaly selection
      logRows.forEach(r => r.classList.remove('hv-row-selected-anomaly'));

      // Hide secret code reveal card
      if (revealCard) {
        revealCard.style.display = 'none';
      }

      // If Stage 3 has not been unlocked yet, keep Stages 2 and 3 hidden
      if (!hvStage3Unlocked) {
        if (stage2Card) stage2Card.style.display = 'none';
        if (stage3Card) stage3Card.style.display = 'none';
        updateHvStepper(1);
      }

      const isUnknownUser = clickedRow.dataset && clickedRow.dataset.user === 'unknown';
      if (isUnknownUser) {
        // Other unknown line clicked (e.g. unknown LOGIN, unknown DOWNLOAD vault, unknown LOGOUT)
        if (feedbackBox) {
          feedbackBox.className = 'hv-feedback-box hv-feedback-warning';
          feedbackBox.innerHTML = `<span>⚠</span> UNAUTHORIZED EVENT: Suspicious <code>unknown</code> activity detected, but target file not accessed. Locate the exact <code>vault.dat</code> access log.`;
          feedbackBox.style.display = 'flex';
        }
        window.showCyberToast("Suspicious activity, but target file not accessed. Locate vault.dat access log.", "warning");
        if (window.cyberSound) window.cyberSound.playClick();
      } else {
        // Normal routine log entry clicked
        if (feedbackBox) {
          feedbackBox.className = 'hv-feedback-box hv-feedback-info';
          feedbackBox.innerHTML = `<span>ℹ</span> ROUTINE USER ACTIVITY: Normal login event verified. Look for suspicious unauthorized activity.`;
          feedbackBox.style.display = 'flex';
        }
        window.showCyberToast("Routine user activity verified. No anomaly found.", "info");
        if (window.cyberSound) window.cyberSound.playClick();
      }
    }
  }

  // =========================================================================
  // STAGE 3 LOGIC: UNLOCK SECURE VAULT WITH KEYWORD
  // =========================================================================
  function stringToHexStream(str) {
    if (!str) return '';
    const asciiData = (typeof getAsciiCodeSourceData === 'function') ? getAsciiCodeSourceData() : (window.ASCII_CODE_COM_DATA || []);
    return Array.from(str).map(c => {
      if (asciiData && asciiData.length > 0) {
        const found = asciiData.find(item => item.symbol === c);
        if (found) return found.hex;
      }
      return c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    }).join(' ');
  }

  function hexStreamToString(stream) {
    if (!stream) return '';
    const asciiData = (typeof getAsciiCodeSourceData === 'function') ? getAsciiCodeSourceData() : (window.ASCII_CODE_COM_DATA || []);
    const parts = String(stream).trim().split(/\s+/).filter(Boolean);
    return parts.map(tok => {
      const clean = tok.trim().toUpperCase().replace(/^0X/, '');
      if (!clean) return '';
      // 1. Try matching HEX in asciiData (e.g. "56" -> V)
      if (asciiData && asciiData.length > 0) {
        let found = asciiData.find(item => item.hex.toUpperCase() === clean);
        if (!found) {
          // If pure decimal token, also support fallback
          const decVal = parseInt(clean, 10);
          if (!isNaN(decVal) && decVal >= 0 && decVal <= 255) {
            found = asciiData.find(item => item.dec === decVal);
          }
        }
        if (found) {
          if (found.dec < 32 || found.dec === 127) return '';
          return found.symbol;
        }
      }
      const hexCode = parseInt(clean, 16);
      return (!isNaN(hexCode) && hexCode >= 32 && hexCode <= 255) ? String.fromCharCode(hexCode) : '';
    }).join('');
  }

  const stringToDecimalStream = stringToHexStream;
  const decimalStreamToString = hexStreamToString;

  function handleHvUnlockSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const input = document.getElementById('hv-vault-keyword-input');
    const feedbackBox = document.getElementById('hv-stage3-feedback');
    if (!input) return;

    const entered = input.value.trim().toUpperCase();
    const expectedKeyword = (hvActiveChallenge && (hvActiveChallenge.vaultKeyword || hvActiveChallenge.vaultPassword) || '').trim().toUpperCase();
    const cipherSeq = (hvActiveChallenge && (hvActiveChallenge.cipherSequence || hvActiveChallenge.accessCode) || '').trim();
    const decodedFromCipher = decimalStreamToString(cipherSeq).toUpperCase();

    const isMatch = entered === 'VAULT' ||
      (expectedKeyword && entered === expectedKeyword) ||
      (decodedFromCipher && entered === decodedFromCipher) ||
      (cipherSeq && entered === cipherSeq.replace(/\s+/g, ''));

    if (isMatch) {
      // Correct keyword: UNLOCK SECURE VAULT
      hvStage3Unlocked = true;

      // Update lock badge
      const lockBadge = document.getElementById('hv-vault-lock-status');
      const lockText = document.getElementById('hv-lock-text');
      if (lockBadge) {
        lockBadge.className = 'hv-vault-status-badge status-unlocked';
        if (lockText) lockText.textContent = 'UNLOCKED';
      }

      if (feedbackBox) {
        feedbackBox.className = 'submission-feedback access-granted';
        feedbackBox.innerHTML = `<span>✓</span> SECURE VAULT UNLOCKED // ACCESS GRANTED`;
        feedbackBox.style.display = 'flex';
      }

      // Reveal Stage 4: Secure Vault file interface
      const stage4Card = document.getElementById('hv-stage-4-card');
      if (stage4Card) {
        stage4Card.style.display = 'block';
        renderHvStage4Files();
      }

      updateHvStepper(4);

      window.showCyberToast("SECURE VAULT UNLOCKED!", "success");
      if (window.cyberSound) window.cyberSound.playSolve();

      if (stage4Card) {
        stage4Card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      // Incorrect keyword
      if (feedbackBox) {
        feedbackBox.className = 'submission-feedback access-denied';
        feedbackBox.innerHTML = `<span>✗</span> ACCESS DENIED // INVALID VAULT KEYWORD`;
        feedbackBox.style.display = 'flex';
      }
      window.showCyberToast("ACCESS DENIED: Invalid vault keyword.", "error");
      if (window.cyberSound) window.cyberSound.playError();
      input.focus();
    }
  }

  // =========================================================================
  // STAGE 4 LOGIC: NATURAL EVENT LOGO TRIGGER & FILES REPOSITORY
  // =========================================================================
  let hvActiveSelectedFileName = 'readme.txt';
  let hvIsViewAllMode = false;

  function renderHvStage4Files() {
    const container = document.getElementById('hv-files-grid');
    if (!container) return;

    // Files list: start with visible files (custom from admin or default)
    let visibleFiles = HV_STAGE4_VISIBLE_FILES;
    if (hvActiveChallenge && Array.isArray(hvActiveChallenge.fakeFiles) && hvActiveChallenge.fakeFiles.length > 0) {
      visibleFiles = hvActiveChallenge.fakeFiles;
    } else if (hvActiveChallenge && Array.isArray(hvActiveChallenge.files)) {
      visibleFiles = hvActiveChallenge.files.filter(f => f.name !== '.hidden' && f.name !== 'evidence.txt');
    }

    // Ensure notes.txt is present if missing from visibleFiles
    if (!visibleFiles.some(f => f.name && f.name.toLowerCase().includes('note'))) {
      const defaultNotes = HV_STAGE4_VISIBLE_FILES.find(f => f.name === 'notes.txt');
      if (defaultNotes) visibleFiles = [...visibleFiles, defaultNotes];
    }

    // Filter out any hidden file from visible files (never expose directly in normal visible file list)
    visibleFiles = visibleFiles.filter(f => f.name !== '.hidden' && f.name !== 'evidence.txt');

    // Requirement 1: Non-notes fake files first, Notes BELOW existing files
    const nonNoteFiles = visibleFiles.filter(f => !f.name.toLowerCase().includes('note'));
    const noteFiles = visibleFiles.filter(f => f.name.toLowerCase().includes('note'));

    // Maintain clean vertical file list layout: Fake files, then Notes
    const filesToDisplay = [...nonNoteFiles, ...noteFiles];

    // Hidden File (evidence.txt) is ONLY added if discovered and enabled
    if (hvHiddenDiscovered) {
      let hiddenFile = { name: 'evidence.txt', size: '1.9 KB', type: 'CLASSIFIED', enabled: true };
      if (hvActiveChallenge && Array.isArray(hvActiveChallenge.hiddenFiles) && hvActiveChallenge.hiddenFiles.length > 0) {
        hiddenFile = { ...hvActiveChallenge.hiddenFiles[0] };
      }
      let rawAdminEvidence = null;
      if (hvActiveChallenge) {
        if (hvActiveChallenge.evidenceContent !== undefined && hvActiveChallenge.evidenceContent !== null) {
          rawAdminEvidence = String(hvActiveChallenge.evidenceContent);
        } else if (Array.isArray(hvActiveChallenge.hiddenFiles) && hvActiveChallenge.hiddenFiles[0] && hvActiveChallenge.hiddenFiles[0].content !== undefined && hvActiveChallenge.hiddenFiles[0].content !== null) {
          rawAdminEvidence = String(hvActiveChallenge.hiddenFiles[0].content);
        } else if (hvActiveChallenge.secretContent !== undefined && hvActiveChallenge.secretContent !== null) {
          rawAdminEvidence = String(hvActiveChallenge.secretContent);
        }
      }
      if (rawAdminEvidence !== null) {
        hiddenFile.content = rawAdminEvidence.trim() === '' ? '[ NO CLASSIFIED INTEL / EVIDENCE RECORDED ]' : rawAdminEvidence;
      }
      const isEvidenceEnabled = (hvActiveChallenge ? hvActiveChallenge.evidenceEnabled !== false : true) &&
                                (hiddenFile.enabled !== false);
      if (isEvidenceEnabled) {
        filesToDisplay.push(hiddenFile);
      }
    }

    const countEl = document.getElementById('hv-files-count');
    if (countEl) {
      countEl.textContent = hvHiddenDiscovered ? `(${filesToDisplay.length} FILES — evidence.txt REVEALED)` : `(${filesToDisplay.length} FILES)`;
    }

    // Ensure active filename is valid
    if (!filesToDisplay.some(f => f.name === hvActiveSelectedFileName)) {
      hvActiveSelectedFileName = filesToDisplay[0] ? filesToDisplay[0].name : 'readme.txt';
    }

    container.innerHTML = filesToDisplay.map((file, idx) => {
      const isHiddenFile = file.name === 'evidence.txt' || file.name === '.hidden';
      const isActive = file.name === hvActiveSelectedFileName;
      return `
        <div class="hv-file-card ${isHiddenFile ? 'hv-file-card-hidden' : ''} ${isActive ? 'hv-file-card-active active' : ''}" data-filename="${escapeHTML(file.name)}" onclick="window.openHvFile('${file.name}')" tabindex="0" role="button" aria-label="Open file ${escapeHTML(file.name)}">
          <div class="hv-file-card-left">
            <span class="hv-file-card-icon">${isHiddenFile ? '🔒' : '📄'}</span>
            <div class="hv-file-card-details">
              <span class="hv-file-card-name ${isHiddenFile ? 'hv-hidden-filename' : ''}">${escapeHTML(file.name)}</span>
              <span class="hv-file-card-sub">${escapeHTML(file.size || '1.0 KB')} • ${isHiddenFile ? 'Classified File' : 'System Document'}</span>
            </div>
          </div>
          <div class="hv-file-card-right">
            <span class="hv-file-card-badge ${isHiddenFile ? 'badge-classified' : 'badge-normal'}">
              ${isActive ? '● VIEWING BELOW' : (isHiddenFile ? 'CLASSIFIED' : 'READ-ONLY')}
            </span>
          </div>
        </div>
      `;
    }).join('');

    // Populate quick file navigation tabs directly in the viewer below the files
    const tabsContainer = document.getElementById('hv-viewer-file-tabs');
    if (tabsContainer) {
      tabsContainer.innerHTML = filesToDisplay.map(f => {
        const isAct = f.name === hvActiveSelectedFileName;
        const isH = f.name === 'evidence.txt' || f.name === '.hidden';
        return `<button type="button" class="hv-file-tab-btn ${isAct ? 'active' : ''}" onclick="window.openHvFile('${f.name}')">${isH ? '🔒' : '📄'} ${escapeHTML(f.name)}</button>`;
      }).join('');
    }

    // Automatically display the selected file's message right below the files!
    openHvFile(hvActiveSelectedFileName, false);
  }

  // Natural CYBERTRIX Event Logo Click Trigger
  function handleHvNaturalLogoClick() {
    if (!hvStage3Unlocked) return;
    if (hvActiveChallenge && hvActiveChallenge.evidenceEnabled === false) {
      window.showCyberToast("EVIDENCE ARCHIVE DISABLED: Administrator has disabled access to evidence.txt.", "warning");
      return;
    }
    if (hvHiddenDiscovered) {
      window.showCyberToast("File evidence.txt is already revealed in the vault directory.", "info");
      return;
    }

    hvHiddenDiscovered = true;

    // Subtle glitch animation on event logo
    const logoWrap = document.getElementById('hv-event-logo');
    if (logoWrap) {
      logoWrap.classList.add('hv-logo-subtle-trigger');
      setTimeout(() => logoWrap.classList.remove('hv-logo-subtle-trigger'), 600);
    }

    // Reveal evidence.txt in the files grid
    renderHvStage4Files();

    window.showCyberToast("HIDDEN FILE REVEALED: evidence.txt discovered in vault!", "success");
    if (window.cyberSound) window.cyberSound.playSolve();

    // Automatically open evidence.txt message directly below the files
    openHvFile('evidence.txt', true);
  }

  // File Viewer (Positioned Directly Below All Vault Files)
  window.openHvFile = function (fileName, shouldScroll = true) {
    if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges) {
      try {
        const all = window.CYBERTRIX_DB.challenges.getAllSync(true);
        const fresh = all && all.find(c => c.id === 'hidden-vault');
        if (fresh) {
          hvActiveChallenge = fresh;
          if (fresh.flag) hvRecoveredFlag = fresh.flag;
        }
      } catch (e) {}
    }

    let file = null;
    let visibleFiles = HV_STAGE4_VISIBLE_FILES;
    if (hvActiveChallenge && Array.isArray(hvActiveChallenge.fakeFiles) && hvActiveChallenge.fakeFiles.length > 0) {
      visibleFiles = hvActiveChallenge.fakeFiles;
    } else if (hvActiveChallenge && Array.isArray(hvActiveChallenge.files)) {
      visibleFiles = hvActiveChallenge.files.filter(f => f.name !== '.hidden' && f.name !== 'evidence.txt');
    }

    if (!visibleFiles.some(f => f.name && f.name.toLowerCase().includes('note'))) {
      const defaultNotes = HV_STAGE4_VISIBLE_FILES.find(f => f.name === 'notes.txt');
      if (defaultNotes) visibleFiles = [...visibleFiles, defaultNotes];
    }

    const isHiddenRequested = fileName === 'evidence.txt' || fileName === '.hidden';
    if (isHiddenRequested) {
      hvHiddenDiscovered = true;
    }
    let hiddenCandidate = null;
    if (hvActiveChallenge && Array.isArray(hvActiveChallenge.hiddenFiles) && hvActiveChallenge.hiddenFiles.length > 0) {
      hiddenCandidate = hvActiveChallenge.hiddenFiles.find(f => f.name === fileName) || hvActiveChallenge.hiddenFiles[0];
    } else {
      hiddenCandidate = HV_STAGE4_HIDDEN_FILE;
    }

    if (isHiddenRequested || (hiddenCandidate && hiddenCandidate.name === fileName)) {
      file = hiddenCandidate || HV_STAGE4_HIDDEN_FILE;
    } else {
      file = visibleFiles.find(f => f.name === fileName) || HV_STAGE4_VISIBLE_FILES.find(f => f.name === fileName);
    }
    if (!file) return;

    hvActiveSelectedFileName = fileName;

    // Update active highlight on file cards in the files grid
    const cards = document.querySelectorAll('#hv-files-grid .hv-file-card');
    cards.forEach(card => {
      const cName = card.getAttribute('data-filename');
      const isCardHidden = card.classList.contains('hv-file-card-hidden');
      const badge = card.querySelector('.hv-file-card-badge');
      if (cName === fileName) {
        card.classList.add('active', 'hv-file-card-active');
        if (badge) badge.textContent = '● VIEWING BELOW';
      } else {
        card.classList.remove('active', 'hv-file-card-active');
        if (badge) badge.textContent = isCardHidden ? 'CLASSIFIED' : 'READ-ONLY';
      }
    });

    // Update quick tab buttons
    const tabBtns = document.querySelectorAll('#hv-viewer-file-tabs .hv-file-tab-btn');
    tabBtns.forEach(btn => {
      if (btn.textContent && btn.textContent.includes(fileName)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const modal = document.getElementById('hv-file-viewer-modal');
    const pathEl = document.getElementById('hv-modal-filename');
    const contentEl = document.getElementById('hv-modal-content');
    const statusPill = document.getElementById('hv-modal-status-pill');
    const flagActions = document.getElementById('hv-modal-flag-actions');
    const footerMsg = document.getElementById('hv-modal-footer-msg');
    const singleContainer = document.getElementById('hv-single-file-container');
    const allContainer = document.getElementById('hv-all-files-container');
    const toggleBtn = document.getElementById('hv-btn-view-all-toggle');

    if (!modal) return;

    // Reset View-All mode to single view for the requested file
    hvIsViewAllMode = false;
    if (singleContainer) singleContainer.style.display = 'block';
    if (allContainer) allContainer.style.display = 'none';
    if (toggleBtn) toggleBtn.innerHTML = '☷ VIEW ALL FILES';

    const isHidden = file.name === 'evidence.txt' || file.name === '.hidden' || isHiddenRequested;
    if (pathEl) pathEl.textContent = `/vault/${file.name}`;

    let effectiveFlag = (hvActiveChallenge && hvActiveChallenge.flag) || hvRecoveredFlag || '';

    let fileContent = '';
    if (isHidden) {
      // Dynamic Admin Evidence Content from Firebase document
      let rawAdminEvidence = null;
      if (hvActiveChallenge) {
        if (hvActiveChallenge.evidenceContent !== undefined && hvActiveChallenge.evidenceContent !== null) {
          rawAdminEvidence = String(hvActiveChallenge.evidenceContent);
        } else if (Array.isArray(hvActiveChallenge.hiddenFiles) && hvActiveChallenge.hiddenFiles[0] && hvActiveChallenge.hiddenFiles[0].content !== undefined && hvActiveChallenge.hiddenFiles[0].content !== null) {
          rawAdminEvidence = String(hvActiveChallenge.hiddenFiles[0].content);
        } else if (hvActiveChallenge.secretContent !== undefined && hvActiveChallenge.secretContent !== null) {
          rawAdminEvidence = String(hvActiveChallenge.secretContent);
        }
      }

      if (!effectiveFlag && rawAdminEvidence) {
        const match = rawAdminEvidence.match(/CYBERTRIX\{[^}]+\}/i);
        if (match) effectiveFlag = match[0];
      }

      if (rawAdminEvidence !== null) {
        if (rawAdminEvidence.trim() === '') {
          fileContent = effectiveFlag ? `flag:${effectiveFlag}` : '[ NO CLASSIFIED INTEL / EVIDENCE RECORDED ]';
        } else {
          fileContent = rawAdminEvidence;
        }
      } else if (file && file.content && file.content.trim() !== '') {
        fileContent = file.content;
      } else if (effectiveFlag) {
        fileContent = `flag:${effectiveFlag}`;
      } else {
        fileContent = '[ NO CLASSIFIED INTEL / EVIDENCE RECORDED ]';
      }

      // If the content explicitly contains a CYBERTRIX flag token placeholder, sync it with effectiveFlag
      if (/CYBERTRIX\{[^}]+\}/i.test(fileContent)) {
        fileContent = fileContent.replace(/CYBERTRIX\{[^}]+\}/gi, effectiveFlag);
      } else if (/^flag\s*:/i.test(fileContent.trim())) {
        fileContent = `flag:${effectiveFlag}`;
      }

      if (/^CYBERTRIX\{[^}]+\}$/i.test(fileContent.trim())) {
        fileContent = `flag:${fileContent.trim()}`;
      }

      hvRecoveredFlag = effectiveFlag;
      if (flagActions) flagActions.style.display = 'flex';
      if (footerMsg) footerMsg.textContent = 'CTF FLAG RECOVERED // CAPTURE ENABLED';
    } else {
      fileContent = (file && file.content) ? file.content : '';
      if (flagActions) flagActions.style.display = 'none';
      if (footerMsg) footerMsg.textContent = 'SEC-09 FILE VIEWER // LOCAL DECRYPT';
    }

    if (contentEl) contentEl.textContent = fileContent;
    if (statusPill) {
      statusPill.textContent = isHidden ? 'CLASSIFIED // DECRYPTED' : 'READ-ONLY // SYSTEM LOG';
    }

    modal.classList.add('active');
    modal.style.display = 'block';
    if (shouldScroll) {
      modal.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (window.cyberSound) window.cyberSound.playClick();
    }
  };

  window.closeHvFileModal = function () {
    const modal = document.getElementById('hv-file-viewer-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    const cards = document.querySelectorAll('#hv-files-grid .hv-file-card');
    cards.forEach(card => card.classList.remove('active', 'hv-file-card-active'));
  };

  // Toggle View All Files Messages simultaneously below the files
  window.toggleHvViewAllFiles = function () {
    if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges) {
      try {
        const all = window.CYBERTRIX_DB.challenges.getAllSync(true);
        const fresh = all && all.find(c => c.id === 'hidden-vault');
        if (fresh) {
          hvActiveChallenge = fresh;
          if (fresh.flag) hvRecoveredFlag = fresh.flag;
        }
      } catch (e) {}
    }

    const modal = document.getElementById('hv-file-viewer-modal');
    const singleContainer = document.getElementById('hv-single-file-container');
    const allContainer = document.getElementById('hv-all-files-container');
    const toggleBtn = document.getElementById('hv-btn-view-all-toggle');
    const pathEl = document.getElementById('hv-modal-filename');
    const statusPill = document.getElementById('hv-modal-status-pill');
    const flagActions = document.getElementById('hv-modal-flag-actions');
    const footerMsg = document.getElementById('hv-modal-footer-msg');

    if (!modal) return;
    hvIsViewAllMode = !hvIsViewAllMode;

    if (hvIsViewAllMode) {
      // Gather all files to display
      let visibleFiles = HV_STAGE4_VISIBLE_FILES;
      if (hvActiveChallenge && Array.isArray(hvActiveChallenge.fakeFiles) && hvActiveChallenge.fakeFiles.length > 0) {
        visibleFiles = hvActiveChallenge.fakeFiles;
      } else if (hvActiveChallenge && Array.isArray(hvActiveChallenge.files)) {
        visibleFiles = hvActiveChallenge.files.filter(f => f.name !== '.hidden' && f.name !== 'evidence.txt');
      }
      if (!visibleFiles.some(f => f.name && f.name.toLowerCase().includes('note'))) {
        const defaultNotes = HV_STAGE4_VISIBLE_FILES.find(f => f.name === 'notes.txt');
        if (defaultNotes) visibleFiles = [...visibleFiles, defaultNotes];
      }
      visibleFiles = visibleFiles.filter(f => f.name !== '.hidden' && f.name !== 'evidence.txt');

      const nonNoteFiles = visibleFiles.filter(f => !f.name.toLowerCase().includes('note'));
      const noteFiles = visibleFiles.filter(f => f.name.toLowerCase().includes('note'));
      const allFilesList = [...nonNoteFiles, ...noteFiles];

      if (hvHiddenDiscovered) {
        let hiddenFile = { name: 'evidence.txt', size: '1.9 KB', type: 'CLASSIFIED', enabled: true };
        if (hvActiveChallenge && Array.isArray(hvActiveChallenge.hiddenFiles) && hvActiveChallenge.hiddenFiles.length > 0) {
          hiddenFile = { ...hvActiveChallenge.hiddenFiles[0] };
        }
        let rawAdminEvidence = null;
        if (hvActiveChallenge) {
          if (hvActiveChallenge.evidenceContent !== undefined && hvActiveChallenge.evidenceContent !== null) {
            rawAdminEvidence = String(hvActiveChallenge.evidenceContent);
          } else if (Array.isArray(hvActiveChallenge.hiddenFiles) && hvActiveChallenge.hiddenFiles[0] && hvActiveChallenge.hiddenFiles[0].content !== undefined && hvActiveChallenge.hiddenFiles[0].content !== null) {
            rawAdminEvidence = String(hvActiveChallenge.hiddenFiles[0].content);
          } else if (hvActiveChallenge.secretContent !== undefined && hvActiveChallenge.secretContent !== null) {
            rawAdminEvidence = String(hvActiveChallenge.secretContent);
          }
        }
        if (rawAdminEvidence !== null) {
          hiddenFile.content = rawAdminEvidence.trim() === '' ? '[ NO CLASSIFIED INTEL / EVIDENCE RECORDED ]' : rawAdminEvidence;
        }
        allFilesList.push(hiddenFile);
      }

      let effectiveFlag = (hvActiveChallenge && hvActiveChallenge.flag) || hvRecoveredFlag || '';
      if (!effectiveFlag && rawAdminEvidence) {
        const match = rawAdminEvidence.match(/CYBERTRIX\{[^}]+\}/i);
        if (match) effectiveFlag = match[0];
      }

      if (allContainer) {
        allContainer.innerHTML = allFilesList.map(f => {
          const isH = f.name === 'evidence.txt' || f.name === '.hidden';
          let bodyText = '';
          if (isH) {
            let rawAdminEvidence = null;
            if (hvActiveChallenge) {
              if (hvActiveChallenge.evidenceContent !== undefined && hvActiveChallenge.evidenceContent !== null) {
                rawAdminEvidence = String(hvActiveChallenge.evidenceContent);
              } else if (Array.isArray(hvActiveChallenge.hiddenFiles) && hvActiveChallenge.hiddenFiles[0] && hvActiveChallenge.hiddenFiles[0].content !== undefined && hvActiveChallenge.hiddenFiles[0].content !== null) {
                rawAdminEvidence = String(hvActiveChallenge.hiddenFiles[0].content);
              } else if (hvActiveChallenge.secretContent !== undefined && hvActiveChallenge.secretContent !== null) {
                rawAdminEvidence = String(hvActiveChallenge.secretContent);
              }
            }
            if (rawAdminEvidence !== null) {
              bodyText = rawAdminEvidence.trim() === '' ? (effectiveFlag ? `flag:${effectiveFlag}` : '[ NO CLASSIFIED INTEL / EVIDENCE RECORDED ]') : rawAdminEvidence;
            } else if (f.content && f.content.trim() !== '') {
              bodyText = f.content;
            } else if (effectiveFlag) {
              bodyText = `flag:${effectiveFlag}`;
            } else {
              bodyText = '[ NO CLASSIFIED INTEL / EVIDENCE RECORDED ]';
            }
            if (/CYBERTRIX\{[^}]+\}/i.test(bodyText)) {
              bodyText = bodyText.replace(/CYBERTRIX\{[^}]+\}/gi, effectiveFlag);
            } else if (/^flag\s*:/i.test(bodyText.trim())) {
              bodyText = `flag:${effectiveFlag}`;
            }
            if (/^CYBERTRIX\{[^}]+\}$/i.test(bodyText.trim())) {
              bodyText = `flag:${bodyText.trim()}`;
            }
          } else {
            bodyText = f.content || '';
          }
          return `
            <div class="hv-all-file-block">
              <div class="hv-all-file-block-header">
                <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
                  <span style="font-size: 1.1rem;">${isH ? '🔒' : '📄'}</span>
                  <span style="font-family: var(--font-code); font-weight: 700; color: #ffffff; letter-spacing: 1px;">/vault/${escapeHTML(f.name)}</span>
                  <span class="cyber-badge ${isH ? 'badge-green' : 'badge-cyan'}" style="font-size: 0.65rem;">
                    ${isH ? 'CLASSIFIED // DECRYPTED' : 'READ-ONLY'}
                  </span>
                </div>
                ${isH ? `
                  <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button type="button" class="btn-cyber btn-cyber-xs btn-cyber-green" onclick="window.copyHvFlag()">📋 COPY FLAG</button>
                    <button type="button" class="btn-cyber btn-cyber-xs btn-cyber-primary" onclick="window.submitHvFlagAuto()">⚡ AUTO-FILL</button>
                  </div>
                ` : ''}
              </div>
              <pre class="hv-file-pre">${escapeHTML(bodyText)}</pre>
            </div>
          `;
        }).join('');
        allContainer.style.display = 'flex';
      }

      if (singleContainer) singleContainer.style.display = 'none';
      if (toggleBtn) toggleBtn.innerHTML = '📄 SINGLE FILE VIEW';
      if (pathEl) pathEl.textContent = `/vault/* (ALL ${allFilesList.length} FILES)`;
      if (statusPill) statusPill.textContent = 'ALL REPOSITORY FILES UNPACKED';
      if (flagActions) flagActions.style.display = hvHiddenDiscovered ? 'flex' : 'none';
      if (footerMsg) footerMsg.textContent = 'ALL VAULT MESSAGES STREAMING // ACTIVE AUDIT';

      modal.classList.add('active');
      modal.style.display = 'block';
      modal.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (window.cyberSound) window.cyberSound.playClick();
    } else {
      openHvFile(hvActiveSelectedFileName, true);
    }
  };

  // Auto-Fill Flag Directly into the Universal Flag Submission Terminal
  window.submitHvFlagAuto = function () {
    const flagVal = (hvActiveChallenge && hvActiveChallenge.flag) || hvRecoveredFlag || '';
    const flagInput = document.getElementById('global-flag-input');
    if (flagInput) {
      flagInput.value = flagVal;
      flagInput.focus();
    }
    const arena = document.getElementById('flag-submission-arena');
    if (arena) {
      arena.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    window.showCyberToast(`FLAG TRANSFERRED TO SUBMISSION TERMINAL: ${flagVal}`, "success");
    if (window.cyberSound) window.cyberSound.playClick();
  };

  window.copyHvFlag = function () {
    const flagVal = (hvActiveChallenge && hvActiveChallenge.flag) || hvRecoveredFlag || '';
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(flagVal).then(() => {
        const btn = document.getElementById('hv-modal-copy-btn');
        if (btn) {
          const orig = btn.innerHTML;
          btn.innerHTML = '✓ COPIED!';
          setTimeout(() => { btn.innerHTML = orig; }, 1800);
        }
        window.showCyberToast(`FLAG COPIED: ${flagVal}`, "success");
        if (window.cyberSound) window.cyberSound.playClick();
      }).catch(() => {
        window.showCyberToast(`FLAG: ${flagVal}`, "info");
      });
    } else {
      window.showCyberToast(`FLAG: ${flagVal}`, "info");
    }
  };

  function updateHvStepper(stage) {
    for (let i = 1; i <= 4; i++) {
      const pill = document.getElementById(`hv-step-pill-${i}`);
      if (pill) {
        if (i < stage) {
          pill.className = 'hv-step-pill completed';
        } else if (i === stage) {
          pill.className = 'hv-step-pill active';
        } else {
          pill.className = 'hv-step-pill';
        }
      }
    }
  }

  function renderHiddenVaultWorkspace(ch) {
    if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges) {
      try {
        const all = window.CYBERTRIX_DB.challenges.getAllSync(true);
        const fresh = all && all.find(c => c.id === 'hidden-vault');
        if (fresh) {
          ch = fresh;
          if (fresh.flag) hvRecoveredFlag = fresh.flag;
        }
      } catch (e) {}
    }
    hvActiveChallenge = ch || activeChallenge;
    if (!hvActiveChallenge) return;

    // Check if user already solved this challenge
    const solved = isChallengeSolved(hvActiveChallenge);
    if (solved) {
      hvStage1Completed = true;
      hvStage3Unlocked = true;
      hvHiddenDiscovered = true;
    }

    // Dynamic Keyword & Hex ASCII Access Code
    const targetKeyword = (hvActiveChallenge.vaultKeyword || hvActiveChallenge.vaultPassword || '').trim();
    let cipherStream = (hvActiveChallenge.cipherSequence || hvActiveChallenge.accessCode || '').trim();
    if (!cipherStream && targetKeyword) {
      cipherStream = stringToHexStream(targetKeyword);
    } else if (!cipherStream) {
      cipherStream = '56 41 55 4C 54';
    } else {
      // If legacy decimal values are present (e.g. "86 65 85 76 84"), normalize to HEX
      const tokens = cipherStream.split(/\s+/).filter(Boolean);
      const isLegacyDecimal = tokens.length > 0 && tokens.every(t => /^\d+$/.test(t) && parseInt(t, 10) > 31 && parseInt(t, 10) <= 255 && !/[A-F]/i.test(t));
      if (isLegacyDecimal && !targetKeyword.includes('86')) {
        cipherStream = tokens.map(t => parseInt(t, 10).toString(16).toUpperCase().padStart(2, '0')).join(' ');
      }
    }

    // Dynamic Access Code in Stage 1 reveal card
    const accessCodeEl = document.getElementById('hv-reveal-access-code');
    if (accessCodeEl) {
      if (accessCodeEl.textContent.trim() !== cipherStream) {
        accessCodeEl.classList.add('glow-pulse-update');
        setTimeout(() => accessCodeEl.classList.remove('glow-pulse-update'), 600);
      }
      accessCodeEl.textContent = cipherStream;
    }

    // Dynamic ASCII Chips in Stage 2
    const chipsContainer = document.getElementById('hv-ascii-chips-container');
    if (chipsContainer) {
      const bytes = cipherStream.split(/\s+/).filter(Boolean);
      if (bytes.length > 0) {
        chipsContainer.innerHTML = bytes.map((byteVal, i) => `
          <div class="hv-chip">
            <span class="chip-idx">BYTE ${i + 1}</span>
            <span class="chip-val">${escapeHTML(byteVal)}</span>
          </div>
        `).join('');
      }
    }

    // Recovered flag dynamic synchronization
    hvRecoveredFlag = (hvActiveChallenge && hvActiveChallenge.flag) || hvRecoveredFlag || '';

    const stage2Card = document.getElementById('hv-stage-2-card');
    const stage3Card = document.getElementById('hv-stage-3-card');
    const stage4Card = document.getElementById('hv-stage-4-card');
    const revealCard = document.getElementById('hv-stage1-reveal');

    if (hvStage1Completed) {
      if (revealCard) revealCard.style.display = 'block';
      if (stage2Card) stage2Card.style.display = 'block';
      if (stage3Card) stage3Card.style.display = 'block';
      populateHvAsciiReferenceTable();
    } else {
      if (revealCard) revealCard.style.display = 'none';
      if (stage2Card) stage2Card.style.display = 'none';
      if (stage3Card) stage3Card.style.display = 'none';
    }

    if (hvStage3Unlocked) {
      if (stage4Card) {
        stage4Card.style.display = 'block';
        renderHvStage4Files();
      }
      const lockBadge = document.getElementById('hv-vault-lock-status');
      const lockText = document.getElementById('hv-lock-text');
      if (lockBadge) {
        lockBadge.className = 'hv-vault-status-badge status-unlocked';
        if (lockText) lockText.textContent = 'UNLOCKED';
      }
      updateHvStepper(4);
    } else {
      if (stage4Card) stage4Card.style.display = 'none';
      updateHvStepper(hvStage1Completed ? 2 : 1);
    }
  }

  function resetHiddenVaultWorkspace(ch) {
    hvStage1Completed = false;
    hvStage3Unlocked = false;
    hvHiddenDiscovered = false;
    hvActiveChallenge = ch || activeChallenge;
    const targetKeyword = (hvActiveChallenge && (hvActiveChallenge.vaultKeyword || hvActiveChallenge.vaultPassword) || '').trim();
    hvRecoveredFlag = (hvActiveChallenge && hvActiveChallenge.flag) || hvRecoveredFlag || '';

    const stage2Card = document.getElementById('hv-stage-2-card');
    const stage3Card = document.getElementById('hv-stage-3-card');
    const stage4Card = document.getElementById('hv-stage-4-card');
    const revealCard = document.getElementById('hv-stage1-reveal');
    const feedback1 = document.getElementById('hv-stage1-feedback');
    const feedback3 = document.getElementById('hv-stage3-feedback');
    const keywordInput = document.getElementById('hv-vault-keyword-input');

    if (revealCard) revealCard.style.display = 'none';
    if (stage2Card) stage2Card.style.display = 'none';
    if (stage3Card) stage3Card.style.display = 'none';
    if (stage4Card) stage4Card.style.display = 'none';
    if (feedback1) feedback1.style.display = 'none';
    if (feedback3) feedback3.style.display = 'none';
    if (keywordInput) keywordInput.value = '';

    const lockBadge = document.getElementById('hv-vault-lock-status');
    const lockText = document.getElementById('hv-lock-text');
    if (lockBadge) {
      lockBadge.className = 'hv-vault-status-badge status-locked';
      if (lockText) lockText.textContent = 'LOCKED';
    }

    document.querySelectorAll('#hv-log-stream .hv-log-row').forEach(r => {
      r.classList.remove('hv-row-selected-anomaly');
    });

    updateHvStepper(1);
    renderHiddenVaultWorkspace(ch);
  }

  // Bridges for window / automated testing
  window.initHiddenVault = initHiddenVault;
  window.populateAsciiReferenceTable = populateAsciiReferenceTable;
  window.populateHvAsciiReferenceTable = populateHvAsciiReferenceTable;
  window.selectHvLogEntry = handleHvLogRowClick;
  window.submitHvUnlock = function (keyword) {
    const input = document.getElementById('hv-vault-keyword-input');
    if (input) input.value = keyword;
    handleHvUnlockSubmit();
  };
  window.clickHvLogo = handleHvNaturalLogoClick;
  window.revealHvHiddenFile = handleHvNaturalLogoClick;
  window.renderHvStage4Files = renderHvStage4Files;
  window.resetHiddenVaultWorkspace = resetHiddenVaultWorkspace;
  window.renderHiddenVaultWorkspace = renderHiddenVaultWorkspace;
  window.hvProceedToStage = function (stageNum) {
    if (stageNum >= 2) {
      handleHvLogRowClick(4); // Select suspicious log line
    }
    if (stageNum >= 3) {
      // Stage 3 revealed
    }
    if (stageNum >= 4) {
      window.submitHvUnlock('VAULT');
      handleHvNaturalLogoClick();
    }
  };

  // =========================================================================
  // 9. ASCII HUNT: TELEMETRY & REFERENCE TABLE (Requirements 13, 14, 15, 16)
  // =========================================================================

  let fullAsciiData = [];

  function buildFullAsciiData() {
    fullAsciiData = [];
    for (let code = 0; code <= 127; code++) {
      const dec = code;
      const hex = code.toString(16).toUpperCase().padStart(2, '0');
      let charLabel = '';
      let isControl = false;

      if (ASCII_CONTROL_LABELS[code] !== undefined) {
        charLabel = ASCII_CONTROL_LABELS[code];
        isControl = true;
      } else {
        charLabel = String.fromCharCode(code);
      }

      fullAsciiData.push({ dec, hex, charLabel, isControl, rawChar: String.fromCharCode(code) });
    }
  }

  function renderAsciiStream(hexOrDecString) {
    const container = document.getElementById('ascii-stream-container');
    const countEl = document.getElementById('ascii-target-chars-count');
    if (!container) return;

    let tokens = (hexOrDecString || '').split(/\s+/).filter(Boolean);
    // If incoming tokens are legacy decimal (e.g. "67 89 66 69 82"), convert to Hex (e.g. "43 59 42 45 52")
    tokens = tokens.map(tok => {
      if (/^[0-9]+$/.test(tok) && !/^[0-9A-Fa-f]{2}$/.test(tok)) {
        const dec = parseInt(tok, 10);
        return dec.toString(16).toUpperCase().padStart(2, '0');
      }
      return tok.toUpperCase().padStart(2, '0');
    });

    if (countEl) {
      countEl.textContent = `TARGET: ${tokens.length} CHARACTERS`;
    }

    container.innerHTML = tokens.map((hex, idx) => `
      <div class="ascii-hex-chip">
        <span class="ascii-hex-pos">BYTE ${idx + 1}</span>
        <span>${hex}</span>
      </div>
    `).join('');
  }

  var asciiHuntCurrentRange = 'all';
  let asciiHuntZoomIndex = 0; // 0: 100%, 1: 115%, 2: 130%
  const ASCII_ZOOM_CLASSES = ['', 'ascii-zoom-large', 'ascii-zoom-xlarge'];
  const ASCII_ZOOM_LABELS = ['100%', '115%', '130%'];

  function initAsciiHuntPortalControls() {
    // Tab switching (Table View vs Live Web View)
    const tabTable = document.getElementById('ascii-tab-table');
    const tabLive = document.getElementById('ascii-tab-live');
    const panelTable = document.getElementById('ascii-panel-table');
    const panelLive = document.getElementById('ascii-panel-live');
    const liveIframe = document.getElementById('ascii-live-iframe');

    if (tabTable && !tabTable._hasTabListener) {
      tabTable._hasTabListener = true;
      tabTable.addEventListener('click', () => {
        tabTable.classList.add('active');
        if (tabLive) tabLive.classList.remove('active');
        if (panelTable) panelTable.style.display = 'flex';
        if (panelLive) panelLive.style.display = 'none';
      });
    }

    if (tabLive && !tabLive._hasTabListener) {
      tabLive._hasTabListener = true;
      tabLive.addEventListener('click', () => {
        tabLive.classList.add('active');
        if (tabTable) tabTable.classList.remove('active');
        if (panelLive) panelLive.style.display = 'block';
        if (panelTable) panelTable.style.display = 'none';
        if (liveIframe && (liveIframe.src === 'about:blank' || liveIframe.getAttribute('src') === 'about:blank')) {
          liveIframe.src = liveIframe.dataset.src || 'https://www.ascii-code.com/';
        }
      });
    }

    // Range buttons
    const rangeBtns = document.querySelectorAll('.ascii-range-btn');
    if (rangeBtns && rangeBtns.forEach) {
      rangeBtns.forEach(btn => {
        if (!btn._hasRangeListener) {
          btn._hasRangeListener = true;
          btn.addEventListener('click', () => {
            rangeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            asciiHuntCurrentRange = btn.dataset ? (btn.dataset.range || 'all') : (btn.getAttribute('data-range') || 'all');
            populateAsciiReferenceTable();
          });
        }
      });
    }

    // Search input
    const searchInp = document.getElementById('ascii-table-search');
    if (searchInp && !searchInp._hasAsciiListener) {
      searchInp._hasAsciiListener = true;
      searchInp.addEventListener('input', (e) => {
        populateAsciiReferenceTable(e.target.value);
      });
    }

    // Zoom Controls
    const btnZoomIn = document.getElementById('btn-ascii-zoom-in');
    const btnZoomOut = document.getElementById('btn-ascii-zoom-out');
    const zoomLevelEl = document.getElementById('ascii-zoom-level');
    const mainTable = document.getElementById('ascii-main-table');

    function applyZoom() {
      if (mainTable) {
        mainTable.classList.remove('ascii-zoom-large', 'ascii-zoom-xlarge');
        if (ASCII_ZOOM_CLASSES[asciiHuntZoomIndex]) {
          mainTable.classList.add(ASCII_ZOOM_CLASSES[asciiHuntZoomIndex]);
        }
      }
      if (zoomLevelEl) {
        zoomLevelEl.textContent = ASCII_ZOOM_LABELS[asciiHuntZoomIndex];
      }
    }

    if (btnZoomIn && !btnZoomIn._hasZoomListener) {
      btnZoomIn._hasZoomListener = true;
      btnZoomIn.addEventListener('click', () => {
        if (asciiHuntZoomIndex < ASCII_ZOOM_CLASSES.length - 1) {
          asciiHuntZoomIndex++;
          applyZoom();
        }
      });
    }

    if (btnZoomOut && !btnZoomOut._hasZoomListener) {
      btnZoomOut._hasZoomListener = true;
      btnZoomOut.addEventListener('click', () => {
        if (asciiHuntZoomIndex > 0) {
          asciiHuntZoomIndex--;
          applyZoom();
        }
      });
    }

    // Expand Height
    const btnExpand = document.getElementById('btn-ascii-expand-height');
    const portalBox = document.getElementById('ascii-hunt-portal');
    if (btnExpand && !btnExpand._hasExpandListener) {
      btnExpand._hasExpandListener = true;
      btnExpand.addEventListener('click', () => {
        if (portalBox) {
          portalBox.classList.toggle('expanded');
          btnExpand.textContent = portalBox.classList.contains('expanded') ? '[ ⊟ COMPACT ]' : '[ ⛶ EXPAND ]';
        }
      });
    }

    // Layout Toggle (Side-by-Side vs Full Width)
    const btnLayout = document.getElementById('btn-ascii-layout-toggle');
    const layoutGrid = document.querySelector('.ascii-layout-grid');
    if (btnLayout && !btnLayout._hasLayoutListener) {
      btnLayout._hasLayoutListener = true;
      btnLayout.addEventListener('click', () => {
        if (layoutGrid) {
          layoutGrid.classList.toggle('layout-full-width');
          const isFull = layoutGrid.classList.contains('layout-full-width');
          btnLayout.textContent = isFull ? '[ ◫ SIDE-BY-SIDE ]' : '[ ⬚ FULL WIDTH ]';
        }
      });
    }
  }

  function populateAsciiReferenceTable(filterQuery) {
    const tbody = document.getElementById('ascii-table-tbody');
    if (tbody) {
      initAsciiHuntPortalControls();
      const searchInp = document.getElementById('ascii-table-search');
      const q = (filterQuery !== undefined ? filterQuery : (searchInp ? searchInp.value : '')).trim().toLowerCase();

      if (!q && filterQuery === undefined && tbody.children && tbody.children.length > 0 && tbody.dataset && tbody.dataset.renderedRange === asciiHuntCurrentRange) {
        populateHvAsciiReferenceTable();
        return;
      }
      if (tbody.dataset) tbody.dataset.renderedRange = asciiHuntCurrentRange;

      const data = getAsciiCodeSourceData();

      const filtered = data.filter(item => {
        // 1. Range filter
        if (asciiHuntCurrentRange === 'control' && !(item.dec >= 0 && item.dec <= 31)) return false;
        if (asciiHuntCurrentRange === 'printable' && !(item.dec >= 32 && item.dec <= 127)) return false;
        if (asciiHuntCurrentRange === 'extended' && !(item.dec >= 128 && item.dec <= 255)) return false;

        // 2. Query filter
        if (!q) return true;
        return String(item.dec).includes(q) ||
          String(item.oct).toLowerCase().includes(q) ||
          String(item.hex).toLowerCase().includes(q) ||
          String(item.bin).includes(q) ||
          String(item.symbol).toLowerCase().includes(q) ||
          String(item.html || '').toLowerCase().includes(q) ||
          String(item.desc || '').toLowerCase().includes(q);
      });

      const countEl = document.getElementById('ascii-visible-count');
      if (countEl) {
        countEl.textContent = `${filtered.length} ROWS`;
      }

      tbody.innerHTML = filtered.map(item => {
        const isCtrl = item.dec < 32 || item.dec === 127;
        return `
          <tr>
            <td style="color: var(--green); font-family: var(--font-code); font-weight: 800; font-size: 1.08rem; letter-spacing: 1px;">${item.hex}</td>
            <td style="color: var(--cyan); font-family: var(--font-code); font-weight: 700; font-size: 1rem;">${item.dec}</td>
            <td style="color: #94a3b8; font-family: var(--font-code); font-size: 0.92rem;">${item.oct}</td>
            <td style="color: rgba(0, 243, 255, 0.85); font-family: var(--font-code); font-size: 0.9rem; letter-spacing: 1px;">${item.bin}</td>
            <td style="text-align: center;">
              ${isCtrl ? `<span class="ascii-char-badge ctrl">${escapeHTML(item.symbol)}</span>` : `<span class="ascii-char-badge">${escapeHTML(item.symbol)}</span>`}
            </td>
            <td style="color: #94a3b8; font-family: var(--font-code); font-size: 0.88rem;">${escapeHTML(item.html || '')}</td>
            <td style="color: #f1f5f9; font-size: 0.95rem; font-weight: 500; text-align: left; padding-left: 1.25rem;">${escapeHTML(item.desc || '')}</td>
          </tr>
        `;
      }).join('');
    }

    // Also populate Hidden Vault ASCII table if present
    populateHvAsciiReferenceTable();
  }

  function getAsciiCodeSourceData() {
    if (window.ASCII_CODE_COM_DATA && Array.isArray(window.ASCII_CODE_COM_DATA) && window.ASCII_CODE_COM_DATA.length > 0) {
      return window.ASCII_CODE_COM_DATA;
    }
    // Fallback generator for 0-255 ASCII data if script tag not loaded yet
    const fallback = [];
    for (let c = 0; c <= 255; c++) {
      const hex = c.toString(16).toUpperCase().padStart(2, '0');
      const oct = c.toString(8).padStart(3, '0');
      const bin = c.toString(2).padStart(8, '0');
      let sym = String.fromCharCode(c);
      let desc = '';
      if (ASCII_CONTROL_LABELS && ASCII_CONTROL_LABELS[c]) {
        sym = ASCII_CONTROL_LABELS[c].split(' ')[0];
        desc = ASCII_CONTROL_LABELS[c];
      } else if (c >= 65 && c <= 90) {
        desc = `Uppercase ${sym}`;
      } else if (c >= 97 && c <= 122) {
        desc = `Lowercase ${sym}`;
      } else if (c >= 48 && c <= 57) {
        desc = `Digit ${sym}`;
      } else {
        desc = `Character ${sym}`;
      }
      fallback.push({
        dec: c,
        oct: oct,
        hex: hex,
        bin: bin,
        symbol: sym,
        html: `&#${c};`,
        desc: desc
      });
    }
    return fallback;
  }

  function initHvAsciiPortalControls() {
    // Tab switching (Table View vs Live Web View)
    const tabTable = document.getElementById('hv-ascii-tab-table');
    const tabLive = document.getElementById('hv-ascii-tab-live');
    const panelTable = document.getElementById('hv-ascii-panel-table');
    const panelLive = document.getElementById('hv-ascii-panel-live');
    const liveIframe = document.getElementById('hv-ascii-live-iframe');

    if (tabTable && !tabTable._hasTabListener) {
      tabTable._hasTabListener = true;
      tabTable.addEventListener('click', () => {
        tabTable.classList.add('active');
        if (tabLive) tabLive.classList.remove('active');
        if (panelTable) panelTable.style.display = 'flex';
        if (panelLive) panelLive.style.display = 'none';
      });
    }

    if (tabLive && !tabLive._hasTabListener) {
      tabLive._hasTabListener = true;
      tabLive.addEventListener('click', () => {
        tabLive.classList.add('active');
        if (tabTable) tabTable.classList.remove('active');
        if (panelLive) panelLive.style.display = 'block';
        if (panelTable) panelTable.style.display = 'none';
        if (liveIframe && (liveIframe.src === 'about:blank' || liveIframe.getAttribute('src') === 'about:blank')) {
          liveIframe.src = liveIframe.dataset.src || 'https://www.ascii-code.com/';
        }
      });
    }

    // Range buttons
    const rangeBtns = document.querySelectorAll('.hv-range-btn');
    if (rangeBtns && rangeBtns.forEach) {
      rangeBtns.forEach(btn => {
        if (!btn._hasRangeListener) {
          btn._hasRangeListener = true;
          btn.addEventListener('click', () => {
            rangeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            hvAsciiCurrentRange = btn.dataset ? (btn.dataset.range || 'all') : (btn.getAttribute('data-range') || 'all');
            populateHvAsciiReferenceTable();
          });
        }
      });
    }

    // Search input
    const hvSearchInp = document.getElementById('hv-ascii-table-search');
    if (hvSearchInp && !hvSearchInp._hasAsciiListener) {
      hvSearchInp._hasAsciiListener = true;
      hvSearchInp.addEventListener('input', (e) => {
        populateHvAsciiReferenceTable(e.target.value);
      });
    }
  }

  function populateHvAsciiReferenceTable(filterQuery) {
    const hvTbody = document.getElementById('hv-ascii-table-tbody');
    if (!hvTbody) return;

    initHvAsciiPortalControls();

    const hvSearchInp = document.getElementById('hv-ascii-table-search');
    const q = (filterQuery !== undefined ? filterQuery : (hvSearchInp ? hvSearchInp.value : '')).trim().toLowerCase();

    if (!q && filterQuery === undefined && hvTbody.children && hvTbody.children.length > 0 && hvTbody.dataset && hvTbody.dataset.renderedRange === hvAsciiCurrentRange) {
      return;
    }
    if (hvTbody.dataset) hvTbody.dataset.renderedRange = hvAsciiCurrentRange;

    const data = getAsciiCodeSourceData();

    const filtered = data.filter(item => {
      // 1. Range filter
      if (hvAsciiCurrentRange === 'control' && !(item.dec >= 0 && item.dec <= 31)) return false;
      if (hvAsciiCurrentRange === 'printable' && !(item.dec >= 32 && item.dec <= 127)) return false;
      if (hvAsciiCurrentRange === 'extended' && !(item.dec >= 128 && item.dec <= 255)) return false;

      // 2. Query filter
      if (!q) return true;
      return String(item.dec).includes(q) ||
        String(item.oct).toLowerCase().includes(q) ||
        String(item.hex).toLowerCase().includes(q) ||
        String(item.bin).includes(q) ||
        String(item.symbol).toLowerCase().includes(q) ||
        String(item.html || '').toLowerCase().includes(q) ||
        String(item.desc || '').toLowerCase().includes(q);
    });

    hvTbody.innerHTML = filtered.map(item => {
      const isCtrl = item.dec < 32 || item.dec === 127;
      return `
        <tr>
          <td style="color: var(--green); font-family: var(--font-code); font-weight: 700;">${item.hex}</td>
          <td style="color: var(--cyan); font-family: var(--font-code); font-weight: 700;">${item.dec}</td>
          <td style="color: var(--text-muted); font-family: var(--font-code);">${item.oct}</td>
          <td style="color: rgba(0, 243, 255, 0.75); font-family: var(--font-code); font-size: 0.72rem;">${item.bin}</td>
          <td style="font-weight: 700; color: #ffffff;">
            ${isCtrl ? `<span class="ascii-ctrl-char">${escapeHTML(item.symbol)}</span>` : `<span style="color: var(--cyan);">${escapeHTML(item.symbol)}</span>`}
          </td>
          <td style="color: var(--text-muted); font-family: var(--font-code); font-size: 0.72rem;">${escapeHTML(item.html || '')}</td>
          <td style="color: var(--text-secondary); text-align: left; padding-left: 0.75rem; font-size: 0.78rem;">${escapeHTML(item.desc || '')}</td>
        </tr>
      `;
    }).join('');
  }

  function initAsciiForm() {
    const form = document.getElementById('ascii-answer-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleAsciiSubmitDecodedValue(e);
    });
  }

  async function handleAsciiSubmitDecodedValue(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!activeChallenge) return;

    const input = document.getElementById('ascii-answer-input');
    if (!input) return;

    const val = input.value.trim();
    if (!val) {
      window.showCyberToast("DECODED VALUE REQUIRED: Please enter the decoded string before submitting.", "warning");
      if (window.cyberSound && window.cyberSound.playError) window.cyberSound.playError();
      return;
    }

    const subtaskState = renderAsciiSubtasksUI(activeChallenge);
    const cur = subtaskState.activeSubtask || currentAsciiActiveSubtask;
    const expectedTarget = getAsciiExpectedTarget(activeChallenge, cur);
    const expectedFlag = getAsciiExpectedFlag(activeChallenge, cur, expectedTarget);

    const valNorm = val.toUpperCase().replace(/\s+/g, ' ');
    const targetNorm = expectedTarget.toUpperCase().replace(/\s+/g, ' ');
    const flagNorm = expectedFlag.toUpperCase().replace(/\s+/g, ' ');

    const valNoSp = val.replace(/\s+/g, '').toUpperCase();
    const targetNoSp = expectedTarget.replace(/\s+/g, '').toUpperCase();
    const flagNoSp = expectedFlag.replace(/\s+/g, '').toUpperCase();

    let isMatch = false;
    if (activeChallenge.caseSensitive) {
      isMatch = (val === expectedTarget) || (val === expectedFlag) ||
                (val.replace(/\s+/g, '') === expectedTarget.replace(/\s+/g, ''));
    } else {
      isMatch = (valNorm === targetNorm) || (valNorm === flagNorm) ||
                (valNoSp === targetNoSp) || (valNoSp === flagNoSp) ||
                (valNoSp === `CYBERTRIX{${targetNoSp}}`);
    }

    if (!isMatch && cur) {
      const candidates = [
        cur.targetWord,
        cur.answer,
        cur.flag,
        cur.asciiHex ? cur.asciiHex.split(/\s+/).filter(Boolean).map(h => {
          if (/^[0-9]+$/.test(h) && !/^[0-9A-Fa-f]{2}$/.test(h)) return String.fromCharCode(parseInt(h, 10));
          return String.fromCharCode(parseInt(h, 16));
        }).join('').trim() : ''
      ].filter(Boolean);
      for (const cand of candidates) {
        const cNorm = cand.toUpperCase().replace(/\s+/g, ' ');
        const cNoSp = cand.replace(/\s+/g, '').toUpperCase();
        if (valNorm === cNorm || valNoSp === cNoSp || valNoSp === `CYBERTRIX{${cNoSp}}`) {
          isMatch = true;
          break;
        }
      }
    }

    if (!isMatch && cur && Array.isArray(cur.aliases)) {
      isMatch = cur.aliases.some(a => a.trim().toUpperCase() === valNorm || a.trim().toUpperCase() === valNoSp);
    }

    const feedbackBox = document.getElementById('ascii-answer-feedback');

    if (!isMatch) {
      if (window.cyberSound && window.cyberSound.playError) window.cyberSound.playError();
      window.showCyberToast("INCORRECT DECODED VALUE: Decoded string does not match the hexadecimal byte stream. Check the ASCII table and retry!", "error");
      if (feedbackBox) {
        feedbackBox.style.display = 'block';
        feedbackBox.innerHTML = `
          <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--red-neon); border-radius: 4px; padding: 0.85rem 1.25rem; color: var(--red-neon); text-align: center; font-family: var(--font-tech);">
            <div style="font-weight: 700; font-size: 1rem; margin-bottom: 0.25rem;">✗ INCORRECT DECODED VALUE</div>
            <div style="font-size: 0.82rem; color: #cbd5e1;">Entered: <code style="font-family: var(--font-code); color: #fff;">${escapeHTML(val)}</code> does not match the byte sequence. Consult the ASCII table on the right and retry.</div>
          </div>
        `;
      }
      return;
    }

    // Decoded value matches!
    asciiDecodedVerified = true;
    asciiVerifiedFlag = expectedFlag;

    if (window.cyberSound && window.cyberSound.playSolve) window.cyberSound.playSolve();
    window.showCyberToast("✓ DECODED VALUE VERIFIED! FLAG UNLOCKED FOR SUBMISSION", "success");

    if (feedbackBox) {
      feedbackBox.style.display = 'block';
      feedbackBox.innerHTML = `
        <div style="background: rgba(0, 255, 157, 0.08); border: 1px solid var(--green); border-radius: 6px; padding: 1rem 1.25rem; color: var(--green); text-align: center; font-family: var(--font-tech);">
          <div style="font-size: 1.1rem; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 0.4rem;">
            ✓ DECODED VALUE VERIFIED!
          </div>
          <div style="font-size: 0.88rem; color: #ffffff; margin-bottom: 0.6rem;">
            UNLOCKED FLAG: <strong style="font-family: var(--font-code); color: #030712; background: var(--green); padding: 4px 10px; border-radius: 4px; font-size: 1.05rem; letter-spacing: 1px; display: inline-block; box-shadow: 0 0 12px rgba(0, 255, 157, 0.5);">${escapeHTML(expectedFlag)}</strong>
          </div>
          <div style="font-size: 0.8rem; color: var(--cyan); letter-spacing: 0.5px;">
            Target string decoded successfully! Now submit this flag below in the Flag Submission terminal to claim your points.
          </div>
        </div>
      `;
    }

    // Unlock bottom Flag Submission Form
    const flagNotice = document.getElementById('mk-flag-locked-notice');
    const flagActiveForm = document.getElementById('flag-active-form-wrapper');
    const flagInput = document.getElementById('global-flag-input');

    if (flagNotice) {
      flagNotice.style.display = 'block';
      flagNotice.className = 'event-paused-banner';
      flagNotice.style.background = 'rgba(0, 255, 157, 0.12)';
      flagNotice.style.borderColor = 'var(--green)';
      flagNotice.style.color = 'var(--green)';
      flagNotice.innerHTML = `<span>✓</span> <strong>VALUE VERIFIED:</strong> Flag <code style="color: #fff; font-family: var(--font-code);">${escapeHTML(expectedFlag)}</code> is unlocked. Click [ SUBMIT FLAG ] below to claim points!`;
    }

    if (flagActiveForm) flagActiveForm.style.display = 'block';
    if (flagInput) {
      flagInput.value = expectedFlag;
      flagInput.focus();
    }

    const arena = document.getElementById('flag-submission-arena');
    if (arena) {
      arena.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // =========================================================================
  // 10. METADATA GHOST: CONTROLLER & CHALLENGE TIMER (Requirements 1-3, 8-10, 12-18, 22)
  // =========================================================================
  let ghostTimerInterval = null;

  // =========================================================================
  // 10. METADATA GHOST: OFFLINE FORENSIC SUITE & CONTROLLER
  // =========================================================================
  async function initGhostChallenge(ch) {
    const ghostImg = document.getElementById('ghost-challenge-img');
    const downloadLink = document.getElementById('btn-ghost-download');
    const imgUrl = ch.imageUrl || 'assets/metadata-ghost-01.png';

    if (ghostImg) {
      ghostImg.src = imgUrl;
      ghostImg.classList.remove('high-contrast', 'zoomed');
    }
    if (downloadLink) {
      downloadLink.href = imgUrl;
    }

    // Check solved status
    const solvedIndicator = document.getElementById('ghost-solved-indicator');
    const isSolved = currentUser && Array.isArray(currentUser.solvedChallenges) && currentUser.solvedChallenges.includes(ch.id);
    if (solvedIndicator) {
      solvedIndicator.style.display = isSolved ? 'block' : 'none';
    }

    // Setup Drag and Drop on dropzone
    const dropzone = document.getElementById('ghost-dropzone');
    if (dropzone && !dropzone._hasDropListener) {
      dropzone._hasDropListener = true;
      ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dragover');
        });
      });
      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          const file = dt.files[0];
          readAndInspectFile(file);
        }
      });
    }

    // Restore any previously revealed hints in session
    for (let i = 1; i <= 3; i++) {
      try {
        if (sessionStorage.getItem(`cybertrix_ghost_hint_${i}`) === 'revealed') {
          const b = document.getElementById(`ghost-hint-body-${i}`);
          const btn = document.getElementById(`btn-ghost-hint-${i}`);
          if (b) b.style.display = 'block';
          if (btn) btn.textContent = '[ HIDE HINT ]';
        }
      } catch (e) {}
    }
  }

  window.toggleGhostContrast = function () {
    const img = document.getElementById('ghost-challenge-img');
    if (!img) return;
    img.classList.toggle('high-contrast');
    if (window.cyberSound) window.cyberSound.playClick();
  };

  window.toggleGhostZoom = function () {
    const img = document.getElementById('ghost-challenge-img');
    if (!img) return;
    img.classList.toggle('zoomed');
    if (window.cyberSound) window.cyberSound.playClick();
  };

  window.switchGhostTool = function (toolKey) {
    const tabs = ['meta', 'b64', 'hex', 'rot13'];
    tabs.forEach(t => {
      const btn = document.getElementById(`ghost-tab-btn-${t}`);
      const pane = document.getElementById(`ghost-tool-pane-${t}`);
      if (btn) {
        if (t === toolKey) btn.classList.add('active');
        else btn.classList.remove('active');
      }
      if (pane) {
        if (t === toolKey) pane.classList.add('active');
        else pane.classList.remove('active');
      }
    });
    if (window.cyberSound && window.cyberSound.playClick) window.cyberSound.playClick();
  };

  window.copyGhostText = function (text, btnElement) {
    if (!text || text === '(Awaiting input)') return;

    let btn = btnElement;
    if (!btn && typeof window !== 'undefined' && window.event) {
      const target = window.event.currentTarget || window.event.target;
      if (target && target.tagName === 'BUTTON') btn = target;
    }

    const showSuccessFeedback = () => {
      if (btn) {
        const origHtml = btn.dataset.origHtml || btn.innerHTML;
        btn.dataset.origHtml = origHtml;
        btn.innerHTML = '✓ COPIED!';
        btn.classList.add('btn-cyber-green');
        setTimeout(() => {
          btn.innerHTML = origHtml;
          btn.classList.remove('btn-cyber-green');
        }, 1600);
      }
      window.showCyberToast("Copied to clipboard!", "success");
      if (window.cyberSound && window.cyberSound.playClick) window.cyberSound.playClick();
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showSuccessFeedback();
      }).catch(() => {
        fallbackCopy(text);
        showSuccessFeedback();
      });
    } else {
      fallbackCopy(text);
      showSuccessFeedback();
    }
  };

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      window.showCyberToast("Copied to clipboard!", "success");
    } catch (e) {
      window.showCyberToast("Press Ctrl+C to copy: " + text, "info");
    }
  }

  function readAndInspectFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      parsePngMetadata(e.target.result, file.name, file.type || 'image/png', file.size);
      window.showCyberToast(`Analyzed ${file.name} successfully!`, "success");
      if (window.cyberSound && window.cyberSound.playClick) window.cyberSound.playClick();
    };
    reader.onerror = function () {
      window.showCyberToast("Error reading file locally.", "error");
    };
    reader.readAsArrayBuffer(file);
  }

  window.handleGhostFileSelect = function (event) {
    const file = event.target.files && event.target.files[0];
    if (file) {
      readAndInspectFile(file);
    }
  };

  function parsePngMetadata(arrayBuffer, fileName, fileType, fileSize) {
    let extracted = {
      filename: fileName || 'metadata-ghost-01.png',
      filetype: fileType || 'image/png',
      filesize: fileSize ? (fileSize / 1024).toFixed(1) + ' KB (' + fileSize.toLocaleString() + ' bytes)' : '1.34 MB (1,400,874 bytes)',
      author: 'OPERATIVE_SPECTER // SURVEILLANCE UNIT 03',
      description: 'Surveillance desk reconnaissance. Intercepted map with encrypted coordinates. Device: Canon EOS R5.',
      custom: 'Timestamp: 2026-10-01 22:47:32 // CAM-03 Alleyway // FPS: 60',
      xghost: 'NTA0ODQ4NTcyMDQ0NTcyMDUwNEM0NzUxNEM0QTRCNTc='
    };

    if (arrayBuffer && arrayBuffer.byteLength > 8) {
      try {
        const bytes = new Uint8Array(arrayBuffer);
        const isPng = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 &&
                      bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
        if (isPng) {
          extracted.filesize = (bytes.length / 1024).toFixed(1) + ' KB (' + bytes.length.toLocaleString() + ' bytes)';
          let offset = 8;
          const dv = new DataView(arrayBuffer);
          while (offset + 8 <= bytes.length) {
            const len = dv.getUint32(offset);
            const chunkType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
            const dataOffset = offset + 8;
            if (chunkType === 'tEXt' && dataOffset + len <= bytes.length) {
              const chunkBytes = bytes.subarray(dataOffset, dataOffset + len);
              let nullIdx = -1;
              for (let i = 0; i < chunkBytes.length; i++) {
                if (chunkBytes[i] === 0) { nullIdx = i; break; }
              }
              if (nullIdx !== -1) {
                const key = String.fromCharCode.apply(null, chunkBytes.subarray(0, nullIdx));
                const val = String.fromCharCode.apply(null, chunkBytes.subarray(nullIdx + 1));
                if (key.toLowerCase() === 'author') extracted.author = val;
                else if (key.toLowerCase() === 'description') extracted.description = val;
                else if (key.toLowerCase().includes('custom')) extracted.custom = val;
                else if (key.toLowerCase() === 'x-ghost' || key.toLowerCase() === 'xghost') extracted.xghost = val;
              }
            }
            offset += 12 + len;
            if (chunkType === 'IEND') break;
          }
        } else if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
          extracted.filetype = 'image/jpeg';
          extracted.filesize = (bytes.length / 1024).toFixed(1) + ' KB (' + bytes.length.toLocaleString() + ' bytes)';
          let offset = 2;
          while (offset < bytes.length - 1) {
            if (bytes[offset] === 0xFF && bytes[offset + 1] === 0xFE) {
              const len = (bytes[offset + 2] << 8) | bytes[offset + 3];
              offset += 2 + len;
            } else if (bytes[offset] === 0xFF && bytes[offset + 1] !== 0x00 && bytes[offset + 1] !== 0xD9) {
              const len = (bytes[offset + 2] << 8) | bytes[offset + 3];
              offset += 2 + len;
            } else {
              offset++;
            }
          }
        }
      } catch (err) {
        console.warn('Metadata parsing note:', err);
      }
    }

    const elFn = document.getElementById('meta-val-filename');
    const elFt = document.getElementById('meta-val-filetype');
    const elFs = document.getElementById('meta-val-filesize');
    const elAu = document.getElementById('meta-val-author');
    const elDe = document.getElementById('meta-val-desc');
    const elCu = document.getElementById('meta-val-custom');
    const elXg = document.getElementById('meta-val-xghost');

    if (elFn) elFn.textContent = extracted.filename;
    if (elFt) elFt.textContent = extracted.filetype;
    if (elFs) elFs.textContent = extracted.filesize;
    if (elAu) elAu.textContent = extracted.author;
    if (elDe) elDe.textContent = extracted.description;
    if (elCu) elCu.textContent = extracted.custom;
    if (elXg) elXg.textContent = extracted.xghost;

    const resBox = document.getElementById('ghost-meta-results');
    const clearBtn = document.getElementById('btn-clear-meta');
    if (resBox) resBox.style.display = 'block';
    if (clearBtn) clearBtn.style.display = 'inline-flex';
  }

  window.ghostAnalyzeCurrentImage = function () {
    const imgUrl = (activeChallenge && activeChallenge.imageUrl) ? activeChallenge.imageUrl : 'assets/metadata-ghost-01.png';
    window.switchGhostTool('meta');
    fetch(imgUrl)
      .then(res => {
        if (!res.ok) throw new Error('Fetch status ' + res.status);
        return res.arrayBuffer();
      })
      .then(buf => {
        parsePngMetadata(buf, 'metadata-ghost-01.png', 'image/png', buf.byteLength);
        window.showCyberToast("Target image metadata extracted successfully!", "success");
        if (window.cyberSound && window.cyberSound.playClick) window.cyberSound.playClick();
      })
      .catch(() => {
        // Fallback for file:// sandbox restrictions
        parsePngMetadata(null, 'metadata-ghost-01.png', 'image/png', 1400874);
        window.showCyberToast("Target image metadata extracted successfully!", "success");
        if (window.cyberSound && window.cyberSound.playClick) window.cyberSound.playClick();
      });
  };

  window.clearGhostMetadataInspector = function () {
    const resBox = document.getElementById('ghost-meta-results');
    const clearBtn = document.getElementById('btn-clear-meta');
    const inp = document.getElementById('ghost-file-input');
    if (resBox) resBox.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
    if (inp) inp.value = '';
    window.showCyberToast("Metadata inspector reset.", "info");
  };

  window.runGhostB64Decode = function () {
    const inp = document.getElementById('ghost-b64-input');
    const out = document.getElementById('ghost-b64-output');
    const act = document.getElementById('ghost-b64-actions');
    if (!inp || !out) return;

    const raw = inp.value.trim();
    if (!raw) {
      out.textContent = '(Awaiting input)';
      out.style.color = 'var(--text-muted)';
      if (act) act.style.display = 'none';
      return;
    }

    try {
      const cleaned = raw.replace(/\s+/g, '');
      const decoded = atob(cleaned);
      out.textContent = decoded;
      out.style.color = 'var(--green)';
      if (act) act.style.display = 'flex';
      window.showCyberToast("Base64 decoded successfully!", "success");
      if (window.cyberSound && window.cyberSound.playClick) window.cyberSound.playClick();
    } catch (err) {
      out.textContent = "ERR: Invalid Base64 sequence";
      out.style.color = '#ff0055';
      if (act) act.style.display = 'none';
      if (window.cyberSound && window.cyberSound.playError) window.cyberSound.playError();
    }
  };

  window.clearGhostB64 = function () {
    const inp = document.getElementById('ghost-b64-input');
    const out = document.getElementById('ghost-b64-output');
    const act = document.getElementById('ghost-b64-actions');
    if (inp) inp.value = '';
    if (out) {
      out.textContent = '(Awaiting input)';
      out.style.color = 'var(--text-muted)';
    }
    if (act) act.style.display = 'none';
  };

  window.runGhostHexDecode = function () {
    const inp = document.getElementById('ghost-hex-input');
    const out = document.getElementById('ghost-hex-output');
    const act = document.getElementById('ghost-hex-actions');
    if (!inp || !out) return;

    const raw = inp.value.trim();
    if (!raw) {
      out.textContent = '(Awaiting input)';
      out.style.color = 'var(--text-muted)';
      if (act) act.style.display = 'none';
      return;
    }

    try {
      const cleaned = raw.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
      if (cleaned.length === 0) {
        throw new Error("No hex digits found");
      }
      if (cleaned.length % 2 !== 0) {
        throw new Error("Hex input requires an even number of digits");
      }

      let result = '';
      for (let i = 0; i < cleaned.length; i += 2) {
        const byte = parseInt(cleaned.substr(i, 2), 16);
        result += String.fromCharCode(byte);
      }

      out.textContent = result;
      out.style.color = 'var(--green)';
      if (act) act.style.display = 'flex';
      window.showCyberToast("Hexadecimal decoded successfully!", "success");
      if (window.cyberSound && window.cyberSound.playClick) window.cyberSound.playClick();
    } catch (err) {
      out.textContent = "ERR: Invalid Hex (" + err.message + ")";
      out.style.color = '#ff0055';
      if (act) act.style.display = 'none';
      if (window.cyberSound && window.cyberSound.playError) window.cyberSound.playError();
    }
  };

  window.clearGhostHex = function () {
    const inp = document.getElementById('ghost-hex-input');
    const out = document.getElementById('ghost-hex-output');
    const act = document.getElementById('ghost-hex-actions');
    if (inp) inp.value = '';
    if (out) {
      out.textContent = '(Awaiting input)';
      out.style.color = 'var(--text-muted)';
    }
    if (act) act.style.display = 'none';
  };

  window.runGhostCaesarDecode = function (shift = 3) {
    const inp = document.getElementById('ghost-rot13-input');
    const out = document.getElementById('ghost-rot13-output');
    const act = document.getElementById('ghost-rot13-actions');
    if (!inp || !out) return;

    const raw = inp.value.trim();
    if (!raw) {
      out.textContent = '(Awaiting input)';
      out.style.color = 'var(--text-muted)';
      if (act) act.style.display = 'none';
      return;
    }

    try {
      const decoded = raw.replace(/[a-zA-Z]/g, function (c) {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base - shift + 26) % 26) + base);
      });

      out.textContent = decoded;
      out.style.color = 'var(--green)';
      if (act) act.style.display = 'flex';
      window.showCyberToast(`Decoded with Shift = ${shift} successfully!`, "success");
      if (window.cyberSound && window.cyberSound.playClick) window.cyberSound.playClick();
    } catch (err) {
      out.textContent = "ERR: Invalid Cipher input";
      out.style.color = '#ff0055';
      if (act) act.style.display = 'none';
      if (window.cyberSound && window.cyberSound.playError) window.cyberSound.playError();
    }
  };

  window.runGhostRot13Decode = function () {
    window.runGhostCaesarDecode(13);
  };

  window.clearGhostRot13 = function () {
    const inp = document.getElementById('ghost-rot13-input');
    const out = document.getElementById('ghost-rot13-output');
    const act = document.getElementById('ghost-rot13-actions');
    if (inp) inp.value = '';
    if (out) {
      out.textContent = '(Awaiting input)';
      out.style.color = 'var(--text-muted)';
    }
    if (act) act.style.display = 'none';
  };

  window.toggleGhostHint = function (hintNumber) {
    const body = document.getElementById(`ghost-hint-body-${hintNumber}`);
    const btn = document.getElementById(`btn-ghost-hint-${hintNumber}`);
    if (!body || !btn) return;

    if (body.style.display === 'none' || !body.style.display) {
      body.style.display = 'block';
      btn.textContent = '[ HIDE HINT ]';
      try {
        sessionStorage.setItem(`cybertrix_ghost_hint_${hintNumber}`, 'revealed');
      } catch (e) {}
      if (window.cyberSound && window.cyberSound.playClick) window.cyberSound.playClick();
    } else {
      body.style.display = 'none';
      btn.textContent = (hintNumber === 1) ? '[ REVEAL HINT ]' : `[ 🔓 UNLOCK HINT ${hintNumber} ]`;
    }
  };

  // =========================================================================
  // 11. FLAG SUBMISSION & UNLOCK ENGINE (Requirements 1, 17, 24, 25)
  // =========================================================================
  function initFlagSubmission() {
    const form = document.getElementById('global-flag-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('global-flag-input');
      if (!input || !activeChallenge) return;

      const flagVal = input.value.trim();
      if (!flagVal) return;

      await submitAnswer(flagVal);
    });
  }

  async function submitAnswer(answerVal) {
    if (!activeChallenge) return;

    if (isChallengeGloballyLocked(activeChallenge)) {
      window.showCyberToast("CHALLENGE GLOBALLY LOCKED: Access is suspended by Administrator.", "error");
      if (window.cyberSound) window.cyberSound.playError();
      return;
    }

    if (isChallengeSolved(activeChallenge)) {
      window.showCyberToast("FLAG ALREADY ACCEPTED: Challenge already completed and permanently locked for your account.", "info");
      return;
    }

    // Mirror Keyboard sequence verification check (allows verified sequence OR direct flag format)
    if (activeChallenge.type === 'mirror-keyboard' || activeChallenge.id === 'mirror-keyboard') {
      const curSub = (currentMkActiveSubtask || (activeChallenge.subtasks && activeChallenge.subtasks[0]));
      const expTarget = ((curSub && (curSub.targetWord || curSub.targetSentence || curSub.answer)) || activeChallenge.targetWord || activeChallenge.targetSentence || 'PYTHON').trim().toUpperCase();
      const expFlag = ((curSub && curSub.flag) || activeChallenge.flag || `CYBERTRIX{${expTarget}}`).trim().toUpperCase();
      const ansClean = (answerVal || '').trim().toUpperCase();
      const isDirectMatch = (ansClean === expTarget || ansClean === expFlag || ansClean.replace(/\s+/g, '') === expTarget || ansClean.replace(/\s+/g, '') === expFlag || ansClean.replace(/\s+/g, '') === `CYBERTRIX{${expTarget}}`);

      if (!mkSequenceVerified && !isDirectMatch) {
        window.showCyberToast("KEYBOARD SEQUENCE REQUIRED: Type the target word on the mirror keyboard or enter the flag!", "warning");
        if (window.cyberSound && window.cyberSound.playError) window.cyberSound.playError();
        return;
      }
    }

    // ASCII Value Finding verification check (allows verified decoded value OR direct flag format)
    if (activeChallenge.type === 'ascii-hunt' || activeChallenge.id === 'ascii-hunt' || activeChallenge.id.startsWith('ascii-hunt')) {
      const curSub = (currentAsciiActiveSubtask || (activeChallenge.subtasks && activeChallenge.subtasks[0]));
      const expTarget = ((curSub && (curSub.targetWord || curSub.answer)) || activeChallenge.targetWord || '').trim().toUpperCase();
      const expFlag = ((curSub && curSub.flag) || activeChallenge.flag || `CYBERTRIX{${expTarget}}`).trim().toUpperCase();
      const ansClean = (answerVal || '').trim().toUpperCase();
      const isDirectMatch = expTarget && (ansClean === expTarget || ansClean === expFlag || ansClean.replace(/\s+/g, '') === expTarget || ansClean.replace(/\s+/g, '') === expFlag || ansClean.replace(/\s+/g, '') === `CYBERTRIX{${expTarget}}`);

      if (!asciiDecodedVerified && !isDirectMatch) {
        window.showCyberToast("DECODED VALUE REQUIRED: Enter the decoded target word or the flag!", "warning");
        if (window.cyberSound && window.cyberSound.playError) window.cyberSound.playError();
        return;
      }
    }

    if (currentUser && (currentUser.disabled === true || currentUser.status === 'disabled')) {
      window.showCyberToast("Your CYBERTRIX account has been disabled by the administrator.", "error");
      if (window.cyberSound) window.cyberSound.playError();
      return;
    }

    if (isTimerEnded) {
      window.showCyberToast("CTF EVENT ENDED. FLAG SUBMISSION IS CLOSED.", "error");
      return;
    }
    if (isTimerPaused) {
      window.showCyberToast("EVENT PAUSED: Submissions temporarily suspended.", "error");
      return;
    }
    if (isTimerNotStarted) {
      window.showCyberToast("EVENT NOT STARTED: Submissions not yet open.", "error");
      return;
    }

    // Requirement 17: Check Individual Challenge Timer
    if (activeChallenge.type === 'metadata-ghost' || (activeChallenge.timerSeconds && activeChallenge.timerSeconds > 0)) {
      try {
        const attempt = await window.CYBERTRIX_DB.attempts.getAttempt(activeChallenge.id);
        if (attempt && (attempt.status === 'expired' || attempt.remainingSeconds <= 0)) {
          window.showCyberToast("CHALLENGE TIME EXPIRED: Submission window has closed.", "error");
          return;
        }
      } catch (e) {
        // Ignored, backend will enforce
      }
    }

    const submitBtn = document.getElementById('global-flag-submit-btn');
    const feedbackBox = document.getElementById('global-flag-feedback');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'TRANSMITTING...';
    }

    try {
      const res = await window.CYBERTRIX_DB.submissions.submitFlag(activeChallenge.id, answerVal);

      if (res.success) {
        currentUser = window.CYBERTRIX_DB.auth.getCurrentUser();

        // 1. If this was a sub-task solve and the challenge still has remaining sub-tasks:
        if (res.subtaskCompleted && !res.isAllCompleted) {
          if (feedbackBox) {
            feedbackBox.className = 'submission-feedback access-granted';
            feedbackBox.innerHTML = `<span>✓</span> ${escapeHTML(res.message)}`;
            feedbackBox.style.display = 'flex';
          }

          window.showCyberToast(res.message, "success");
          if (window.cyberSound) window.cyberSound.playSolve();

          // Clear flag submission input & restore submit button
          clearGlobalFlagInput(false);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '[ SUBMIT FLAG ]';
          }

          // Reset workspace state for the next sub-task so it's ready
          if (activeChallenge.type === 'mirror-keyboard' || activeChallenge.id === 'mirror-keyboard') {
            resetMirrorKeyboard(activeChallenge);
          } else if (activeChallenge.type === 'ascii-hunt' || activeChallenge.id === 'ascii-hunt' || activeChallenge.id.startsWith('ascii-hunt')) {
            resetAsciiHuntState(activeChallenge);
          }

          // Update workspace state for current challenge (displays the next sub-task)
          updateWorkspaceView(activeChallenge);

          // Update challenge list so the next challenge's lock is immediately opened
          renderChallengeList();

          if (!challengesList || challengesList.length === 0) {
            try {
              if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges && window.CYBERTRIX_DB.challenges.getAllSync) {
                const fresh = window.CYBERTRIX_DB.challenges.getAllSync(false);
                if (Array.isArray(fresh) && fresh.length > 0) {
                  challengesList = [...fresh].sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
                }
              }
            } catch (e) {}
          }

          const sortedChs = [...(challengesList || [])]
            .filter(c => !/^(mirror-keyboard|ascii-hunt)-\d+$/.test(c.id))
            .sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
          const currentBaseId = (activeChallenge.id || '').replace(/-\d+$/, '');
          const curIdx = sortedChs.findIndex(c => c.id === currentBaseId || c.id === activeChallenge.id);
          const nextChallenge = (curIdx >= 0 && curIdx < sortedChs.length - 1) ? sortedChs[curIdx + 1] : null;

          if (res.nextSubtaskTitle) {
            window.showCyberToast(`🚀 ${res.nextSubtaskTitle} IS NOW UNLOCKED & ACTIVE!`, "info");
          }
          if (nextChallenge) {
            window.showCyberToast(`Sector 0${nextChallenge.order} [${nextChallenge.title}] Lock OPENED in arena!`, "success");
          }

          // Persist current active challenge in session
          try {
            sessionStorage.setItem('cybertrix_active_challenge_id', activeChallenge.id);
          } catch (e) {}

          // Scroll workspace so the player can view and solve the next sub-task
          const activeSubtaskCard = document.getElementById(activeChallenge.type === 'ascii-hunt' || activeChallenge.id.startsWith('ascii-hunt') ? 'ascii-subtasks-card' : 'mk-subtasks-card');
          if (activeSubtaskCard) {
            activeSubtaskCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }

          return;
        }

        // 2. Full challenge completed (all sub-tasks solved or single challenge completed)
        if (feedbackBox) {
          if (activeChallenge.type === 'hidden-vault') {
            const customSuccess = (activeChallenge.successMessage || 'OPERATION COMPLETE // +250 POINTS AWARDED // STATUS: SOLVED ✓').trim();
            feedbackBox.className = 'submission-feedback access-granted';
            feedbackBox.innerHTML = `<span>✓</span> ${customSuccess}`;
          } else {
            const totalPts = res.totalChallengePoints || res.pointsAwarded || activeChallenge.points || 100;
            feedbackBox.className = 'submission-feedback access-granted';
            feedbackBox.innerHTML = `<span>✓</span> ACCESS GRANTED // CHALLENGE SOLVED (+${totalPts} PTS)`;
          }
          feedbackBox.style.display = 'flex';
        }

        window.showCyberToast(activeChallenge.type === 'hidden-vault' ? "OPERATION COMPLETE! +250 PTS AWARDED // STATUS: SOLVED ✓" : (res.message || `FLAG VERIFIED! +${res.pointsAwarded} PTS awarded!`), "success");
        if (window.cyberSound) window.cyberSound.playSolve();

        // Immediately clear and lock flag input
        clearGlobalFlagInput(false);
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '🔒 COMPLETED & LOCKED';
        }
        const flagInputEl = document.getElementById('global-flag-input');
        if (flagInputEl) {
          flagInputEl.disabled = true;
          flagInputEl.placeholder = 'CHALLENGE COMPLETED — PERMANENTLY LOCKED ✓';
        }

        // Notify user state change
        try {
          window.dispatchEvent(new CustomEvent('cybertrix_user_updated', { detail: { user: currentUser } }));
        } catch (e) {}

        // Permanently stop this challenge's timer (Requirement 2)
        try {
          await window.CYBERTRIX_DB.attempts.completeAttempt(activeChallenge.id);
        } catch (e) {}
        if (challengeTimerInterval) {
          clearInterval(challengeTimerInterval);
          challengeTimerInterval = null;
        }

        updateWorkspaceView(activeChallenge);
        // Immediately refresh challenge list to show solved badge and unlock next
        renderChallengeList();

        // Always make sure challengesList is fresh
        if (!challengesList || challengesList.length === 0) {
          try {
            if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.challenges && window.CYBERTRIX_DB.challenges.getAllSync) {
              const fresh = window.CYBERTRIX_DB.challenges.getAllSync(false);
              if (Array.isArray(fresh) && fresh.length > 0) {
                challengesList = [...fresh].sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
              }
            }
          } catch (e) {}
        }

        // Find next challenge in sequential progression (Requirement 1: Next challenge automatically unlocked/opened)
        const sortedChs = [...(challengesList || [])]
          .filter(c => !/^(mirror-keyboard|ascii-hunt)-\d+$/.test(c.id))
          .sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
        const currentBaseId = (activeChallenge.id || '').replace(/-\d+$/, '');
        const curIdx = sortedChs.findIndex(c => c.id === currentBaseId || c.id === activeChallenge.id);
        const nextChallenge = (curIdx >= 0 && curIdx < sortedChs.length - 1) ? sortedChs[curIdx + 1] : null;

        if (nextChallenge) {
          window.showCyberToast(`Sector 0${nextChallenge.order} [${nextChallenge.title}] UNLOCKED! Automatically entering next challenge...`, "success");
          setTimeout(async () => {
            if (nextChallenge.type === 'metadata-ghost' || (nextChallenge.timerSeconds && nextChallenge.timerSeconds > 0)) {
              try {
                await window.CYBERTRIX_DB.attempts.startAttempt(nextChallenge.id);
              } catch (err) {}
            }
            activeChallenge = nextChallenge;
            try {
              sessionStorage.setItem('cybertrix_active_challenge_id', nextChallenge.id);
            } catch (e) {}

            const listView = document.getElementById('view-challenge-list');
            const workspaceView = document.getElementById('view-challenge-workspace');
            if (listView) listView.style.display = 'none';
            if (workspaceView) workspaceView.style.display = 'block';

            clearGlobalFlagInput(true);
            updateWorkspaceView(nextChallenge);
            renderChallengeList();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            window.showCyberToast(`NOW ACTIVE: Sector 0${nextChallenge.order} [${nextChallenge.title}]`, "info");
          }, 1200);
        } else {
          window.showCyberToast(`🏆 CONGRATULATIONS! ALL SECTORS SUCCESSFULLY CLEARED!`, "success");
          renderChallengeList();
        }
      } else {
        if (feedbackBox) {
          if (activeChallenge.type === 'hidden-vault') {
            feedbackBox.className = 'submission-feedback access-denied';
            feedbackBox.innerHTML = `<span>✗</span> INVALID FLAG // EVIDENCE VERIFICATION FAILED`;
          } else {
            feedbackBox.className = 'submission-feedback access-denied';
            feedbackBox.innerHTML = `<span>✗</span> ${res.message || "ACCESS DENIED: Invalid flag submission."}`;
          }
          feedbackBox.style.display = 'flex';
        }
        window.showCyberToast(activeChallenge.type === 'hidden-vault' ? "INVALID FLAG // EVIDENCE VERIFICATION FAILED" : (res.message || "ACCESS DENIED: Submission did not match."), "error");
        if (window.cyberSound) window.cyberSound.playError();
      }
    } catch (err) {
      if (feedbackBox) {
        feedbackBox.className = 'submission-feedback access-denied';
        feedbackBox.innerHTML = `<span>⚠</span> ${err.message}`;
        feedbackBox.style.display = 'flex';
      }
      window.showCyberToast(err.message, "error");
      if (window.cyberSound) window.cyberSound.playError();
    } finally {
      if (submitBtn && (!activeChallenge || !isChallengeSolved(activeChallenge))) {
        submitBtn.disabled = false;
        submitBtn.textContent = '[ SUBMIT FLAG ]';
      }
    }
  }

  // HTML Entity Escaper
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Global helper exports
  window.clearGlobalFlagInput = clearGlobalFlagInput;
  window.updateWorkspaceView = updateWorkspaceView;
  window.openChallengeWorkspace = function(ch) { activeChallenge = ch; clearGlobalFlagInput(true); updateWorkspaceView(ch); };
  window.handleAsciiSubmitDecodedValue = handleAsciiSubmitDecodedValue;
  window.resetAsciiHuntState = resetAsciiHuntState;
  window.handleMkSubmitSequence = handleMkSubmitSequence;
  window.handleMirrorKeypress = handleMirrorKeypress;
  window.setMkBuffer = function(val) { mkBuffer = val; updateMkStreamUI(); };
  window.submitAnswer = submitAnswer;

})();
