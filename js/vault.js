/**
 * CYBERTRIX - Secure Storage Vault Controller
 * Handles interactive file modal inspection, hidden file revelation,
 * flag string extraction, and submission validation.
 */

(function () {
  'use strict';

  // Vault File System Data
  const VAULT_FILES = {
    'readme.txt': {
      filename: 'readme.txt',
      meta: '2.4 KB • Plain Text',
      icon: '📄',
      type: 'standard',
      content: `================================================================================
CYBERTRIX SECURE REPOSITORY // NODE MANIFEST & PROTOCOL BRIEFING
STORAGE NODE: /mnt/secure_vault/ (SEC-09-ALPHA)
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

    'system.log': {
      filename: 'system.log',
      meta: '4.8 KB • Event Log',
      icon: '📊',
      type: 'standard',
      content: `[2026-10-01 03:14:02 UTC] [KERNEL] Boot sequence initialized. Kernel v6.12.0-sec-hardened x86_64.
[2026-10-01 03:14:04 UTC] [CRYPT] Keyring verification acknowledged (epoch: 2026-09-30).
[2026-10-01 03:14:05 UTC] [AUTH] Daemon auth_guard-v2 telemetry heartbeat acknowledged [OK].
[2026-10-01 03:14:08 UTC] [STORAGE] Partition /mnt/secure_vault/ mounted in read-only isolation mode.
[2026-10-01 03:14:11 UTC] [STORAGE] Directory manifest populated: 3 visible storage blocks mapped.
[2026-10-01 03:14:15 UTC] [NET] Listening on local socket unix:///var/run/cybertrix_vault.sock.
[2026-10-01 03:14:18 UTC] [STEALTH] Stealth partition initialized at memory offset 0x00FF4C.
[2026-10-01 03:14:22 UTC] [STEALTH] Node [.vault_secret.txt] cloaked from standard directory index listings.
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
[2026-10-01 03:16:04 UTC] [INTEGRITY] Block 3 (.vault_secret.txt) : CLOAKED [Verified - Seal Intact]
[2026-10-01 03:16:15 UTC] [AUDIT] System operating in nominal standby. Awaiting operative authorization.`
    },

    'notes.txt': {
      filename: 'notes.txt',
      meta: '1.8 KB • Field Notes',
      icon: '📝',
      type: 'standard',
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
   Filename: .vault_secret.txt
   Trigger: The CYBERTRIX system insignia / event logo controls the stealth relay.
   Interacting directly with the CYBERTRIX emblem destabilizes the cloak.

5. EXTRACTION DIRECTIVE:
   Once the stealth container is exposed, inspect .vault_secret.txt, extract the
   confirmed flag string, and submit it into the verification console to complete.

--------------------------------------------------------------------------------
[END OF MEMORANDUM // SPECIAL AGENT CIPHER // SIGNED & ENCRYPTED]
================================================================================`
    },

    '.vault_secret.txt': {
      filename: '.vault_secret.txt',
      meta: '1.9 KB • Classified Artifact [HIDDEN]',
      icon: '🔑',
      type: 'hidden',
      hasFlag: true,
      content: `================================================================================
RESTRICTED FILE: .vault_secret.txt
SECURITY STATUS: TOP SECRET // CLASSIFIED INTEL DECRYPTED
AUTHORIZATION LEVEL: OMEGA-5 // SPECIAL RECON CLEARANCE
PARTITION SOURCE: /mnt/secure_vault/.vault_secret.txt
INTEGRITY SEAL: VERIFIED // SHA-256 CHECKSUM MATCH
================================================================================

OPERATION: CYBERTRIX FORENSICS
SECTOR: HIDDEN VAULT
CLEARANCE LEVEL: MAXIMUM (LEVEL 5)

CONGRATULATIONS OPERATIVE!
You have successfully penetrated the cloaked stealth partition of the vault.
By analyzing the system telemetry logs, decoding the hexadecimal access sequence
using the ASCII standard, and inspecting the CYBERTRIX repository emblem, you have
bypassed all defense layers.

RECOVERED MISSION FLAG TOKEN:
CYBERTRIX{v4ul7_53cr37_unl0ck3d_2026}

================================================================================
SUBMISSION INSTRUCTIONS:
Copy this verified token and submit it in the verification terminal below to
complete the mission and claim operation clearance.
================================================================================
[TRANSMISSION TERMINATED // SEC-09 DECRYPT ENGINE LIVE]`
    }
  };

  // Valid Flags accepted by the vault validator
  const ACCEPTED_FLAGS = [
    'CYBERTRIX{v4ul7_53cr37_unl0ck3d_2026}',
    'CYBERTRIX{v4ult_s3cr3t_l0g0_d3crypt3d_99}'
  ];

  let isHiddenVisible = false;
  let activeModalFile = null;

  // Sound helper (graceful fallback if cyberSound is not present)
  function playSound(type) {
    if (window.cyberSound) {
      if (type === 'click') window.cyberSound.playClick();
      else if (type === 'error') window.cyberSound.playError();
      else if (type === 'solve') window.cyberSound.playSolve();
      return;
    }
    // Web Audio API beep fallback
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'error') {
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'solve') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else {
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      }
    } catch (e) {}
  }

  // Toast notification helper
  function notify(msg, type) {
    if (window.showCyberToast) {
      window.showCyberToast(msg, type);
    } else {
      console.log(`[VAULT ${type.toUpperCase()}]: ${msg}`);
    }
  }

  // 1. Toggle Hidden Files via CYBERTRIX Logo Click
  function toggleHiddenFiles() {
    isHiddenVisible = !isHiddenVisible;
    const hiddenCard = document.getElementById('vault-card-hidden');
    const logoBtn = document.getElementById('vault-logo-trigger');

    if (hiddenCard) {
      hiddenCard.style.display = isHiddenVisible ? 'flex' : 'none';
      if (isHiddenVisible) {
        hiddenCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    if (logoBtn) {
      logoBtn.classList.toggle('active', isHiddenVisible);
    }

    playSound('click');

    if (isHiddenVisible) {
      notify("CYBERTRIX STEALTH LAYER UNCLOAKED // RESTRICTED FILE REVEALED", "success");
    } else {
      notify("STEALTH LAYER CONCEALED", "info");
    }
  }

  // 2. Open File Modal
  function openFileModal(fileKey) {
    const file = VAULT_FILES[fileKey];
    if (!file) return;

    activeModalFile = file;

    const modal = document.getElementById('vault-file-modal');
    const filenameEl = document.getElementById('vault-modal-filename');
    const metaEl = document.getElementById('vault-modal-meta');
    const contentEl = document.getElementById('vault-modal-content');
    const autofillBtn = document.getElementById('btn-vault-autofill');

    if (filenameEl) filenameEl.textContent = file.filename;
    if (metaEl) metaEl.textContent = file.meta;
    if (contentEl) contentEl.textContent = file.content;

    if (autofillBtn) {
      autofillBtn.style.display = file.hasFlag ? 'inline-flex' : 'none';
    }

    if (modal) {
      modal.classList.add('active');
    }

    playSound('click');
  }

  // 3. Close File Modal
  function closeFileModal() {
    const modal = document.getElementById('vault-file-modal');
    if (modal) {
      modal.classList.remove('active');
    }
    activeModalFile = null;
    playSound('click');
  }

  // 4. Copy Modal Content
  function copyModalContent() {
    if (!activeModalFile) return;
    navigator.clipboard.writeText(activeModalFile.content).then(() => {
      const btn = document.getElementById('btn-vault-copy');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<span>✓ COPIED!</span>';
        setTimeout(() => { btn.innerHTML = orig; }, 1800);
      }
      notify(`Content of ${activeModalFile.filename} copied to clipboard!`, "success");
      playSound('click');
    }).catch(() => {
      notify("Unable to copy to clipboard.", "error");
    });
  }

  // 5. Auto-Fill Flag from Modal
  function autoFillFlag() {
    const flagInput = document.getElementById('vault-flag-input');
    if (flagInput) {
      flagInput.value = 'CYBERTRIX{v4ul7_53cr37_unl0ck3d_2026}';
      flagInput.focus();
    }
    closeFileModal();

    const flagSection = document.getElementById('vault-flag-section');
    if (flagSection) {
      flagSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    notify("Flag token transferred to submission terminal!", "success");
    playSound('click');
  }

  // 6. Submit & Validate Flag
  function handleFlagSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const input = document.getElementById('vault-flag-input');
    const feedback = document.getElementById('vault-feedback-banner');
    if (!input || !feedback) return;

    const value = input.value.trim();

    // Reset feedback display
    feedback.className = 'vault-feedback-banner';
    feedback.style.display = 'none';

    // Format validation
    const flagPattern = /^CYBERTRIX\{[A-Za-z0-9_!@#$-]+\}$/;
    if (!flagPattern.test(value)) {
      feedback.className = 'vault-feedback-banner error';
      feedback.innerHTML = `
        <span>✗</span>
        <div>
          <strong>INVALID FLAG FORMAT:</strong> Flag must follow the standard <code style="color:#ffffff;">CYBERTRIX{...}</code> notation.
        </div>
      `;
      feedback.style.display = 'flex';
      notify("INVALID FORMAT: Flag must follow CYBERTRIX{...}", "error");
      playSound('error');
      input.focus();
      return;
    }

    // Flag Value Verification
    const isCorrect = ACCEPTED_FLAGS.includes(value);

    if (isCorrect) {
      feedback.className = 'vault-feedback-banner success';
      feedback.innerHTML = `
        <span>✓</span>
        <div>
          <strong>ACCESS GRANTED // OPERATION COMPLETE:</strong> Verified flag accepted! Secure Storage Vault compromised. (+250 PTS AWARDED)
        </div>
      `;
      feedback.style.display = 'flex';
      notify("OPERATION COMPLETE // +250 PTS AWARDED // STATUS: SOLVED ✓", "success");
      playSound('solve');
    } else {
      feedback.className = 'vault-feedback-banner error';
      feedback.innerHTML = `
        <span>✗</span>
        <div>
          <strong>ACCESS DENIED:</strong> Cryptographic verification rejected. The submitted token does not match the vault master seal.
        </div>
      `;
      feedback.style.display = 'flex';
      notify("ACCESS DENIED: Invalid flag submission.", "error");
      playSound('error');
      input.focus();
    }
  }

  // DOM Content Loaded Initializer
  function initVault() {
    // 1. Hook CYBERTRIX Logo Interactive Trigger
    const logoTrigger = document.getElementById('vault-logo-trigger');
    if (logoTrigger) {
      logoTrigger.addEventListener('click', toggleHiddenFiles);
    }

    // 3. Hook File Cards click events
    document.querySelectorAll('.vault-file-card[data-file]').forEach(card => {
      card.addEventListener('click', () => {
        const fileKey = card.getAttribute('data-file');
        openFileModal(fileKey);
      });
    });

    // 4. Hook Modal Actions
    const modalCloseBtn = document.getElementById('btn-vault-modal-close');
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closeFileModal);
    }

    const modalOverlay = document.getElementById('vault-file-modal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeFileModal();
      });
    }

    const copyBtn = document.getElementById('btn-vault-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', copyModalContent);
    }

    const autofillBtn = document.getElementById('btn-vault-autofill');
    if (autofillBtn) {
      autofillBtn.addEventListener('click', autoFillFlag);
    }

    // Keyboard Escape to dismiss modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeFileModal();
    });

    // 5. Hook Flag Submission Form
    const flagForm = document.getElementById('vault-flag-form');
    if (flagForm) {
      flagForm.addEventListener('submit', handleFlagSubmit);
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVault);
  } else {
    initVault();
  }

  // Export methods for programmatic / test usage
  window.CYBERTRIX_VAULT = {
    toggleHiddenFiles,
    openFileModal,
    closeFileModal,
    handleFlagSubmit,
    autoFillFlag,
    copyModalContent
  };

})();
