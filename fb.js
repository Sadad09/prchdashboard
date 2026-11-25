// Loads the Firebase SDK (from Google's CDN) and hands it to dash-shim.js through window.fbApi.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, query, orderBy, limit, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const app = initializeApp(window.PRCH_CONFIG.firebase);
window.fbApi = {
  auth: getAuth(app), db: getFirestore(app),
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, onSnapshot, query, orderBy, limit, writeBatch
};
window.dispatchEvent(new Event('fb-ready'));
