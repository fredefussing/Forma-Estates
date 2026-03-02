const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } = require('firebase/auth');

const firebaseConfig = {
  apiKey: "",
  authDomain: "nordic-homebuilding1.firebaseapp.com",
  projectId: "nordic-homebuilding1",
  storageBucket: "nordic-homebuilding1.firebasestorage.app",
  messagingSenderId: "126571617593",
  appId: "1:126571617593:web:80fcdb36b73a87489b1ce8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

module.exports = { 
  auth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut 
};