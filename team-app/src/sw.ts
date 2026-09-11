/// <reference lib="webworker" />

// Eigener Service-Worker-Quellcode statt des von vite-plugin-pwa automatisch
// generierten (`strategies: 'generateSW'`) — nur so lassen sich eigene
// `push`/`notificationclick`-Listener registrieren (für #106 Push-
// Benachrichtigungen). Precaching + Runtime-Caching bilden 1:1 nach, was
// vorher über die `workbox`-Optionen in vite.config.ts generiert wurde, damit
// sich am Offline-/Cache-Verhalten für bereits installierte Nutzer nichts
// ändert.

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// registerType 'autoUpdate' erwartet, dass ein neuer Service Worker sofort
// übernimmt statt auf das Schließen aller Tabs zu warten — bei
// `generateSW` erledigt workbox-build das automatisch, im eigenen SW-Code
// müssen wir es selbst setzen.
self.skipWaiting();
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  ({ url }) => url.hostname.endsWith('.supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-api',
    networkTimeoutSeconds: 8,
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 })]
  })
);

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }

  const title = payload.title ?? 'TBW Team App';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url ?? '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string | undefined) ?? '/';

  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const target = new URL(url, self.location.origin).href;
      const existing = clientsArr.find((c) => c.url === target || c.url === self.location.origin + '/');
      if (existing && 'focus' in existing) {
        await existing.focus();
        if ('navigate' in existing) await (existing as WindowClient).navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
