import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Sechste Benachrichtigungsart: informiert NUR den betroffenen Spieler,
// wenn er NACH bereits veröffentlichtem Kader neu in den Kader aufgenommen
// wird (z. B. Nachnominierung, weil jemand anders abgesagt hat). Wird der
// Kader initial zusammengestellt (squad_published noch false), soll das
// noch keine Push auslösen — das prüft diese Function selbst anhand von
// games.squad_published, da der Trigger auf game_squad selbst nicht weiß,
// ob der Kader schon veröffentlicht ist.
//
// Bewusst komplett ohne eigene lokale Imports — siehe send-training-
// reminders.ts für den Grund.

interface SquadNominationPayload {
  type?: string;
  table?: string;
  record?: {
    game_id?: string;
    player_id?: string;
    is_selected?: boolean;
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

  const body = req.body as SquadNominationPayload;
  const gameId = body?.record?.game_id;
  const playerId = body?.record?.player_id;
  const isSelected = body?.record?.is_selected;
  if (!gameId || !playerId) {
    res.status(400).json({ error: 'Kein game_id/player_id im Webhook-Payload.' });
    return;
  }
  if (isSelected !== true) {
    res.status(200).json({ skipped: 'not_selected' });
    return;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const [gameRes, playerRes, linkRes] = await Promise.all([
    supabase.from('games').select('opponent, game_date, squad_published').eq('id', gameId).maybeSingle(),
    supabase.from('players').select('name').eq('id', playerId).maybeSingle(),
    supabase.from('player_auth_links').select('auth_user_id').eq('player_id', playerId).maybeSingle()
  ]);

  const queryError = gameRes.error ?? playerRes.error ?? linkRes.error;
  if (queryError) {
    // eslint-disable-next-line no-console
    console.error('send-squad-nomination query error', queryError);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
    return;
  }

  if (!gameRes.data?.squad_published) {
    // Kader wird gerade erst zusammengestellt, noch nicht veröffentlicht —
    // das ist keine Nachnominierung, dafür gibt es die "Kader veröffentlicht"-Push.
    res.status(200).json({ skipped: 'squad_not_yet_published' });
    return;
  }

  const opponent = gameRes.data?.opponent;
  const gameDate = gameRes.data?.game_date;
  const playerName = playerRes.data?.name;
  const authUserId = linkRes.data?.auth_user_id;
  if (!opponent || !gameDate || !playerName || !authUserId) {
    res.status(200).json({ skipped: 'game_or_player_not_found' });
    return;
  }

  const { data: subs, error: loadError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('user_id', authUserId);

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
    title: 'Kader-Nachnominierung',
    body: `Du wurdest für das Spiel gegen ${opponent} am ${fmtDate(gameDate)} in den Kader nachnominiert.`,
    url: '/spiele'
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
