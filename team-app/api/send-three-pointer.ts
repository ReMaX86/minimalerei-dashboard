import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Neunte Benachrichtigungsart, Erweiterung des Live-Tickers (siehe
// send-quarter-score.ts/send-game-finished.ts): sobald im Live-Stats-
// Tracker ein Dreier fürs eigene Team erfasst wird (game_stat_events-INSERT
// mit team='us' und stat_type='fg3_made'), geht sofort eine Push mit dem
// aktuellen Spielstand raus. Anders als bei Viertelwechsel/Spielende
// braucht es hier keine Dedupe-Ratchet-Spalte — jedes INSERT ist ein
// eigenständiger, echter Treffer, also soll jedes INSERT genau einmal
// pushen. Der Trigger reagiert deshalb bewusst nur auf INSERT (nicht auf
// DELETE) — ein versehentlich erfasster Dreier, der über "Zurück" im
// Tracker sofort wieder gelöscht wird, hat die Push zu diesem Zeitpunkt
// aber schon verschickt (dieselbe Art von akzeptiertem Restrisiko wie beim
// bewusst weggelassenen Push für die Verlängerung, siehe README).
//
// Geht an alle mit aktivierten Push-Benachrichtigungen, wie die anderen
// beiden Live-Ticker-Pushes. Der eigentliche Auslöser ist ein von Hand
// angelegter Trigger auf game_stat_events (siehe README) — enthält den
// Webhook-Secret im Klartext, deshalb bewusst nicht als Migration versioniert.
//
// Bewusst komplett ohne eigene lokale Imports — siehe send-training-
// reminders.ts für den Grund.

interface ThreePointerPayload {
  type?: string;
  table?: string;
  record?: {
    game_id?: string;
    player_id?: string;
    // Nur zum manuellen Testen per SQL Editor gesetzt (siehe README) — schränkt
    // den Versand auf eine einzelne auth_user_id ein, statt an alle zu gehen.
    // Der echte Trigger (Dreier im Tracker) übergibt das nie, Live-Verhalten
    // (Broadcast an alle) bleibt also unverändert.
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

  const body = req.body as ThreePointerPayload;
  const gameId = body?.record?.game_id;
  const playerId = body?.record?.player_id;
  const testUserId = body?.record?.test_user_id;
  if (!gameId || !playerId) {
    res.status(400).json({ error: 'Kein game_id/player_id im Webhook-Payload.' });
    return;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const [gameRes, playerRes] = await Promise.all([
    supabase.from('games').select('opponent, final_score_us, final_score_opponent').eq('id', gameId).maybeSingle(),
    supabase.from('players').select('name').eq('id', playerId).maybeSingle()
  ]);

  if (gameRes.error || playerRes.error) {
    const queryError = gameRes.error ?? playerRes.error!;
    // eslint-disable-next-line no-console
    console.error('send-three-pointer query error', queryError);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
    return;
  }

  const game = gameRes.data;
  const player = playerRes.data;
  if (!game || game.final_score_us === null || game.final_score_opponent === null || !player) {
    res.status(200).json({ skipped: 'game_or_player_not_found' });
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

  const firstName = player.name.split(' ')[0];
  const payload = JSON.stringify({
    title: '💥 Bang!',
    body: `${firstName} from Downtown — TB Wülfrath ${game.final_score_us}:${game.final_score_opponent} ${game.opponent}`,
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
