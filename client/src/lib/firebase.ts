import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: "nordic-homebuilding1.firebaseapp.com",
  projectId: "nordic-homebuilding1",
  storageBucket: "nordic-homebuilding1.firebasestorage.app",
  messagingSenderId: "126571617593",
  appId: "1:126571617593:web:80fcdb36b73a87489b1ce8",
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
