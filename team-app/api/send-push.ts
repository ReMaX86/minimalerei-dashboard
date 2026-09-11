import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Nimmt den Supabase-Database-Webhook für neue Announcements entgegen und
// verschickt Web-Push an alle gespeicherten push_subscriptions. Läuft als
// Vercel-Serverless-Function (Hobby-Tarif deckt das kostenlos ab) statt als
// Supabase Edge Function, weil wir dafür keinen CLI-/Dashboard-Zugriff auf
// das Supabase-Projekt brauchen — Deploy passiert automatisch mit jedem
// Push aufs Repo, wie bei der restlichen App.
//
// Setup siehe README "Push-Benachrichtigungen": Vercel-Env-Vars
// (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
// SUPABASE_SERVICE_ROLE_KEY, PUSH_WEBHOOK_SECRET) + Supabase Database
// Webhook auf INSERT für "announcements".

interface AnnouncementWebhookPayload {
  type?: string;
  table?: string;
  record?: {
    message?: string;
    author_name?: string;
  };
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const webhookSecret = process.env.PUSH_WEBHOOK_SECRET;
  if (!webhookSecret || req.headers['x-webhook-secret'] !== webhookSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject || !supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Server ist nicht vollständig für Push-Versand konfiguriert.' });
    return;
  }

  const body = req.body as AnnouncementWebhookPayload;
  const message = body?.record?.message;
  if (!message) {
    res.status(400).json({ error: 'Kein Announcement-Text im Webhook-Payload.' });
    return;
  }
  const authorName = body?.record?.author_name;

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: subs, error: loadError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key');

  if (loadError) {
    // eslint-disable-next-line no-console
    console.error('push_subscriptions load error', loadError);
    res.status(500).json({
      error: 'push_subscriptions konnten nicht geladen werden.',
      details: loadError.message,
      code: loadError.code
    });
    return;
  }

  const payload = JSON.stringify({
    title: authorName ? `Neue Meldung von ${authorName}` : 'Neue Meldung',
    body: message,
    url: '/'
  });

  const staleIds: string[] = [];
  let sent = 0;

  await Promise.all(
    ((subs as PushSubscriptionRow[]) ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload
        );
        sent += 1;
      } catch (err) {
        // 404/410 = die Subscription existiert beim Push-Dienst nicht mehr
        // (z. B. Browser-Daten gelöscht) — aufräumen statt bei jedem
        // künftigen Versand erneut fehlzuschlagen.
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id);
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds);
  }

  res.status(200).json({ sent, removed: staleIds.length, total: (subs ?? []).length });
}
