import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' : Electron에서 file:// 로 dist/index.html을 직접 열기 때문에 상대 경로가 필요합니다.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
  },
  server: { port: 5173 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
