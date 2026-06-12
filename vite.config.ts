import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // New deploys are picked up automatically; the worker below claims clients
      // and skips waiting so a field device always loads the latest shell.
      registerType: 'autoUpdate',
      // We register the SW manually in main.tsx (see TASK 2).
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons.svg'],
      manifest: {
        name: 'Reenpro Installer',
        short_name: 'Reenpro',
        description: 'UAB Reenpro montuotojų lauko programėlė',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the full app shell (HTML/JS/CSS/icons/fonts) so it loads with zero network.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // SPA fallback to the cached index for any in-app route while offline.
        navigateFallback: '/index.html',
        // Never let the SW hijack Supabase/auth requests — those must hit the network;
        // offline DATA is handled by React Query's IndexedDB persistence + outbox.
        navigateFallbackDenylist: [/^\/auth/, /supabase\.co/],
        runtimeCaching: [
          {
            // Google Fonts (Inter) so typography survives offline.
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20 } },
          },
        ],
      },
      // Keep the SW off during `vite dev` to avoid HMR/stale-cache friction; it is
      // generated and active in the production build + preview.
      devOptions: { enabled: false },
    }),
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
