import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Standalone Hotess_HQ app. Dev proxy mirrors Booking_HQ's shape (relative
// "/api/..." calls proxied to the backend) but the target is env-driven so no
// secrets/hosts are hardcoded here. Set VITE_API_PROXY_TARGET in .env.local.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'https://localhost:7018',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
