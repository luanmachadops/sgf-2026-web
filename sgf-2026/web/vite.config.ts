import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  // Caminho ABSOLUTO para os assets. Com './' o index.html referencia
  // `./assets/…`, que o navegador resolve contra a rota atual: em `/posto/login`
  // vira `/posto/assets/index-*.js`, arquivo que não existe. O rewrite de SPA
  // então devolve o index.html no lugar do bundle e o navegador recusa o módulo
  // ("MIME type of text/html"), deixando o portal em branco. Só quebrava nas
  // rotas de dois segmentos — os portais do posto e da oficina.
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
