import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Fünfte Benachrichtigungsart: informiert NUR die Trainer (nicht alle
// Nutzer wie die übrigen Arten), sobald ein Spieler seinen Kader-Platz
// absagt (game_squad.confirmation -> 'declined'). Der Trigger übergibt nur
// game_id/player_id — Name und Gegner werden hier serverseitig
// nachgeschlagen, da der Trigger sie sonst per Sub-Query im SQL selbst
// holen müsste.
//
// Bewusst komplett ohne eigene lokale Imports — siehe send-training-
// reminders.ts für den Grund.

interface SquadDeclinePayload {
  type?: string;
  table?: string;
  record?: {
    game_id?: string;
    player_id?: string;
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

  const body = req.body as SquadDeclinePayload;
  const gameId = body?.record?.game_id;
  const playerId = body?.record?.player_id;
  if (!gameId || !playerId) {
    res.status(400).json({ error: 'Kein game_id/player_id im Webhook-Payload.' });
    return;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const [gameRes, playerRes, trainersRes, adminPlayersRes] = await Promise.all([
    supabase.from('games').select('opponent, game_date').eq('id', gameId).maybeSingle(),
    supabase.from('players').select('name').eq('id', playerId).maybeSingle(),
    supabase.from('trainers').select('id'),
    // "Trainer" heißt hier wie überall sonst im Projekt (siehe is_trainer()
    // in supabase/migrations/0006_player_admin_flag.sql): echte Trainer
    // (trainers-Tabelle) UND Spieler mit Trainer-Rechten (players.is_admin,
    // z. B. ein spielender Trainer) — sonst bekommen Admin-Spieler diese
    // Push nie, egal auf welchem Gerät (live so aufgefallen).
    supabase.from('players').select('id').eq('is_admin', true)
  ]);

  const queryError = gameRes.error ?? playerRes.error ?? trainersRes.error ?? adminPlayersRes.error;
  if (queryError) {
    // eslint-disable-next-line no-console
    console.error('send-squad-decline query error', queryError);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
    return;
  }

  const opponent = gameRes.data?.opponent;
  const gameDate = gameRes.data?.game_date;
  const playerName = playerRes.data?.name;
  if (!opponent || !gameDate || !playerName) {
    res.status(200).json({ skipped: 'game_or_player_not_found' });
    return;
  }

  const trainerIds = ((trainersRes.data as { id: string }[] | null) ?? []).map((t) => t.id);
  const adminPlayerIds = ((adminPlayersRes.data as { id: string }[] | null) ?? []).map((p) => p.id);

  let adminPlayerAuthUserIds: string[] = [];
  if (adminPlayerIds.length > 0) {
    const { data: adminLinkRows, error: adminLinkError } = await supabase
      .from('player_auth_links')
      .select('auth_user_id')
      .in('player_id', adminPlayerIds);
    if (adminLinkError) {
      // eslint-disable-next-line no-console
      console.error('send-squad-decline query error', adminLinkError);
      res
        .status(500)
        .json({ error: 'Daten konnten nicht geladen werden.', details: adminLinkError.message, code: adminLinkError.code });
      return;
    }
    adminPlayerAuthUserIds = ((adminLinkRows as { auth_user_id: string }[] | null) ?? []).map((r) => r.auth_user_id);
  }

  const recipientIds = [...trainerIds, ...adminPlayerAuthUserIds];
  if (recipientIds.length === 0) {
    res.status(200).json({ sent: 0, reason: 'no_trainers' });
    return;
  }

  const { data: subs, error: loadError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .in('user_id', recipientIds);

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
    title: 'Kader-Absage',
    body: `${playerName} kann leider nicht am Spiel gegen ${opponent} am ${fmtDate(gameDate)} teilnehmen.`,
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
