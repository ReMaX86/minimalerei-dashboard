import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import type { Player, ReminderSettings } from '../src/types/database';

// Vierte Benachrichtigungsart nach "neue Meldung" (send-push.ts), Training-
// (send-training-reminders.ts) und Kampfgericht-Erinnerung
// (send-officiating-reminders.ts): erinnert Spieler, die für ein
// veröffentlichtes Spiel im Kader stehen (game_squad.is_selected) und noch
// nicht geantwortet haben (game_squad.confirmation = 'pending'), an ihre
// Kader-Zusage/-Absage — zu bis zu drei Zeitpunkten vor Spielbeginn
// (reminder_settings.squad_push_offset_{1,2,3}_min, Migration 0051,
// Default 5/3/1 Tage vorher) — im Admin unter Funktionen -> Erinnerungen
// änderbar.
//
// Wie bei der Kampfgericht-Erinnerung (nicht wie beim Training mit seiner
// einzelnen "nächster Termin"-Ermittlung) gibt es hier potenziell mehrere
// unabhängige, veröffentlichte Spiele mit je eigenen fälligen Erinnerungen
// in einem einzigen Durchlauf — die Fälligkeitsprüfung läuft deshalb über
// jedes anstehende veröffentlichte Spiel einzeln. Dedupliziert wird wie
// beim Training pro Spieler+Termin (hier: pro Spiel, ohne zusätzlichen
// session_date-Schlüssel, da ein Spiel — anders als ein wiederkehrendes
// Training — nur einmal stattfindet).
//
// Aufgerufen per pg_cron (wie die anderen Erinnerungsarten), siehe README
// "Push-Benachrichtigungen" für die Einrichtung — am einfachsten derselbe
// Job-Takt (alle 10 Minuten), nur ein zusätzlicher cron.schedule(...)-Eintrag
// mit dieser URL.
//
// Bewusst KOMPLETT ohne eigene lokale Imports (siehe ausführliche Begründung
// in send-training-reminders.ts — Vercel bündelt für api/-Functions dieses
// Projekts keine lokalen Dateiabhängigkeiten). Zeitzonen-Umrechnung,
// withRetry() und das Claim-vor-Versand-Muster sind deshalb bewusste Kopien
// von dort — bei Änderungen an diesen Mustern bitte dort UND hier (UND in
// send-officiating-reminders.ts) synchron nachziehen.

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

type ReminderSlot = 'slot_1' | 'slot_2' | 'slot_3';

interface GameRow {
  id: string;
  game_date: string;
  game_time: string;
  opponent: string;
  squad_published: boolean;
}

interface GameSquadRow {
  game_id: string;
  player_id: string;
  is_selected: boolean;
  confirmation: string;
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
  game: GameRow;
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

  const [settingsRes, gamesRes, squadRes, playersRes] = await Promise.all([
    withRetry(() => supabase.from('reminder_settings').select('*').limit(1).maybeSingle()),
    withRetry(() => supabase.from('games').select('id, game_date, game_time, opponent, squad_published').eq('squad_published', true)),
    withRetry(() => supabase.from('game_squad').select('*').eq('is_selected', true).eq('confirmation', 'pending')),
    withRetry(() => supabase.from('players').select('*').eq('is_active', true))
  ]);

  const queryError = settingsRes.error ?? gamesRes.error ?? squadRes.error ?? playersRes.error;
  if (queryError) {
    // eslint-disable-next-line no-console
    console.error('send-squad-reminders query error', queryError);
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
      { type: 'slot_1', minutes: settings.squad_push_offset_1_min },
      { type: 'slot_2', minutes: settings.squad_push_offset_2_min },
      { type: 'slot_3', minutes: settings.squad_push_offset_3_min }
    ] satisfies { type: ReminderSlot; minutes: number }[]
  ).filter((o) => o.minutes > 0);

  if (offsets.length === 0) {
    res.status(200).json({ skipped: 'offsets_disabled' });
    return;
  }

  const now = new Date();
  const games = (gamesRes.data as GameRow[]) ?? [];
  const pendingSquadRows = (squadRes.data as GameSquadRow[]) ?? [];
  const playersById = new Map(((playersRes.data as Player[]) ?? []).map((p) => [p.id, p] as const));

  // Jedes anstehende, veröffentlichte Spiel einzeln prüfen (nicht nur das
  // nächste): mehrere Spiele können in einem Durchlauf gleichzeitig fällige
  // Erinnerungen haben.
  const candidates: Candidate[] = [];
  for (const game of games) {
    const [y, mo, d] = game.game_date.split('-').map(Number);
    const [h, m] = game.game_time.split(':').map(Number);
    const startsAt = berlinTimeToUtc(y, mo, d, h, m);
    if (startsAt <= now) continue;

    const pendingForGame = pendingSquadRows.filter((s) => s.game_id === game.id);
    for (const squadRow of pendingForGame) {
      const player = playersById.get(squadRow.player_id);
      if (!player) continue;
      for (const offset of offsets) {
        if (startsAt.getTime() - offset.minutes * 60_000 <= now.getTime()) {
          candidates.push({ game, type: offset.type, player });
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
      .from('squad_reminder_log')
      .select('game_id, player_id, reminder_type')
      .in(
        'game_id',
        candidates.map((c) => c.game.id)
      )
  );
  if (logRes.error) {
    // eslint-disable-next-line no-console
    console.error('send-squad-reminders query error', logRes.error);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: logRes.error.message, code: logRes.error.code });
    return;
  }
  const alreadySent = new Set(
    ((logRes.data as { game_id: string; player_id: string; reminder_type: string }[] | null) ?? []).map(
      (r) => `${r.game_id}:${r.player_id}:${r.reminder_type}`
    )
  );
  const stillCandidates = candidates.filter((c) => !alreadySent.has(`${c.game.id}:${c.player.id}:${c.type}`));

  if (stillCandidates.length === 0) {
    res.status(200).json({ sent: 0, attempted: 0 });
    return;
  }

  // Claim VOR dem Versand — gleiches Muster wie in send-training-reminders.ts
  // (siehe dortiger Kommentar für die ausführliche Begründung): der
  // Unique-Key von squad_reminder_log wirkt als atomarer Lock, damit zwei
  // überlappende Durchläufe dieselbe Erinnerung nicht doppelt verschicken.
  const claimRows = stillCandidates.map((c) => ({
    game_id: c.game.id,
    player_id: c.player.id,
    reminder_type: c.type
  }));
  const claimRes = await supabase
    .from('squad_reminder_log')
    .upsert(claimRows, { onConflict: 'game_id,player_id,reminder_type', ignoreDuplicates: true })
    .select('game_id, player_id, reminder_type');
  if (claimRes.error) {
    // eslint-disable-next-line no-console
    console.error('send-squad-reminders query error', claimRes.error);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: claimRes.error.message, code: claimRes.error.code });
    return;
  }
  const claimedKeys = new Set(
    ((claimRes.data as { game_id: string; player_id: string; reminder_type: string }[] | null) ?? []).map(
      (r) => `${r.game_id}:${r.player_id}:${r.reminder_type}`
    )
  );
  const toSend = stillCandidates.filter((c) => claimedKeys.has(`${c.game.id}:${c.player.id}:${c.type}`));

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
    console.error('send-squad-reminders query error', linkRes.error);
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
    console.error('send-squad-reminders query error', subRes.error);
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
        title: `Kader ${fmtWeekdayShort(c.game.game_date)} ${fmtTime(c.game.game_time)} Uhr`,
        body: `${firstName}, bist du beim Spiel gegen ${c.game.opponent} dabei?`,
        url: '/spiele?kader=1'
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
