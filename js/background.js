/**
 * CYBERTRIX - Interactive Cyber Canvas & Grid System
 * Dynamic particles, connection lines, mouse parallax, and admin shortcut handler
 */

(function () {
  let canvas, ctx;
  let particles = [];
  const particleCount = 26;
  const maxDistance = 125;
  let mouse = { x: null, y: null, radius: 120 };

  function initCanvas() {
    canvas = document.getElementById('cyber-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'cyber-canvas';
      document.body.prepend(canvas);
    }
    ctx = canvas.getContext('2d');
    resize();
    createParticles();
    requestAnimationFrame(animate);

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('mousemove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }, { passive: true });
    window.addEventListener('mouseout', () => {
      mouse.x = null;
      mouse.y = null;
    }, { passive: true });
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticles() {
    particles = [];
    const width = canvas ? canvas.width : window.innerWidth;
    const height = canvas ? canvas.height : window.innerHeight;
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 1.5 + 1,
        color: Math.random() > 0.3 ? 'rgba(0, 243, 255, ' : 'rgba(157, 78, 221, ',
        alpha: Math.random() * 0.4 + 0.3
      });
    }
  }

  function animate() {
    if (document.hidden) {
      requestAnimationFrame(animate);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.shadowBlur = 0; // Explicitly disable expensive shadow blur to prevent browser hang

    // 1. Draw connecting lines in batched paths for high performance
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.12)';
    ctx.lineWidth = 0.75;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < maxDistance) {
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
        }
      }
    }
    ctx.stroke();

    // 2. Update and draw particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Update position
      p.x += p.vx;
      p.y += p.vy;

      // Bounce
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      // Mouse influence
      if (mouse.x !== null) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius && dist > 0) {
          p.x -= (dx / dist) * 1.0;
          p.y -= (dy / dist) * 1.0;
        }
      }

      // Draw particle (no blur, pure alpha rendering)
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color + p.alpha + ')';
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  // Admin Shortcut Handler (CTRL + SHIFT + A)
  function initAdminShortcut() {
    window.addEventListener('keydown', (e) => {
      // Check if Ctrl + Shift + A (or Cmd + Shift + A on macOS) is pressed
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        if (window.cyberSound) window.cyberSound.playClick();
        triggerAdminAccess();
      }
    });
  }

  async function triggerAdminAccess() {
    // Check if on admin page already
    if (window.location.pathname.includes('/admin/')) {
      return;
    }

    const currentUser = (window.CYBERTRIX_DB && window.CYBERTRIX_DB.auth) ? window.CYBERTRIX_DB.auth.getCurrentUser() : null;

    // If an authenticated user is currently logged in, perform access check (Requirement 1)
    if (currentUser) {
      let isAuthorized = false;
      try {
        if (window.CYBERTRIX_DB.auth.verifyAdminAccess) {
          const check = await window.CYBERTRIX_DB.auth.verifyAdminAccess(currentUser.uid, currentUser.email);
          isAuthorized = Boolean(check && check.authorized);
        } else {
          isAuthorized = (currentUser.role === 'admin' && currentUser.active !== false);
        }
      } catch (e) {
        isAuthorized = false;
      }

      if (!isAuthorized) {
        if (window.cyberSound) window.cyberSound.playError();
        if (window.showCyberToast) {
          window.showCyberToast("ACCESS DENIED: This account is not an active admin.", "error");
        }
        showAccessDeniedModal(currentUser);
        return;
      }

      // Authorized admin -> proceed to admin dashboard
      if (window.cyberSound) window.cyberSound.playClick();
      window.location.href = 'admin/dashboard.html';
      return;
    }

    // If unauthenticated, show admin access modal leading to admin login
    showAdminAccessModal();
  }

  function showAccessDeniedModal(user) {
    let modal = document.getElementById('admin-access-denied-modal');
    if (modal) modal.remove();

    const userName = (user && (user.username || user.name || user.email)) || 'Participant';
    const safeName = String(userName).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c));

    modal = document.createElement('div');
    modal.id = 'admin-access-denied-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 440px; border-color: var(--red); box-shadow: 0 0 35px rgba(255,0,85,0.4);">
        <div class="modal-header" style="border-bottom-color: rgba(255,0,85,0.3);">
          <h3 class="modal-title" style="color: var(--red); font-size: 1.15rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>⛔</span> ACCESS RESTRICTED
          </h3>
          <button class="modal-close" onclick="document.getElementById('admin-access-denied-modal').classList.remove('active')">&times;</button>
        </div>
        <div style="padding: 1.25rem 0;">
          <div style="font-family: var(--font-tech); font-weight: 700; color: #fff; font-size: 1.15rem; margin-bottom: 0.5rem; letter-spacing: 1px;">
            ROOT CLEARANCE REQUIRED
          </div>
          <p style="font-family: var(--font-code); font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6; margin: 0 0 0.5rem 0;">
            Current session is active for operative <strong style="color: var(--cyan);">${safeName}</strong>, which does not have administrative rights.
          </p>
          <p style="font-family: var(--font-code); font-size: 0.82rem; color: var(--red); line-height: 1.5; margin: 0;">
            This account is not an active admin.
          </p>
        </div>
        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
          <button type="button" class="btn-cyber btn-cyber-sm" onclick="document.getElementById('admin-access-denied-modal').classList.remove('active')">DISMISS</button>
          <button type="button" class="btn-cyber btn-cyber-danger btn-cyber-sm" id="btn-modal-switch-admin">LOGIN AS ADMIN</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const switchBtn = modal.querySelector('#btn-modal-switch-admin');
    if (switchBtn) {
      switchBtn.addEventListener('click', async () => {
        if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.auth) {
          await window.CYBERTRIX_DB.auth.logout();
        }
        window.location.href = window.location.pathname.includes('/admin/') ? 'index.html' : 'admin/index.html';
      });
    }

    modal.classList.add('active');
  }

  function showAdminAccessModal() {
    let modal = document.getElementById('admin-access-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'admin-access-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 440px; border-color: var(--red); box-shadow: 0 0 35px rgba(255,0,85,0.4);">
          <div class="modal-header" style="border-bottom-color: rgba(255,0,85,0.3);">
            <h3 class="modal-title" style="color: var(--red); font-size: 1.15rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>⚠</span> RESTRICTED ACCESS // LEVEL-0
            </h3>
            <button class="modal-close" onclick="document.getElementById('admin-access-modal').classList.remove('active')">&times;</button>
          </div>
          <p style="font-family: var(--font-code); font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem; line-height: 1.6;">
            [SECURITY ALERT] Administrative control interface requested. Privileged credentials are required to proceed.
          </p>
          <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
            <button type="button" class="btn-cyber btn-cyber-sm" onclick="document.getElementById('admin-access-modal').classList.remove('active')">ABORT</button>
            <a href="admin/index.html" class="btn-cyber btn-cyber-danger btn-cyber-sm" id="btn-proceed-admin">ENTER ADMIN PORTAL</a>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const btn = modal.querySelector('#btn-proceed-admin');
    if (btn) {
      btn.href = 'admin/index.html';
    }

    modal.classList.add('active');
  }

  // Common UI initialization
  document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    initAdminShortcut();

    // Mobile Navbar toggle
    const toggleBtn = document.querySelector('.mobile-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (toggleBtn && navLinks) {
      toggleBtn.addEventListener('click', () => {
        navLinks.classList.toggle('open');
        if (window.cyberSound) window.cyberSound.playClick();
      });
    }

    // Sound toggle buttons
    document.querySelectorAll('.btn-sound-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.cyberSound) window.cyberSound.toggleMute();
      });
    });

    // Sound effects on cyber buttons
    document.querySelectorAll('.btn-cyber').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        if (window.cyberSound) window.cyberSound.playClick();
      });
    });
  });

  // Expose helper to show cyber toasts
  window.showCyberToast = function (message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `cyber-toast toast-${type}`;
    
    let icon = 'ℹ';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '✗';

    toast.innerHTML = `<span style="font-weight: 800; font-size: 1.1rem;">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    if (window.cyberSound) {
      if (type === 'success') window.cyberSound.playAccessGranted();
      else if (type === 'error') window.cyberSound.playAccessDenied();
      else window.cyberSound.playClick();
    }

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  };

})();
