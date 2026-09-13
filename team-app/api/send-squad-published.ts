import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Vierte Benachrichtigungsart: informiert alle mit aktivierten Push-
// Benachrichtigungen, sobald der Trainer den Kader für ein Spiel
// veröffentlicht (games.squad_published false -> true). Bewusst an alle
// gesendet statt nur an ausgewählte Spieler — auch wer nicht im Kader
// steht, soll das direkt erfahren, und der Query dafür bräuchte einen
// zusätzlichen Join zum Trigger-Zeitpunkt.
//
// Bewusst komplett ohne eigene lokale Imports — siehe send-training-
// reminders.ts für den Grund.

interface SquadPublishedPayload {
  type?: string;
  table?: string;
  record?: {
    opponent?: string;
    game_date?: string;
  };
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
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

  const body = req.body as SquadPublishedPayload;
  const opponent = body?.record?.opponent;
  const gameDate = body?.record?.game_date;
  if (!opponent || !gameDate) {
    res.status(400).json({ error: 'Kein opponent/game_date im Webhook-Payload.' });
    return;
  }

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
    title: 'Kader veröffentlicht',
    body: `Kader für Spiel gegen ${opponent} am ${fmtDate(gameDate)} ist online.`,
    url: '/spiele?kader=1'
  });

  const staleIds: string[] = [];
  let sent = 0;

  await Promise.all(
    ((subs as { id: string; endpoint: string; p256dh: string; auth_key: string }[] | null) ?? []).map(
      async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            payload
          );
          sent += 1;
        } catch (err) {
          const statusCode = (err as { statusCode?: number } | null)?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            staleIds.push(sub.id);
          }
        }
      }
    )
  );

  if (staleIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds);
  }

  res.status(200).json({ sent, removed: staleIds.length, total: (subs ?? []).length });
}
