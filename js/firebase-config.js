/**
 * CYBERTRIX - Firebase Configuration File
 * Paste your real Firebase project credentials below or configure via UI.
 * 
 * If you do not provide Firebase keys or are testing locally, CYBERTRIX will
 * automatically and flawlessly run in resilient Cyber-MockStore mode with full
 * real-time cross-tab synchronization.
 */

const firebaseConfig = {
  apiKey: "AIzaSyB2SKVoRxCiOJaTshnt-BzjZCVrgVwFZWU",
  authDomain: "cybertrix-d1cdc.firebaseapp.com",
  projectId: "cybertrix-d1cdc",
  storageBucket: "cybertrix-d1cdc.firebasestorage.app",
  messagingSenderId: "978646508955",
  appId: "1:978646508955:web:d0e37749bbc19c2390ed3e",
  measurementId: "G-HKMJV5HKWC"
};
// Check if user has saved custom Firebase credentials in browser
(function () {
  try {
    const savedConfig = localStorage.getItem('cybertrix_custom_firebase_config');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      if (parsed && parsed.apiKey) {
        window.CYBERTRIX_FIREBASE_CONFIG = parsed;
      }
    }
  } catch (e) {
    console.warn("Unable to load custom Firebase config:", e);
  }
})();
