/**
 * CYBERTRIX - Public Announcements System
 * Real-time announcement feed with important badges, pulsing indicators,
 * and public popup notification modal on publication (Requirement 8).
 */

(function () {
  'use strict';

  const SEEN_STORAGE_KEY = 'cybertrix_seen_announcements';
  let announcementQueue = [];
  let isPopupActive = false;

  document.addEventListener('DOMContentLoaded', () => {
    initPublicAnnouncements();
  });

  function getSeenAnnouncementIds() {
    try {
      const raw = localStorage.getItem(SEEN_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function markAnnouncementSeen(id) {
    if (!id) return;
    try {
      const seen = getSeenAnnouncementIds();
      if (!seen.includes(id)) {
        seen.push(id);
        localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen));
      }
    } catch (e) {}
  }

  function initPublicAnnouncements() {
    if (!window.CYBERTRIX_DB || !window.CYBERTRIX_DB.announcements) {
      return;
    }

    let isInitialLoad = true;

    // Subscribe to real-time announcements
    window.CYBERTRIX_DB.announcements.onSnapshot((announcements) => {
      const published = (announcements || []).filter(a => a.published !== false);

      // 1. Render in-page feed if present (e.g. index.html)
      renderInPageList(published);

      // 2. On initial page load, seed seen list so existing announcements don't block user
      if (isInitialLoad) {
        isInitialLoad = false;
        const seen = getSeenAnnouncementIds();
        if (seen.length === 0) {
          published.forEach(a => markAnnouncementSeen(a.id));
          return;
        }
      }

      // 3. Handle announcement popups for newly published transmissions
      handleAnnouncementPopups(published);
    });
  }

  function renderInPageList(announcements) {
    const container = document.getElementById('public-announcements-list');
    if (!container) return;

    if (!announcements || announcements.length === 0) {
      container.innerHTML = `
        <div class="cyber-card" style="text-align: center; color: var(--text-muted); font-family: var(--font-code);">
          [NO PUBLIC TRANSMISSIONS BROADCASTED YET]
        </div>
      `;
      return;
    }

    const hasImportant = announcements.some(a => a.important);
    const auraEl = document.getElementById('announcement-aura');
    if (auraEl) {
      auraEl.style.display = hasImportant ? 'block' : 'none';
    }

    container.innerHTML = announcements.map(item => {
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : 'RECENT';

      return `
        <article class="announcement-card ${item.important ? 'important' : ''} cyber-card-corner">
          <div class="announcement-top">
            <div class="announcement-heading">
              ${item.important ? `
                <span class="cyber-badge badge-red badge-pulse">
                  <span>⚠</span> IMPORTANT
                </span>
              ` : `
                <span class="cyber-badge badge-cyan">
                  <span>◈</span> NOTICE
                </span>
              `}
              <span>${escapeHTML(item.title)}</span>
            </div>
            <time class="announcement-time" datetime="${item.createdAt || ''}">
              ${dateStr}
            </time>
          </div>
          <div class="announcement-body">
            ${escapeHTML(item.message)}
          </div>
        </article>
      `;
    }).join('');
  }

  function handleAnnouncementPopups(publishedAnnouncements) {
    const seenIds = getSeenAnnouncementIds();

    // Identify unseen announcements (sorted oldest first so user sees them in order)
    const unseen = publishedAnnouncements
      .filter(a => a && a.id && !seenIds.includes(a.id))
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

    if (unseen.length === 0) return;

    // Queue unseen announcements
    unseen.forEach(ann => {
      if (!announcementQueue.some(q => q.id === ann.id)) {
        announcementQueue.push(ann);
      }
    });

    if (!isPopupActive) {
      displayNextQueuedPopup();
    }
  }

  function ensurePopupModalInDOM() {
    let overlay = document.getElementById('announcement-popup-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'announcement-popup-overlay';
    overlay.className = 'announcement-popup-overlay';
    overlay.style.display = 'none';

    overlay.innerHTML = `
      <div class="announcement-popup-card cyber-card-corner" id="announcement-popup-card" role="dialog" aria-modal="true" aria-labelledby="announcement-popup-title">
        <button type="button" class="announcement-popup-close" id="btn-announcement-popup-close" aria-label="Close Announcement">&times;</button>
        <div class="announcement-popup-icon" id="announcement-popup-icon">📢</div>
        <div class="announcement-popup-tag" id="announcement-popup-tag">ANNOUNCEMENT</div>
        <h3 class="announcement-popup-title" id="announcement-popup-title">TRANSMISSION TITLE</h3>
        <div class="announcement-popup-body" id="announcement-popup-body">Message body</div>
        <div class="announcement-popup-actions">
          <button type="button" id="btn-announcement-popup-ok" class="btn-cyber btn-cyber-primary">[ OK ]</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const btnOk = overlay.querySelector('#btn-announcement-popup-ok');
    const btnClose = overlay.querySelector('#btn-announcement-popup-close');

    if (btnOk) {
      btnOk.addEventListener('click', dismissCurrentPopup);
    }
    if (btnClose) {
      btnClose.addEventListener('click', dismissCurrentPopup);
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        dismissCurrentPopup();
      }
    });

    return overlay;
  }

  function displayNextQueuedPopup() {
    if (announcementQueue.length === 0) {
      isPopupActive = false;
      const overlay = document.getElementById('announcement-popup-overlay');
      if (overlay) overlay.style.display = 'none';
      return;
    }

    isPopupActive = true;
    const current = announcementQueue[0];
    const overlay = ensurePopupModalInDOM();
    const card = overlay.querySelector('#announcement-popup-card');
    const tagEl = overlay.querySelector('#announcement-popup-tag');
    const titleEl = overlay.querySelector('#announcement-popup-title');
    const bodyEl = overlay.querySelector('#announcement-popup-body');
    const iconEl = overlay.querySelector('#announcement-popup-icon');

    if (card) {
      if (current.important) {
        card.classList.add('important');
      } else {
        card.classList.remove('important');
      }
    }

    if (tagEl) {
      tagEl.textContent = current.important ? '⚠ CRITICAL ANNOUNCEMENT' : '📢 ANNOUNCEMENT';
    }
    if (iconEl) {
      iconEl.textContent = current.important ? '🚨' : '📢';
    }
    if (titleEl) {
      titleEl.textContent = current.title || 'BROADCAST TRANSMISSION';
    }
    if (bodyEl) {
      bodyEl.textContent = current.message || '';
    }

    overlay.style.display = 'flex';

    try {
      if (window.cyberSound && window.cyberSound.playClick) {
        window.cyberSound.playClick();
      }
    } catch (e) {}
  }

  function dismissCurrentPopup() {
    if (announcementQueue.length > 0) {
      const dismissed = announcementQueue.shift();
      if (dismissed && dismissed.id) {
        markAnnouncementSeen(dismissed.id);
      }
    }

    const overlay = document.getElementById('announcement-popup-overlay');
    if (announcementQueue.length > 0) {
      displayNextQueuedPopup();
    } else {
      isPopupActive = false;
      if (overlay) overlay.style.display = 'none';
    }

    try {
      if (window.cyberSound && window.cyberSound.playClick) {
        window.cyberSound.playClick();
      }
    } catch (e) {}
  }

  // Global helper for testing or triggering announcements
  window.showAnnouncementPopup = function (announcement) {
    if (!announcement) return;
    announcementQueue.push(announcement);
    if (!isPopupActive) {
      displayNextQueuedPopup();
    }
  };

  function escapeHTML(str) {
    return String(str || '').replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }
})();
