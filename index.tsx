import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initAnalytics } from './services/firebase';

// 初始化 Firebase Analytics
initAnalytics();

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error("找不到 root 節點，請檢查 index.html。");
}