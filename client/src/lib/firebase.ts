import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: "nordic-homebuilding.firebaseapp.com",
  projectId: "nordic-homebuilding",
  storageBucket: "nordic-homebuilding.firebasestorage.app",
  messagingSenderId: "1086068815265",
  appId: "1:1086068815265:web:1fd2452f4946d97c5f47e0",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

let analyticsInstance: ReturnType<typeof getAnalytics> | null = null;
isSupported().then((supported) => {
  if (supported) {
    analyticsInstance = getAnalytics(app);
  }
});

export const getAnalyticsInstance = () => analyticsInstance;
