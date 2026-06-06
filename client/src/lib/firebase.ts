import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: "nordic-homebuilding.firebaseapp.com",
  projectId: "nordic-homebuilding",
  storageBucket: "nordic-homebuilding.firebasestorage.app",
  messagingSenderId: "1086068815265",
  appId: "1:1086068815265:web:1fd2452f4946d97c5f47e0",
  measurementId: "G-5BRC2FMPNT",
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
