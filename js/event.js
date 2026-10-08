/**
 * CYBERTRIX - Global CTF Event Timer & Countdown Controller
 * Synchronizes a single global event timer across all operatives, browsers, and tabs.
 * Supports NOT_STARTED, LIVE, PAUSED, ENDED, and scheduled starts.
 */

(function () {
  let timerConfig = null;
  let timerInterval = null;

  document.addEventListener('DOMContentLoaded', () => {
    initGlobalEventTimer();
  });

  function initGlobalEventTimer() {
    if (!window.CYBERTRIX_DB || !window.CYBERTRIX_DB.timer) return;

    window.CYBERTRIX_DB.timer.onSnapshot((config) => {
      timerConfig = config;
      renderTimerUI();
    });

    // Also sync with event general settings if available
    if (window.CYBERTRIX_DB.event) {
      window.CYBERTRIX_DB.event.onSnapshot((evConfig) => {
        updateEventGeneralUI(evConfig);
      });
    }

    // Run active countdown loop
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (timerConfig) {
        // If scheduled start reached in NOT_STARTED state, re-fetch config
        if (timerConfig.status === 'NOT_STARTED' && timerConfig.startMode === 'scheduled' && timerConfig.scheduledStartTime) {
          const sched = new Date(timerConfig.scheduledStartTime).getTime();
          if (!isNaN(sched) && Date.now() >= sched) {
            window.CYBERTRIX_DB.timer.getTimerConfig().then(c => {
              timerConfig = c;
              renderTimerUI();
            });
            return;
          }
        }

        if (timerConfig.status === 'LIVE') {
          renderTimerUI();
        }
      }
    }, 1000);
  }

  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function renderTimerUI() {
    if (!timerConfig) return;

    const timerDisplayEl = document.getElementById('global-timer-display');
    const statusBadgeEl = document.getElementById('global-timer-status-badge');
    const legacyDays = document.getElementById('count-days');
    const legacyHours = document.getElementById('count-hours');
    const legacyMins = document.getElementById('count-mins');
    const legacySecs = document.getElementById('count-secs');

    let displayString = '00:00:00';
    let badgeText = '● LIVE';
    let badgeClass = 'cyber-badge badge-green badge-pulse';

    const status = timerConfig.status || 'NOT_STARTED';

    if (status === 'NOT_STARTED') {
      const dur = timerConfig.remainingSeconds || timerConfig.durationSeconds || 7200;
      displayString = formatTime(dur);

      if (timerConfig.startMode === 'scheduled' && timerConfig.scheduledStartTime) {
        const schedDate = new Date(timerConfig.scheduledStartTime);
        const timeStr = !isNaN(schedDate.getTime()) ? schedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        badgeText = `EVENT STARTS AT ${timeStr}`;
        badgeClass = 'cyber-badge badge-yellow';
      } else {
        badgeText = 'EVENT NOT STARTED';
        badgeClass = 'cyber-badge badge-yellow';
      }
    } else if (status === 'LIVE') {
      let rem = 0;
      if (timerConfig.endTime) {
        rem = Math.max(0, Math.floor((new Date(timerConfig.endTime).getTime() - Date.now()) / 1000));
      } else {
        rem = timerConfig.remainingSeconds || 0;
      }

      if (rem <= 0) {
        displayString = '00:00:00';
        badgeText = 'TIME EXPIRED';
        badgeClass = 'cyber-badge badge-red';
        // Auto trigger end in db only once upon transition
        if (timerConfig.status === 'LIVE') {
          timerConfig.status = 'ENDED';
          if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.timer && window.CYBERTRIX_DB.timer.endEvent) {
            window.CYBERTRIX_DB.timer.endEvent().catch(() => {});
          }
        }
      } else {
        displayString = formatTime(rem);
        badgeText = '● LIVE';
        badgeClass = 'cyber-badge badge-green badge-pulse';
      }
    } else if (status === 'PAUSED') {
      const rem = timerConfig.remainingSeconds || 0;
      displayString = formatTime(rem);
      badgeText = 'EVENT PAUSED';
      badgeClass = 'cyber-badge badge-yellow';
    } else if (status === 'ENDED') {
      displayString = '00:00:00';
      badgeText = 'TIME EXPIRED';
      badgeClass = 'cyber-badge badge-red';
    }

    // Update main cyber display
    if (timerDisplayEl) {
      timerDisplayEl.textContent = displayString;
    }

    // Update status badge
    if (statusBadgeEl) {
      statusBadgeEl.className = badgeClass;
      statusBadgeEl.innerHTML = badgeText.startsWith('●') ? `<span>●</span> LIVE` : escapeHTML(badgeText);
    }

    // Update segmented display if present
    if (legacyHours && legacyMins && legacySecs) {
      const parts = displayString.split(':');
      if (legacyDays) legacyDays.textContent = '00';
      legacyHours.textContent = parts[0] || '00';
      legacyMins.textContent = parts[1] || '00';
      legacySecs.textContent = parts[2] || '00';
    }

    // Update global status pill in hero
    const statusPills = document.querySelectorAll('.event-status-pill');
    statusPills.forEach(pill => {
      pill.className = badgeClass;
      pill.innerHTML = badgeText.startsWith('●') ? `<span>●</span> CYBERTRIX IS LIVE` : escapeHTML(badgeText);
    });

    // Update any timer status text on admin/user pages
    const adminTimerStatusEl = document.getElementById('admin-timer-status-preview');
    if (adminTimerStatusEl) {
      adminTimerStatusEl.textContent = status;
      adminTimerStatusEl.className = status === 'LIVE' ? 'status-pill status-active' : (status === 'PAUSED' ? 'status-pill status-locked' : 'status-pill status-hidden');
    }

    const adminTimerRemainingEl = document.getElementById('admin-timer-remaining-preview');
    if (adminTimerRemainingEl) {
      adminTimerRemainingEl.textContent = displayString;
    }
  }

  function updateEventGeneralUI(evConfig) {
    if (!evConfig) return;
    const eventNameEls = document.querySelectorAll('.event-name-display');
    eventNameEls.forEach(el => {
      el.textContent = evConfig.eventName || "CYBERTRIX CTF 2026";
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

  window.addEventListener('beforeunload', () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  });

  // Export helper globally
  window.formatCTFTime = formatTime;
})();
