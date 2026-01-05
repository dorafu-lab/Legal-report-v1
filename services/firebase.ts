import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAW85eY0VQPzob5i139VCwLszmTtRODCAc",
  authDomain: "legalv2.firebaseapp.com",
  projectId: "legalv2",
  storageBucket: "legalv2.firebasestorage.app",
  messagingSenderId: "494056311916",
  appId: "1:494056311916:web:a6f5edf7220a0ed0ee1c49",
  measurementId: "G-ETFCMJB8KB"
};

const app = initializeApp(firebaseConfig);

// 非同步檢查是否支援 Analytics 並初始化
export const initAnalytics = async () => {
  if (typeof window !== "undefined") {
    try {
      const supported = await isSupported();
      if (supported) {
        return getAnalytics(app);
      }
    } catch (e) {
      console.warn("Firebase Analytics 初始化失敗:", e);
    }
  }
  return null;
};

export default app;