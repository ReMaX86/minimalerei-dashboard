import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Neunte Benachrichtigungsart: "Spiel gestartet", sobald der erste
// wurfrelevante game_stat_events-Eintrag für ein Spiel erfasst wird (egal
// ob eigener Korb oder Gegentreffer) — auf Nutzeranfrage, damit man auf der
// Startseite mitbekommt, dass gerade live getrackt wird, ohne extra
// nachzuschauen. Der auslösende Trigger (von Hand im SQL Editor angelegt,
// siehe README) dedupliziert über games.game_started_announced_at
// (Migration 0057) — verschickt also garantiert nur einmal pro Spiel.
//
// Wie bei "Zwischenstand"/"Spiel beendet": bekommt nur die game_id, liest
// den aktuellen Spielstand frisch aus games.final_score_us/opponent (statt
// den Wert selbst aus dem auslösenden Event zu berechnen) — die sind zum
// Zeitpunkt des tatsächlichen HTTP-Aufrufs (pg_net verschickt asynchron erst
// nach Transaktionsende) durch den parallelen recalc_game_score()-Trigger
// (Migration 0028) bereits aktuell.
//
// Bewusst komplett ohne eigene lokale Imports — siehe send-training-
// reminders.ts für den Grund.

interface GameStartedPayload {
  type?: string;
  table?: string;
  record?: {
    game_id?: string;
    // Nur zum manuellen Testen per SQL Editor gesetzt (siehe README) — schränkt
    // den Versand auf eine einzelne auth_user_id ein, statt an alle zu gehen.
    // Der echte Trigger (erster Korb) übergibt das nie, Live-Verhalten
    // bleibt also unverändert Broadcast an alle.
    test_user_id?: string;
  };
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

  const body = req.body as GameStartedPayload;
  const gameId = body?.record?.game_id;
  const testUserId = body?.record?.test_user_id;
  if (!gameId) {
    res.status(400).json({ error: 'Kein game_id im Webhook-Payload.' });
    return;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: game, error: queryError } = await supabase
    .from('games')
    .select('opponent, final_score_us, final_score_opponent')
    .eq('id', gameId)
    .maybeSingle();

  if (queryError) {
    // eslint-disable-next-line no-console
    console.error('send-game-started query error', queryError);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
    return;
  }

  if (!game || game.final_score_us === null || game.final_score_opponent === null) {
    res.status(200).json({ skipped: 'game_or_score_not_found' });
    return;
  }

  const subsQuery = supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth_key');
  const { data: subs, error: loadError } = await (testUserId ? subsQuery.eq('user_id', testUserId) : subsQuery);

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
    title: '🔴 Live: Spiel gestartet',
    body: `TB Wülfrath ${game.final_score_us}:${game.final_score_opponent} ${game.opponent} — jetzt live mitverfolgen.`,
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
