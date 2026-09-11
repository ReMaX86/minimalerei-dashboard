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
      includeAssets: ['favicon.ico', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'],
      manifest: {
        name: 'TBW Team App',
        short_name: 'TBW Team',
        description: 'Team-Organisation für TB Wülfrath Herren',
        theme_color: '#07160F',
        background_color: '#F3F6F4',
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
