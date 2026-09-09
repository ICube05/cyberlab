import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.WEB_PORT ?? 5173);
const apiTarget = process.env.API_TARGET ?? 'http://127.0.0.1:5174';

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      // Consume the core package straight from source — one type system, no build step.
      '@cyberlab/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, ws: false },
    },
  },
  preview: {
    port,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, ws: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
