import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const apiTarget = process.env['RATEMIX_API_PROXY'] ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Same-origin proxy keeps the httpOnly refresh cookie first-party in development.
    proxy: {
      '/trpc': { target: apiTarget, changeOrigin: true },
      '/auth/oauth': { target: apiTarget, changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/trpc': { target: apiTarget, changeOrigin: true },
      '/auth/oauth': { target: apiTarget, changeOrigin: true },
    },
  },
});
