// Firebase project + who is on the core team.
// The Firebase web config is meant to be public; access is protected by Google login + Firestore rules.
window.PRCH_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyAT7JTa562GZqoGTMJMI2MXSu6nHIhTT0w',
    authDomain: 'prchdashboard.firebaseapp.com',
    projectId: 'prchdashboard',
    storageBucket: 'prchdashboard.firebasestorage.app',
    messagingSenderId: '228203827617',
    appId: '1:228203827617:web:c950ffefa89f5d89373be0',
    measurementId: 'G-XRPCNLC5XH'
  },
  // Core team: Google email (lowercase) -> display name.
  // Keep this list in sync with isTeam() in firestore.rules.
  team: {
    // 'sadad@example.com': 'Sadad',
    // 'aji@example.com': 'Aji',
    // 'oji@example.com': 'Mas Oji'
  }
};
