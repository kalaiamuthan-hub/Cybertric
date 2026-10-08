/**
 * CYBERTRIX - Cyber Audio Synthesizer (Web Audio API)
 * Zero external audio files required, purely synthesized retro-cyber sound FX.
 * Safely fails silently if browser autoplay / Web Audio is restricted.
 */

class CyberSoundEngine {
  constructor() {
    this.audioCtx = null;
    this.muted = localStorage.getItem('cybertrix_sound_muted') === 'true';
  }

  init() {
    try {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.audioCtx = new AudioContext();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        const resumePromise = this.audioCtx.resume();
        if (resumePromise && typeof resumePromise.catch === 'function') {
          resumePromise.catch(() => {});
        }
      }
    } catch (e) {
      // Audio autoplay policy fallback - fail silently
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('cybertrix_sound_muted', this.muted);
    } catch (e) {}
    this.updateUI();
    if (!this.muted) {
      this.playClick();
    }
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  updateUI() {
    try {
      const btns = document.querySelectorAll('.btn-sound-toggle');
      btns.forEach(btn => {
        btn.innerHTML = this.muted ? '🔇 SOUND: OFF' : '🔊 SOUND: ON';
        btn.setAttribute('aria-label', this.muted ? 'Unmute Sound' : 'Mute Sound');
      });
    } catch (e) {}
  }

  playClick() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, this.audioCtx.currentTime + 0.04);
      
      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.04);
      
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.04);
    } catch (e) {
      // Fail silently
    }
  }

  playKeypress() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800 + Math.random() * 400, this.audioCtx.currentTime);
      
      gain.gain.setValueAtTime(0.03, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.02);
      
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.02);
    } catch (e) {}
  }

  playAccessGranted() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (Major celebratory chord)
      
      notes.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        
        gain.gain.setValueAtTime(0.12, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.45);
        
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.45);
      });
    } catch (e) {}
  }

  // Aliases for solve/success
  playSolve() {
    this.playAccessGranted();
  }

  playSuccess() {
    this.playAccessGranted();
  }

  playAccessDenied() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.setValueAtTime(110, now + 0.15);
      
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {}
  }

  // Aliases for error
  playError() {
    this.playAccessDenied();
  }

  playFail() {
    this.playAccessDenied();
  }

  playBoot() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);
      
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {}
  }
}

// Global instance
window.cyberSound = new CyberSoundEngine();
document.addEventListener('DOMContentLoaded', () => {
  if (window.cyberSound) window.cyberSound.updateUI();
});
