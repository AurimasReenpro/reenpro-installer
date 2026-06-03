import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing vendor libs into their own long-cached
        // chunks so a code change to the app doesn't bust the whole bundle and
        // the browser can cache vendors across deploys.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('/xlsx/') || id.includes('\\xlsx\\')) return 'xlsx';
          if (
            id.includes('react-router') ||
            id.includes('/react-dom/') || id.includes('\\react-dom\\') ||
            id.includes('/react/') || id.includes('\\react\\')
          ) return 'react-vendor';
        },
      },
    },
  },
  server: {
    port: 3000,
    // Bind all interfaces so the dev server is reachable on the LAN (phone on
    // the same Wi-Fi) or via an ngrok tunnel.
    host: true,
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.io', '.ngrok.app'],
  },
  preview: {
    port: 3000,
    host: true,
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.io', '.ngrok.app'],
  },
})
