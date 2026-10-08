/**
 * CYBERTRIX - Authentication Controller
 * Manages participant registration, login, logout, and navbar user status.
 */

(function () {
  function bootAuth() {
    initAuthUI();
    initLoginForm();
    initRegisterForm();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootAuth);
  } else {
    bootAuth();
  }

  function initAuthUI() {
    // Dynamic Navbar Login/Profile state & Enter the Arena destination
    window.CYBERTRIX_DB.auth.onAuthStateChanged((user) => {
      const enterArenaBtn = document.getElementById('btn-hero-enter-arena');
      if (enterArenaBtn) {
        enterArenaBtn.setAttribute('href', 'challenges.html');
      }

      const authSlot = document.getElementById('nav-auth-slot');
      if (!authSlot) return;

      if (user) {
        authSlot.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.85rem;">
            <a href="${getRelativePrefix()}dashboard.html" class="cyber-badge badge-cyan" style="padding: 0.35rem 0.75rem; text-decoration: none;">
              <span>OPERATIVE:</span> <strong>${escapeHTML(user.username)}</strong> [${user.points || 0} PTS]
            </a>
            <button id="btn-logout" class="btn-cyber btn-cyber-sm" style="padding: 0.35rem 0.75rem; font-size: 0.72rem;">LOGOUT</button>
          </div>
        `;
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
          btnLogout.addEventListener('click', async () => {
            if (window.cyberSound) window.cyberSound.playClick();
            await window.CYBERTRIX_DB.auth.logout();
            window.showCyberToast("Disconnected from CYBERTRIX terminal.", "info");
            setTimeout(() => {
              window.location.href = getRelativePrefix() + 'index.html';
            }, 500);
          });
        }
      } else {
        authSlot.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <a href="${getRelativePrefix()}register.html" class="btn-cyber btn-cyber-purple btn-cyber-sm">
              <span>ENLIST</span>
            </a>
            <a href="${getRelativePrefix()}login.html" class="btn-cyber btn-cyber-sm">
              <span>ENTER PORTAL</span>
            </a>
          </div>
        `;
      }
    });

    // Enter Arena direct interceptor
    const enterArenaBtn = document.getElementById('btn-hero-enter-arena');
    if (enterArenaBtn) {
      enterArenaBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'challenges.html';
      });
    }
  }

  function initLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;

    const quickFillBtn = document.getElementById('btn-quick-player-fill');
    if (quickFillBtn) {
      quickFillBtn.addEventListener('click', () => {
        const emailInput = document.getElementById('login-email');
        const passInput = document.getElementById('login-password');
        if (emailInput) emailInput.value = 'wolf@cybertrix.ctf';
        if (passInput) passInput.value = 'password123';
        if (window.cyberSound) window.cyberSound.playClick();
        if (window.showCyberToast) window.showCyberToast("Operative credentials loaded into form.", "info");
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const pass = document.getElementById('login-password').value;
      const errorBox = document.getElementById('login-error');
      const submitBtn = form.querySelector('button[type="submit"]');

      if (errorBox) errorBox.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'AUTHENTICATING...';

      try {
        const user = await window.CYBERTRIX_DB.auth.login(email, pass);
        window.showCyberToast(`Access Granted. Welcome Operative ${user.username}`, 'success');
        
        setTimeout(() => {
          if (user.role === 'admin') {
            window.location.href = 'admin/dashboard.html';
          } else {
            window.location.href = 'dashboard.html';
          }
        }, 600);
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err.message;
          errorBox.style.display = 'block';
        }
        window.showCyberToast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'ACCESS TERMINAL';
      }
    });
  }

  function initRegisterForm() {
    const form = document.getElementById('register-form');
    if (!form) return;

    // Check if an operative session is already active and display helpful info without bouncing the user
    function checkActiveSession() {
      if (window.CYBERTRIX_DB && window.CYBERTRIX_DB.auth) {
        const activeUser = window.CYBERTRIX_DB.auth.getCurrentUser();
        const noticeEl = document.getElementById('register-active-notice');
        const usernameEl = document.getElementById('register-active-username');
        if (activeUser && noticeEl && usernameEl) {
          usernameEl.textContent = activeUser.name || activeUser.username || activeUser.email || 'Operative';
          noticeEl.style.display = 'block';
        } else if (noticeEl) {
          noticeEl.style.display = 'none';
        }
      }
    }
    checkActiveSession();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullNameInput = document.getElementById('reg-fullname');
      const collegeInput = document.getElementById('reg-college');
      const emailInput = document.getElementById('reg-email');
      const passInput = document.getElementById('reg-password');
      const passConfirmInput = document.getElementById('reg-password-confirm');
      const errorBox = document.getElementById('register-error');
      const submitBtn = form.querySelector('button[type="submit"]');

      const fullName = (fullNameInput ? fullNameInput.value : '').trim();
      const collegeName = (collegeInput ? collegeInput.value : '').trim();
      const email = (emailInput ? emailInput.value : '').trim();
      const pass = passInput ? passInput.value : '';
      const passConfirm = passConfirmInput ? passConfirmInput.value : '';

      function showError(msg) {
        if (errorBox) {
          errorBox.textContent = msg;
          errorBox.style.display = 'block';
        }
        window.showCyberToast(msg, 'error');
        if (window.cyberSound) window.cyberSound.playError();
      }

      if (errorBox) errorBox.style.display = 'none';

      // Validation Rules (Requirement 3)
      if (!fullName) {
        showError("Full Name cannot be empty.");
        if (fullNameInput) fullNameInput.focus();
        return;
      }

      if (!collegeName) {
        showError("Please enter your college name.");
        if (collegeInput) collegeInput.focus();
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        showError("Valid communication email required.");
        if (emailInput) emailInput.focus();
        return;
      }

      if (!pass || pass.length < 6) {
        showError("Security clearance key must be at least 6 characters.");
        if (passInput) passInput.focus();
        return;
      }

      if (pass !== passConfirm) {
        showError("Passwords do not match.");
        if (passConfirmInput) passConfirmInput.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'CREATING ACCOUNT...';

      try {
        const newUser = await window.CYBERTRIX_DB.auth.register(fullName, collegeName, email, pass);
        window.showCyberToast(`Clearance Granted. Welcome to the Arena, ${newUser.name || newUser.username}!`, 'success');
        if (window.cyberSound) window.cyberSound.playSolve();
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 700);
      } catch (err) {
        showError(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = '[ CREATE ACCOUNT ]';
      }
    });
  }

  function getRelativePrefix() {
    return window.location.pathname.includes('/admin/') ? '../' : '';
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

  window.escapeHTML = escapeHTML;
})();
