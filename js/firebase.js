/**
 * CYBERTRIX - Unified Firebase Engine & Real-Time Sync Provider
 * Supports Firebase CDN SDK with fallback to high-performance local MockStore
 * with cross-tab BroadcastChannel synchronization.
 */

(function () {
  const SYNC_CHANNEL_NAME = 'cybertrix_firestore_sync';
  const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(SYNC_CHANNEL_NAME) : null;

  // ==========================================
  // CLOUD FIRESTORE & FIREBASE AUTH INTEGRATION
  // ==========================================
  let fbApp = null;
  let fbAuth = null;
  let fbDb = null;
  let isFirestoreInitialized = false;

  function initFirebase() {
    if (isFirestoreInitialized) return;
    try {
      const cfg = (typeof window !== 'undefined' && window.CYBERTRIX_FIREBASE_CONFIG) || (typeof firebaseConfig !== 'undefined' ? firebaseConfig : null);
      if (typeof firebase !== 'undefined' && firebase.initializeApp && cfg && cfg.apiKey) {
        if (!firebase.apps || firebase.apps.length === 0) {
          fbApp = firebase.initializeApp(cfg);
        } else {
          fbApp = firebase.apps[0];
        }
        fbAuth = firebase.auth();
        fbDb = firebase.firestore();
        isFirestoreInitialized = true;
        console.log("CYBERTRIX: Connected to Cloud Firestore (" + cfg.projectId + ")");
      }
    } catch (e) {
      console.warn("CYBERTRIX: Firebase SDK init warning:", e.message);
    }
  }

  async function syncDocToFirestore(collectionName, docId, data) {
    initFirebase();
    if (!fbDb) return false;
    try {
      const cleanData = JSON.parse(JSON.stringify(data));
      await fbDb.collection(collectionName).doc(docId).set(cleanData, { merge: true });
      return true;
    } catch (err) {
      console.warn(`Firestore write warning [${collectionName}/${docId}]:`, err.message);
      return false;
    }
  }

  async function deleteDocFromFirestore(collectionName, docId) {
    initFirebase();
    if (!fbDb) return false;
    try {
      await fbDb.collection(collectionName).doc(docId).delete();
      return true;
    } catch (err) {
      console.warn(`Firestore delete warning [${collectionName}/${docId}]:`, err.message);
      return false;
    }
  }

  async function getDocFromFirestore(collectionName, docId) {
    initFirebase();
    if (!fbDb) return null;
    try {
      const snap = await fbDb.collection(collectionName).doc(docId).get();
      if (snap.exists) return { ...snap.data(), id: snap.id };
      return null;
    } catch (err) {
      console.warn(`Firestore read warning [${collectionName}/${docId}]:`, err.message);
      return null;
    }
  }

  async function getCollectionFromFirestore(collectionName) {
    initFirebase();
    if (!fbDb) return null;
    try {
      const snap = await fbDb.collection(collectionName).get();
      const list = [];
      snap.forEach(doc => list.push({ ...doc.data(), id: doc.id }));
      return list;
    } catch (err) {
      console.warn(`Firestore query warning [${collectionName}]:`, err.message);
      return null;
    }
  }

  async function seedFirestoreIfEmpty() {
    initFirebase();
    if (!fbDb) return;
    try {
      const chSnap = await fbDb.collection('challenges').limit(1).get();
      if (chSnap.empty) {
        console.log("CYBERTRIX: Seeding initial challenges to Firestore...");
        for (const ch of DEFAULT_CHALLENGES) {
          const { flag, secretContent, ...publicCh } = ch;
          if (ch.id === 'hidden-vault') publicCh.flag = flag;
          await fbDb.collection('challenges').doc(ch.id).set(JSON.parse(JSON.stringify(publicCh)), { merge: true });
        }
      }

      const secSnap = await fbDb.collection('challengeSecrets').limit(1).get();
      if (secSnap.empty) {
        for (const [id, sec] of Object.entries(DEFAULT_CHALLENGE_SECRETS)) {
          await fbDb.collection('challengeSecrets').doc(id).set(JSON.parse(JSON.stringify(sec)), { merge: true });
        }
      }

      const hvDoc = await fbDb.collection('hiddenVault').doc('config').get();
      if (!hvDoc.exists) {
        const defaultHvFlag = DEFAULT_CHALLENGE_SECRETS['hidden-vault']?.flag || "CYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}";
        await fbDb.collection('hiddenVault').doc('config').set({
          evidenceFlag: defaultHvFlag,
          evidenceContent: `flag:${defaultHvFlag}`,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      const annSnap = await fbDb.collection('announcements').limit(1).get();
      if (annSnap.empty) {
        for (const ann of DEFAULT_ANNOUNCEMENTS) {
          await fbDb.collection('announcements').doc(ann.id).set(JSON.parse(JSON.stringify(ann)), { merge: true });
        }
      }

      const timerDoc = await fbDb.collection('siteSettings').doc('eventTimer').get();
      if (!timerDoc.exists) {
        await fbDb.collection('siteSettings').doc('eventTimer').set(JSON.parse(JSON.stringify(DEFAULT_TIMER_CONFIG)), { merge: true });
      }
      const eventDoc = await fbDb.collection('eventSettings').doc('main').get();
      if (!eventDoc.exists) {
        await fbDb.collection('eventSettings').doc('main').set(JSON.parse(JSON.stringify(DEFAULT_EVENT_CONFIG)), { merge: true });
      }

      const adminDoc = await fbDb.collection('admins').doc(DEFAULT_ADMIN.uid).get();
      if (!adminDoc.exists) {
        await fbDb.collection('admins').doc(DEFAULT_ADMIN.uid).set(DEFAULT_ADMINS[DEFAULT_ADMIN.uid], { merge: true });
      }

      const usersSnap = await fbDb.collection('users').limit(1).get();
      if (usersSnap.empty) {
        const { passwordHash, ...cleanAdmin } = DEFAULT_ADMIN;
        await fbDb.collection('users').doc(DEFAULT_ADMIN.uid).set(cleanAdmin, { merge: true });
        for (const p of DEFAULT_PLAYERS) {
          const { passwordHash, ...cleanP } = p;
          await fbDb.collection('users').doc(p.uid).set(cleanP, { merge: true });
        }
      }
    } catch (e) {
      console.warn("CYBERTRIX: Firestore initial seed notice:", e.message);
    }
  }

  let hasSetupRealtimeListeners = false;
  function setupFirestoreRealtimeListeners() {
    if (hasSetupRealtimeListeners) return;
    initFirebase();
    if (!fbDb) return;
    hasSetupRealtimeListeners = true;
    try {
      fbDb.collection('challenges').onSnapshot(snapshot => {
        if (!snapshot.empty) {
          const list = [];
          snapshot.forEach(d => list.push({ ...d.data(), id: d.id }));
          list.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
          dbChallengesList = list;
          try {
            localStorage.setItem('cybertrix_challenges', JSON.stringify(list));
            window.dispatchEvent(new CustomEvent('cybertrix_data_changed', { detail: { collection: 'challenges' } }));
          } catch(e){}
        }
      }, err => console.warn("Challenges onSnapshot warning:", err.message));

      fbDb.collection('announcements').onSnapshot(snapshot => {
        if (!snapshot.empty) {
          const list = [];
          snapshot.forEach(d => list.push({ ...d.data(), id: d.id }));
          list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
          dbAnnouncementsList = list;
          try {
            localStorage.setItem('cybertrix_announcements', JSON.stringify(list));
            window.dispatchEvent(new CustomEvent('cybertrix_data_changed', { detail: { collection: 'announcements' } }));
          } catch(e){}
        }
      }, err => console.warn("Announcements onSnapshot warning:", err.message));

      fbDb.collection('users').onSnapshot(snapshot => {
        if (!snapshot.empty) {
          const list = [];
          snapshot.forEach(d => list.push({ ...d.data(), uid: d.id }));
          dbUsers = list;
          try {
            localStorage.setItem('cybertrix_users', JSON.stringify(list));
            window.dispatchEvent(new CustomEvent('cybertrix_data_changed', { detail: { collection: 'users' } }));
          } catch(e){}
        }
      }, err => console.warn("Users onSnapshot warning:", err.message));

      fbDb.collection('siteSettings').doc('eventTimer').onSnapshot(doc => {
        if (doc.exists) {
          dbTimerConfig = { ...DEFAULT_TIMER_CONFIG, ...doc.data() };
          try {
            localStorage.setItem('cybertrix_event_timer', JSON.stringify(dbTimerConfig));
            window.dispatchEvent(new CustomEvent('cybertrix_data_changed', { detail: { collection: 'event_timer' } }));
          } catch(e){}
        }
      }, err => console.warn("Timer onSnapshot warning:", err.message));

      fbDb.collection('hiddenVault').doc('config').onSnapshot(doc => {
        if (doc.exists) {
          const data = doc.data();
          if (data && data.evidenceFlag) {
            const ch = dbChallengesList.find(c => c.id === 'hidden-vault');
            if (ch) {
              ch.flag = data.evidenceFlag;
              ch.evidenceContent = data.evidenceContent || `flag:${data.evidenceFlag}`;
              try {
                localStorage.setItem('cybertrix_challenges', JSON.stringify(dbChallengesList));
                window.dispatchEvent(new CustomEvent('cybertrix_data_changed', { detail: { collection: 'challenges' } }));
              } catch(e){}
            }
          }
        }
      }, err => console.warn("Hidden Vault onSnapshot warning:", err.message));
    } catch(e) {
      console.warn("CYBERTRIX: Realtime listeners setup warning:", e.message);
    }
  }

  // Attempt immediate setup
  initFirebase();
  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      initFirebase();
      seedFirestoreIfEmpty();
      setupFirestoreRealtimeListeners();
    });
  }

  // Initial Seed Data
  const DEFAULT_EVENT_CONFIG = {
    eventName: "CYBERTRIX CTF 2026",
    status: "LIVE", // UPCOMING, LIVE, ENDED
    startDate: "2026-09-30T09:00:00",
    endDate: "2026-10-05T18:00:00",
    registrationOpen: true
  };

  // Global Event Timer Configuration (siteSettings/eventTimer)
  const DEFAULT_TIMER_CONFIG = {
    enabled: true,
    status: "LIVE", // NOT_STARTED, LIVE, PAUSED, ENDED
    durationSeconds: 7200, // 2 hours default
    hours: 2,
    minutes: 0,
    seconds: 0,
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 7200 * 1000).toISOString(),
    pausedAt: null,
    remainingSeconds: 7200,
    startMode: "immediate", // immediate or scheduled
    scheduledStartTime: null,
    updatedAt: new Date().toISOString()
  };

  const DEFAULT_ADMINS = {
    "admin_root_cybertrix": {
      uid: "admin_root_cybertrix",
      email: "admin@cybertrix.ctf",
      active: true,
      role: "admin",
      createdAt: "2026-09-28T10:00:00.000Z"
    }
  };

  const DEFAULT_ADMIN = {
    uid: "admin_root_cybertrix",
    username: "RootAdmin",
    email: "admin@cybertrix.ctf",
    passwordHash: "CyberAdmin#2026",
    role: "admin",
    active: true,
    points: 0,
    score: 0,
    solvedCount: 0,
    solvedChallenges: [],
    completedChallenges: [],
    createdAt: "2026-09-28T10:00:00.000Z"
  };

  const DEFAULT_PLAYERS = [
    {
      uid: "player_wolf",
      username: "CyberWolf",
      name: "CyberWolf",
      collegeName: "Cyber Defense Academy",
      email: "wolf@cybertrix.ctf",
      passwordHash: "password123",
      role: "player",
      active: true,
      points: 250,
      score: 250,
      solvedCount: 0,
      solvedChallenges: [],
      completedChallenges: [],
      status: "active",
      disabled: false,
      createdAt: "2026-09-29T08:12:00.000Z",
      lastSolvedAt: "2026-09-30T09:40:00.000Z"
    },
    {
      uid: "player_null",
      username: "NullByte",
      name: "NullByte",
      collegeName: "MIT Tech Institute",
      email: "nullbyte@cybertrix.ctf",
      passwordHash: "password123",
      role: "player",
      active: true,
      points: 200,
      score: 200,
      solvedCount: 0,
      solvedChallenges: [],
      completedChallenges: [],
      status: "active",
      disabled: false,
      createdAt: "2026-09-29T09:00:00.000Z",
      lastSolvedAt: "2026-09-30T09:15:00.000Z"
    },
    {
      uid: "player_shadow",
      username: "ShadowRoot",
      name: "ShadowRoot",
      collegeName: "National Cybersecurity College",
      email: "shadow@cybertrix.ctf",
      passwordHash: "password123",
      role: "player",
      active: true,
      points: 150,
      score: 150,
      solvedCount: 0,
      solvedChallenges: [],
      completedChallenges: [],
      status: "active",
      disabled: false,
      createdAt: "2026-09-29T11:20:00.000Z",
      lastSolvedAt: "2026-09-30T08:50:00.000Z"
    },
    {
      uid: "player_zeroday",
      username: "ZeroDay",
      name: "ZeroDay",
      collegeName: "Stanford Security Labs",
      email: "zeroday@cybertrix.ctf",
      passwordHash: "password123",
      role: "player",
      active: true,
      points: 100,
      score: 100,
      solvedCount: 0,
      solvedChallenges: [],
      completedChallenges: [],
      status: "active",
      disabled: false,
      createdAt: "2026-09-29T14:10:00.000Z",
      lastSolvedAt: "2026-09-30T07:20:00.000Z"
    },
    {
      uid: "player_cipher",
      username: "CipherPunk",
      name: "CipherPunk",
      collegeName: "Polytechnic Institute",
      email: "cipher@cybertrix.ctf",
      passwordHash: "password123",
      role: "player",
      active: true,
      points: 50,
      score: 50,
      solvedCount: 0,
      solvedChallenges: [],
      completedChallenges: [],
      status: "active",
      disabled: false,
      createdAt: "2026-09-30T02:00:00.000Z",
      lastSolvedAt: "2026-09-30T06:10:00.000Z"
    }
  ];

  // Public Challenges List (Single Mirror Keyboard with 3 sub-tasks, Single ASCII with 2 sub-tasks)
  // Total Points: MK (100+100+100=300) + HV (250) + ASCII (200+200=400) + MG (300) = 1250
  // No flags stored here!
  const DEFAULT_CHALLENGES = [
    {
      id: "mirror-keyboard",
      title: "MIRROR KEYBOARD",
      type: "mirror-keyboard",
      category: "CRYPTO",
      difficulty: "EASY",
      points: 300,
      order: 1,
      question: "Left is Right, Right is left. Type what you see, not what you mean.",
      mirrorWord: "QTYFWX",
      targetSentence: "The cyber world rewards careful thinking.",
      targetWord: "PYTHON",
      answer: "PYTHON",
      flag: "CYBERTRIX{PYTHON}",
      description: "Left is Right, Right is left. Type what you see, not what you mean.",
      mission: "An intercepted encrypted transmission requires decryption using the reciprocal mirror keyboard. Type the target sequences to unlock flags and recover points.",
      timerEnabled: true,
      timerSeconds: 300, // 05:00
      enabled: true,
      status: "ACTIVE",
      subtasks: [
        {
          id: "task_1",
          title: "Sub-task 1",
          name: "Mirror Keyboard — Task 1",
          order: 1,
          points: 100,
          question: "Left is Right, Right is left. Type what you see, not what you mean.",
          mirrorWord: "QTYFWX",
          targetSentence: "The cyber world rewards careful thinking.",
          targetWord: "PYTHON",
          answer: "PYTHON",
          description: "Left is Right, Right is left. Type what you see, not what you mean."
        },
        {
          id: "task_2",
          title: "Sub-task 2",
          name: "Mirror Keyboard — Task 2",
          order: 2,
          points: 100,
          question: "Type the target word CIPHER using the reciprocal mirror keyboard.",
          mirrorWord: "BEQFIU",
          targetSentence: "Encrypt your data and defend the network.",
          targetWord: "CIPHER",
          answer: "CIPHER",
          description: "Task 2 of 3: Type the target word CIPHER using the reciprocal mirror keyboard."
        },
        {
          id: "task_3",
          title: "Sub-task 3",
          name: "Mirror Keyboard — Task 3",
          order: 3,
          points: 100,
          question: "Type the target word NETWORK using the reciprocal mirror keyboard.",
          mirrorWord: "XIYOWUS",
          targetSentence: "Knowledge is the ultimate shield in combat.",
          targetWord: "NETWORK",
          answer: "NETWORK",
          description: "Task 3 of 3: Type the target word NETWORK using the reciprocal mirror keyboard."
        }
      ],
      createdAt: "2026-09-30T10:00:00.000Z"
    },
    {
      id: "hidden-vault",
      title: "HIDDEN VAULT",
      type: "hidden-vault",
      category: "Forensics / Logic",
      difficulty: "Medium",
      points: 250,
      order: 2,
      question: "Analyze cyber-themed terminal system logs to identify suspicious unknown activity, decode intercepted telemetry, unlock the secure vault, and recover the classified hidden file.",
      description: "Analyze cyber-themed terminal system logs to identify suspicious unknown activity, decode intercepted telemetry, unlock the secure vault, and recover the classified hidden file.",
      mission: "Inspect system logs, trace unknown user activity, decode access codes using ASCII, breach the secure vault, and extract the hidden flag.",
      clueData: "System telemetry logs show suspicious unknown user activity accessing vault.dat with access code 56 41 55 4C 54.",
      vaultPassword: "VAULT",
      vaultKeyword: "VAULT",
      cipherSequence: "56 41 55 4C 54",
      accessCode: "56 41 55 4C 54",
      logoUrl: "assets/logo/logo.svg",
      fakeFiles: [
        {
          name: "readme.txt",
          size: "2.4 KB",
          content: "================================================================================\nCYBERTRIX SECURE REPOSITORY // NODE MANIFEST & PROTOCOL BRIEFING\nSTORAGE NODE: /vault/ (SEC-09-ALPHA)\nSECURITY LEVEL: PUBLIC CTF PERIMETER // READ-ONLY ISOLATION\nCLUSTER: OMEGA-GRID-04 // KERNEL: 6.12.0-CYBER-HARDENED\nENCRYPTION: AES-256-GCM / SHA-512 INTEGRITY AUDIT\n================================================================================\n\n[+] OPERATIONAL DIRECTIVE:\nWelcome Operative. You have mounted the restricted CYBERTRIX file partition.\nThis storage enclave houses core forensics telemetry, system event journals,\nand field intelligence artifacts captured during Sector Reconnaissance.\n\n[+] SYSTEM SPECIFICATIONS:\n- Host Node: cybertrix-vault-core-09.internal.ctf\n- Filesystem Type: EXT4-CRYPTO-V4 (Mounted Read-Only)\n- Active Mount Point: /mnt/secure_vault/ -> /vault/\n- Decoy Partition: ACTIVE (Public index exposes standard maintenance artifacts)\n- Stealth Layer: INITIALIZED (Offset 0x00FF4C - Virtual Concealment Active)\n\n[+] OPERATING RULES OF ENGAGEMENT:\n1. All partition transactions undergo continuous cryptographic telemetry hashing.\n2. Direct unauthorized root modification is permanently disabled on this node.\n3. Decoy files exist to misdirect automated scanners and unauthorized interceptors.\n4. Not all repository partitions are visible in the standard directory manifest.\n5. Operatives must analyze system logs and operator notes for stealth trigger vectors.\n6. Recover the classified mission token and submit it to claim operation points.\n\n[+] ROOT DIRECTORY SUMMARY:\n- readme.txt  : Node manifest and operational rules (You are here)\n- system.log  : Kernel, daemon, and intercepted anomaly event logs\n- notes.txt   : Tactical field memorandum from Special Agent Cipher\n\n================================================================================\n[STATUS: NOMINAL // ALL PARTITION INTEGRITY SEALS INTACT]\n================================================================================"
        },
        {
          name: "system.log",
          size: "3.6 KB",
          content: "[2026-10-01 03:14:02 UTC] [KERNEL] Boot sequence initialized. Kernel v6.12.0-sec-hardened x86_64.\n[2026-10-01 03:14:04 UTC] [CRYPT] Keyring verification acknowledged (epoch: 2026-09-30).\n[2026-10-01 03:14:05 UTC] [AUTH] Daemon auth_guard-v2 telemetry heartbeat acknowledged [OK].\n[2026-10-01 03:14:08 UTC] [STORAGE] Partition /mnt/secure_vault/ mounted in read-only isolation mode.\n[2026-10-01 03:14:11 UTC] [STORAGE] Directory manifest populated: 3 visible storage blocks mapped.\n[2026-10-01 03:14:15 UTC] [NET] Listening on local socket unix:///var/run/cybertrix_vault.sock.\n[2026-10-01 03:14:18 UTC] [STEALTH] Stealth partition initialized at memory offset 0x00FF4C.\n[2026-10-01 03:14:22 UTC] [STEALTH] Node [.hidden] cloaked from standard directory index listings.\n[2026-10-01 03:14:25 UTC] [STEALTH] CYBERTRIX cryptographic brand emblem linked to stealth uncloak toggle.\n[2026-10-01 03:14:30 UTC] [FIREWALL] Filter rules compiled: 412 ingress drops, 0 breaches logged.\n[2026-10-01 03:14:45 UTC] [ANOMALY_WARN] Suspicious remote session established from 198.51.100.77.\n[2026-10-01 03:15:02 UTC] [AUDIT] Unknown user session UID=0x994F queried storage index.\n[2026-10-01 03:15:18 UTC] [ACCESS_TRACE] Unauthorized file request intercepted: target=vault.dat.\n[2026-10-01 03:15:24 UTC] [PAYLOAD_DUMP] Intercepted raw hexadecimal access stream: 56 41 55 4C 54.\n[2026-10-01 03:15:35 UTC] [CRYPT_VERIFY] ASCII translation of intercepted stream verified keyword: 'VAULT'.\n[2026-10-01 03:16:00 UTC] [INTEGRITY] SHA-256 integrity check running across volume partitions...\n[2026-10-01 03:16:01 UTC] [INTEGRITY] Block 0 (readme.txt) : OK [a1d8f79e...b4]\n[2026-10-01 03:16:02 UTC] [INTEGRITY] Block 1 (system.log) : OK [c3e8091a...7f]\n[2026-10-01 03:16:03 UTC] [INTEGRITY] Block 2 (notes.txt)  : OK [9b4421cc...12]\n[2026-10-01 03:16:04 UTC] [INTEGRITY] Block 3 (.hidden)    : CLOAKED [Verified - Seal Intact]\n[2026-10-01 03:16:15 UTC] [AUDIT] System operating in nominal standby. Awaiting operative authorization."
        },
        {
          name: "notes.txt",
          size: "1.8 KB",
          content: "================================================================================\nFIELD AGENT MEMORANDUM // RESTRICTED RECON INTELLIGENCE\nAUTHOR: Special Agent Cipher (Field Forensics Unit SEC-09)\nTARGET: /mnt/secure_vault/ (CYBERTRIX Storage Node)\nCLASSIFICATION: CONFIDENTIAL // AGENT EYES ONLY\n================================================================================\n\nOPERATIONAL NOTES & DISCOVERIES:\n--------------------------------------------------------------------------------\n1. TARGET ANALYSIS:\n   The target storage repository maintains a high-assurance perimeter defense.\n   External scanning reveals exactly three decoy files in the public directory:\n   - readme.txt (System manifest)\n   - system.log (Telemetry journals)\n   - notes.txt  (This field memo)\n\n2. FORENSIC CLUE:\n   \"Not everything inside the vault is visible.\"\n   The system administrator has implemented a steganographic cloaking mechanism\n   to prevent automated directory crawlers from locating the target objective.\n\n3. ACCESS SEQUENCE INVESTIGATION:\n   During passive reconnaissance, an unknown entity was logged attempting to\n   access 'vault.dat'. The intercepted credential stream was recorded in hex:\n   [ 56 41 55 4C 54 ] -> Translates via ASCII table to: V - A - U - L - T.\n\n4. THE CLOAKED ARTIFACT:\n   Intelligence confirms the classified token resides within a hidden container:\n   Filename: evidence.txt\n   Trigger: The CYBERTRIX system insignia / event logo controls the stealth relay.\n   Interacting directly with the CYBERTRIX emblem destabilizes the cloak.\n\n5. EXTRACTION DIRECTIVE:\n   Once the stealth container is exposed, inspect evidence.txt, extract the confirmed\n   flag string, and submit it into the verification console to claim 250 points.\n\n--------------------------------------------------------------------------------\n[END OF MEMORANDUM // SPECIAL AGENT CIPHER // SIGNED & ENCRYPTED]\n================================================================================"
        }
      ],
      hiddenDirectory: "",
      hiddenFiles: [
        {
          name: "evidence.txt",
          size: "1.9 KB",
          type: "CLASSIFIED",
          enabled: true,
          content: "================================================================================\nRESTRICTED ACCESS ARCHIVE // NODE: /mnt/secure_vault/evidence.txt\nCLEARANCE: LEVEL-5 TOP SECRET // OPERATION: CYBERTRIX FORENSICS\nSECURITY PROTOCOL: SHA-256 INTEGRITY VERIFIED\nPARTITION: /dev/mapper/vault-crypt [EXT4 / ENCRYPTED]\nTIMESTAMP: 2026-10-01 03:14:02 UTC\n================================================================================\n\n[SYSTEM ENVIRONMENT PARAMETERS]\nHOSTNAME         : SEC-VAULT-PROD-01\nKERNEL_RELEASE   : Linux 6.8.0-45-generic #45-Ubuntu SMP\nSECURITY_ENCLAVE : TPM 2.0 / HARDWARE SECURE BOOT ACTIVE\nACCESS_VECTOR    : INTRUSION ISOLATED (unknown -> ACCESS vault.dat)\nGATEWAY_KEYWORD  : VAULT [HEX DECODE: 56 41 55 4C 54]\n\n[NETWORK ROUTING & FIREWALL JOURNAL]\n[03:12:11] INGRESS: 192.168.1.104:44328 -> 10.0.4.15:443 [TLSv1.3 ESTABLISHED]\n[03:12:15] AUTH: Routine credentials failed on /auth/admin\n[03:13:40] PROBE: Directory crawler initiated scanning against public partition\n[03:14:02] BYPASS: Insignia stealth relay triggered; cloaked node exposed\n\n[CLASSIFIED FORENSICS INTEL // RECOVERED EVIDENCE]\nDuring the forensic audit of the compromised storage node, field agents\ndiscovered that sensitive incident tokens were archived deep inside this\nstealth container.\n\nThe recovered root clearance token is preserved below:\n--------------------------------------------------------------------------------\nRECOVERED MISSION FLAG TOKEN:\nCYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}\n--------------------------------------------------------------------------------\n\n[SUBMISSION PROTOCOL]\nOperatives must extract the verified flag token from this file, enter it into\nthe universal flag submission terminal below, and verify it to claim +250 POINTS\nand advance to the next challenge sector.\n\n================================================================================\n[TRANSMISSION TERMINATED // SEC-09 FORENSICS ENGINE LIVE]\n================================================================================"
        }
      ],
      secretFileName: "evidence.txt",
      secretFileTitle: "CYBERTRIX SECURE VAULT // evidence.txt",
      evidenceContent: "================================================================================\nRESTRICTED ACCESS ARCHIVE // NODE: /mnt/secure_vault/evidence.txt\nCLEARANCE: LEVEL-5 TOP SECRET // OPERATION: CYBERTRIX FORENSICS\nSECURITY PROTOCOL: SHA-256 INTEGRITY VERIFIED\nPARTITION: /dev/mapper/vault-crypt [EXT4 / ENCRYPTED]\nTIMESTAMP: 2026-10-01 03:14:02 UTC\n================================================================================\n\n[SYSTEM ENVIRONMENT PARAMETERS]\nHOSTNAME         : SEC-VAULT-PROD-01\nKERNEL_RELEASE   : Linux 6.8.0-45-generic #45-Ubuntu SMP\nSECURITY_ENCLAVE : TPM 2.0 / HARDWARE SECURE BOOT ACTIVE\nACCESS_VECTOR    : INTRUSION ISOLATED (unknown -> ACCESS vault.dat)\nGATEWAY_KEYWORD  : VAULT [HEX DECODE: 56 41 55 4C 54]\n\n[NETWORK ROUTING & FIREWALL JOURNAL]\n[03:12:11] INGRESS: 192.168.1.104:44328 -> 10.0.4.15:443 [TLSv1.3 ESTABLISHED]\n[03:12:15] AUTH: Routine credentials failed on /auth/admin\n[03:13:40] PROBE: Directory crawler initiated scanning against public partition\n[03:14:02] BYPASS: Insignia stealth relay triggered; cloaked node exposed\n\n[CLASSIFIED FORENSICS INTEL // RECOVERED EVIDENCE]\nDuring the forensic audit of the compromised storage node, field agents\ndiscovered that sensitive incident tokens were archived deep inside this\nstealth container.\n\nThe recovered root clearance token is preserved below:\n--------------------------------------------------------------------------------\nRECOVERED MISSION FLAG TOKEN:\nCYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}\n--------------------------------------------------------------------------------\n\n[SUBMISSION PROTOCOL]\nOperatives must extract the verified flag token from this file, enter it into\nthe universal flag submission terminal below, and verify it to claim +250 POINTS\nand advance to the next challenge sector.\n\n================================================================================\n[TRANSMISSION TERMINATED // SEC-09 FORENSICS ENGINE LIVE]\n================================================================================",
      evidenceEnabled: true,
      isLocked: false,
      adminLocked: false,
      flag: "CYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}",
      successMessage: "OPERATION COMPLETE // +250 POINTS AWARDED // STATUS: SOLVED ✓",
      timerEnabled: true,
      timerSeconds: 900, // 15:00 (15 minutes)
      caseSensitive: false,
      enabled: true,
      status: "ACTIVE",
      createdAt: "2026-09-30T10:05:00.000Z"
    },
    {
      id: "ascii-hunt",
      title: "ASCII VALUE FINDING",
      type: "ascii-hunt",
      category: "MISC",
      difficulty: "EASY",
      points: 400,
      order: 3,
      question: "Decode the intercepted hexadecimal byte stream into its ASCII plaintext character representation.",
      asciiHex: "43 59 42 45 52 21",
      asciiValues: "43 59 42 45 52 21",
      targetWord: "CYBER!",
      answer: "CYBER!",
      flag: "CYBERTRIX{CYBER!}",
      caseSensitive: false,
      description: "Decode the intercepted hexadecimal byte stream into its ASCII plaintext character representation.",
      mission: "Translate the space-separated hexadecimal ASCII bytes into human-readable plaintext using the reference table.",
      timerEnabled: true,
      timerSeconds: 300, // 05:00
      enabled: true,
      status: "ACTIVE",
      subtasks: [
        {
          id: "task_1",
          title: "Sub-task 1",
          name: "ASCII Value Finding — Task 1",
          points: 200,
          asciiHex: "43 59 42 45 52 21",
          asciiValues: "43 59 42 45 52 21",
          targetWord: "CYBER!",
          description: "Task 1 of 2: Intercepted telemetry in hexadecimal format. Decode the hex bytes into the target word using the ASCII table.",
          instructions: "Convert each hexadecimal value into its corresponding ASCII character to reveal the complete word.",
          order: 1
        },
        {
          id: "task_2",
          title: "Sub-task 2",
          name: "ASCII Value Finding — Task 2",
          points: 200,
          asciiHex: "53 33 63 75 72 31 74 79 23",
          asciiValues: "53 33 63 75 72 31 74 79 23",
          targetWord: "S3cur1ty#",
          description: "Task 2 of 2: An advanced telemetry stream containing letters, numbers, and symbols. Decode the hex sequence into the target string.",
          instructions: "Convert the second hexadecimal sequence into its corresponding ASCII string to complete the challenge.",
          order: 2
        }
      ],
      createdAt: "2026-09-30T10:10:00.000Z"
    },
    {
      id: "metadata-ghost",
      title: "Metadata Ghost",
      type: "metadata-ghost",
      category: "FORENSICS",
      difficulty: "HARD",
      points: 300,
      order: 4,
      question: "An intercepted surveillance photo shows a detective's desk, encrypted blueprint text 'PHHW DW PLGQLJKW', and tactical notes. Decipher the surveillance clues to recover the secret message.",
      answer: "MEET AT MIDNIGHT",
      flag: "CYBERTRIX{MEET_AT_MIDNIGHT}",
      description: "An intercepted surveillance photo shows a detective's desk, encrypted blueprint text 'PHHW DW PLGQLJKW', and tactical notes. Decipher the surveillance clues to recover the secret message.",
      mission: "An intercepted surveillance photo shows a detective's desk, encrypted blueprint text 'PHHW DW PLGQLJKW', and tactical notes. Decipher the surveillance clues to recover the secret message.",
      imageUrl: "assets/metadata-ghost-01.png",
      timerEnabled: true,
      timerSeconds: 420, // 07:00
      enabled: true,
      status: "ACTIVE",
      createdAt: "2026-09-30T10:15:00.000Z"
    }
  ];

  // Secret Flags Store (Requirements 1, 2, 7, 10, 16, 17, 20, 25)
  // Completely isolated from public challenge documents
  const DEFAULT_CHALLENGE_SECRETS = {
    "mirror-keyboard": {
      targetSentence: "The cyber world rewards careful thinking.",
      targetWord: "PYTHON",
      answer: "PYTHON",
      flag: "CYBERTRIX{PYTHON}",
      flagEnabled: true,
      caseSensitive: false,
      ignoreExtraSpaces: true,
      trimSpaces: true,
      aliases: [
        "PYTHON",
        "python",
        "CYBERTRIX{PYTHON}",
        "CYBERTRIX{python}",
        "The cyber world rewards careful thinking.",
        "THE CYBER WORLD REWARDS CAREFUL THINKING",
        "CYBERTRIX{The cyber world rewards careful thinking.}",
        "CYBERTRIX{THE CYBER WORLD REWARDS CAREFUL THINKING}",
        "World, Hello!",
        "WORLD, HELLO!",
        "CYBERTRIX{World, Hello!}"
      ],
      subtasks: {
        "task_1": {
          flag: "CYBERTRIX{PYTHON}",
          targetWord: "PYTHON",
          targetSentence: "The cyber world rewards careful thinking.",
          answer: "PYTHON",
          mirrorWord: "QTYFWX",
          aliases: ["PYTHON", "python", "CYBERTRIX{PYTHON}", "CYBERTRIX{python}", "QTYFWX", "The cyber world rewards careful thinking.", "THE CYBER WORLD REWARDS CAREFUL THINKING", "CYBERTRIX{THE_CYBER_WORLD_REWARDS_CAREFUL_THINKING}", "CYBERTRIX{The cyber world rewards careful thinking.}", "CYBERTRIX{THE CYBER WORLD REWARDS CAREFUL THINKING}"]
        },
        "task_2": {
          flag: "CYBERTRIX{CIPHER}",
          targetWord: "CIPHER",
          targetSentence: "Encrypt your data and defend the network.",
          answer: "CIPHER",
          mirrorWord: "BEQFIU",
          aliases: ["CIPHER", "cipher", "CYBERTRIX{CIPHER}", "CYBERTRIX{cipher}", "BEQFIU", "Encrypt your data and defend the network.", "ENCRYPT YOUR DATA AND DEFEND THE NETWORK", "CYBERTRIX{ENCRYPT_YOUR_DATA_AND_DEFEND_THE_NETWORK}", "CYBERTRIX{Encrypt your data and defend the network.}", "CYBERTRIX{ENCRYPT YOUR DATA AND DEFEND THE NETWORK}"]
        },
        "task_3": {
          flag: "CYBERTRIX{NETWORK}",
          targetWord: "NETWORK",
          targetSentence: "Knowledge is the ultimate shield in combat.",
          answer: "NETWORK",
          mirrorWord: "XIYOWUS",
          aliases: ["NETWORK", "network", "CYBERTRIX{NETWORK}", "CYBERTRIX{network}", "XIYOWUS", "Knowledge is the ultimate shield in combat.", "KNOWLEDGE IS THE ULTIMATE SHIELD IN COMBAT", "CYBERTRIX{KNOWLEDGE_IS_THE_ULTIMATE_SHIELD_IN_COMBAT}", "CYBERTRIX{Knowledge is the ultimate shield in combat.}", "CYBERTRIX{KNOWLEDGE IS THE ULTIMATE SHIELD IN COMBAT}"]
        }
      }
    },
    "mirror-keyboard-1": {
      flag: "CYBERTRIX{PYTHON}",
      aliases: ["PYTHON", "The cyber world rewards careful thinking.", "CYBERTRIX{The cyber world rewards careful thinking.}"]
    },
    "mirror-keyboard-2": {
      flag: "CYBERTRIX{CIPHER}",
      aliases: ["CIPHER", "Encrypt your data and defend the network.", "CYBERTRIX{Encrypt your data and defend the network.}"]
    },
    "mirror-keyboard-3": {
      flag: "CYBERTRIX{NETWORK}",
      aliases: ["NETWORK", "Knowledge is the ultimate shield in combat.", "CYBERTRIX{Knowledge is the ultimate shield in combat.}"]
    },
    "hidden-vault": {
      flag: "CYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}",
      secretContent: "================================================================================\nRESTRICTED ACCESS ARCHIVE // NODE: /mnt/secure_vault/evidence.txt\nCLEARANCE: LEVEL-5 TOP SECRET // OPERATION: CYBERTRIX FORENSICS\nSECURITY PROTOCOL: SHA-256 INTEGRITY VERIFIED\nPARTITION: /dev/mapper/vault-crypt [EXT4 / ENCRYPTED]\nTIMESTAMP: 2026-10-01 03:14:02 UTC\n================================================================================\n\n[SYSTEM ENVIRONMENT PARAMETERS]\nHOSTNAME         : SEC-VAULT-PROD-01\nKERNEL_RELEASE   : Linux 6.8.0-45-generic #45-Ubuntu SMP\nSECURITY_ENCLAVE : TPM 2.0 / HARDWARE SECURE BOOT ACTIVE\nACCESS_VECTOR    : INTRUSION ISOLATED (unknown -> ACCESS vault.dat)\nGATEWAY_KEYWORD  : VAULT [HEX DECODE: 56 41 55 4C 54]\n\n[NETWORK ROUTING & FIREWALL JOURNAL]\n[03:12:11] INGRESS: 192.168.1.104:44328 -> 10.0.4.15:443 [TLSv1.3 ESTABLISHED]\n[03:12:15] AUTH: Routine credentials failed on /auth/admin\n[03:13:40] PROBE: Directory crawler initiated scanning against public partition\n[03:14:02] BYPASS: Insignia stealth relay triggered; cloaked node exposed\n\n[CLASSIFIED FORENSICS INTEL // RECOVERED EVIDENCE]\nDuring the forensic audit of the compromised storage node, field agents\ndiscovered that sensitive incident tokens were archived deep inside this\nstealth container.\n\nThe recovered root clearance token is preserved below:\n--------------------------------------------------------------------------------\nRECOVERED MISSION FLAG TOKEN:\nCYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}\n--------------------------------------------------------------------------------\n\n[SUBMISSION PROTOCOL]\nOperatives must extract the verified flag token from this file, enter it into\nthe universal flag submission terminal below, and verify it to claim +250 POINTS\nand advance to the next challenge sector.\n\n================================================================================\n[TRANSMISSION TERMINATED // SEC-09 FORENSICS ENGINE LIVE]\n================================================================================",
      secretFileName: "evidence.txt",
      secretFileTitle: "CYBERTRIX SECURE VAULT // evidence.txt"
    },
    "ascii-hunt": {
      flag: "CYBERTRIX{CYBER!}",
      subtasks: {
        "task_1": {
          flag: "CYBERTRIX{CYBER!}",
          answer: "CYBER!",
          aliases: ["CYBER!", "CYBERTRIX{CYBER!}", "CYBER", "CYBERTRIX{CYBER}"]
        },
        "task_2": {
          flag: "CYBERTRIX{S3cur1ty#}",
          answer: "S3cur1ty#",
          aliases: ["S3cur1ty#", "CYBERTRIX{S3cur1ty#}", "SECURITY", "CYBERTRIX{SECURITY}"]
        }
      }
    },
    "ascii-hunt-1": {
      flag: "CYBERTRIX{CYBER}"
    },
    "ascii-hunt-2": {
      flag: "CYBERTRIX{SECURITY}"
    },
    "metadata-ghost": {
      answer: "MEET AT MIDNIGHT",
      flag: "CYBERTRIX{MEET_AT_MIDNIGHT}",
      aliases: [
        "MEET AT MIDNIGHT",
        "MEET_AT_MIDNIGHT",
        "CYBERTRIX{MEET_AT_MIDNIGHT}",
        "CYBERTRIX{MEET AT MIDNIGHT}",
        "MEET AT MIDNIGHT ALLEY",
        "MEET_AT_MIDNIGHT_ALLEY",
        "CYBERTRIX{MEET_AT_MIDNIGHT_ALLEY}",
        "CYBERTRIX{MEET AT MIDNIGHT ALLEY}",
        "MEET ME AT MIDNIGHT",
        "MEET_ME_AT_MIDNIGHT",
        "CYBERTRIX{MEET_ME_AT_MIDNIGHT}",
        "CYBERTRIX{MEET ME AT MIDNIGHT}",
        "PHHW DW PLGQLJKW",
        "PHHW_DW_PLGQLJKW",
        "CYBERTRIX{PHHW_DW_PLGQLJKW}",
        "CYBERTRIX{PHHW DW PLGQLJKW}"
      ]
    }
  };

  const DEFAULT_ANNOUNCEMENTS = [
    {
      id: "ann_1",
      title: "Challenge 01 is Live: MIRROR KEYBOARD",
      message: "The interactive Mirror Keyboard challenge has 3 sequential sub-tasks. Solve all 3 to clear Sector 01 and unlock Hidden Vault!",
      important: true,
      published: true,
      createdAt: "2026-09-30T09:30:00.000Z"
    },
    {
      id: "ann_2",
      title: "Welcome to CYBERTRIX CTF 2026",
      message: "Arena gates are open. Standard flag format is CYBERTRIX{...}. Challenges unlock one-by-one upon completion.",
      important: false,
      published: true,
      createdAt: "2026-09-30T09:00:00.000Z"
    }
  ];

  const DEFAULT_SUBMISSIONS = [];

  // Storage Persistence Helper
  function loadFromStorage(key, defaultVal) {
    try {
      const data = localStorage.getItem('cybertrix_' + key);
      if (data !== null && data !== undefined) return JSON.parse(data);
    } catch (e) {
      console.warn("Storage read error:", e);
    }
    try {
      localStorage.setItem('cybertrix_' + key, JSON.stringify(defaultVal));
    } catch (e) {}
    return defaultVal;
  }

  function saveToStorage(key, val) {
    try {
      localStorage.setItem('cybertrix_' + key, JSON.stringify(val));
      if (syncChannel) {
        syncChannel.postMessage({ type: 'SYNC_UPDATE', collection: key });
      }
      window.dispatchEvent(new CustomEvent('cybertrix_data_changed', { detail: { collection: key } }));
    } catch (e) {
      console.error("Storage write error:", e);
    }

    if (fbDb) {
      try {
        if (key === 'challenges' && Array.isArray(val)) {
          val.forEach(ch => {
            const { flag, secretContent, hiddenAnswer, ...publicCh } = ch;
            if (ch.id === 'hidden-vault') publicCh.flag = flag;
            syncDocToFirestore('challenges', ch.id, publicCh);
            if (ch.flag || ch.subtasks) {
              const secStore = loadFromStorage('challenge_secrets', {});
              const sec = (secStore && secStore[ch.id]) || {};
              if (ch.flag && !sec.flag) sec.flag = ch.flag;
              syncDocToFirestore('challengeSecrets', ch.id, sec);
            }
            if (ch.id === 'hidden-vault') {
              const hvFlag = ch.flag || "CYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}";
              syncDocToFirestore('hiddenVault', 'config', {
                evidenceFlag: hvFlag,
                evidenceContent: ch.evidenceContent || `flag:${hvFlag}`,
                updatedAt: new Date().toISOString()
              });
            }
          });
        } else if (key === 'challenge_secrets' && typeof val === 'object' && val !== null) {
          Object.entries(val).forEach(([id, sec]) => {
            syncDocToFirestore('challengeSecrets', id, sec);
            if (id === 'hidden-vault' && sec && sec.flag) {
              syncDocToFirestore('hiddenVault', 'config', {
                evidenceFlag: sec.flag,
                evidenceContent: sec.secretContent || `flag:${sec.flag}`,
                updatedAt: new Date().toISOString()
              });
            }
          });
        } else if (key === 'users' && Array.isArray(val)) {
          val.forEach(u => syncDocToFirestore('users', u.uid, u));
        } else if (key === 'announcements' && Array.isArray(val)) {
          val.forEach(a => syncDocToFirestore('announcements', a.id, a));
        } else if (key === 'event_settings') {
          syncDocToFirestore('eventSettings', 'main', val);
        } else if (key === 'event_timer') {
          syncDocToFirestore('siteSettings', 'eventTimer', val);
        } else if (key === 'challenge_attempts' && typeof val === 'object' && val !== null) {
          Object.entries(val).forEach(([k, att]) => {
            syncDocToFirestore('challengeAttempts', k, att);
            if (att && att.userId && att.challengeId) {
              try {
                fbDb.collection('progress').doc(att.userId).collection('challenges').doc(att.challengeId).set({
                  started: att.status !== 'not_started',
                  solved: att.status === 'solved',
                  remainingTime: att.remainingSeconds !== undefined ? att.remainingSeconds : (att.durationSeconds || 300),
                  status: att.status || 'active',
                  startedAt: att.startedAt || new Date().toISOString(),
                  solvedAt: att.solvedAt || null,
                  lastUpdated: new Date().toISOString()
                }, { merge: true });
              } catch(e) {}
            }
          });
        } else if (key === 'submissions' && Array.isArray(val)) {
          val.forEach(sub => syncDocToFirestore('submissions', sub.id, sub));
        } else if (key === 'admins' && typeof val === 'object' && val !== null) {
          Object.entries(val).forEach(([id, adm]) => syncDocToFirestore('admins', id, adm));
        }
      } catch (err) {
        console.warn("Async Firestore persistence warning:", err.message);
      }
    }
  }

  // Initialize DB Tables in localStorage with consistent schema
  let dbAdminsMap = loadFromStorage('admins', DEFAULT_ADMINS);
  if (!dbAdminsMap || typeof dbAdminsMap !== 'object' || Array.isArray(dbAdminsMap)) {
    dbAdminsMap = { ...DEFAULT_ADMINS };
    saveToStorage('admins', dbAdminsMap);
  } else {
    // Ensure default root admin is always present and active
    if (!dbAdminsMap[DEFAULT_ADMIN.uid] || dbAdminsMap[DEFAULT_ADMIN.uid].active !== true || dbAdminsMap[DEFAULT_ADMIN.uid].role !== 'admin') {
      dbAdminsMap[DEFAULT_ADMIN.uid] = {
        uid: DEFAULT_ADMIN.uid,
        email: DEFAULT_ADMIN.email,
        active: true,
        role: "admin",
        createdAt: dbAdminsMap[DEFAULT_ADMIN.uid]?.createdAt || DEFAULT_ADMIN.createdAt
      };
      saveToStorage('admins', dbAdminsMap);
    }
  }

  let dbUsers = loadFromStorage('users', [DEFAULT_ADMIN, ...DEFAULT_PLAYERS]);
  if (!Array.isArray(dbUsers)) {
    dbUsers = [DEFAULT_ADMIN, ...DEFAULT_PLAYERS];
  }

  // Guarantee Root Admin exists with active clearance in dbUsers
  const rootAdminUserIdx = dbUsers.findIndex(u => u.uid === DEFAULT_ADMIN.uid || (u.email && u.email.toLowerCase() === DEFAULT_ADMIN.email.toLowerCase()));
  if (rootAdminUserIdx === -1) {
    dbUsers.unshift({ ...DEFAULT_ADMIN });
    saveToStorage('users', dbUsers);
  } else {
    const rootAdminUser = dbUsers[rootAdminUserIdx];
    if (rootAdminUser.role !== 'admin' || rootAdminUser.active !== true || rootAdminUser.disabled === true || rootAdminUser.status === 'disabled' || !rootAdminUser.passwordHash) {
      rootAdminUser.role = 'admin';
      rootAdminUser.active = true;
      rootAdminUser.disabled = false;
      rootAdminUser.status = 'active';
      rootAdminUser.email = DEFAULT_ADMIN.email;
      rootAdminUser.passwordHash = DEFAULT_ADMIN.passwordHash;
      saveToStorage('users', dbUsers);
    }
  }

  // Ensure root admin credentials exist in auth_credentials store
  let startupAuthCreds = loadFromStorage('auth_credentials', {});
  if (!startupAuthCreds || typeof startupAuthCreds !== 'object') startupAuthCreds = {};
  if (!startupAuthCreds[DEFAULT_ADMIN.uid]) {
    startupAuthCreds[DEFAULT_ADMIN.uid] = DEFAULT_ADMIN.passwordHash;
    saveToStorage('auth_credentials', startupAuthCreds);
  }
  // Ensure every user has valid active flag, status, disabled flag, college name, and subtasks
  if (Array.isArray(dbUsers)) {
    let usersUpdated = false;
    dbUsers = dbUsers.map(u => {
      let isChanged = false;
      const copy = { ...u };
      if (!copy.name) { copy.name = copy.username || "Operative"; isChanged = true; }
      if (!copy.collegeName) { copy.collegeName = copy.college || "Cyber Defense Academy"; isChanged = true; }
      if (copy.disabled === undefined) { copy.disabled = false; isChanged = true; }
      if (!copy.status) { copy.status = copy.disabled ? "disabled" : "active"; isChanged = true; }
      if (copy.disabled && copy.status !== "disabled") { copy.status = "disabled"; isChanged = true; }
      if (!copy.disabled && copy.status === "disabled") { copy.disabled = true; isChanged = true; }

      // Requirement 2, 4, 5: Explicitly maintain active: true / false
      if (copy.active === undefined) {
        copy.active = (copy.disabled !== true && copy.status !== "disabled");
        isChanged = true;
      }
      if (copy.disabled === true || copy.status === "disabled") {
        if (copy.active !== false) { copy.active = false; isChanged = true; }
      }
      if (copy.active === false) {
        if (copy.disabled !== true) { copy.disabled = true; isChanged = true; }
        if (copy.status !== "disabled") { copy.status = "disabled"; isChanged = true; }
      }

      if (!Array.isArray(copy.solvedSubtasks)) { copy.solvedSubtasks = []; isChanged = true; }
      if (!Array.isArray(copy.solvedChallenges)) { copy.solvedChallenges = []; isChanged = true; }
      if (!Array.isArray(copy.completedChallenges)) {
        copy.completedChallenges = [...copy.solvedChallenges];
        isChanged = true;
      }

      // Synchronize points and score
      const unifiedScore = (copy.score !== undefined ? copy.score : copy.points) || 0;
      if (copy.points !== unifiedScore) { copy.points = unifiedScore; isChanged = true; }
      if (copy.score !== unifiedScore) { copy.score = unifiedScore; isChanged = true; }

      // Migrate legacy challenge IDs if present
      if (Array.isArray(copy.solvedChallenges)) {
        if (copy.solvedChallenges.includes('mirror-keyboard-1') && !copy.solvedSubtasks.includes('mirror-keyboard_task_1')) {
          copy.solvedSubtasks.push('mirror-keyboard_task_1');
          isChanged = true;
        }
        if (copy.solvedChallenges.includes('mirror-keyboard-2') && !copy.solvedSubtasks.includes('mirror-keyboard_task_2')) {
          copy.solvedSubtasks.push('mirror-keyboard_task_2');
          isChanged = true;
        }
        if (copy.solvedChallenges.includes('mirror-keyboard-3') && !copy.solvedSubtasks.includes('mirror-keyboard_task_3')) {
          copy.solvedSubtasks.push('mirror-keyboard_task_3');
          isChanged = true;
        }
        if (copy.solvedChallenges.includes('ascii-hunt-1') && !copy.solvedSubtasks.includes('ascii-hunt_task_1')) {
          copy.solvedSubtasks.push('ascii-hunt_task_1');
          isChanged = true;
        }
        if (copy.solvedChallenges.includes('ascii-hunt-2') && !copy.solvedSubtasks.includes('ascii-hunt_task_2')) {
          copy.solvedSubtasks.push('ascii-hunt_task_2');
          isChanged = true;
        }

        // Clean legacy task IDs from solvedChallenges
        const originalSolvedLen = copy.solvedChallenges.length;
        copy.solvedChallenges = copy.solvedChallenges.filter(id => !['mirror-keyboard-1', 'mirror-keyboard-2', 'mirror-keyboard-3', 'ascii-hunt-1', 'ascii-hunt-2'].includes(id));
        if (copy.solvedChallenges.length !== originalSolvedLen) isChanged = true;

        // If all 3 MK tasks are solved, ensure 'mirror-keyboard' is in solvedChallenges
        if (['mirror-keyboard_task_1', 'mirror-keyboard_task_2', 'mirror-keyboard_task_3'].every(t => copy.solvedSubtasks.includes(t))) {
          if (!copy.solvedChallenges.includes('mirror-keyboard')) {
            copy.solvedChallenges.push('mirror-keyboard');
            isChanged = true;
          }
        }

        // If both ASCII tasks are solved, ensure 'ascii-hunt' is in solvedChallenges
        if (['ascii-hunt_task_1', 'ascii-hunt_task_2'].every(t => copy.solvedSubtasks.includes(t))) {
          if (!copy.solvedChallenges.includes('ascii-hunt')) {
            copy.solvedChallenges.push('ascii-hunt');
            isChanged = true;
          }
        }
      }

      // Sync completedChallenges with solvedChallenges
      copy.solvedChallenges.forEach(id => {
        if (!copy.completedChallenges.includes(id)) {
          copy.completedChallenges.push(id);
          isChanged = true;
        }
      });
      copy.completedChallenges.forEach(id => {
        if (!copy.solvedChallenges.includes(id)) {
          copy.solvedChallenges.push(id);
          isChanged = true;
        }
      });

      const solvedTotal = copy.solvedChallenges.length;
      if (copy.solvedCount !== solvedTotal) {
        copy.solvedCount = solvedTotal;
        isChanged = true;
      }

      if (isChanged) usersUpdated = true;
      return copy;
    });
    if (usersUpdated) {
      saveToStorage('users', dbUsers);
    }
  }

  // Ensure challenges are clean and upgraded to single Mirror Keyboard (3 subtasks) and single ASCII Value Finding (2 subtasks)
  let rawChallenges = loadFromStorage('challenges', DEFAULT_CHALLENGES);
  const needsChallengeUpgrade = !Array.isArray(rawChallenges) ||
    rawChallenges.length === 0 ||
    rawChallenges.some(c => c.id === 'mirror-keyboard-1') ||
    rawChallenges.some(c => c.id === 'ascii-hunt-1');

  if (needsChallengeUpgrade) {
    rawChallenges = DEFAULT_CHALLENGES;
    saveToStorage('challenges', rawChallenges);
  }

  // Ensure every challenge has timerEnabled, timerSeconds and valid subtasks configured
  if (Array.isArray(rawChallenges)) {
    rawChallenges.forEach((c, idx) => {
      const def = DEFAULT_CHALLENGES.find(d => d.id === c.id);
      if (def && !c.question) {
        c.question = def.question || def.description;
      }
      if (c.timerEnabled === undefined) {
        c.timerEnabled = def ? (def.timerEnabled !== undefined ? def.timerEnabled : true) : true;
      }
      if (!c.timerSeconds && def && def.timerSeconds) {
        c.timerSeconds = def.timerSeconds;
      }
      // Ensure subtasks are present on ascii-hunt ONLY if missing or empty
      if (def && def.subtasks && c.id === 'ascii-hunt' && (!c.subtasks || !Array.isArray(c.subtasks) || c.subtasks.length === 0)) {
        c.subtasks = def.subtasks;
        c.points = def.points;
      }
      // Ensure subtasks are present on mirror-keyboard ONLY if missing or empty
      if (c.id === 'mirror-keyboard' && def) {
        if (!c.question || c.question.includes('mirror word') || c.question.includes('programming language') || c.question.includes('PYTHON using')) {
          c.question = "Left is Right, Right is left. Type what you see, not what you mean.";
          c.description = "Left is Right, Right is left. Type what you see, not what you mean.";
        }
        if (Array.isArray(c.subtasks) && c.subtasks[0]) {
          if (!c.subtasks[0].question || c.subtasks[0].question.includes('mirror word') || c.subtasks[0].question.includes('programming language') || c.subtasks[0].question.includes('PYTHON using')) {
            c.subtasks[0].question = "Left is Right, Right is left. Type what you see, not what you mean.";
            c.subtasks[0].description = "Left is Right, Right is left. Type what you see, not what you mean.";
          }
        }
        if (!c.subtasks || !Array.isArray(c.subtasks) || c.subtasks.length === 0) {
          c.subtasks = JSON.parse(JSON.stringify(def.subtasks));
          c.points = def.points || 300;
          c.description = def.description;
          c.mission = def.mission;
          c.targetSentence = def.targetSentence;
          c.targetWord = def.targetWord;
        }
      }
      // Upgrade hidden-vault if cached with old challenge parameters or legacy .hidden / evidence.dat files
      if (c.id === 'hidden-vault' && def) {
        const hasValidEvidence = !!(c.evidenceContent || (Array.isArray(c.hiddenFiles) && c.hiddenFiles[0] && c.hiddenFiles[0].name === 'evidence.txt' && c.hiddenFiles[0].content));
        const isLegacyHiddenFile = Array.isArray(c.hiddenFiles) && c.hiddenFiles[0] && (c.hiddenFiles[0].name === '.hidden' || c.hiddenFiles[0].name === 'evidence.dat');
        
        if (!c.vaultKeyword || !c.fakeFiles || c.fakeFiles.length === 0 || !c.hiddenFiles || !Array.isArray(c.hiddenFiles) || c.hiddenFiles.length === 0 || isLegacyHiddenFile || !c.fakeFiles.some(f => f.name === 'notes.txt')) {
          const preservedEvidence = (c.evidenceContent !== undefined && c.evidenceContent !== null)
            ? c.evidenceContent
            : (Array.isArray(c.hiddenFiles) && c.hiddenFiles[0] && c.hiddenFiles[0].name === 'evidence.txt' && c.hiddenFiles[0].content !== undefined ? c.hiddenFiles[0].content : '');
          c.fakeFiles = JSON.parse(JSON.stringify(def.fakeFiles));
          c.hiddenFiles = JSON.parse(JSON.stringify(def.hiddenFiles));
          if (preservedEvidence !== undefined) {
            c.evidenceContent = preservedEvidence;
            c.hiddenFiles[0].content = preservedEvidence;
          }
          c.secretFileName = def.secretFileName;
          c.secretFileTitle = def.secretFileTitle;
          c.evidenceEnabled = c.evidenceEnabled !== false;
          rawChallenges[idx] = { ...def, ...c, fakeFiles: def.fakeFiles, hiddenFiles: c.hiddenFiles, secretFileName: def.secretFileName, secretFileTitle: def.secretFileTitle, evidenceEnabled: c.evidenceEnabled };
        }
      }
      // Upgrade metadata-ghost if cached with old points (150) or old answer/category
      if (c.id === 'metadata-ghost' && def) {
        if (c.points !== 300 || c.category !== 'FORENSICS' || c.difficulty !== 'HARD' || !c.question || !c.question.includes('PHHW DW PLGQLJKW') || c.answer === 'PHANTOM' || c.answer === 'GHOST') {
          c.points = 300;
          c.category = 'FORENSICS';
          c.difficulty = 'HARD';
          c.title = 'Metadata Ghost';
          c.description = def.description;
          c.question = def.question;
          c.mission = def.mission;
          c.answer = def.answer;
          c.flag = def.flag;
        }
      }
    });
    saveToStorage('challenges', rawChallenges);
  }
  let dbChallengesList = rawChallenges;

  let dbChallengeSecrets = loadFromStorage('challenge_secrets', DEFAULT_CHALLENGE_SECRETS);
  if (!dbChallengeSecrets || typeof dbChallengeSecrets !== 'object' || Object.keys(dbChallengeSecrets).length === 0) {
    dbChallengeSecrets = { ...DEFAULT_CHALLENGE_SECRETS };
    saveToStorage('challenge_secrets', dbChallengeSecrets);
  } else {
    // Fill in any completely missing challenge secrets without overwriting existing custom admin secrets
    let secretsUpdated = false;
    Object.keys(DEFAULT_CHALLENGE_SECRETS).forEach(k => {
      if (!dbChallengeSecrets[k]) {
        dbChallengeSecrets[k] = DEFAULT_CHALLENGE_SECRETS[k];
        secretsUpdated = true;
      }
    });
    if (dbChallengeSecrets['mirror-keyboard'] && (!dbChallengeSecrets['mirror-keyboard'].subtasks || Object.keys(dbChallengeSecrets['mirror-keyboard'].subtasks).length === 0)) {
      dbChallengeSecrets['mirror-keyboard'].subtasks = DEFAULT_CHALLENGE_SECRETS['mirror-keyboard'].subtasks;
      dbChallengeSecrets['mirror-keyboard'].targetSentence = DEFAULT_CHALLENGE_SECRETS['mirror-keyboard'].targetSentence;
      dbChallengeSecrets['mirror-keyboard'].targetWord = DEFAULT_CHALLENGE_SECRETS['mirror-keyboard'].targetWord;
      dbChallengeSecrets['mirror-keyboard'].flag = DEFAULT_CHALLENGE_SECRETS['mirror-keyboard'].flag;
      secretsUpdated = true;
    }
    if (dbChallengeSecrets['metadata-ghost'] && (dbChallengeSecrets['metadata-ghost'].answer === 'GHOST' || dbChallengeSecrets['metadata-ghost'].answer === 'PHANTOM' || !dbChallengeSecrets['metadata-ghost'].answer || (dbChallengeSecrets['metadata-ghost'].flag && (dbChallengeSecrets['metadata-ghost'].flag.includes('gh0st') || dbChallengeSecrets['metadata-ghost'].flag.includes('PHANTOM'))))) {
      dbChallengeSecrets['metadata-ghost'].answer = 'MEET AT MIDNIGHT';
      dbChallengeSecrets['metadata-ghost'].flag = 'CYBERTRIX{MEET_AT_MIDNIGHT}';
      dbChallengeSecrets['metadata-ghost'].aliases = DEFAULT_CHALLENGE_SECRETS['metadata-ghost'].aliases;
      secretsUpdated = true;
    }
    if (secretsUpdated) saveToStorage('challenge_secrets', dbChallengeSecrets);
  }

  // Fix "EVENT ENDED" in challenge UI: Ensure timer in localStorage is cleanly LIVE and not expired from past tests (Requirement 1)
  let dbTimerConfig = loadFromStorage('event_timer', DEFAULT_TIMER_CONFIG);
  if (!dbTimerConfig || (dbTimerConfig.status === 'LIVE' && dbTimerConfig.endTime && new Date(dbTimerConfig.endTime).getTime() <= Date.now()) || (dbTimerConfig.status === 'ENDED' && dbTimerConfig.remainingSeconds <= 0)) {
    dbTimerConfig = {
      ...DEFAULT_TIMER_CONFIG,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 7200 * 1000).toISOString(),
      remainingSeconds: 7200,
      status: "LIVE",
      updatedAt: new Date().toISOString()
    };
    saveToStorage('event_timer', dbTimerConfig);
  }

  let dbAnnouncementsList = loadFromStorage('announcements', DEFAULT_ANNOUNCEMENTS);
  let dbSubmissionsList = loadFromStorage('submissions', DEFAULT_SUBMISSIONS);
  let dbEventConfig = loadFromStorage('event_settings', DEFAULT_EVENT_CONFIG);

  // Helper for cross-tab synchronization
  function handleCrossTabSync(key) {
    if (key === 'admins') dbAdminsMap = loadFromStorage('admins', DEFAULT_ADMINS);
    if (key === 'users') dbUsers = loadFromStorage('users', []);
    if (key === 'challenges') dbChallengesList = loadFromStorage('challenges', DEFAULT_CHALLENGES);
    if (key === 'challenge_secrets') dbChallengeSecrets = loadFromStorage('challenge_secrets', DEFAULT_CHALLENGE_SECRETS);
    if (key === 'announcements') dbAnnouncementsList = loadFromStorage('announcements', []);
    if (key === 'submissions') dbSubmissionsList = loadFromStorage('submissions', []);
    if (key === 'event_settings') dbEventConfig = loadFromStorage('event_settings', {});
    if (key === 'event_timer') dbTimerConfig = loadFromStorage('event_timer', DEFAULT_TIMER_CONFIG);
    window.dispatchEvent(new CustomEvent('cybertrix_data_changed', { detail: { collection: key } }));
  }

  // Listen for sync from other tabs via BroadcastChannel
  if (syncChannel) {
    syncChannel.onmessage = (event) => {
      if (event.data && event.data.type === 'SYNC_UPDATE') {
        handleCrossTabSync(event.data.collection);
      }
    };
  }

  // Listen for sync from other tabs via standard StorageEvent (cross-tab fallback)
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', (event) => {
      if (event.key && event.key.startsWith('cybertrix_')) {
        const collection = event.key.replace('cybertrix_', '');
        handleCrossTabSync(collection);
      }
    });
  }

  // ==========================================
  // ADMINS SERVICE (admins/{uid} collection)
  // Requirement 1: email, active: true, role: "admin"
  // ==========================================
  const dbAdmins = {
    async getByUid(uid) {
      if (!uid) return null;
      dbAdminsMap = loadFromStorage('admins', DEFAULT_ADMINS);
      return dbAdminsMap[uid] || null;
    },

    async getAll() {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      dbAdminsMap = loadFromStorage('admins', DEFAULT_ADMINS);
      return Object.values(dbAdminsMap);
    },

    async setAdmin(uid, data) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      if (!uid) throw new Error("Admin UID is required.");
      dbAdminsMap = loadFromStorage('admins', DEFAULT_ADMINS);
      const cleanEmail = (data.email || '').trim().toLowerCase();
      dbAdminsMap[uid] = {
        uid: uid,
        email: cleanEmail,
        active: data.active !== undefined ? Boolean(data.active) : true,
        role: data.role !== undefined ? data.role : "admin",
        createdAt: dbAdminsMap[uid]?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      saveToStorage('admins', dbAdminsMap);

      // Keep dbUsers in sync if matching operative exists
      dbUsers = loadFromStorage('users', []);
      const uIdx = dbUsers.findIndex(u => u.uid === uid || (u.email && u.email.toLowerCase() === cleanEmail));
      if (uIdx !== -1) {
        dbUsers[uIdx].role = data.role !== undefined ? data.role : "admin";
        dbUsers[uIdx].active = data.active !== undefined ? Boolean(data.active) : true;
        dbUsers[uIdx].disabled = !dbUsers[uIdx].active;
        dbUsers[uIdx].status = dbUsers[uIdx].active ? "active" : "disabled";
        saveToStorage('users', dbUsers);
      }
      return dbAdminsMap[uid];
    },

    async removeAdmin(uid) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      if (fbDb) {
        deleteDocFromFirestore('admins', uid);
      }
      dbAdminsMap = loadFromStorage('admins', DEFAULT_ADMINS);
      delete dbAdminsMap[uid];
      saveToStorage('admins', dbAdminsMap);
      return true;
    },

    async verifyAdminAccess(uid, email) {
      if (!uid) {
        return { authorized: false, reason: "No user UID provided." };
      }
      dbAdminsMap = loadFromStorage('admins', DEFAULT_ADMINS);

      let cleanEmail = (email || '').trim().toLowerCase();
      if (cleanEmail === 'admin' || cleanEmail === 'rootadmin' || cleanEmail === 'admin@cybertrix.com' || cleanEmail === 'admin@domain.com') {
        cleanEmail = DEFAULT_ADMIN.email.toLowerCase();
      }

      let record = dbAdminsMap[uid];
      if (!record && cleanEmail) {
        record = Object.values(dbAdminsMap).find(a => a && a.email && a.email.toLowerCase() === cleanEmail);
      }

      // Root Admin is guaranteed active admin
      if (uid === DEFAULT_ADMIN.uid || cleanEmail === DEFAULT_ADMIN.email.toLowerCase()) {
        if (!record) {
          record = {
            uid: DEFAULT_ADMIN.uid,
            email: DEFAULT_ADMIN.email,
            active: true,
            role: "admin",
            createdAt: DEFAULT_ADMIN.createdAt
          };
          dbAdminsMap[DEFAULT_ADMIN.uid] = record;
          saveToStorage('admins', dbAdminsMap);
        } else {
          record.active = true;
          record.role = 'admin';
          record.email = DEFAULT_ADMIN.email;
        }
      }

      if (!record) {
        return { authorized: false, reason: "This account is not an active admin." };
      }

      const recEmail = (record.email || '').trim().toLowerCase();
      const isActive = (record.active === true || record.active === 'true') && record.active !== false && !record.disabled;
      const isRoleAdmin = record.role === 'admin';
      const isEmailMatch = Boolean(recEmail && cleanEmail && recEmail === cleanEmail);

      if (isActive && isRoleAdmin && isEmailMatch) {
        return { authorized: true, admin: record };
      }

      return { authorized: false, reason: "This account is not an active admin." };
    }
  };

  // ==========================================
  // AUTH SERVICE
  // ==========================================
  const dbAuth = {
    getCurrentUser() {
      try {
        const u = localStorage.getItem('cybertrix_active_user');
        if (u) {
          const parsed = JSON.parse(u);
          // Refresh user data from dbUsers
          dbUsers = loadFromStorage('users', []);
          const fresh = dbUsers.find(x => x.uid === parsed.uid);
          if (fresh) {
            fresh.score = (fresh.score !== undefined ? fresh.score : fresh.points) || 0;
            fresh.points = fresh.score;
            fresh.solvedChallenges = fresh.solvedChallenges || fresh.completedChallenges || [];
            fresh.completedChallenges = fresh.completedChallenges || fresh.solvedChallenges || [];
            fresh.solvedCount = fresh.solvedCount !== undefined ? fresh.solvedCount : fresh.solvedChallenges.length;
            localStorage.setItem('cybertrix_active_user', JSON.stringify(fresh));
            return fresh;
          }
          parsed.score = (parsed.score !== undefined ? parsed.score : parsed.points) || 0;
          parsed.points = parsed.score;
          parsed.solvedChallenges = parsed.solvedChallenges || parsed.completedChallenges || [];
          parsed.completedChallenges = parsed.completedChallenges || parsed.solvedChallenges || [];
          parsed.solvedCount = parsed.solvedCount !== undefined ? parsed.solvedCount : parsed.solvedChallenges.length;
          return parsed;
        }
      } catch (e) { }
      return null;
    },

    async verifyAdminAccess(uid, email) {
      return dbAdmins.verifyAdminAccess(uid, email);
    },

    async login(email, password) {
      initFirebase();
      dbUsers = loadFromStorage('users', []);
      let authCreds = loadFromStorage('auth_credentials', {});
      let cleanEmail = (email || '').trim().toLowerCase();

      // Support common admin login aliases
      if (cleanEmail === 'admin' || cleanEmail === 'rootadmin' || cleanEmail === 'admin@cybertrix.com' || cleanEmail === 'admin@domain.com') {
        cleanEmail = DEFAULT_ADMIN.email.toLowerCase();
      }

      let authUser = null;
      if (fbAuth) {
        try {
          const cred = await fbAuth.signInWithEmailAndPassword(cleanEmail, password);
          if (cred && cred.user) {
            authUser = cred.user;
          }
        } catch (authErr) {
          console.warn("Firebase Auth signIn note:", authErr.message);
        }
      }

      let user = null;
      if (fbDb && authUser) {
        try {
          const remoteDoc = await getDocFromFirestore('users', authUser.uid);
          if (remoteDoc) {
            user = { ...remoteDoc, uid: authUser.uid };
          }
        } catch (e) {}
      }

      if (!user) {
        user = dbUsers.find(u => (u.email && u.email.toLowerCase() === cleanEmail) || (u.username && u.username.toLowerCase() === cleanEmail));
      }

      // Self-heal root admin in dbUsers if logging in as root admin
      if (!user && cleanEmail === DEFAULT_ADMIN.email.toLowerCase()) {
        user = { ...DEFAULT_ADMIN };
        if (authUser) user.uid = authUser.uid;
        dbUsers.unshift(user);
        saveToStorage('users', dbUsers);
      }

      if (!user) {
        throw new Error("No operative profile found with this email.");
      }

      // If user is root admin, guarantee password in auth_credentials
      if (user.uid === DEFAULT_ADMIN.uid || cleanEmail === DEFAULT_ADMIN.email.toLowerCase()) {
        if (!authCreds[user.uid]) {
          authCreds[user.uid] = DEFAULT_ADMIN.passwordHash;
          saveToStorage('auth_credentials', authCreds);
        }
      }

      // Check password from dedicated auth credentials or legacy user.passwordHash
      if (!authUser) {
        const storedPass = authCreds[user.uid] || user.passwordHash;
        if (storedPass !== password) {
          throw new Error("Access Denied: Invalid cyber clearance credentials.");
        }
      }

      // Requirement 6 & 11: Check whether player is disabled in Firestore / profile
      if (user.disabled === true || user.active === false || user.status === 'disabled') {
        if (fbAuth) {
          try { await fbAuth.signOut(); } catch(e){}
        }
        localStorage.removeItem('cybertrix_active_user');
        throw new Error("Your CYBERTRIX account has been disabled by the administrator.");
      }

      // If user has admin role, verify against admins/{uid} (Requirement 1)
      if (user.role === 'admin') {
        const check = await dbAdmins.verifyAdminAccess(user.uid, user.email);
        if (!check || !check.authorized) {
          throw new Error("ACCESS DENIED: This account is not an active admin.");
        }
      }

      // Return clean user profile without password
      const { passwordHash, ...cleanProfile } = user;
      cleanProfile.score = (cleanProfile.score !== undefined ? cleanProfile.score : cleanProfile.points) || 0;
      cleanProfile.points = cleanProfile.score;
      cleanProfile.solvedChallenges = cleanProfile.solvedChallenges || cleanProfile.completedChallenges || [];
      cleanProfile.completedChallenges = cleanProfile.completedChallenges || cleanProfile.solvedChallenges || [];
      cleanProfile.solvedCount = cleanProfile.solvedCount !== undefined ? cleanProfile.solvedCount : cleanProfile.solvedChallenges.length;
      localStorage.setItem('cybertrix_active_user', JSON.stringify(cleanProfile));
      window.dispatchEvent(new CustomEvent('cybertrix_auth_state_changed', { detail: { user: cleanProfile } }));
      return cleanProfile;
    },

    async register(name, collegeName, email, password) {
      initFirebase();
      // Support legacy signature (username, email, password)
      if (arguments.length === 3) {
        password = email;
        email = collegeName;
        collegeName = "N/A";
      }

      dbUsers = loadFromStorage('users', [DEFAULT_ADMIN, ...DEFAULT_PLAYERS]);
      let authCreds = loadFromStorage('auth_credentials', {});
      dbEventConfig = loadFromStorage('event_settings', DEFAULT_EVENT_CONFIG);

      // Gate check: only block if explicitly closed by admin (defaults to open)
      if (dbEventConfig && dbEventConfig.registrationOpen === false) {
        throw new Error("Arena registration is currently closed by the Admin.");
      }

      if (!name || !name.trim()) {
        throw new Error("Full Name cannot be empty.");
      }
      if (!collegeName || !collegeName.trim()) {
        throw new Error("Please enter your college name.");
      }
      if (!email || !email.includes('@')) {
        throw new Error("Valid communication email required.");
      }
      if (!password || password.length < 6) {
        throw new Error("Security clearance key must be at least 6 characters.");
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name.trim();

      // Ensure unique email among all operatives (safe lookup avoiding undefined crashes)
      const existingUser = Array.isArray(dbUsers) && dbUsers.find(u => u && u.email && u.email.toLowerCase() === cleanEmail);
      if (existingUser) {
        throw new Error("This email is already registered in CYBERTRIX. Please log in instead.");
      }

      let authUid = null;
      if (fbAuth) {
        try {
          const userCred = await fbAuth.createUserWithEmailAndPassword(cleanEmail, password);
          if (userCred && userCred.user) {
            authUid = userCred.user.uid;
          }
        } catch (authErr) {
          if (authErr.code === 'auth/email-already-in-use') {
            throw new Error("This email is already registered in CYBERTRIX. Please log in instead.");
          }
          console.warn("Firebase Auth registration note:", authErr.message);
        }
      }

      const uid = authUid || ("user_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5));

      // Store password ONLY in dedicated auth credentials store, NEVER in user profile (Requirement 2)
      authCreds[uid] = password;
      saveToStorage('auth_credentials', authCreds);

      const newUser = {
        uid: uid,
        name: cleanName,
        username: cleanName,
        collegeName: collegeName.trim(),
        college: collegeName.trim(),
        email: cleanEmail,
        role: "player",
        active: true,
        points: 0,
        score: 0,
        solvedCount: 0,
        solvedChallenges: [],
        completedChallenges: [],
        solvedSubtasks: [],
        progress: {},
        status: "active",
        disabled: false,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };

      if (fbDb) {
        await syncDocToFirestore('users', uid, newUser);
      }

      dbUsers.push(newUser);
      saveToStorage('users', dbUsers);
      localStorage.setItem('cybertrix_active_user', JSON.stringify(newUser));
      window.dispatchEvent(new CustomEvent('cybertrix_auth_state_changed', { detail: { user: newUser } }));
      return newUser;
    },

    async logout() {
      if (fbAuth) {
        try { await fbAuth.signOut(); } catch(e){}
      }
      localStorage.removeItem('cybertrix_active_user');
      window.dispatchEvent(new CustomEvent('cybertrix_auth_state_changed', { detail: { user: null } }));
    },

    isAdmin() {
      const u = this.getCurrentUser();
      if (!u || u.role !== 'admin' || u.active === false || u.disabled === true) return false;
      const cleanEmail = (u.email || '').trim().toLowerCase();
      if (u.uid === DEFAULT_ADMIN.uid || cleanEmail === DEFAULT_ADMIN.email.toLowerCase()) {
        return true;
      }
      const admins = loadFromStorage('admins', DEFAULT_ADMINS);
      const rec = admins[u.uid] || Object.values(admins).find(a => a && a.email && a.email.toLowerCase() === cleanEmail);
      return Boolean(rec && (rec.active === true || rec.active === 'true') && rec.active !== false && !rec.disabled && rec.role === 'admin' && (rec.email || '').toLowerCase() === cleanEmail);
    },

    onAuthStateChanged(callback) {
      window.addEventListener('cybertrix_auth_state_changed', (e) => {
        callback(e.detail.user);
      });
      // Immediate invoke
      callback(this.getCurrentUser());
    }
  };

  // ==========================================
  // CHALLENGES SERVICE
  // ==========================================
  const dbChallenges = {
    async getAll(includeHidden = false) {
      if (fbDb) {
        try {
          const remoteList = await getCollectionFromFirestore('challenges');
          if (remoteList && remoteList.length > 0) {
            remoteList.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
            dbChallengesList = remoteList;
            try {
              localStorage.setItem('cybertrix_challenges', JSON.stringify(remoteList));
            } catch(e){}
          }
        } catch(e) {}
      }
      dbChallengesList = loadFromStorage('challenges', DEFAULT_CHALLENGES);
      let list = includeHidden ? [...dbChallengesList] : dbChallengesList.filter(c => c.status !== 'HIDDEN' && c.enabled !== false);
      // Sort challenges explicitly by order field (Requirement 9)
      list.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));

      if (includeHidden) {
        const virtualTasks = [
          {
            id: 'mirror-keyboard-1',
            title: 'Mirror Keyboard — Task 1',
            type: 'mirror-keyboard',
            category: 'CRYPTO',
            difficulty: 'EASY',
            points: 100,
            order: 1,
            targetWord: 'PYTHON',
            targetSentence: 'The cyber world rewards careful thinking.',
            status: 'ACTIVE',
            enabled: true
          },
          {
            id: 'mirror-keyboard-2',
            title: 'Mirror Keyboard — Task 2',
            type: 'mirror-keyboard',
            category: 'CRYPTO',
            difficulty: 'EASY',
            points: 100,
            order: 2,
            targetWord: 'CIPHER',
            targetSentence: 'Encrypt your data and defend the network.',
            status: 'ACTIVE',
            enabled: true
          },
          {
            id: 'mirror-keyboard-3',
            title: 'Mirror Keyboard — Task 3',
            type: 'mirror-keyboard',
            category: 'CRYPTO',
            difficulty: 'EASY',
            points: 100,
            order: 3,
            targetWord: 'NETWORK',
            targetSentence: 'Knowledge is the ultimate shield in combat.',
            status: 'ACTIVE',
            enabled: true
          },
          {
            id: 'ascii-hunt-1',
            title: 'ASCII Value Finding — Task 1',
            type: 'ascii-hunt',
            category: 'CRYPTO',
            difficulty: 'MEDIUM',
            points: 200,
            order: 5,
            asciiValues: '43 59 42 45 52 21',
            targetWord: 'CYBER!',
            status: 'ACTIVE',
            enabled: true
          },
          {
            id: 'ascii-hunt-2',
            title: 'ASCII Value Finding — Task 2',
            type: 'ascii-hunt',
            category: 'CRYPTO',
            difficulty: 'MEDIUM',
            points: 200,
            order: 6,
            asciiValues: '53 33 63 75 72 31 74 79 23',
            targetWord: 'S3cur1ty#',
            status: 'ACTIVE',
            enabled: true
          }
        ];
        virtualTasks.forEach(vt => {
          if (!list.some(c => c.id === vt.id)) {
            list.push(vt);
          }
        });
      }

      // Requirement 10 & 20: Strip secret flag, secretContent, hiddenAnswer from public payload
      if (!dbAuth.isAdmin()) {
        return list.map(c => {
          const { flag, secretContent, hiddenAnswer, answer, ...safe } = c;
          if (Array.isArray(safe.subtasks)) {
            safe.subtasks = safe.subtasks.map(st => {
              const { flag: stFlag, answer: stAnswer, ...safeSt } = st;
              return safeSt;
            });
          }
          return safe;
        });
      }
      return list;
    },

    getAllSync(includeHidden = false) {
      dbChallengesList = loadFromStorage('challenges', DEFAULT_CHALLENGES);
      let list = includeHidden ? [...dbChallengesList] : dbChallengesList.filter(c => c.status !== 'HIDDEN' && c.enabled !== false);
      list.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
      if (!dbAuth.isAdmin()) {
        return list.map(c => {
          const isHv = c.id === 'hidden-vault' || c.type === 'hidden-vault';
          const { flag, secretContent, hiddenAnswer, answer, ...safe } = c;
          if (isHv && flag) {
            safe.flag = flag;
          }
          if (Array.isArray(safe.subtasks)) {
            safe.subtasks = safe.subtasks.map(st => {
              const { flag: stFlag, answer: stAnswer, ...safeSt } = st;
              return safeSt;
            });
          }
          return safe;
        });
      }
      return list;
    },

    async getById(id) {
      if (fbDb) {
        try {
          const remoteCh = await getDocFromFirestore('challenges', id);
          if (remoteCh) {
            const idx = dbChallengesList.findIndex(c => c.id === id);
            if (idx !== -1) dbChallengesList[idx] = { ...dbChallengesList[idx], ...remoteCh };
            else dbChallengesList.push(remoteCh);
          }
        } catch(e) {}
      }
      dbChallengesList = loadFromStorage('challenges', DEFAULT_CHALLENGES);
      let ch = dbChallengesList.find(c => c.id === id);
      if (!ch) {
        if (id === 'mirror-keyboard-1') ch = { id: 'mirror-keyboard-1', title: 'Mirror Keyboard — Task 1', type: 'mirror-keyboard', category: 'CRYPTO', difficulty: 'EASY', points: 100, targetWord: 'PYTHON', targetSentence: 'The cyber world rewards careful thinking.', status: 'ACTIVE', enabled: true };
        else if (id === 'mirror-keyboard-2') ch = { id: 'mirror-keyboard-2', title: 'Mirror Keyboard — Task 2', type: 'mirror-keyboard', category: 'CRYPTO', difficulty: 'EASY', points: 100, targetWord: 'CIPHER', targetSentence: 'Encrypt your data and defend the network.', status: 'ACTIVE', enabled: true };
        else if (id === 'mirror-keyboard-3') ch = { id: 'mirror-keyboard-3', title: 'Mirror Keyboard — Task 3', type: 'mirror-keyboard', category: 'CRYPTO', difficulty: 'EASY', points: 100, targetWord: 'NETWORK', targetSentence: 'Knowledge is the ultimate shield in combat.', status: 'ACTIVE', enabled: true };
        else if (id === 'ascii-hunt-1') ch = { id: 'ascii-hunt-1', title: 'ASCII Value Finding — Task 1', type: 'ascii-hunt', category: 'CRYPTO', difficulty: 'MEDIUM', points: 200, asciiValues: '43 59 42 45 52 21', targetWord: 'CYBER!', status: 'ACTIVE', enabled: true };
        else if (id === 'ascii-hunt-2') ch = { id: 'ascii-hunt-2', title: 'ASCII Value Finding — Task 2', type: 'ascii-hunt', category: 'CRYPTO', difficulty: 'MEDIUM', points: 200, asciiValues: '53 33 63 75 72 31 74 79 23', targetWord: 'S3cur1ty#', status: 'ACTIVE', enabled: true };
      }
      if (!ch) return null;
      if (!dbAuth.isAdmin()) {
        const { flag, secretContent, hiddenAnswer, answer, ...safe } = ch;
        if (Array.isArray(safe.subtasks)) {
          safe.subtasks = safe.subtasks.map(st => {
            const { flag: stFlag, answer: stAnswer, ...safeSt } = st;
            return safeSt;
          });
        }
        return safe;
      }
      return ch;
    },

    async getSecret(id) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required to access secrets.");
      if (fbDb) {
        try {
          const remoteSec = await getDocFromFirestore('challengeSecrets', id);
          if (remoteSec) {
            dbChallengeSecrets[id] = remoteSec;
            return remoteSec;
          }
        } catch(e) {}
      }
      dbChallengeSecrets = loadFromStorage('challenge_secrets', DEFAULT_CHALLENGE_SECRETS);
      return dbChallengeSecrets[id] || { flag: '', answer: '', secretContent: '' };
    },

    async revealVaultSecret(challengeId, vaultKeyword) {
      const user = dbAuth.getCurrentUser();
      if (!user) throw new Error("Authentication required.");

      dbChallengesList = loadFromStorage('challenges', DEFAULT_CHALLENGES);
      const ch = dbChallengesList.find(c => c.id === challengeId);
      if (!ch) throw new Error("Challenge not found.");

      const expectedKeyword = (ch.vaultPassword || ch.vaultKeyword || 'VAULT').trim().toUpperCase();
      const providedKeyword = (vaultKeyword || '').trim().toUpperCase();

      if (providedKeyword !== expectedKeyword) {
        throw new Error("INVALID VAULT PASSWORD // ACCESS DENIED");
      }

      let flag = null;
      if (fbDb) {
        try {
          const hvDoc = await getDocFromFirestore('hiddenVault', 'config');
          if (hvDoc && hvDoc.evidenceFlag) {
            flag = hvDoc.evidenceFlag.trim();
          }
        } catch(e) {}
      }

      if (!flag) {
        dbChallengeSecrets = loadFromStorage('challenge_secrets', DEFAULT_CHALLENGE_SECRETS);
        const secretObj = dbChallengeSecrets[challengeId] || DEFAULT_CHALLENGE_SECRETS["hidden-vault"] || {};
        flag = (secretObj.flag || ch.flag || "CYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}").trim();
      }
      
      const defaultEvidenceContent = `================================================================================
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

[CLASSIFIED FORENSICS INTEL // RECOVERED EVIDENCE]
During the forensic audit of the compromised storage node, field agents
discovered that sensitive incident tokens were archived deep inside this
stealth container.

The recovered root clearance token is preserved below:
--------------------------------------------------------------------------------
RECOVERED MISSION FLAG TOKEN:
${flag}
--------------------------------------------------------------------------------

[SUBMISSION PROTOCOL]
Operatives must extract the verified flag token from this file, enter it into
the universal flag submission terminal below, and verify it to claim points.

================================================================================
[TRANSMISSION TERMINATED // SEC-09 FORENSICS ENGINE LIVE]
================================================================================`;

      const rawContent = (ch.evidenceContent !== undefined && ch.evidenceContent !== null)
        ? ch.evidenceContent
        : ((ch.hiddenFiles && ch.hiddenFiles[0] && ch.hiddenFiles[0].content !== undefined)
            ? ch.hiddenFiles[0].content
            : (secretObj.secretContent || defaultEvidenceContent));
      let finalMsgContent = rawContent;
      if (flag) {
        if (finalMsgContent && /CYBERTRIX\{[^}]+\}/i.test(finalMsgContent)) {
          finalMsgContent = finalMsgContent.replace(/CYBERTRIX\{[^}]+\}/gi, flag);
        } else if (finalMsgContent && /^flag\s*:/i.test(finalMsgContent.trim())) {
          finalMsgContent = `flag:${flag}`;
        } else if (!finalMsgContent || finalMsgContent === defaultEvidenceContent) {
          finalMsgContent = `flag:${flag}`;
        }
      }
      if (/^CYBERTRIX\{[^}]+\}$/i.test(finalMsgContent.trim())) {
        finalMsgContent = `flag:${finalMsgContent.trim()}`;
      }

      const hiddenDir = ch.hiddenDirectory || "";
      const defaultHidden = [
        {
          name: "evidence.txt",
          size: "1.9 KB",
          content: finalMsgContent,
          type: "CLASSIFIED",
          enabled: ch.evidenceEnabled !== false
        }
      ];

      const rawHidden = (ch.hiddenFiles && ch.hiddenFiles.length > 0) ? ch.hiddenFiles : defaultHidden;
      const hiddenFiles = rawHidden.map(f => {
        const isEvidence = f.name === 'evidence.txt' || f.name === '.hidden' || f.name.includes('evidence') || f.name.includes('final');
        if (isEvidence) {
          let c = (ch.evidenceContent !== undefined && ch.evidenceContent !== null)
            ? ch.evidenceContent
            : (f.content !== undefined ? f.content : finalMsgContent);
          if (flag) {
            if (c && /CYBERTRIX\{[^}]+\}/i.test(c)) {
              c = c.replace(/CYBERTRIX\{[^}]+\}/gi, flag);
            } else if (c && /^flag\s*:/i.test(c.trim())) {
              c = `flag:${flag}`;
            } else if (!c || c === defaultEvidenceContent) {
              c = `flag:${flag}`;
            }
          }
          if (/^CYBERTRIX\{[^}]+\}$/i.test(c.trim())) {
            c = `flag:${c.trim()}`;
          }
          return {
            ...f,
            name: 'evidence.txt',
            content: c,
            enabled: ch.evidenceEnabled !== false && f.enabled !== false
          };
        }
        return f;
      });

      return {
        success: true,
        hiddenDirectory: hiddenDir,
        hiddenFiles: hiddenFiles,
        fileName: ch.secretFileName || "evidence.txt",
        fileTitle: ch.secretFileTitle || "CYBERTRIX SECURE VAULT // evidence.txt",
        secretContent: finalMsgContent,
        flag: flag
      };
    },

    async verifyMirrorAnswer(challengeId, submittedAnswer) {
      const user = dbAuth.getCurrentUser();
      if (!user) throw new Error("Authentication required.");

      if (user.active === false || user.disabled === true || user.status === 'disabled') {
        throw new Error("Your CYBERTRIX account has been disabled by the administrator.");
      }

      const timerConfig = await dbTimer.getTimerConfig();
      if (!timerConfig.enabled || timerConfig.status === 'ENDED') {
        throw new Error("CTF EVENT IS CLOSED.");
      }

      dbChallengesList = loadFromStorage('challenges', DEFAULT_CHALLENGES);
      const ch = dbChallengesList.find(c => c.id === challengeId);
      if (!ch) throw new Error("Challenge not found.");
      if (ch.status === 'LOCKED' || ch.enabled === false) {
        throw new Error("Challenge is currently unavailable.");
      }

      // Check timer attempt
      if (ch.timerEnabled !== false && ch.timerSeconds && ch.timerSeconds > 0) {
        const attempts = loadFromStorage('challenge_attempts', {});
        const attemptKey = `${user.uid}_${challengeId}`;
        const attempt = attempts[attemptKey];
        if (attempt) {
          if (attempt.status === 'paused') {
            throw new Error("CHALLENGE PAUSED: Please resume timer before submitting.");
          }
          if (attempt.status === 'expired' || (attempt.expiresAt && Date.now() >= new Date(attempt.expiresAt).getTime())) {
            throw new Error("TIME EXPIRED: Submission closed for this attempt. Please restart challenge.");
          }
        }
      }

      dbChallengeSecrets = loadFromStorage('challenge_secrets', DEFAULT_CHALLENGE_SECRETS);
      const secret = dbChallengeSecrets[challengeId] || {};
      const expectedSentence = (secret.targetSentence || secret.answer || "World, Hello!").trim();
      const rawInput = (submittedAnswer || '');

      if (!rawInput.trim()) {
        return { success: false, message: "INCORRECT — TRY AGAIN" };
      }

      const caseSensitive = (secret.caseSensitive !== undefined) ? !!secret.caseSensitive : (ch.caseSensitive !== undefined ? !!ch.caseSensitive : false);
      const ignoreExtraSpaces = (secret.ignoreExtraSpaces !== undefined) ? !!secret.ignoreExtraSpaces : (ch.ignoreExtraSpaces !== undefined ? !!ch.ignoreExtraSpaces : true);
      const trimSpaces = (secret.trimSpaces !== undefined) ? !!secret.trimSpaces : (ch.trimSpaces !== undefined ? !!ch.trimSpaces : true);

      let p = rawInput;
      let exp = expectedSentence;

      if (trimSpaces) {
        p = p.trim();
        exp = exp.trim();
      }
      if (ignoreExtraSpaces) {
        p = p.replace(/\s+/g, ' ');
        exp = exp.replace(/\s+/g, ' ');
      }

      let isMatch = false;
      if (caseSensitive) {
        isMatch = (p === exp);
      } else {
        isMatch = (p.toLowerCase() === exp.toLowerCase());
      }

      if (!isMatch && ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'")))) {
        const unquoted = p.slice(1, -1).trim();
        isMatch = caseSensitive ? (unquoted === exp) : (unquoted.toLowerCase() === exp.toLowerCase());
      }

      if (!isMatch && !caseSensitive && Array.isArray(secret.aliases)) {
        for (const alias of secret.aliases) {
          let a = String(alias);
          if (trimSpaces) a = a.trim();
          if (ignoreExtraSpaces) a = a.replace(/\s+/g, ' ');
          if (p.toLowerCase() === a.toLowerCase()) {
            isMatch = true;
            break;
          }
        }
      }

      if (isMatch) {
        const flag = (secret.flag || `CYBERTRIX{${expectedSentence}}`).trim();
        const flagEnabled = (secret.flagEnabled !== false && ch.flagEnabled !== false);
        return {
          success: true,
          message: "CORRECT SENTENCE DECODED!",
          flag: flag,
          flagEnabled: flagEnabled
        };
      } else {
        return {
          success: false,
          message: "INCORRECT — TRY AGAIN"
        };
      }
    },

    async create(data) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      dbChallengesList = loadFromStorage('challenges', DEFAULT_CHALLENGES);
      dbChallengeSecrets = loadFromStorage('challenge_secrets', DEFAULT_CHALLENGE_SECRETS);

      const newId = (data.id || ("ch_" + Date.now().toString(36))).trim();
      const newCh = {
        id: newId,
        title: data.title.trim(),
        type: data.type || (newId === 'mirror-keyboard' ? 'mirror-keyboard' : 'standard'),
        category: (data.category || 'CRYPTO').toUpperCase(),
        difficulty: (data.difficulty || 'EASY').toUpperCase(),
        points: parseInt(data.points) || 100,
        order: parseInt(data.order) || (dbChallengesList.length + 1),
        targetWord: data.targetWord ? data.targetWord.trim() : (data.type === 'mirror-keyboard' ? 'PYTHON' : ''),
        asciiValues: data.asciiValues ? data.asciiValues.trim() : (data.type === 'ascii-hunt' ? '67 89 66 69 82' : ''),
        vaultPassword: data.vaultPassword ? data.vaultPassword.trim().toUpperCase() : (data.vaultKeyword ? data.vaultKeyword.trim().toUpperCase() : 'VAULT'),
        vaultKeyword: data.vaultPassword ? data.vaultPassword.trim().toUpperCase() : (data.vaultKeyword ? data.vaultKeyword.trim().toUpperCase() : 'VAULT'),
        cipherSequence: data.cipherSequence ? data.cipherSequence.trim() : '56 41 55 4C 54',
        logoUrl: data.logoUrl ? data.logoUrl.trim() : 'assets/logo/logo.svg',
        logoAnimation: data.logoAnimation ? data.logoAnimation.trim() : 'glitch-decrypt',
        fakeFiles: data.fakeFiles || [
          { name: "readme.txt", size: "1.2 KB", content: "CYBERTRIX SECURE VAULT v4.2" },
          { name: "system.log", size: "2.8 KB", content: "[SYS_LOG] 09:14:24 File access recorded: vault.dat" },
          { name: "notes.txt", size: "0.9 KB", content: "CONFIDENTIAL OPERATOR NOTES" }
        ],
        hiddenDirectory: data.hiddenDirectory || '',
        hiddenFiles: data.hiddenFiles || [
          { name: ".hidden", size: "1.1 KB", content: "FLAG: " + (data.flag || 'CYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}') }
        ],
        secretFileName: data.secretFileName ? data.secretFileName.trim() : '.hidden',
        secretFileTitle: data.secretFileTitle ? data.secretFileTitle.trim() : 'CYBERTRIX SECURE VAULT // .hidden',
        successMessage: data.successMessage ? data.successMessage.trim() : 'OPERATION COMPLETE // +250 POINTS AWARDED // STATUS: SOLVED ✓',
        imageUrl: data.imageUrl ? data.imageUrl.trim() : (data.type === 'metadata-ghost' ? 'assets/metadata-ghost-01.png' : ''),
        timerEnabled: data.timerEnabled !== false,
        timerSeconds: data.timerSeconds ? parseInt(data.timerSeconds, 10) : (data.type === 'metadata-ghost' ? 600 : 0),
        caseSensitive: !!data.caseSensitive,
        description: data.description || '',
        hint1: data.hint1 || data.hint || '',
        hint2: data.hint2 || '',
        hint3: data.hint3 || '',
        status: data.status || 'ACTIVE',
        enabled: data.enabled !== false && data.status !== 'HIDDEN',
        ...(Array.isArray(data.subtasks) ? { subtasks: data.subtasks } : {}),
        createdAt: new Date().toISOString()
      };

      if (data.flag || data.hiddenAnswer || data.answer || data.secretContent || data.subtaskSecrets) {
        dbChallengeSecrets[newId] = {
          flag: data.flag ? data.flag.trim() : '',
          answer: data.hiddenAnswer ? data.hiddenAnswer.trim() : (data.answer ? data.answer.trim() : ''),
          secretContent: data.secretContent ? data.secretContent.trim() : '',
          ...(data.subtaskSecrets && typeof data.subtaskSecrets === 'object' ? { subtasks: data.subtaskSecrets } : {})
        };
        saveToStorage('challenge_secrets', dbChallengeSecrets);
      }

      dbChallengesList.push(newCh);
      dbChallengesList.sort((a, b) => (a.order || 1) - (b.order || 1));
      saveToStorage('challenges', dbChallengesList);
      return newCh;
    },

    async update(id, updates) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      dbChallengesList = loadFromStorage('challenges', DEFAULT_CHALLENGES);
      dbChallengeSecrets = loadFromStorage('challenge_secrets', DEFAULT_CHALLENGE_SECRETS);
      const index = dbChallengesList.findIndex(c => c.id === id);
      if (index === -1) throw new Error("Challenge not found.");

      const current = dbChallengesList[index];
      const updatedEvidenceContent = updates.evidenceContent !== undefined
        ? updates.evidenceContent
        : (updates.hiddenFiles && updates.hiddenFiles[0] && updates.hiddenFiles[0].content !== undefined
            ? updates.hiddenFiles[0].content
            : current.evidenceContent);

      let updatedHiddenFiles = updates.hiddenFiles !== undefined ? updates.hiddenFiles : (current.hiddenFiles ? JSON.parse(JSON.stringify(current.hiddenFiles)) : undefined);
      if (updatedHiddenFiles && updatedHiddenFiles[0] && updatedEvidenceContent !== undefined) {
        updatedHiddenFiles[0].content = updatedEvidenceContent;
        if (updates.evidenceEnabled !== undefined) {
          updatedHiddenFiles[0].enabled = !!updates.evidenceEnabled;
        }
      }

      dbChallengesList[index] = {
        ...current,
        ...updates,
        evidenceContent: updatedEvidenceContent,
        flag: updates.flag !== undefined ? updates.flag.trim() : (current.flag || 'CYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}'),
        title: updates.title !== undefined ? updates.title.trim() : current.title,
        order: updates.order !== undefined ? parseInt(updates.order) : (current.order || 1),
        targetWord: updates.targetWord !== undefined ? updates.targetWord.trim() : (current.targetWord || 'PYTHON'),
        targetSentence: updates.targetSentence !== undefined ? updates.targetSentence.trim() : (updates.targetWord !== undefined ? updates.targetWord.trim() : (current.targetSentence || current.targetWord || 'PYTHON')),
        asciiValues: updates.asciiValues !== undefined ? updates.asciiValues.trim() : (current.asciiValues || '67 89 66 69 82'),
        asciiHex: updates.asciiHex !== undefined ? updates.asciiHex.trim() : (updates.asciiValues !== undefined ? updates.asciiValues.trim() : (current.asciiHex || current.asciiValues || '43 59 42 45 52 21')),
        vaultPassword: updates.vaultPassword !== undefined ? updates.vaultPassword.trim().toUpperCase() : (updates.vaultKeyword !== undefined ? updates.vaultKeyword.trim().toUpperCase() : (current.vaultPassword || current.vaultKeyword || 'VAULT')),
        vaultKeyword: updates.vaultPassword !== undefined ? updates.vaultPassword.trim().toUpperCase() : (updates.vaultKeyword !== undefined ? updates.vaultKeyword.trim().toUpperCase() : (current.vaultKeyword || current.vaultPassword || 'VAULT')),
        cipherSequence: updates.cipherSequence !== undefined ? updates.cipherSequence.trim() : (current.cipherSequence || '56 41 55 4C 54'),
        logoUrl: updates.logoUrl !== undefined ? updates.logoUrl.trim() : (current.logoUrl || 'assets/logo/logo.svg'),
        logoAnimation: updates.logoAnimation !== undefined ? updates.logoAnimation.trim() : (current.logoAnimation || 'glitch-decrypt'),
        fakeFiles: updates.fakeFiles !== undefined ? updates.fakeFiles : current.fakeFiles,
        hiddenDirectory: updates.hiddenDirectory !== undefined ? updates.hiddenDirectory.trim() : (current.hiddenDirectory || ''),
        hiddenFiles: updatedHiddenFiles !== undefined ? updatedHiddenFiles : current.hiddenFiles,
        secretFileName: updates.secretFileName !== undefined ? updates.secretFileName.trim() : (current.secretFileName || 'evidence.txt'),
        secretFileTitle: updates.secretFileTitle !== undefined ? updates.secretFileTitle.trim() : (current.secretFileTitle || 'CYBERTRIX SECURE VAULT // evidence.txt'),
        successMessage: updates.successMessage !== undefined ? updates.successMessage.trim() : (current.successMessage || 'OPERATION COMPLETE // +250 POINTS AWARDED // STATUS: SOLVED ✓'),
        imageUrl: updates.imageUrl !== undefined ? updates.imageUrl.trim() : (current.imageUrl || ''),
        timerEnabled: updates.timerEnabled !== undefined ? !!updates.timerEnabled : (current.timerEnabled !== false),
        timerSeconds: updates.timerSeconds !== undefined ? parseInt(updates.timerSeconds, 10) : (current.timerSeconds || 0),
        points: updates.points !== undefined ? parseInt(updates.points) : current.points,
        category: updates.category !== undefined ? updates.category.trim() : current.category,
        difficulty: updates.difficulty !== undefined ? updates.difficulty.trim() : current.difficulty,
        description: updates.description !== undefined ? updates.description.trim() : (updates.question !== undefined ? updates.question.trim() : current.description),
        question: updates.question !== undefined ? updates.question.trim() : (updates.description !== undefined ? updates.description.trim() : (current.question || current.description)),
        mission: updates.mission !== undefined ? updates.mission.trim() : (current.mission || updates.description || updates.question || ''),
        caseSensitive: updates.caseSensitive !== undefined ? !!updates.caseSensitive : !!current.caseSensitive,
        ignoreExtraSpaces: updates.ignoreExtraSpaces !== undefined ? !!updates.ignoreExtraSpaces : (current.ignoreExtraSpaces !== undefined ? !!current.ignoreExtraSpaces : true),
        trimSpaces: updates.trimSpaces !== undefined ? !!updates.trimSpaces : (current.trimSpaces !== undefined ? !!current.trimSpaces : true),
        flagEnabled: updates.flagEnabled !== undefined ? !!updates.flagEnabled : (current.flagEnabled !== undefined ? !!current.flagEnabled : true),
        evidenceEnabled: updates.evidenceEnabled !== undefined ? !!updates.evidenceEnabled : (current.evidenceEnabled !== false),
        isLocked: updates.isLocked !== undefined ? !!updates.isLocked : (updates.status === 'LOCKED' ? true : !!current.isLocked),
        adminLocked: updates.adminLocked !== undefined ? !!updates.adminLocked : (updates.status === 'LOCKED' ? true : !!current.adminLocked),
        status: updates.status !== undefined ? updates.status : (updates.isLocked ? 'LOCKED' : (current.status || 'ACTIVE')),
        mirroredSentence: updates.mirroredSentence !== undefined ? updates.mirroredSentence : (current.mirroredSentence || "!olleH ,dlroW"),
        hint1: updates.hint1 !== undefined ? updates.hint1.trim() : (current.hint1 || ''),
        hint2: updates.hint2 !== undefined ? updates.hint2.trim() : (current.hint2 || ''),
        hint3: updates.hint3 !== undefined ? updates.hint3.trim() : (current.hint3 || ''),
        enabled: updates.enabled !== undefined ? !!updates.enabled : (updates.status ? updates.status !== 'HIDDEN' : current.enabled),
        updatedAt: new Date().toISOString()
      };

      if (updates.question !== undefined) {
        const qTrim = updates.question.trim();
        dbChallengesList[index].question = qTrim;
        if (!updates.description) dbChallengesList[index].description = qTrim;
        if (Array.isArray(dbChallengesList[index].subtasks) && dbChallengesList[index].subtasks[0] && !dbChallengesList[index].subtasks[0].question) {
          dbChallengesList[index].subtasks[0].question = qTrim;
          dbChallengesList[index].subtasks[0].description = qTrim;
        }
      }

      if (updates.subtasks !== undefined) {
        if (Array.isArray(updates.subtasks)) {
          dbChallengesList[index].subtasks = updates.subtasks;
          if (updates.points === undefined) {
            dbChallengesList[index].points = updates.subtasks.reduce((sum, st) => sum + (Number(st.points) || 0), 0);
          }
        } else if (updates.subtasks === null || updates.subtasks === false) {
          delete dbChallengesList[index].subtasks;
        }
      }

      if (updates.mirrorWord !== undefined) {
        const mw = String(updates.mirrorWord).trim();
        dbChallengesList[index].mirrorWord = mw;
        dbChallengesList[index].mirroredSentence = mw;
        if (Array.isArray(dbChallengesList[index].subtasks) && dbChallengesList[index].subtasks[0]) {
          dbChallengesList[index].subtasks[0].mirrorWord = mw;
          if (updates.targetSentence) {
            dbChallengesList[index].subtasks[0].targetSentence = updates.targetSentence.trim();
            dbChallengesList[index].subtasks[0].targetWord = updates.targetSentence.trim();
            dbChallengesList[index].subtasks[0].answer = updates.targetSentence.trim();
          }
        }
      }

      dbChallengesList.sort((a, b) => (a.order || 1) - (b.order || 1));
      saveToStorage('challenges', dbChallengesList);

      if (updates.flag !== undefined || updates.targetSentence !== undefined || updates.hiddenAnswer !== undefined || updates.answer !== undefined || updates.secretContent !== undefined || updates.evidenceContent !== undefined || updates.subtaskSecrets) {
        if (!dbChallengeSecrets[id]) dbChallengeSecrets[id] = {};
        if (updates.flag !== undefined) dbChallengeSecrets[id].flag = updates.flag.trim();
        if (updates.targetSentence !== undefined) {
          const ts = updates.targetSentence.trim();
          dbChallengeSecrets[id].targetSentence = ts;
          dbChallengeSecrets[id].answer = ts;
          const flg = (updates.flag || dbChallengeSecrets[id].flag || `CYBERTRIX{${ts}}`).trim();
          const isCase = updates.caseSensitive !== undefined ? !!updates.caseSensitive : (dbChallengeSecrets[id].caseSensitive !== undefined ? !!dbChallengeSecrets[id].caseSensitive : !!current.caseSensitive);
          dbChallengeSecrets[id].aliases = isCase ? [
            ts,
            flg,
            `CYBERTRIX{${ts}}`
          ] : [
            ts,
            ts.toUpperCase(),
            ts.toLowerCase(),
            flg,
            flg.toUpperCase(),
            `CYBERTRIX{${ts}}`,
            `CYBERTRIX{${ts.toUpperCase()}}`,
            "The cyber world rewards careful thinking.",
            "THE CYBER WORLD REWARDS CAREFUL THINKING",
            "CYBERTRIX{The cyber world rewards careful thinking.}",
            "CYBERTRIX{PYTHON}",
            "PYTHON"
          ];
          if (!dbChallengeSecrets[id].subtasks) dbChallengeSecrets[id].subtasks = {};
          if (!dbChallengeSecrets[id].subtasks['task_1']) dbChallengeSecrets[id].subtasks['task_1'] = {};
          dbChallengeSecrets[id].subtasks['task_1'].targetSentence = ts;
          dbChallengeSecrets[id].subtasks['task_1'].targetWord = ts;
          dbChallengeSecrets[id].subtasks['task_1'].answer = ts;
          dbChallengeSecrets[id].subtasks['task_1'].flag = flg;
          dbChallengeSecrets[id].subtasks['task_1'].aliases = isCase ? [ts, flg, `CYBERTRIX{${ts}}`] : [ts, ts.toUpperCase(), ts.toLowerCase(), flg, flg.toUpperCase(), `CYBERTRIX{${ts}}`, `CYBERTRIX{${ts.toUpperCase()}}`];
        }
        if (updates.caseSensitive !== undefined) dbChallengeSecrets[id].caseSensitive = !!updates.caseSensitive;
        if (updates.ignoreExtraSpaces !== undefined) dbChallengeSecrets[id].ignoreExtraSpaces = !!updates.ignoreExtraSpaces;
        if (updates.trimSpaces !== undefined) dbChallengeSecrets[id].trimSpaces = !!updates.trimSpaces;
        if (updates.question !== undefined) dbChallengeSecrets[id].question = updates.question.trim();
        if (updates.vaultPassword !== undefined || updates.vaultKeyword !== undefined) {
          const vk = (updates.vaultPassword || updates.vaultKeyword || '').trim().toUpperCase();
          dbChallengeSecrets[id].vaultPassword = vk;
          dbChallengeSecrets[id].vaultKeyword = vk;
        }
        if (updates.cipherSequence !== undefined || updates.accessCode !== undefined) {
          const cs = (updates.cipherSequence || updates.accessCode || '').trim();
          dbChallengeSecrets[id].cipherSequence = cs;
          dbChallengeSecrets[id].accessCode = cs;
        }
        if (updates.flagEnabled !== undefined) dbChallengeSecrets[id].flagEnabled = !!updates.flagEnabled;
        if (updates.hiddenAnswer !== undefined) dbChallengeSecrets[id].answer = updates.hiddenAnswer.trim();
        else if (updates.answer !== undefined && updates.targetSentence === undefined) dbChallengeSecrets[id].answer = updates.answer.trim();
        if (updates.mirrorWord !== undefined) {
          const mw = String(updates.mirrorWord).trim();
          dbChallengeSecrets[id].mirrorWord = mw;
          if (dbChallengeSecrets[id].subtasks && dbChallengeSecrets[id].subtasks['task_1']) {
            dbChallengeSecrets[id].subtasks['task_1'].mirrorWord = mw;
          }
        }
        if (updates.secretContent !== undefined) dbChallengeSecrets[id].secretContent = updates.secretContent.trim();
        else if (updatedEvidenceContent !== undefined) dbChallengeSecrets[id].secretContent = String(updatedEvidenceContent).trim();
        if (updates.subtasks && Array.isArray(updates.subtasks)) {
          if (!dbChallengeSecrets[id].subtasks) dbChallengeSecrets[id].subtasks = {};
          updates.subtasks.forEach(st => {
            if (!st || !st.id) return;
            const ascHex = (st.asciiHex || st.asciiValues || '').trim();
            let decodedAscii = '';
            if (ascHex) {
              try {
                decodedAscii = ascHex.split(/\s+/).filter(Boolean).map(h => {
                  if (/^[0-9]+$/.test(h) && !/^[0-9A-Fa-f]{2}$/.test(h)) return String.fromCharCode(parseInt(h, 10));
                  return String.fromCharCode(parseInt(h, 16));
                }).join('').trim();
              } catch (e) {}
            }
            const ans = (st.answer || st.targetSentence || st.targetWord || decodedAscii || '').trim();
            const flg = (st.flag || `CYBERTRIX{${ans}}`).trim();
            const mw = (st.mirrorWord || '').trim();
            if (ans || ascHex) {
              dbChallengeSecrets[id].subtasks[st.id] = {
                ...(dbChallengeSecrets[id].subtasks[st.id] || {}),
                answer: ans,
                targetSentence: ans,
                targetWord: ans,
                asciiHex: ascHex,
                asciiValues: ascHex,
                flag: flg,
                mirrorWord: mw,
                aliases: [ans, ans.toUpperCase(), ans.toLowerCase(), flg, flg.toUpperCase(), `CYBERTRIX{${ans}}`, `CYBERTRIX{${ans.toUpperCase()}}`, mw, mw.toUpperCase(), decodedAscii, decodedAscii.toUpperCase()].filter(Boolean)
              };
            }
          });
        }
        if (updates.subtaskSecrets && typeof updates.subtaskSecrets === 'object') {
          if (!dbChallengeSecrets[id].subtasks) dbChallengeSecrets[id].subtasks = {};
          Object.keys(updates.subtaskSecrets).forEach(stId => {
            dbChallengeSecrets[id].subtasks[stId] = {
              ...(dbChallengeSecrets[id].subtasks[stId] || {}),
              ...updates.subtaskSecrets[stId]
            };
          });
        }
        saveToStorage('challenge_secrets', dbChallengeSecrets);
      }

      return dbChallengesList.find(c => c.id === id);
    },

    async toggleLock(id, isLocked) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      dbChallengesList = loadFromStorage('challenges', DEFAULT_CHALLENGES);
      const index = dbChallengesList.findIndex(c => c.id === id);
      if (index === -1) throw new Error("Challenge not found.");

      const lockState = Boolean(isLocked);
      dbChallengesList[index].isLocked = lockState;
      dbChallengesList[index].adminLocked = lockState;
      if (lockState) {
        dbChallengesList[index].status = 'LOCKED';
      } else if (dbChallengesList[index].status === 'LOCKED') {
        dbChallengesList[index].status = 'ACTIVE';
      }
      dbChallengesList[index].updatedAt = new Date().toISOString();
      saveToStorage('challenges', dbChallengesList);
      return dbChallengesList[index];
    },

    async reorder(id, direction) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      dbChallengesList = loadFromStorage('challenges', DEFAULT_CHALLENGES);
      dbChallengesList = dbChallengesList.filter(c => !c.id.match(/^mirror-keyboard-\d+$/) && !c.id.match(/^ascii-hunt-\d+$/));
      dbChallengesList.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));

      const idx = dbChallengesList.findIndex(c => c.id === id);
      if (idx === -1) throw new Error("Challenge not found.");

      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= dbChallengesList.length) return [...dbChallengesList];

      const temp = dbChallengesList[idx];
      dbChallengesList[idx] = dbChallengesList[targetIdx];
      dbChallengesList[targetIdx] = temp;

      // Assign sequential order
      dbChallengesList.forEach((c, i) => {
        c.order = i + 1;
      });

      saveToStorage('challenges', dbChallengesList);
      return [...dbChallengesList];
    },

    async updateOrder(orderedIds) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      dbChallengesList = loadFromStorage('challenges', DEFAULT_CHALLENGES);
      orderedIds.forEach((id, idx) => {
        const item = dbChallengesList.find(c => c.id === id);
        if (item) item.order = idx + 1;
      });
      dbChallengesList.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
      saveToStorage('challenges', dbChallengesList);
      return [...dbChallengesList];
    },

    async delete(id) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      if (fbDb) {
        await deleteDocFromFirestore('challenges', id);
        await deleteDocFromFirestore('challengeSecrets', id);
      }
      dbChallengesList = loadFromStorage('challenges', DEFAULT_CHALLENGES);
      dbChallengesList = dbChallengesList.filter(c => c.id !== id);
      saveToStorage('challenges', dbChallengesList);
      return true;
    },

    onSnapshot(callback) {
      const handler = () => {
        const list = loadFromStorage('challenges', DEFAULT_CHALLENGES).filter(c => c.status !== 'HIDDEN' && c.enabled !== false);
        list.sort((a, b) => (a.order || 1) - (b.order || 1));
        if (!dbAuth.isAdmin()) {
          callback(list.map(c => {
            const { flag, secretContent, hiddenAnswer, answer, ...safe } = c;
            if (Array.isArray(safe.subtasks)) {
              safe.subtasks = safe.subtasks.map(st => {
                const { flag: stFlag, answer: stAnswer, ...safeSt } = st;
                return safeSt;
              });
            }
            return safe;
          }));
        } else {
          callback(list);
        }
      };
      const listener = (e) => {
        if (!e.detail || !e.detail.collection || e.detail.collection === 'challenges') handler();
      };
      window.addEventListener('cybertrix_data_changed', listener);
      handler();
      return () => window.removeEventListener('cybertrix_data_changed', listener);
    }
  };

  // ==========================================
  // SUBMISSIONS & SCORING SERVICE (Requirements 1, 2, 3, 7, 8, 11, 18, 19)
  // ==========================================
  const dbSubmissions = {
    async submitFlag(challengeId, submittedFlag) {
      let user = dbAuth.getCurrentUser();
      if (!user) {
        dbUsers = loadFromStorage('users', [DEFAULT_ADMIN, ...DEFAULT_PLAYERS]);
        const defaultPlayer = dbUsers.find(u => u.role !== 'admin' && u.active);
        if (defaultPlayer) {
          user = defaultPlayer;
          try {
            localStorage.setItem('cybertrix_active_user', JSON.stringify(defaultPlayer));
          } catch (e) {}
          window.dispatchEvent(new CustomEvent('cybertrix_auth_state_changed', { detail: { user: defaultPlayer } }));
        } else {
          throw new Error("Authentication required to submit flags.");
        }
      }

      // Check Event Timer & Expiration (Requirements 1, 10, 19, 25)
      const timerConfig = await dbTimer.getTimerConfig();
      if (!timerConfig.enabled) {
        throw new Error("CTF EVENT IS CLOSED: Event timer is currently disabled.");
      }
      if (timerConfig.status === 'ENDED') {
        throw new Error("EVENT ENDED: FLAG SUBMISSION IS CLOSED.");
      }
      if (timerConfig.status === 'PAUSED') {
        throw new Error("EVENT PAUSED: Flag submission is temporarily suspended.");
      }
      if (timerConfig.status === 'NOT_STARTED') {
        throw new Error("EVENT NOT STARTED: Flag submission is not yet open.");
      }
      if (timerConfig.status === 'LIVE' && timerConfig.endTime) {
        const remaining = Math.max(0, Math.floor((new Date(timerConfig.endTime).getTime() - Date.now()) / 1000));
        if (remaining <= 0) {
          await dbTimer.endEvent();
          throw new Error("EVENT ENDED: FLAG SUBMISSION IS CLOSED.");
        }
      }

      // Alias mapping for backward compatibility
      let actualChallengeId = challengeId;
      let targetSubtaskId = null;
      if (challengeId === 'mirror-keyboard-1') { actualChallengeId = 'mirror-keyboard'; targetSubtaskId = 'task_1'; }
      else if (challengeId === 'mirror-keyboard-2') { actualChallengeId = 'mirror-keyboard'; targetSubtaskId = 'task_2'; }
      else if (challengeId === 'mirror-keyboard-3') { actualChallengeId = 'mirror-keyboard'; targetSubtaskId = 'task_3'; }
      else if (challengeId === 'ascii-hunt-1') { actualChallengeId = 'ascii-hunt'; targetSubtaskId = 'task_1'; }
      else if (challengeId === 'ascii-hunt-2') { actualChallengeId = 'ascii-hunt'; targetSubtaskId = 'task_2'; }

      dbChallengesList = loadFromStorage('challenges', DEFAULT_CHALLENGES);
      const ch = dbChallengesList.find(c => c.id === actualChallengeId);
      if (!ch) throw new Error("Challenge not found.");

      if (ch.isLocked === true || ch.adminLocked === true || ch.status === 'LOCKED') {
        throw new Error("CHALLENGE LOCKED: This challenge is currently locked by the Administrator.");
      }
      if (ch.enabled === false || ch.status === 'HIDDEN') {
        throw new Error("Challenge is currently DISABLED.");
      }

      dbUsers = loadFromStorage('users', []);
      const freshUser = dbUsers.find(u => u.uid === user.uid);
      if (!freshUser) throw new Error("User record not found.");

      // Check if player is disabled (Requirement 2 & 4)
      if (freshUser.active === false || freshUser.disabled === true || freshUser.status === 'disabled') {
        throw new Error("Your CYBERTRIX account has been disabled by the administrator.");
      }

      // 1. One-by-One Challenge Progression Lock (Requirements 7, 8, 18, 24)
      const activeSorted = [...dbChallengesList]
        .filter(c => c.status !== 'HIDDEN' && c.enabled !== false)
        .sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));

      const chIdx = activeSorted.findIndex(c => c.id === actualChallengeId);
      if (chIdx > 0) {
        const prevCh = activeSorted[chIdx - 1];
        const hasSolvedPrev = (freshUser.solvedChallenges && freshUser.solvedChallenges.includes(prevCh.id)) ||
                              (freshUser.completedChallenges && freshUser.completedChallenges.includes(prevCh.id));
        const hasSolvedPrevSubtask = (prevCh.subtasks && Array.isArray(prevCh.subtasks) && prevCh.subtasks.some(st => {
          return Array.isArray(freshUser.solvedSubtasks) && freshUser.solvedSubtasks.includes(`${prevCh.id}_${st.id}`);
        })) || (Array.isArray(freshUser.solvedSubtasks) && freshUser.solvedSubtasks.some(stId => stId.startsWith(`${prevCh.id}_`)));
        const hasPrevProgress = freshUser.progress && freshUser.progress[prevCh.id] && (
          freshUser.progress[prevCh.id].solved ||
          (Array.isArray(freshUser.progress[prevCh.id].completedSubtasks) && freshUser.progress[prevCh.id].completedSubtasks.length > 0)
        );

        if (!hasSolvedPrev && !hasSolvedPrevSubtask && !hasPrevProgress) {
          throw new Error(`CHALLENGE LOCKED: You must complete Challenge #${prevCh.order || chIdx} (${prevCh.title}) first!`);
        }
      }

      const hasSubtasks = Array.isArray(ch.subtasks) && ch.subtasks.length > 0;

      // 2. Duplicate Solve Check (Permanent Lock per player)
      const isAlreadySolved = (
        (Array.isArray(freshUser.solvedChallenges) && freshUser.solvedChallenges.includes(actualChallengeId)) ||
        (Array.isArray(freshUser.completedChallenges) && freshUser.completedChallenges.includes(actualChallengeId)) ||
        (freshUser.progress && freshUser.progress[actualChallengeId] && freshUser.progress[actualChallengeId].solved)
      );
      if (isAlreadySolved) {
        throw new Error("FLAG ALREADY ACCEPTED: Challenge already completed and locked. Points already awarded.");
      }

      // 2.5 Challenge-Specific Timer Check (Requirement 2: Every challenge timer)
      if (ch.timerEnabled !== false && ch.timerSeconds && ch.timerSeconds > 0) {
        let attempts = loadFromStorage('challenge_attempts', {});
        const attemptKey = `${freshUser.uid}_${actualChallengeId}`;
        let attempt = attempts[attemptKey];
        if (!attempt) {
          const durationSeconds = Number(ch.timerSeconds) || 300;
          attempt = {
            attemptId: attemptKey,
            userId: freshUser.uid,
            challengeId: actualChallengeId,
            startedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + durationSeconds * 1000).toISOString(),
            durationSeconds: durationSeconds,
            remainingSeconds: durationSeconds,
            status: 'active',
            hiddenFound: false
          };
          attempts[attemptKey] = attempt;
          saveToStorage('challenge_attempts', attempts);
        } else {
          if (attempt.status === 'paused') {
            const rem = attempt.remainingSeconds !== undefined ? attempt.remainingSeconds : (attempt.durationSeconds || 300);
            if (rem <= 0) {
              attempt.status = 'expired';
              attempt.remainingSeconds = 0;
              attempts[attemptKey] = attempt;
              saveToStorage('challenge_attempts', attempts);
              throw new Error("TIME EXPIRED: Submission closed for this attempt. Please restart challenge.");
            }
            // Auto-resume active state on submission
            attempt.status = 'active';
            attempt.expiresAt = new Date(Date.now() + rem * 1000).toISOString();
            attempt.pausedAt = null;
            attempt.remainingSeconds = rem;
            attempts[attemptKey] = attempt;
            saveToStorage('challenge_attempts', attempts);
          }
          const now = Date.now();
          const expiresAtMs = attempt.expiresAt ? new Date(attempt.expiresAt).getTime() : 0;
          if (now >= expiresAtMs || attempt.status === 'expired') {
            attempt.status = 'expired';
            attempt.remainingSeconds = 0;
            attempts[attemptKey] = attempt;
            saveToStorage('challenge_attempts', attempts);
            throw new Error("TIME EXPIRED: Submission closed for this attempt. Please restart challenge.");
          }
        }
      }

      // 3. Flag / Secret Verification
      if (fbDb) {
        try {
          const remoteSec = await getDocFromFirestore('challengeSecrets', actualChallengeId);
          if (remoteSec) {
            dbChallengeSecrets[actualChallengeId] = { ...(dbChallengeSecrets[actualChallengeId] || {}), ...remoteSec };
          }
          if (actualChallengeId === 'hidden-vault') {
            const hvDoc = await getDocFromFirestore('hiddenVault', 'config');
            if (hvDoc && hvDoc.evidenceFlag) {
              dbChallengeSecrets['hidden-vault'] = {
                ...(dbChallengeSecrets['hidden-vault'] || {}),
                flag: hvDoc.evidenceFlag
              };
              ch.flag = hvDoc.evidenceFlag;
            }
          }
        } catch(e) {}
      }
      dbChallengeSecrets = loadFromStorage('challenge_secrets', DEFAULT_CHALLENGE_SECRETS);
      const secretObj = dbChallengeSecrets[actualChallengeId] || {};
      const cleanInput = (submittedFlag || '').trim();

      if (!cleanInput) {
        throw new Error("Please provide a flag string.");
      }

      let isCorrect = false;
      let activeSubtask = null;
      let subtasksList = hasSubtasks ? ch.subtasks : [];
      let userSolvedSubtasks = Array.isArray(freshUser.solvedSubtasks) ? freshUser.solvedSubtasks : [];

      if (hasSubtasks) {
        // Check if user already solved a sub-task with this exact flag
        const isDuplicateSubtaskFlag = subtasksList.some(st => {
          const compId = `${actualChallengeId}_${st.id}`;
          if (!userSolvedSubtasks.includes(compId)) return false;
          const stSec = (secretObj.subtasks && secretObj.subtasks[st.id]) || {};
          const stFlag = (stSec.flag || st.flag || '').toUpperCase();
          const stAns = (stSec.answer || stSec.targetWord || stSec.targetSentence || st.answer || st.targetWord || st.targetSentence || '').toUpperCase();
          const normInput = cleanInput.toUpperCase();
          return (normInput === stFlag || normInput === stAns || normInput === `CYBERTRIX{${stAns}}` || (stSec.aliases && stSec.aliases.some(a => String(a).toUpperCase() === normInput)));
        });
        if (isDuplicateSubtaskFlag) {
          throw new Error("FLAG ALREADY ACCEPTED: Points already awarded for this flag/sub-task.");
        }

        // Find active subtask
        if (targetSubtaskId) {
          const compoundId = `${actualChallengeId}_${targetSubtaskId}`;
          if (userSolvedSubtasks.includes(compoundId)) {
            throw new Error("FLAG ALREADY ACCEPTED: Points already awarded for this sub-task.");
          }
          activeSubtask = subtasksList.find(st => st.id === targetSubtaskId);
        } else {
          activeSubtask = subtasksList.find(st => !userSolvedSubtasks.includes(`${actualChallengeId}_${st.id}`));
        }

        if (!activeSubtask) {
          throw new Error("CHALLENGE ALREADY COMPLETED: All sub-tasks have been solved.");
        }

        const subtaskSecrets = (secretObj.subtasks && secretObj.subtasks[activeSubtask.id]) || {};
        const normInput = cleanInput.toUpperCase();

        if (ch.type === 'mirror-keyboard') {
          const rawExpected = subtaskSecrets.answer || subtaskSecrets.targetWord || subtaskSecrets.targetSentence || activeSubtask.answer || activeSubtask.targetSentence || activeSubtask.targetWord || ch.targetSentence || ch.targetWord || ch.answer || 'PYTHON';
          const expectedWord = rawExpected.trim().toUpperCase();
          const rawFlag = subtaskSecrets.flag || activeSubtask.flag || ch.flag || `CYBERTRIX{${expectedWord}}`;
          const expectedFlag = rawFlag.trim().toUpperCase();
          const aliases = (subtaskSecrets.aliases || []).map(a => (a || '').trim().toUpperCase());

          const cleanNorm = cleanInput.toUpperCase();
          const cleanNoSp = cleanNorm.replace(/\s+/g, '');
          const expectedNoSp = expectedWord.replace(/\s+/g, '');
          const flagNoSp = expectedFlag.replace(/\s+/g, '');

          isCorrect = (cleanNorm === expectedWord) ||
            (cleanNorm === expectedFlag) ||
            (cleanNoSp === expectedNoSp) ||
            (cleanNoSp === flagNoSp) ||
            (cleanNoSp === `CYBERTRIX{${expectedNoSp}}`) ||
            aliases.includes(cleanNorm) ||
            aliases.includes(cleanInput.trim()) ||
            aliases.some(a => a.replace(/\s+/g, '') === cleanNoSp);
        } else if (ch.type === 'ascii-hunt') {
          const hexSource = (activeSubtask && (activeSubtask.asciiHex || activeSubtask.asciiValues)) ||
                            (subtaskSecrets && (subtaskSecrets.asciiHex || subtaskSecrets.asciiValues)) ||
                            ch.asciiHex || ch.asciiValues || '';
          let decodedFromHex = '';
          if (hexSource) {
            try {
              decodedFromHex = hexSource.split(/\s+/).filter(Boolean).map(h => {
                if (/^[0-9]+$/.test(h) && !/^[0-9A-Fa-f]{2}$/.test(h)) return String.fromCharCode(parseInt(h, 10));
                return String.fromCharCode(parseInt(h, 16));
              }).join('').trim();
            } catch (e) {}
          }

          let expectedVal = decodedFromHex || (subtaskSecrets.answer || activeSubtask.targetWord || activeSubtask.answer || '').trim();
          const expectedFlag = (subtaskSecrets.flag || activeSubtask.flag || `CYBERTRIX{${expectedVal}}`).trim().toUpperCase();
          const normExpected = expectedVal.toUpperCase();
          const cleanNoSpaces = normInput.replace(/\s+/g, '');
          const cleanExpected = normExpected.replace(/\s+/g, '');
          const aliases = [
            ...(subtaskSecrets.aliases || []),
            expectedVal,
            decodedFromHex,
            activeSubtask.targetWord,
            activeSubtask.answer,
            subtaskSecrets.answer,
            `CYBERTRIX{${expectedVal}}`,
            `CYBERTRIX{${decodedFromHex}}`,
            `CYBERTRIX{${activeSubtask.targetWord}}`
          ].filter(Boolean).map(a => a.trim().toUpperCase());

          if (ch.caseSensitive) {
            isCorrect = (cleanInput === expectedFlag) || (cleanInput === expectedVal) || (cleanInput === decodedFromHex) || aliases.includes(cleanInput);
          } else {
            isCorrect = (normInput === expectedFlag) ||
              (normInput === normExpected) ||
              (cleanNoSpaces === cleanExpected) ||
              (cleanNoSpaces === `CYBERTRIX{${cleanExpected}}`) ||
              (decodedFromHex && cleanNoSpaces === decodedFromHex.replace(/\s+/g, '').toUpperCase()) ||
              (decodedFromHex && cleanNoSpaces === `CYBERTRIX{${decodedFromHex.replace(/\s+/g, '').toUpperCase()}}`) ||
              aliases.includes(normInput) ||
              aliases.includes(cleanNoSpaces) ||
              aliases.some(a => a.replace(/\s+/g, '') === cleanNoSpaces);
          }
        }
      } else {
        // Standard single challenge verification
        const secretFlag = (secretObj.flag || '').trim();
        const normInput = cleanInput.toUpperCase();

        if (ch.type === 'mirror-keyboard') {
          const targetSentence = (secretObj.targetSentence || secretObj.targetWord || secretObj.answer || ch.targetSentence || ch.targetWord || ch.answer || 'PYTHON').trim();
          const expectedFlag = (secretFlag || ch.flag || `CYBERTRIX{${targetSentence}}`).trim();
          const aliases = (secretObj.aliases || []).map(a => a.trim());

          const caseSensitive = (secretObj.caseSensitive !== undefined) ? !!secretObj.caseSensitive : (ch.caseSensitive !== undefined ? !!ch.caseSensitive : false);
          const ignoreExtraSpaces = (secretObj.ignoreExtraSpaces !== undefined) ? !!secretObj.ignoreExtraSpaces : (ch.ignoreExtraSpaces !== undefined ? !!ch.ignoreExtraSpaces : true);
          const trimSpaces = (secretObj.trimSpaces !== undefined) ? !!secretObj.trimSpaces : (ch.trimSpaces !== undefined ? !!ch.trimSpaces : true);

          let p = cleanInput;
          if (trimSpaces) p = p.trim();
          if (ignoreExtraSpaces) p = p.replace(/\s+/g, ' ');

          const checkMatch = (candidate) => {
            if (!candidate) return false;
            let c = candidate;
            if (trimSpaces) c = c.trim();
            if (ignoreExtraSpaces) c = c.replace(/\s+/g, ' ');
            return caseSensitive ? (p === c) : (p.toLowerCase() === c.toLowerCase());
          };

          isCorrect = checkMatch(expectedFlag) ||
            checkMatch(targetSentence) ||
            checkMatch(`CYBERTRIX{${targetSentence}}`) ||
            aliases.some(a => checkMatch(a));
        } else if (secretFlag && normInput === secretFlag.toUpperCase()) {
          isCorrect = true;
        } else if (ch.type === 'hidden-vault') {
          const expectedFlag = (secretFlag || ch.flag || 'CYBERTRIX{HIDDEN_IN_PLAIN_SIGHT}').trim().toUpperCase();
          isCorrect = (normInput === expectedFlag) ||
            (normInput === expectedFlag.replace('CYBERTRIX{', '').replace('}', '')) ||
            (secretFlag && normInput === secretFlag.toUpperCase()) ||
            (ch.flag && normInput === ch.flag.trim().toUpperCase());
        } else if (ch.type === 'metadata-ghost' || ch.id === 'metadata-ghost') {
          const expectedAnswer = (secretObj.answer || 'MEET AT MIDNIGHT').trim().toUpperCase();
          const expectedFlag = (secretFlag || `CYBERTRIX{${expectedAnswer}}`).trim().toUpperCase();
          const aliases = (secretObj.aliases || []).map(a => a.trim().toUpperCase());
          isCorrect = (normInput === expectedFlag) ||
            (normInput === `CYBERTRIX{${expectedAnswer}}`) ||
            (normInput === `CYBERTRIX{${expectedAnswer.replace(/\s+/g, '_')}}`) ||
            (normInput === expectedAnswer) ||
            (normInput === expectedAnswer.replace(/\s+/g, '_')) ||
            (secretFlag && normInput === secretFlag.toUpperCase()) ||
            aliases.includes(normInput) ||
            aliases.some(a => normInput === `CYBERTRIX{${a}}`) ||
            aliases.some(a => normInput === `CYBERTRIX{${a.replace(/\s+/g, '_')}}`);
        }
      }

      // Record Submission History
      dbSubmissionsList = loadFromStorage('submissions', []);
      const newSub = {
        id: "sub_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
        userId: freshUser.uid,
        username: freshUser.username,
        challengeId: ch.id,
        subtaskId: activeSubtask ? activeSubtask.id : null,
        challengeTitle: ch.title,
        submittedFlag: cleanInput,
        correct: isCorrect,
        timestamp: new Date().toISOString()
      };
      dbSubmissionsList.unshift(newSub);
      saveToStorage('submissions', dbSubmissionsList);

      if (isCorrect) {
        let pointsAwarded = 0;
        let isAllCompleted = false;

        if (hasSubtasks && activeSubtask) {
          if (!Array.isArray(freshUser.solvedSubtasks)) freshUser.solvedSubtasks = [];
          const compoundId = `${actualChallengeId}_${activeSubtask.id}`;
          freshUser.solvedSubtasks.push(compoundId);

          pointsAwarded = Number(activeSubtask.points) || 100;
          freshUser.points = (freshUser.points || 0) + pointsAwarded;
          freshUser.score = freshUser.points;
          freshUser.solvedChallenges = freshUser.solvedChallenges || [];
          freshUser.completedChallenges = freshUser.completedChallenges || [];
          freshUser.solvedCount = freshUser.solvedChallenges.length;
          freshUser.lastSolvedAt = newSub.timestamp;

          if (!freshUser.progress) freshUser.progress = {};
          if (!freshUser.progress[actualChallengeId]) {
            freshUser.progress[actualChallengeId] = { completedSubtasks: [], solved: false };
          }
          if (!Array.isArray(freshUser.progress[actualChallengeId].completedSubtasks)) {
            freshUser.progress[actualChallengeId].completedSubtasks = [];
          }
          freshUser.progress[actualChallengeId].completedSubtasks.push(activeSubtask.id);

          // Check if all subtasks are now solved
          isAllCompleted = subtasksList.every(st => freshUser.solvedSubtasks.includes(`${actualChallengeId}_${st.id}`));

          if (isAllCompleted) {
            if (!Array.isArray(freshUser.solvedChallenges)) freshUser.solvedChallenges = [];
            if (!freshUser.solvedChallenges.includes(actualChallengeId)) {
              freshUser.solvedChallenges.push(actualChallengeId);
            }
            if (!Array.isArray(freshUser.completedChallenges)) freshUser.completedChallenges = [];
            if (!freshUser.completedChallenges.includes(actualChallengeId)) {
              freshUser.completedChallenges.push(actualChallengeId);
            }
            freshUser.solvedCount = freshUser.solvedChallenges.length;
            freshUser.progress[actualChallengeId].solved = true;
            freshUser.progress[actualChallengeId].solvedAt = newSub.timestamp;
            freshUser.progress[actualChallengeId].pointsAwarded = ch.points;

            let attempts = loadFromStorage('challenge_attempts', {});
            const attemptKey = `${freshUser.uid}_${actualChallengeId}`;
            if (attempts[attemptKey]) {
              attempts[attemptKey].status = 'solved';
              attempts[attemptKey].solvedAt = newSub.timestamp;
              saveToStorage('challenge_attempts', attempts);
            }
          }
        } else {
          // Single challenge solve
          if (!Array.isArray(freshUser.solvedChallenges)) freshUser.solvedChallenges = [];
          if (!freshUser.solvedChallenges.includes(actualChallengeId)) {
            freshUser.solvedChallenges.push(actualChallengeId);
          }
          if (!Array.isArray(freshUser.completedChallenges)) freshUser.completedChallenges = [];
          if (!freshUser.completedChallenges.includes(actualChallengeId)) {
            freshUser.completedChallenges.push(actualChallengeId);
          }
          pointsAwarded = Number(ch.points) || 100;
          freshUser.points = (freshUser.points || 0) + pointsAwarded;
          freshUser.score = freshUser.points;
          freshUser.solvedCount = freshUser.solvedChallenges.length;
          freshUser.lastSolvedAt = newSub.timestamp;
          isAllCompleted = true;

          let attempts = loadFromStorage('challenge_attempts', {});
          const attemptKey = `${freshUser.uid}_${actualChallengeId}`;
          if (attempts[attemptKey]) {
            attempts[attemptKey].status = 'solved';
            attempts[attemptKey].solvedAt = newSub.timestamp;
            saveToStorage('challenge_attempts', attempts);
          }

          if (!freshUser.progress) freshUser.progress = {};
          freshUser.progress[actualChallengeId] = {
            solved: true,
            solvedAt: newSub.timestamp,
            pointsAwarded: pointsAwarded
          };
        }

        // Save updated user record
        const uIdx = dbUsers.findIndex(u => u.uid === freshUser.uid);
        if (uIdx !== -1) {
          dbUsers[uIdx] = freshUser;
          saveToStorage('users', dbUsers);
          localStorage.setItem('cybertrix_active_user', JSON.stringify(freshUser));
          window.dispatchEvent(new CustomEvent('cybertrix_auth_state_changed', { detail: { user: freshUser } }));
          window.dispatchEvent(new CustomEvent('cybertrix_data_changed', { detail: { collection: 'users' } }));
        }

        if (fbDb && freshUser.uid) {
          try {
            fbDb.collection('progress').doc(freshUser.uid).collection('challenges').doc(actualChallengeId).set({
              started: true,
              solved: isAllCompleted,
              score: isAllCompleted ? (Number(ch.points) || pointsAwarded) : pointsAwarded,
              attempts: 1,
              solvedAt: newSub.timestamp,
              remainingTime: 0,
              lastUpdated: newSub.timestamp
            }, { merge: true });
          } catch(e) {}
        }

        const nextCh = activeSorted[chIdx + 1];
        const unlockedNotice = nextCh ? ` Sector 0${nextCh.order} [${nextCh.title}] UNLOCKED!` : '';

        if (hasSubtasks && !isAllCompleted) {
          const remainingSubtask = subtasksList.find(st => !freshUser.solvedSubtasks.includes(`${actualChallengeId}_${st.id}`));
          return {
            success: true,
            subtaskCompleted: true,
            subtaskId: activeSubtask.id,
            subtaskTitle: activeSubtask.title,
            isAllCompleted: false,
            pointsAwarded: pointsAwarded,
            newTotalPoints: freshUser.points,
            newTotalScore: freshUser.score,
            solvedCount: freshUser.solvedCount,
            nextSubtaskId: remainingSubtask ? remainingSubtask.id : null,
            nextSubtaskTitle: remainingSubtask ? remainingSubtask.title : null,
            unlockedNext: nextCh ? nextCh.id : null,
            message: `✓ ${activeSubtask.title} SOLVED (+${pointsAwarded} PTS)!${unlockedNotice}`
          };
        } else if (hasSubtasks && isAllCompleted) {
          return {
            success: true,
            subtaskCompleted: true,
            subtaskId: activeSubtask ? activeSubtask.id : null,
            subtaskTitle: activeSubtask ? activeSubtask.title : null,
            isAllCompleted: true,
            pointsAwarded: pointsAwarded,
            totalChallengePoints: ch.points,
            newTotalPoints: freshUser.points,
            newTotalScore: freshUser.score,
            solvedCount: freshUser.solvedCount,
            message: `CHALLENGE COMPLETED ✓ // ALL ${subtasksList.length} SUB-TASKS SOLVED (+${ch.points} PTS)!${unlockedNotice}`,
            unlockedNext: nextCh ? nextCh.id : null
          };
        } else {
          return {
            success: true,
            isAllCompleted: true,
            pointsAwarded: pointsAwarded,
            newTotalPoints: freshUser.points,
            newTotalScore: freshUser.score,
            solvedCount: freshUser.solvedCount,
            message: `FLAG VERIFIED! +${pointsAwarded} PTS awarded!${unlockedNotice}`,
            unlockedNext: nextCh ? nextCh.id : null
          };
        }
      } else {
        return {
          success: false,
          message: ch.type === 'hidden-vault'
            ? "INVALID FLAG // EVIDENCE VERIFICATION FAILED"
            : (ch.type === 'mirror-keyboard' ? "INVALID FLAG" : (hasSubtasks ? "ACCESS DENIED: Input does not match the current sub-task." : "ACCESS DENIED // INVALID FLAG"))
        };
      }
    },

    async getAll() {
      dbSubmissionsList = loadFromStorage('submissions', []);
      return [...dbSubmissionsList];
    },

    async getUserSubmissions(userId) {
      dbSubmissionsList = loadFromStorage('submissions', []);
      return dbSubmissionsList.filter(s => s.userId === userId);
    },

    onSnapshot(callback) {
      const handler = () => {
        callback(loadFromStorage('submissions', []));
      };
      const listener = (e) => {
        if (e.detail.collection === 'submissions') handler();
      };
      window.addEventListener('cybertrix_data_changed', listener);
      handler();
      return () => window.removeEventListener('cybertrix_data_changed', listener);
    }
  };

  // ==========================================
  // LEADERBOARD SERVICE (Exact same Firestore logic across Public & Admin)
  // Requirement 2: The public leaderboard must show ONLY players where active == true.
  // Disabled players must NOT appear in leaderboard ranking, player list, public score list,
  // solved-count ranking, or any other public leaderboard section.
  // ==========================================
  const dbLeaderboard = {
    async getRankings(includeDisabled = false) {
      if (fbDb) {
        try {
          const remoteUsers = await getCollectionFromFirestore('users');
          if (remoteUsers && remoteUsers.length > 0) {
            dbUsers = remoteUsers;
            try {
              localStorage.setItem('cybertrix_users', JSON.stringify(remoteUsers));
            } catch(e){}
          }
        } catch(e) {}
      }
      dbUsers = loadFromStorage('users', []);
      // Filter out admin role from leaderboard
      let players = dbUsers.filter(u => u.role !== 'admin');

      // Requirement 2: The public leaderboard must show ONLY players where active == true
      if (!includeDisabled) {
        players = players.filter(u => u.active === true && !u.disabled && u.status !== 'disabled');
      }

      // Sort criteria:
      // 1. Highest points / score DESC
      // 2. Highest solved challenges count DESC
      // 3. Earliest lastSolvedAt timestamp ASC
      players.sort((a, b) => {
        const ptsA = (a.score !== undefined ? a.score : a.points) || 0;
        const ptsB = (b.score !== undefined ? b.score : b.points) || 0;
        if (ptsB !== ptsA) return ptsB - ptsA;

        const solvedA = a.solvedCount !== undefined ? a.solvedCount : (a.solvedChallenges || a.completedChallenges || []).length;
        const solvedB = b.solvedCount !== undefined ? b.solvedCount : (b.solvedChallenges || b.completedChallenges || []).length;
        if (solvedB !== solvedA) return solvedB - solvedA;

        const timeA = new Date(a.lastSolvedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.lastSolvedAt || b.createdAt || 0).getTime();
        return timeA - timeB;
      });

      return players.map((p, index) => {
        const unifiedPts = (p.score !== undefined ? p.score : p.points) || 0;
        const solvedList = p.solvedChallenges || p.completedChallenges || [];
        const count = p.solvedCount !== undefined ? p.solvedCount : solvedList.length;
        return {
          rank: index + 1,
          uid: p.uid,
          name: p.name || p.username,
          username: p.username,
          email: p.email,
          collegeName: p.collegeName || "Cyber Defense Academy",
          points: unifiedPts,
          score: unifiedPts,
          solvedCount: count,
          solvedChallenges: solvedList,
          completedChallenges: solvedList,
          active: p.active === true && !p.disabled && p.status !== 'disabled',
          disabled: p.disabled === true || p.status === 'disabled' || p.active === false,
          status: (p.disabled === true || p.active === false) ? "disabled" : (p.status || "active"),
          createdAt: p.createdAt,
          lastSolvedAt: p.lastSolvedAt || p.createdAt
        };
      });
    },

    onSnapshot(callback) {
      const handler = async () => {
        const rankings = await this.getRankings(false);
        callback(rankings);
      };
      const listener = (e) => {
        if (e.detail.collection === 'users') handler();
      };
      window.addEventListener('cybertrix_data_changed', listener);
      handler();
      return () => window.removeEventListener('cybertrix_data_changed', listener);
    }
  };

  // ==========================================
  // ANNOUNCEMENTS SERVICE
  // ==========================================
  const dbAnnouncements = {
    async getAll(onlyPublished = true) {
      if (fbDb) {
        try {
          const remoteAnns = await getCollectionFromFirestore('announcements');
          if (remoteAnns && remoteAnns.length > 0) {
            remoteAnns.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            dbAnnouncementsList = remoteAnns;
            try {
              localStorage.setItem('cybertrix_announcements', JSON.stringify(remoteAnns));
            } catch(e){}
          }
        } catch(e) {}
      }
      dbAnnouncementsList = loadFromStorage('announcements', DEFAULT_ANNOUNCEMENTS);
      if (onlyPublished) {
        return dbAnnouncementsList.filter(a => a.published !== false);
      }
      return [...dbAnnouncementsList];
    },

    async create(data) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      dbAnnouncementsList = loadFromStorage('announcements', DEFAULT_ANNOUNCEMENTS);

      const newAnn = {
        id: "ann_" + Date.now().toString(36),
        title: data.title.trim(),
        message: data.message.trim(),
        important: Boolean(data.important),
        published: data.published !== false,
        createdAt: new Date().toISOString()
      };

      if (fbDb) {
        await syncDocToFirestore('announcements', newAnn.id, newAnn);
      }
      dbAnnouncementsList.unshift(newAnn);
      saveToStorage('announcements', dbAnnouncementsList);
      return newAnn;
    },

    async update(id, updates) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      dbAnnouncementsList = loadFromStorage('announcements', DEFAULT_ANNOUNCEMENTS);
      const index = dbAnnouncementsList.findIndex(a => a.id === id);
      if (index === -1) throw new Error("Announcement not found.");

      dbAnnouncementsList[index] = {
        ...dbAnnouncementsList[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      if (fbDb) {
        await syncDocToFirestore('announcements', id, dbAnnouncementsList[index]);
      }
      saveToStorage('announcements', dbAnnouncementsList);
      return dbAnnouncementsList[index];
    },

    async delete(id) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      if (fbDb) {
        await deleteDocFromFirestore('announcements', id);
      }
      dbAnnouncementsList = loadFromStorage('announcements', DEFAULT_ANNOUNCEMENTS);
      dbAnnouncementsList = dbAnnouncementsList.filter(a => a.id !== id);
      saveToStorage('announcements', dbAnnouncementsList);
      return true;
    },

    onSnapshot(callback) {
      const handler = () => {
        callback(loadFromStorage('announcements', []).filter(a => a.published !== false));
      };
      const listener = (e) => {
        if (e.detail.collection === 'announcements') handler();
      };
      window.addEventListener('cybertrix_data_changed', listener);
      handler();
      return () => window.removeEventListener('cybertrix_data_changed', listener);
    }
  };

  // ==========================================
  // EVENT CONTROL SERVICE
  // ==========================================
  const dbEvent = {
    async getConfig() {
      if (fbDb) {
        try {
          const remoteEvent = await getDocFromFirestore('eventSettings', 'main');
          if (remoteEvent) {
            dbEventConfig = { ...DEFAULT_EVENT_CONFIG, ...remoteEvent };
            try {
              localStorage.setItem('cybertrix_event_settings', JSON.stringify(dbEventConfig));
            } catch(e){}
          }
        } catch(e) {}
      }
      dbEventConfig = loadFromStorage('event_settings', DEFAULT_EVENT_CONFIG);
      return { ...dbEventConfig };
    },

    async updateConfig(updates) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      dbEventConfig = loadFromStorage('event_settings', DEFAULT_EVENT_CONFIG);
      dbEventConfig = { ...dbEventConfig, ...updates };
      saveToStorage('event_settings', dbEventConfig);
      return dbEventConfig;
    },

    onSnapshot(callback) {
      const handler = () => {
        callback(loadFromStorage('event_settings', DEFAULT_EVENT_CONFIG));
      };
      const listener = (e) => {
        if (e.detail.collection === 'event_settings') handler();
      };
      window.addEventListener('cybertrix_data_changed', listener);
      handler();
      return () => window.removeEventListener('cybertrix_data_changed', listener);
    }
  };

  // ==========================================
  // PLAYERS SERVICE (Admin view)
  // ==========================================
  const dbPlayers = {
    async getAll() {
      dbUsers = loadFromStorage('users', []);
      return dbUsers.filter(u => u.role !== 'admin');
    },

    async getById(uid) {
      dbUsers = loadFromStorage('users', []);
      return dbUsers.find(u => u.uid === uid) || null;
    },

    async toggleStatus(uid, shouldDisable) {
      if (!dbAuth.isAdmin()) {
        throw new Error("Unauthorized: Only an authenticated admin can modify player status.");
      }
      dbUsers = loadFromStorage('users', []);
      const idx = dbUsers.findIndex(u => u.uid === uid);
      if (idx === -1) throw new Error("Operative record not found in database.");

      const isDisabling = Boolean(shouldDisable);
      dbUsers[idx].active = !isDisabling;
      dbUsers[idx].disabled = isDisabling;
      dbUsers[idx].status = isDisabling ? "disabled" : "active";
      dbUsers[idx].updatedAt = new Date().toISOString();

      saveToStorage('users', dbUsers);

      // If active user in local session is this operative, synchronize session
      const currentActive = dbAuth.getCurrentUser();
      if (currentActive && currentActive.uid === uid) {
        currentActive.active = !isDisabling;
        currentActive.disabled = isDisabling;
        currentActive.status = isDisabling ? "disabled" : "active";
        localStorage.setItem('cybertrix_active_user', JSON.stringify(currentActive));
        window.dispatchEvent(new CustomEvent('cybertrix_auth_state_changed', { detail: { user: currentActive } }));
      }

      return dbUsers[idx];
    },

    async delete(uid) {
      if (!dbAuth.isAdmin()) {
        throw new Error("Unauthorized: Only an authenticated admin can remove players.");
      }
      dbUsers = loadFromStorage('users', []);
      const idx = dbUsers.findIndex(u => u.uid === uid);
      if (idx === -1) throw new Error("Operative record not found in database.");

      const removed = dbUsers[idx];
      if (removed.role === 'admin') {
        throw new Error("Cannot remove administrator account.");
      }

      // Remove operative from users list
      if (fbDb) {
        deleteDocFromFirestore('users', uid);
      }
      dbUsers.splice(idx, 1);
      saveToStorage('users', dbUsers);

      // Clean up credentials
      let authCreds = loadFromStorage('auth_credentials', {});
      if (authCreds && authCreds[uid]) {
        delete authCreds[uid];
        saveToStorage('auth_credentials', authCreds);
      }

      // Clean up submissions for this user
      let submissions = loadFromStorage('submissions', []);
      const prevSubmissionsCount = submissions.length;
      submissions = submissions.filter(s => s.userId !== uid);
      if (submissions.length !== prevSubmissionsCount) {
        saveToStorage('submissions', submissions);
      }

      // Clean up challenge attempts for this user
      let attempts = loadFromStorage('challenge_attempts', {});
      let updatedAttempts = {};
      let attemptsChanged = false;
      Object.keys(attempts).forEach(k => {
        if (k.startsWith(`${uid}_`)) {
          attemptsChanged = true;
        } else {
          updatedAttempts[k] = attempts[k];
        }
      });
      if (attemptsChanged) {
        saveToStorage('challenge_attempts', updatedAttempts);
      }

      // If active user in local session is this removed operative, clear session
      const currentActive = dbAuth.getCurrentUser();
      if (currentActive && currentActive.uid === uid) {
        localStorage.removeItem('cybertrix_active_user');
        window.dispatchEvent(new CustomEvent('cybertrix_auth_state_changed', { detail: { user: null } }));
      }

      return removed;
    },

    async remove(uid) {
      return this.delete(uid);
    },

    getTotalPlayerCount() {
      dbUsers = loadFromStorage('users', []);
      return dbUsers.filter(u => u.role !== 'admin').length;
    },

    getActivePlayerCount() {
      dbUsers = loadFromStorage('users', []);
      return dbUsers.filter(u => u.role !== 'admin' && u.active === true && !u.disabled && u.status !== 'disabled').length;
    },

    onSnapshot(callback) {
      const handler = () => {
        callback(loadFromStorage('users', []).filter(u => u.role !== 'admin'));
      };
      const listener = (e) => {
        if (e.detail.collection === 'users') handler();
      };
      window.addEventListener('cybertrix_data_changed', listener);
      handler();
      return () => window.removeEventListener('cybertrix_data_changed', listener);
    }
  };

  // ==========================================
  // EVENT TIMER SERVICE (siteSettings/eventTimer)
  // Requirements 4, 5, 6, 7, 9, 10, 11, 12, 13, 14
  // ==========================================
  const dbTimer = {
    async getTimerConfig() {
      if (fbDb) {
        try {
          const remoteTimer = await getDocFromFirestore('siteSettings', 'eventTimer');
          if (remoteTimer) {
            dbTimerConfig = { ...DEFAULT_TIMER_CONFIG, ...remoteTimer };
            try {
              localStorage.setItem('cybertrix_event_timer', JSON.stringify(dbTimerConfig));
            } catch(e){}
          }
        } catch(e) {}
      }
      dbTimerConfig = loadFromStorage('event_timer', DEFAULT_TIMER_CONFIG);

      // Check scheduled start
      if (dbTimerConfig.status === 'NOT_STARTED' && dbTimerConfig.startMode === 'scheduled' && dbTimerConfig.scheduledStartTime) {
        const schedTime = new Date(dbTimerConfig.scheduledStartTime).getTime();
        if (!isNaN(schedTime) && Date.now() >= schedTime) {
          dbTimerConfig.status = 'LIVE';
          dbTimerConfig.startTime = new Date().toISOString();
          const remSec = dbTimerConfig.remainingSeconds || dbTimerConfig.durationSeconds || 7200;
          dbTimerConfig.endTime = new Date(Date.now() + remSec * 1000).toISOString();
          dbTimerConfig.updatedAt = new Date().toISOString();
          saveToStorage('event_timer', dbTimerConfig);
        }
      }

      // Check countdown expiration for LIVE state
      if (dbTimerConfig.status === 'LIVE' && dbTimerConfig.endTime) {
        const rem = Math.max(0, Math.floor((new Date(dbTimerConfig.endTime).getTime() - Date.now()) / 1000));
        if (rem <= 0 && dbTimerConfig.status !== 'ENDED') {
          dbTimerConfig.status = 'ENDED';
          dbTimerConfig.remainingSeconds = 0;
          dbTimerConfig.updatedAt = new Date().toISOString();
          saveToStorage('event_timer', dbTimerConfig);
        }
      }

      return { ...dbTimerConfig };
    },

    async updateTimerConfig(updates) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Only an active Admin can configure the timer.");
      dbTimerConfig = loadFromStorage('event_timer', DEFAULT_TIMER_CONFIG);

      dbTimerConfig = {
        ...dbTimerConfig,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      // If updating duration in NOT_STARTED state, synchronize remainingSeconds
      if (dbTimerConfig.status === 'NOT_STARTED' && updates.durationSeconds) {
        dbTimerConfig.remainingSeconds = updates.durationSeconds;
      }

      saveToStorage('event_timer', dbTimerConfig);
      return { ...dbTimerConfig };
    },

    async startEvent() {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Only an active Admin can start the event.");
      dbTimerConfig = loadFromStorage('event_timer', DEFAULT_TIMER_CONFIG);

      const remSec = (dbTimerConfig.status === 'PAUSED' && dbTimerConfig.remainingSeconds > 0)
        ? dbTimerConfig.remainingSeconds
        : (dbTimerConfig.durationSeconds || 7200);

      dbTimerConfig.status = 'LIVE';
      dbTimerConfig.startTime = new Date().toISOString();
      dbTimerConfig.endTime = new Date(Date.now() + remSec * 1000).toISOString();
      dbTimerConfig.remainingSeconds = remSec;
      dbTimerConfig.pausedAt = null;
      dbTimerConfig.updatedAt = new Date().toISOString();

      saveToStorage('event_timer', dbTimerConfig);
      return { ...dbTimerConfig };
    },

    async pauseEvent() {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Only an active Admin can pause the event.");
      dbTimerConfig = loadFromStorage('event_timer', DEFAULT_TIMER_CONFIG);

      let rem = dbTimerConfig.remainingSeconds || 0;
      if (dbTimerConfig.status === 'LIVE' && dbTimerConfig.endTime) {
        rem = Math.max(0, Math.floor((new Date(dbTimerConfig.endTime).getTime() - Date.now()) / 1000));
      }

      dbTimerConfig.status = 'PAUSED';
      dbTimerConfig.remainingSeconds = rem;
      dbTimerConfig.pausedAt = new Date().toISOString();
      dbTimerConfig.endTime = null;
      dbTimerConfig.updatedAt = new Date().toISOString();

      saveToStorage('event_timer', dbTimerConfig);
      return { ...dbTimerConfig };
    },

    async resumeEvent() {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Only an active Admin can resume the event.");
      dbTimerConfig = loadFromStorage('event_timer', DEFAULT_TIMER_CONFIG);

      const remSec = dbTimerConfig.remainingSeconds > 0 ? dbTimerConfig.remainingSeconds : (dbTimerConfig.durationSeconds || 7200);

      dbTimerConfig.status = 'LIVE';
      dbTimerConfig.startTime = new Date().toISOString();
      dbTimerConfig.endTime = new Date(Date.now() + remSec * 1000).toISOString();
      dbTimerConfig.remainingSeconds = remSec;
      dbTimerConfig.pausedAt = null;
      dbTimerConfig.updatedAt = new Date().toISOString();

      saveToStorage('event_timer', dbTimerConfig);
      return { ...dbTimerConfig };
    },

    async resetTimer() {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Only an active Admin can reset the event timer.");
      dbTimerConfig = loadFromStorage('event_timer', DEFAULT_TIMER_CONFIG);

      const dur = dbTimerConfig.durationSeconds || 7200;
      dbTimerConfig.status = 'NOT_STARTED';
      dbTimerConfig.remainingSeconds = dur;
      dbTimerConfig.startTime = null;
      dbTimerConfig.endTime = null;
      dbTimerConfig.pausedAt = null;
      dbTimerConfig.updatedAt = new Date().toISOString();

      saveToStorage('event_timer', dbTimerConfig);
      return { ...dbTimerConfig };
    },

    async endEvent() {
      dbTimerConfig = loadFromStorage('event_timer', DEFAULT_TIMER_CONFIG);
      dbTimerConfig.status = 'ENDED';
      dbTimerConfig.remainingSeconds = 0;
      dbTimerConfig.updatedAt = new Date().toISOString();
      saveToStorage('event_timer', dbTimerConfig);
      return { ...dbTimerConfig };
    },

    onSnapshot(callback) {
      const handler = async () => {
        const config = await this.getTimerConfig();
        callback(config);
      };
      const listener = (e) => {
        if (e.detail.collection === 'event_timer') handler();
      };
      window.addEventListener('cybertrix_data_changed', listener);
      handler();
      return () => window.removeEventListener('cybertrix_data_changed', listener);
    }
  };

  // ==========================================
  // CHALLENGE ATTEMPTS SERVICE (Requirements 12-18, 23-26)
  // Individual Challenge Timer & Hidden Answer Verification
  // ==========================================
  const dbAttempts = {
    async getAttempt(challengeId) {
      const user = dbAuth.getCurrentUser();
      if (!user) return null;
      let attempts = loadFromStorage('challenge_attempts', {});
      const attemptKey = `${user.uid}_${challengeId}`;
      let attempt = attempts[attemptKey];
      if (!attempt && fbDb) {
        try {
          const remoteAtt = await getDocFromFirestore('challengeAttempts', attemptKey);
          if (remoteAtt) {
            attempt = remoteAtt;
            attempts[attemptKey] = attempt;
            saveToStorage('challenge_attempts', attempts);
          }
        } catch(e) {}
      }
      if (!attempt) return null;

      if (attempt.status === 'paused') {
        return {
          ...attempt,
          remainingSeconds: Math.max(0, attempt.remainingSeconds !== undefined ? attempt.remainingSeconds : (attempt.durationSeconds || 300))
        };
      }

      if (attempt.status === 'solved') {
        return { ...attempt, remainingSeconds: attempt.remainingSeconds || 0 };
      }

      const now = Date.now();
      const expiresAtMs = attempt.expiresAt ? new Date(attempt.expiresAt).getTime() : 0;
      const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - now) / 1000));

      if (remainingSeconds <= 0 && attempt.status === 'active') {
        attempt.status = 'expired';
        attempt.remainingSeconds = 0;
        attempts[attemptKey] = attempt;
        saveToStorage('challenge_attempts', attempts);
      }

      return {
        ...attempt,
        remainingSeconds: attempt.status === 'expired' ? 0 : remainingSeconds
      };
    },

    async startAttempt(challengeId) {
      let user = dbAuth.getCurrentUser();
      if (!user) {
        dbUsers = loadFromStorage('users', [DEFAULT_ADMIN, ...DEFAULT_PLAYERS]);
        const defaultPlayer = dbUsers.find(u => u.role !== 'admin' && u.active);
        if (defaultPlayer) {
          user = defaultPlayer;
          try {
            localStorage.setItem('cybertrix_active_user', JSON.stringify(defaultPlayer));
          } catch (e) {}
          window.dispatchEvent(new CustomEvent('cybertrix_auth_state_changed', { detail: { user: defaultPlayer } }));
        } else {
          throw new Error("Authentication required to start challenge attempt.");
        }
      }

      // Check if player is disabled (Requirement 4)
      if (user.active === false || user.disabled === true || user.status === 'disabled') {
        throw new Error("Your CYBERTRIX account has been disabled by the administrator.");
      }

      const timerConfig = await dbTimer.getTimerConfig();
      if (!timerConfig.enabled || timerConfig.status !== 'LIVE') {
        throw new Error("CTF EVENT IS NOT LIVE. Cannot start challenge attempt.");
      }

      const ch = await dbChallenges.getById(challengeId);
      if (!ch || ch.status === 'HIDDEN' || ch.enabled === false) {
        throw new Error("Challenge not found or unavailable.");
      }

      // Progression check
      const activeSorted = dbChallengesList.filter(c => c.status !== 'HIDDEN' && c.enabled !== false)
        .sort((a, b) => (Number(a.order) || 1) - (Number(b.order) || 1));
      const chIdx = activeSorted.findIndex(c => c.id === challengeId);
      if (chIdx > 0) {
        const prevCh = activeSorted[chIdx - 1];
        const userSolved = user.solvedChallenges || [];
        const hasSolvedPrev = userSolved.includes(prevCh.id);
        const hasSolvedPrevSubtask = (prevCh.subtasks && Array.isArray(prevCh.subtasks) && prevCh.subtasks.some(st => {
          return Array.isArray(user.solvedSubtasks) && user.solvedSubtasks.includes(`${prevCh.id}_${st.id}`);
        })) || (Array.isArray(user.solvedSubtasks) && user.solvedSubtasks.some(stId => stId.startsWith(`${prevCh.id}_`)));
        const hasPrevProgress = user.progress && user.progress[prevCh.id] && (
          user.progress[prevCh.id].solved ||
          (Array.isArray(user.progress[prevCh.id].completedSubtasks) && user.progress[prevCh.id].completedSubtasks.length > 0)
        );

        if (!hasSolvedPrev && !hasSolvedPrevSubtask && !hasPrevProgress) {
          throw new Error(`CHALLENGE LOCKED: Complete [${prevCh.title}] first.`);
        }
      }

      let attempts = loadFromStorage('challenge_attempts', {});
      const attemptKey = `${user.uid}_${challengeId}`;
      let attempt = attempts[attemptKey];

      // Challenge timer must NOT reset if the player refreshes the page or reopens workspace
      if (attempt) {
        if (attempt.status === 'paused') {
          const rem = attempt.remainingSeconds !== undefined ? attempt.remainingSeconds : (attempt.durationSeconds || 300);
          if (rem <= 0) {
            attempt.status = 'expired';
            attempt.remainingSeconds = 0;
            attempts[attemptKey] = attempt;
            saveToStorage('challenge_attempts', attempts);
            return {
              ...attempt,
              remainingSeconds: 0
            };
          }
          // Automatically resume from previous remaining time (Requirement 2)
          attempt.status = 'active';
          attempt.expiresAt = new Date(Date.now() + rem * 1000).toISOString();
          attempt.pausedAt = null;
          attempt.remainingSeconds = rem;
          attempts[attemptKey] = attempt;
          saveToStorage('challenge_attempts', attempts);
          return {
            ...attempt,
            remainingSeconds: rem
          };
        }

        if (attempt.status === 'solved') {
          return { ...attempt, remainingSeconds: 0 };
        }

        const now = Date.now();
        const expiresAtMs = attempt.expiresAt ? new Date(attempt.expiresAt).getTime() : 0;
        const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - now) / 1000));

        if (attempt.status === 'active' && remainingSeconds > 0) {
          return {
            ...attempt,
            remainingSeconds
          };
        } else if (remainingSeconds <= 0 || attempt.status === 'expired') {
          attempt.status = 'expired';
          attempt.remainingSeconds = 0;
          attempts[attemptKey] = attempt;
          saveToStorage('challenge_attempts', attempts);
          return {
            ...attempt,
            remainingSeconds: 0
          };
        }
      }

      // New attempt start
      const durationSeconds = (ch.timerSeconds !== undefined && ch.timerSeconds !== null) ? Number(ch.timerSeconds) : 300;
      const startedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

      attempt = {
        attemptId: attemptKey,
        userId: user.uid,
        challengeId: challengeId,
        startedAt: startedAt,
        expiresAt: expiresAt,
        durationSeconds: durationSeconds,
        remainingSeconds: durationSeconds,
        status: 'active',
        hiddenFound: false
      };

      attempts[attemptKey] = attempt;
      saveToStorage('challenge_attempts', attempts);

      return {
        ...attempt,
        remainingSeconds: durationSeconds
      };
    },

    async pauseAttempt(challengeId) {
      const user = dbAuth.getCurrentUser();
      if (!user) return null;
      let attempts = loadFromStorage('challenge_attempts', {});
      const attemptKey = `${user.uid}_${challengeId}`;
      const attempt = attempts[attemptKey];
      if (!attempt) return null;

      if (attempt.status === 'active') {
        const now = Date.now();
        const expiresAtMs = attempt.expiresAt ? new Date(attempt.expiresAt).getTime() : 0;
        const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - now) / 1000));

        if (remainingSeconds <= 0) {
          attempt.status = 'expired';
          attempt.remainingSeconds = 0;
        } else {
          attempt.status = 'paused';
          attempt.remainingSeconds = remainingSeconds;
          attempt.pausedAt = new Date().toISOString();
        }
        attempts[attemptKey] = attempt;
        saveToStorage('challenge_attempts', attempts);
      }
      return { ...attempt };
    },

    async resumeAttempt(challengeId) {
      const user = dbAuth.getCurrentUser();
      if (!user) return null;
      let attempts = loadFromStorage('challenge_attempts', {});
      const attemptKey = `${user.uid}_${challengeId}`;
      const attempt = attempts[attemptKey];
      if (!attempt) return null;

      if (attempt.status === 'paused') {
        const rem = attempt.remainingSeconds > 0 ? attempt.remainingSeconds : (attempt.durationSeconds || 300);
        attempt.status = 'active';
        attempt.expiresAt = new Date(Date.now() + rem * 1000).toISOString();
        attempt.pausedAt = null;
        attempt.remainingSeconds = rem;
        attempts[attemptKey] = attempt;
        saveToStorage('challenge_attempts', attempts);
      }
      return { ...attempt };
    },

    async restartAttempt(challengeId) {
      const user = dbAuth.getCurrentUser();
      if (!user) throw new Error("Authentication required.");
      const ch = await dbChallenges.getById(challengeId);
      if (!ch) throw new Error("Challenge not found.");

      const isCompleted = (user.completedChallenges && user.completedChallenges.includes(challengeId)) ||
                          (user.solvedChallenges && user.solvedChallenges.includes(challengeId));
      if (isCompleted) {
        throw new Error("CHALLENGE COMPLETED: This challenge is permanently solved and locked.");
      }
      if (ch.isLocked === true || ch.adminLocked === true || ch.status === 'LOCKED') {
        throw new Error("CHALLENGE LOCKED: This challenge is locked by Administrator.");
      }

      const durationSeconds = (ch.timerSeconds !== undefined && ch.timerSeconds !== null) ? Number(ch.timerSeconds) : 300;
      let attempts = loadFromStorage('challenge_attempts', {});
      const attemptKey = `${user.uid}_${challengeId}`;
      const startedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

      const attempt = {
        attemptId: attemptKey,
        userId: user.uid,
        challengeId: challengeId,
        startedAt: startedAt,
        expiresAt: expiresAt,
        durationSeconds: durationSeconds,
        remainingSeconds: durationSeconds,
        status: 'active',
        hiddenFound: false
      };

      attempts[attemptKey] = attempt;
      saveToStorage('challenge_attempts', attempts);
      return { ...attempt };
    },

    async expireAttempt(challengeId) {
      const user = dbAuth.getCurrentUser();
      if (!user) return null;
      let attempts = loadFromStorage('challenge_attempts', {});
      const attemptKey = `${user.uid}_${challengeId}`;
      const attempt = attempts[attemptKey];
      if (attempt) {
        attempt.status = 'expired';
        attempt.remainingSeconds = 0;
        attempts[attemptKey] = attempt;
        saveToStorage('challenge_attempts', attempts);
      }
      return attempt;
    },

    async completeAttempt(challengeId) {
      const user = dbAuth.getCurrentUser();
      if (!user) return null;
      let attempts = loadFromStorage('challenge_attempts', {});
      const attemptKey = `${user.uid}_${challengeId}`;
      const attempt = attempts[attemptKey];
      if (attempt) {
        attempt.status = 'solved';
        attempt.remainingSeconds = 0;
        attempt.solvedAt = new Date().toISOString();
        attempts[attemptKey] = attempt;
        saveToStorage('challenge_attempts', attempts);
      }
      return attempt;
    },

    async verifyHiddenAnswer(challengeId, submittedAnswer) {
      const user = dbAuth.getCurrentUser();
      if (!user) throw new Error("Authentication required.");

      const timerConfig = await dbTimer.getTimerConfig();
      if (!timerConfig.enabled || timerConfig.status === 'ENDED') {
        throw new Error("CTF EVENT ENDED: Submissions are closed.");
      }
      if (timerConfig.status !== 'LIVE') {
        throw new Error("CTF EVENT NOT LIVE: Submissions temporarily unavailable.");
      }

      let attempts = loadFromStorage('challenge_attempts', {});
      const attemptKey = `${user.uid}_${challengeId}`;
      const attempt = attempts[attemptKey];

      if (!attempt) {
        throw new Error("No active attempt found. Click START CHALLENGE first.");
      }

      const now = Date.now();
      const expiresAtMs = new Date(attempt.expiresAt).getTime();
      if (now >= expiresAtMs || attempt.status === 'expired') {
        attempt.status = 'expired';
        attempt.remainingSeconds = 0;
        attempts[attemptKey] = attempt;
        saveToStorage('challenge_attempts', attempts);
        throw new Error("CHALLENGE TIME EXPIRED: Submission window has closed.");
      }

      dbChallengeSecrets = loadFromStorage('challenge_secrets', DEFAULT_CHALLENGE_SECRETS);
      const secret = dbChallengeSecrets[challengeId] || {};
      const expectedAnswer = (secret.answer || 'MEET AT MIDNIGHT').trim().toUpperCase();
      const cleanInput = (submittedAnswer || '').trim().toUpperCase();
      const aliases = (secret.aliases || []).map(a => a.trim().toUpperCase());

      if (!cleanInput) {
        throw new Error("Please enter a hidden word to verify.");
      }

      const isMatched = (cleanInput === expectedAnswer) ||
        (cleanInput === expectedAnswer.replace(/\s+/g, '_')) ||
        (cleanInput === `CYBERTRIX{${expectedAnswer}}`) ||
        (cleanInput === `CYBERTRIX{${expectedAnswer.replace(/\s+/g, '_')}}`) ||
        aliases.includes(cleanInput);

      if (isMatched) {
        attempt.hiddenFound = true;
        attempts[attemptKey] = attempt;
        saveToStorage('challenge_attempts', attempts);
        return {
          success: true,
          message: "✓ HIDDEN DATA FOUND"
        };
      } else {
        return {
          success: false,
          message: "INCORRECT"
        };
      }
    },

    async resetAttempts(challengeId) {
      if (!dbAuth.isAdmin()) throw new Error("Unauthorized: Admin clearance required.");
      let attempts = loadFromStorage('challenge_attempts', {});
      let updatedAttempts = {};
      Object.keys(attempts).forEach(k => {
        if (!k.endsWith(`_${challengeId}`)) {
          updatedAttempts[k] = attempts[k];
        }
      });
      saveToStorage('challenge_attempts', updatedAttempts);
      return true;
    }
  };

  // Expose services globally
  window.CYBERTRIX_DB = {
    auth: dbAuth,
    admins: dbAdmins,
    challenges: dbChallenges,
    submissions: dbSubmissions,
    attempts: dbAttempts,
    leaderboard: dbLeaderboard,
    announcements: dbAnnouncements,
    event: dbEvent,
    timer: dbTimer,
    players: dbPlayers,
    resetToDefaults() {
      saveToStorage('admins', DEFAULT_ADMINS);
      saveToStorage('users', [DEFAULT_ADMIN, ...DEFAULT_PLAYERS]);
      saveToStorage('challenges', DEFAULT_CHALLENGES);
      saveToStorage('challenge_secrets', DEFAULT_CHALLENGE_SECRETS);
      saveToStorage('challenge_attempts', {});
      saveToStorage('announcements', DEFAULT_ANNOUNCEMENTS);
      saveToStorage('submissions', DEFAULT_SUBMISSIONS);
      saveToStorage('event_settings', DEFAULT_EVENT_CONFIG);
      saveToStorage('event_timer', DEFAULT_TIMER_CONFIG);
      localStorage.removeItem('cybertrix_active_user');
      window.location.reload();
    }
  };

})();
