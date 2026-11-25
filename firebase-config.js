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
  // Owner/admin. Keep in sync with isOwner() in firestore.rules.
  // Other admins, team members and partners are managed in the app (Team tab → Access & members).
  admin: 'sadadrasyad2@gmail.com',
  adminName: 'Sadad'
};
