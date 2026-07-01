import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  // Admin servido no próprio domínio (ex.: sgf-admin.vercel.app,
  // futuramente admin.gestao2026.com). base padrão '/'.
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5174,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
});
