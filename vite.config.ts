import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<user>.github.io/ccm-lmi/ on GitHub Pages.
  base: '/ccm-lmi/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'CCM-LMI: Control Contraction Metrics',
        short_name: 'CCM-LMI',
        description:
          'Analyze and design nonlinear control systems with Control Contraction Metrics and LMIs — runs entirely in your browser.',
        theme_color: '#0f2a47',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/ccm-lmi/',
        scope: '/ccm-lmi/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The app is fully self-contained (the SDP solver is pure JS), so the
        // whole bundle is precached and the app works offline with no network.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
})
