import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import type { OfficiatingTaskType, Player, ReminderSettings } from '../src/types/database';

// Dritte Benachrichtigungsart nach "neue Meldung" (send-push.ts) und der
// Training-Erinnerung (send-training-reminders.ts): erinnert Spieler mit
// einer zugewiesenen Kampfgericht-Aufgabe (officiating_tasks.
// assigned_player_id) an ihren Einsatz, zu bis zu drei Zeitpunkten vor
// Spielbeginn (reminder_settings.officiating_push_offset_{1,2,3}_min,
// Migration 0049, Default 5 Tage/1 Tag/2 Stunden vorher) — im Admin unter
// Funktionen -> Erinnerungen änderbar.
//
// Anders als beim Training gibt es hier keine Zu-/Absage: die Aufgabe ist
// bereits vom Trainer fest zugewiesen, die Erinnerung ist reine
// Gedächtnisstütze. Dedupliziert wird deshalb direkt pro einzelner Aufgabe
// (officiating_reminder_log.officiating_task_id + reminder_type), nicht
// pro Spieler+Termin wie beim Training — eine Aufgabe hat ohnehin nur einen
// zugewiesenen Spieler. Und anders als beim Training (eine einzelne
// "nächster Termin"-Ermittlung) gibt es hier potenziell mehrere
// unabhängige Spiele mit je eigenen fälligen Aufgaben in einem einzigen
// Durchlauf — die Fälligkeitsprüfung läuft deshalb über jedes anstehende
// Spiel mit seinen zugewiesenen Aufgaben einzeln, nicht über eine einzelne
// "nächste"-Ermittlung wie beim Training.
//
// Aufgerufen per pg_cron (wie die Training-Erinnerung), siehe README
// "Push-Benachrichtigungen" für die Einrichtung — am einfachsten derselbe
// Job-Takt (alle 10 Minuten), nur ein zusätzlicher cron.schedule(...)-Eintrag
// mit dieser URL statt send-training-reminders.
//
// Bewusst KOMPLETT ohne eigene lokale Imports (siehe ausführliche Begründung
// in send-training-reminders.ts — Vercel bündelt für api/-Functions dieses
// Projekts keine lokalen Dateiabhängigkeiten). Zeitzonen-Umrechnung und
// Claim-vor-Versand-Muster sind deshalb bewusste Kopien von dort — bei
// Änderungen an diesen beiden Mustern bitte dort UND hier synchron
// nachziehen.

const OFFICIATING_TASK_LABELS: Record<OfficiatingTaskType, string> = {
  uhr: '24-Sekunden-Uhr',
  anschreiber: 'Anschreiben',
  zeit: 'Zeit & Punkte'
};

// Kopie von berlinTimeToUtc() aus send-training-reminders.ts — siehe dort
// für die ausführliche Begründung (Vercel läuft mit TZ=UTC, Spielzeiten
// sind aber als deutsche Wanduhrzeit gemeint).
function berlinTimeToUtc(y: number, mo: number, d: number, h: number, m: number): Date {
  const asIfUtc = new Date(Date.UTC(y, mo - 1, d, h, m));
  const berlinReading = new Date(asIfUtc.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const offsetMs = asIfUtc.getTime() - berlinReading.getTime();
  return new Date(asIfUtc.getTime() + offsetMs);
}

function fmtWeekdayShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${d.toLocaleDateString('de-DE', { weekday: 'short' })}.`;
}

function fmtTime(time: string): string {
  return time.slice(0, 5);
}

function officiatingGameLabel(game: { opponent_teams: string; opponent: string | null }): string {
  return game.opponent ? `${game.opponent_teams} vs. ${game.opponent}` : game.opponent_teams;
}

type ReminderSlot = 'slot_1' | 'slot_2' | 'slot_3';

interface OfficiatingGameRow {
  id: string;
  game_date: string;
  game_time: string | null;
  opponent_teams: string;
  opponent: string | null;
  location: string;
}

interface OfficiatingTaskRow {
  id: string;
  officiating_game_id: string;
  task_type: OfficiatingTaskType;
  assigned_player_id: string | null;
}

interface PushSubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

// Kopie von withRetry() aus send-training-reminders.ts.
async function withRetry<T>(fn: () => PromiseLike<T>): Promise<T> {
  const first = await fn();
  if (!(first as { error?: unknown }).error) return first;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return fn();
}

interface Candidate {
  task: OfficiatingTaskRow;
  game: OfficiatingGameRow;
  type: ReminderSlot;
  player: Player;
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

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const [settingsRes, gamesRes, tasksRes, playersRes] = await Promise.all([
    withRetry(() => supabase.from('reminder_settings').select('*').limit(1).maybeSingle()),
    withRetry(() => supabase.from('officiating_games').select('*').not('game_time', 'is', null)),
    withRetry(() => supabase.from('officiating_tasks').select('*').not('assigned_player_id', 'is', null)),
    withRetry(() => supabase.from('players').select('*').eq('is_active', true))
  ]);

  const queryError = settingsRes.error ?? gamesRes.error ?? tasksRes.error ?? playersRes.error;
  if (queryError) {
    // eslint-disable-next-line no-console
    console.error('send-officiating-reminders query error', queryError);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
    return;
  }

  const settings = settingsRes.data as ReminderSettings | null;
  if (!settings?.enabled) {
    res.status(200).json({ skipped: 'reminders_disabled' });
    return;
  }

  const offsets = (
    [
      { type: 'slot_1', minutes: settings.officiating_push_offset_1_min },
      { type: 'slot_2', minutes: settings.officiating_push_offset_2_min },
      { type: 'slot_3', minutes: settings.officiating_push_offset_3_min }
    ] satisfies { type: ReminderSlot; minutes: number }[]
  ).filter((o) => o.minutes > 0);

  if (offsets.length === 0) {
    res.status(200).json({ skipped: 'offsets_disabled' });
    return;
  }

  const now = new Date();
  const games = (gamesRes.data as OfficiatingGameRow[]) ?? [];
  const tasks = (tasksRes.data as OfficiatingTaskRow[]) ?? [];
  const playersById = new Map(((playersRes.data as Player[]) ?? []).map((p) => [p.id, p] as const));

  // Jedes anstehende Spiel mit gesetzter Uhrzeit einzeln prüfen (nicht nur
  // das nächste): mehrere Spiele können in einem Durchlauf gleichzeitig
  // fällige Aufgaben haben.
  const candidates: Candidate[] = [];
  for (const game of games) {
    if (!game.game_time) continue;
    const [y, mo, d] = game.game_date.split('-').map(Number);
    const [h, m] = game.game_time.split(':').map(Number);
    const startsAt = berlinTimeToUtc(y, mo, d, h, m);
    if (startsAt <= now) continue;

    const gameTasks = tasks.filter((t) => t.officiating_game_id === game.id);
    for (const task of gameTasks) {
      const player = task.assigned_player_id ? playersById.get(task.assigned_player_id) : undefined;
      if (!player) continue;
      for (const offset of offsets) {
        if (startsAt.getTime() - offset.minutes * 60_000 <= now.getTime()) {
          candidates.push({ task, game, type: offset.type, player });
        }
      }
    }
  }

  if (candidates.length === 0) {
    res.status(200).json({ skipped: 'not_due_yet' });
    return;
  }

  const logRes = await withRetry(() =>
    supabase
      .from('officiating_reminder_log')
      .select('officiating_task_id, reminder_type')
      .in(
        'officiating_task_id',
        candidates.map((c) => c.task.id)
      )
  );
  if (logRes.error) {
    // eslint-disable-next-line no-console
    console.error('send-officiating-reminders query error', logRes.error);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: logRes.error.message, code: logRes.error.code });
    return;
  }
  const alreadySent = new Set(
    ((logRes.data as { officiating_task_id: string; reminder_type: string }[] | null) ?? []).map(
      (r) => `${r.officiating_task_id}:${r.reminder_type}`
    )
  );
  const stillCandidates = candidates.filter((c) => !alreadySent.has(`${c.task.id}:${c.type}`));

  if (stillCandidates.length === 0) {
    res.status(200).json({ sent: 0, attempted: 0 });
    return;
  }

  // Claim VOR dem Versand — gleiches Muster wie in send-training-reminders.ts
  // (siehe dortiger Kommentar für die ausführliche Begründung): der
  // Unique-Key von officiating_reminder_log wirkt als atomarer Lock, damit
  // zwei überlappende Durchläufe dieselbe Aufgaben-Erinnerung nicht doppelt
  // verschicken.
  const claimRows = stillCandidates.map((c) => ({
    officiating_task_id: c.task.id,
    reminder_type: c.type
  }));
  const claimRes = await supabase
    .from('officiating_reminder_log')
    .upsert(claimRows, { onConflict: 'officiating_task_id,reminder_type', ignoreDuplicates: true })
    .select('officiating_task_id, reminder_type');
  if (claimRes.error) {
    // eslint-disable-next-line no-console
    console.error('send-officiating-reminders query error', claimRes.error);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: claimRes.error.message, code: claimRes.error.code });
    return;
  }
  const claimedKeys = new Set(
    ((claimRes.data as { officiating_task_id: string; reminder_type: string }[] | null) ?? []).map(
      (r) => `${r.officiating_task_id}:${r.reminder_type}`
    )
  );
  const toSend = stillCandidates.filter((c) => claimedKeys.has(`${c.task.id}:${c.type}`));

  if (toSend.length === 0) {
    res.status(200).json({ sent: 0, attempted: 0 });
    return;
  }

  const playerIds = [...new Set(toSend.map((c) => c.player.id))];
  const linkRes = await withRetry(() =>
    supabase.from('player_auth_links').select('player_id, auth_user_id').in('player_id', playerIds)
  );
  if (linkRes.error) {
    // eslint-disable-next-line no-console
    console.error('send-officiating-reminders query error', linkRes.error);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: linkRes.error.message, code: linkRes.error.code });
    return;
  }
  // Mehrgeräte-Login (siehe player_auth_links in supabase/migrations/0001_init.sql):
  // ein Spieler kann mehrere auth_user_id-Zeilen haben, deshalb Liste statt
  // einzelnem Wert.
  const authUserIdsByPlayer = new Map<string, string[]>();
  for (const row of (linkRes.data as { player_id: string; auth_user_id: string }[] | null) ?? []) {
    const list = authUserIdsByPlayer.get(row.player_id) ?? [];
    list.push(row.auth_user_id);
    authUserIdsByPlayer.set(row.player_id, list);
  }
  const authUserIds = [...authUserIdsByPlayer.values()].flat();

  const subRes = await withRetry(() =>
    supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth_key')
      .in('user_id', authUserIds.length > 0 ? authUserIds : ['00000000-0000-0000-0000-000000000000'])
  );
  if (subRes.error) {
    // eslint-disable-next-line no-console
    console.error('send-officiating-reminders query error', subRes.error);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: subRes.error.message, code: subRes.error.code });
    return;
  }

  const subsByAuthUser = new Map<string, PushSubRow[]>();
  for (const sub of (subRes.data as PushSubRow[] | null) ?? []) {
    const list = subsByAuthUser.get(sub.user_id) ?? [];
    list.push(sub);
    subsByAuthUser.set(sub.user_id, list);
  }

  const staleSubIds: string[] = [];
  let sent = 0;

  await Promise.all(
    toSend.map(async (c) => {
      const playerAuthUserIds = authUserIdsByPlayer.get(c.player.id) ?? [];
      const subs = playerAuthUserIds.flatMap((authUserId) => subsByAuthUser.get(authUserId) ?? []);
      const firstName = c.player.name.split(' ')[0];
      const payload = JSON.stringify({
        title: `Kampfgericht ${fmtWeekdayShort(c.game.game_date)} ${fmtTime(c.game.game_time!)} Uhr`,
        body: `${firstName}, du bist für "${OFFICIATING_TASK_LABELS[c.task.task_type]}" eingeteilt (${officiatingGameLabel(c.game)}).`,
        url: '/kampfgericht'
      });

      await Promise.all(
        subs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
              payload
            );
            sent += 1;
          } catch (err) {
            const statusCode = (err as { statusCode?: number } | null)?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
              staleSubIds.push(sub.id);
            }
          }
        })
      );
      // Geloggt ist der Versuch schon durch den Claim oben — auch wenn der
      // Spieler (noch) kein Gerät angemeldet hat, zählt "fällig gewesen"
      // als erledigt.
    })
  );

  if (staleSubIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleSubIds);
  }

  res.status(200).json({
    sent,
    attempted: toSend.length,
    removed: staleSubIds.length
  });
}
