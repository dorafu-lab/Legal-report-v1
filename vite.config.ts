import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 載入環境變數 (包含 .env 檔案與系統變數)
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    base: '/',
    define: {
      'global': 'window',
      // 正確注入 API_KEY：優先使用 loadEnv 載入的變數，若無則嘗試讀取系統環境變數
      // 使用 JSON.stringify 確保插入的是字串值
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || ''),
    },
    server: {
      port: 3000,
      host: true
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'recharts', 'lucide-react', 'xlsx'],
          },
        },
      },
    }
  };
});