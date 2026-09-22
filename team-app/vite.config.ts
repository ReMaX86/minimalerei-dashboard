import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest statt generateSW: nur so kann src/sw.ts eigene
      // push/notificationclick-Listener registrieren (Push-Benachrichtigungen).
      // Precaching + Runtime-Caching (siehe workbox-Optionen unten) werden
      // dafür jetzt manuell in src/sw.ts nachgebildet statt hier generiert.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/favicon.svg', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'],
      manifest: {
        name: 'Tipoff',
        short_name: 'Tipoff',
        description: 'Kader, Trikots, Kampfgericht und Spielplan deines Teams, an einem Ort.',
        theme_color: '#0A0C0F',
        background_color: '#0A0C0F',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      // Precaching + Runtime-Caching (App-Shell + NetworkFirst für die
      // Supabase-API) stehen jetzt in src/sw.ts — hier nur noch, welche
      // Build-Dateien in den Precache-Manifest aufgenommen werden.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ],
  server: { port: 5173 }
});
