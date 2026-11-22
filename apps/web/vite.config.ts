import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: the API runs on :8787 and Vite proxies /api to it. Prod: the API serves dist/ itself.
export default defineConfig(({ mode }) => ({
  base: mode === 'demo' ? './' : '/',
  // the static demo (no server): set here, not in an .env file (those stay out of git)
  define: mode === 'demo' ? { 'import.meta.env.VITE_STATIC': JSON.stringify('1') } : {},
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8787' } },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // three.js and React change rarely: separate chunks stay cached across deploys
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
          if (/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)) return 'react'
        },
      },
    },
  },
}))
