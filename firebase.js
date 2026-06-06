const { initializeApp } = require("firebase/app");
const {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} = require("firebase/auth");

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "",
  authDomain: "nordic-homebuilding.firebaseapp.com",
  projectId: "nordic-homebuilding",
  storageBucket: "nordic-homebuilding.firebasestorage.app",
  messagingSenderId: "1086068815265",
  appId: "1:1086068815265:web:1fd2452f4946d97c5f47e0",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

module.exports = {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
};
