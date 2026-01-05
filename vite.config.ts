import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Fix type error: Property 'cwd' does not exist on type 'Process'
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    base: '/',
    define: {
      'global': 'window',
      // 正確注入 API_KEY
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // 保持對 process.env 的相容性定義
      'process.env': {
        NODE_ENV: process.env.NODE_ENV || 'development'
      }
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