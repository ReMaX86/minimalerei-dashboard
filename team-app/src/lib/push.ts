import { supabase } from './supabase';

export type PushStatus = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// VAPID Public Key ist unbedenklich öffentlich (Gegenstück zum privaten Key,
// der nur serverseitig beim Versand-Endpunkt liegt) — fehlt er, ist der
// Versand noch nicht eingerichtet; die Opt-in-Karte bleibt dann ohnehin über
// das "push_notifications"-Feature-Flag ausgeblendet (siehe README).
function vapidPublicKey(): string | null {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() || null;
}

// Web-Push-APIs erwarten den Application-Server-Key als Uint8Array, VAPID-
// Tools liefern ihn aber als URL-safe Base64 — Standard-Konvertierung laut
// MDN-Beispiel für pushManager.subscribe().
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported() || !vapidPublicKey()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'subscribed' : 'unsubscribed';
}

export async function subscribeToPush(): Promise<void> {
  const key = vapidPublicKey();
  if (!key) throw new Error('Push-Benachrichtigungen sind noch nicht eingerichtet.');
  if (!isPushSupported()) throw new Error('Push-Benachrichtigungen werden auf diesem Gerät nicht unterstützt.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Berechtigung für Benachrichtigungen wurde nicht erteilt.');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  const alreadySubscribed = !!subscription;
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource
    });
  }

  // Browser-Subscription und Supabase-Zeile sollen nie auseinanderlaufen —
  // schlägt das Speichern fehl, macht die Browser-Subscription auch wieder
  // rückgängig, statt dass die UI "aktiviert" zeigt, obwohl der Server das
  // Gerät gar nicht kennt und deshalb nie etwas verschicken würde.
  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Nicht angemeldet.');

    const json = subscription.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth_key: json.keys?.auth ?? ''
      },
      { onConflict: 'endpoint' }
    );
    if (error) throw error;
  } catch (err) {
    if (!alreadySubscribed) await subscription.unsubscribe();
    throw err;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}
