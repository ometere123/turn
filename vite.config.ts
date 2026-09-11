import nimiq from '@nimiq/core/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const hmrHost = process.env.VITE_HMR_HOST

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), nimiq()],
  build: {
    target: 'esnext',
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5173,
    hmr: hmrHost
      ? {
          host: hmrHost,
          protocol: 'ws',
          clientPort: 5173,
        }
      : undefined,
  },
})
