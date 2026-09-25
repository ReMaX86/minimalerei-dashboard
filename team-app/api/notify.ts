import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import type {
  OfficiatingTaskType,
  Player,
  PlayerAbsence,
  Training,
  TrainingOverride
} from '../src/types/database';

// Gebündelte Push-Notification-Function für ALLE Benachrichtigungsarten.
//
// Grund: Vercel Hobby erlaubt maximal 12 Serverless Functions pro
// Deployment (eine Datei unter api/ = eine Function) — mit 13 einzelnen
// api/send-*.ts-Dateien (zuletzt durch send-game-started.ts überschritten)
// scheiterten die letzten beiden Produktions-Deployments live mit
// "exceeded_serverless_functions_per_deployment", OHNE dass das beim Mergen
// auffiel (Vercel meldet das nur als Deployment-Status, nicht als PR-Check).
// Die App lief dadurch mehrere Tage auf einem älteren Stand, u. a. OHNE den
// Security-Fix aus Migration 0058 — siehe README "Nachtrag" hierzu.
//
// Fix: alle bisherigen api/send-*.ts in DIESE eine Function zusammengeführt,
// per "kind"-Query-Parameter dispatched. Die alten URLs (auf die die
// bestehenden, von Hand angelegten Datenbank-Trigger bereits zeigen, siehe
// README) bleiben unverändert gültig — vercel.json rewritet z. B.
// "/api/send-quarter-score" transparent auf "/api/notify?kind=quarter-score".
// Kein einziger bestehender Trigger im SQL-Editor musste dafür geändert
// werden. Neue Notification-Arten brauchen ab jetzt nur einen neuen
// "case" hier unten plus einen neuen Rewrite-Eintrag, keine neue Datei —
// das hält uns dauerhaft weit unter dem 12-Function-Limit.
//
// Bewusst weiterhin ohne Laufzeit-Imports aus src/lib/ (nur "import type",
// der zur Compile-Zeit entfernt wird und deshalb nicht am
// ERR_MODULE_NOT_FOUND-Problem hängt, siehe die einzelnen Kommentare in den
// ehemaligen Dateien) — Vercel bündelt für api/-Functions dieses Projekts
// keine lokalen Laufzeit-Dateiabhängigkeiten.

interface NotifyPayload {
  type?: string;
  table?: string;
  record?: Record<string, unknown>;
}

interface PushSubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

function fmtDateDe(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Vorher dupliziert in send-training-reminders.ts/send-officiating-
// reminders.ts/send-squad-reminders.ts — jetzt eine Kopie für alle drei.
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

// Supabase-Anfragen scheitern auf dem Free-Tier (Nano-Compute) gelegentlich
// mit "Gateway Timeout" — ein einziger kurzer Retry behebt die meisten
// dieser Aussetzer (live beobachtet, siehe ehemalige send-training-
// reminders.ts).
async function withRetry<T>(fn: () => PromiseLike<T>): Promise<T> {
  const first = await fn();
  if (!(first as { error?: unknown }).error) return first;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return fn();
}

async function broadcastPush(
  subs: PushSubRow[],
  payload: string
): Promise<{ sent: number; staleIds: string[] }> {
  const staleIds: string[] = [];
  let sent = 0;
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
          staleIds.push(sub.id);
        }
      }
    })
  );
  return { sent, staleIds };
}

async function cleanupStale(supabase: SupabaseClient, staleIds: string[]): Promise<void> {
  if (staleIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds);
  }
}

// --- Terminlogik für "training-reminders", Kopie von src/lib/trainingSchedule.ts
// (nur nextTrainingOccurrences) — bei Änderungen dort bitte hier synchron
// nachziehen, siehe ausführliche Begründung in der ehemaligen
// send-training-reminders.ts. ---

const WEEKDAY_TO_JS_DAY: Record<string, number> = {
  Sonntag: 0,
  Montag: 1,
  Dienstag: 2,
  Mittwoch: 3,
  Donnerstag: 4,
  Freitag: 5,
  Samstag: 6
};

interface TrainingOccurrence {
  training: Training;
  date: string; // YYYY-MM-DD
  note?: string;
}

type OverrideInput = Pick<TrainingOverride, 'id' | 'start_date' | 'end_date' | 'mode' | 'note'>;

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function firstOccurrenceOnOrAfter(training: Training, from: Date): Date {
  const targetDay = WEEKDAY_TO_JS_DAY[training.weekday!];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (targetDay === undefined) return d;

  const diff = (targetDay - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);

  if (diff === 0) {
    const [h, m] = training.start_time.split(':').map(Number);
    const startsAt = berlinTimeToUtc(d.getFullYear(), d.getMonth() + 1, d.getDate(), h, m);
    if (startsAt <= from) d.setDate(d.getDate() + 7);
  }
  return d;
}

function isOneOffUpcoming(training: Training, from: Date): boolean {
  const today = toDateKey(from);
  if (training.specific_date! > today) return true;
  if (training.specific_date! < today) return false;
  const [h, m] = training.start_time.split(':').map(Number);
  const startsAt = berlinTimeToUtc(from.getFullYear(), from.getMonth() + 1, from.getDate(), h, m);
  return startsAt > from;
}

function nextTrainingOccurrences(
  trainings: Training[],
  count: number,
  from: Date,
  overrides: OverrideInput[]
): TrainingOccurrence[] {
  if (count <= 0) return [];

  const recurring = trainings.filter((t) => t.weekday !== null);
  const oneOff = trainings.filter((t) => t.specific_date !== null && isOneOffUpcoming(t, from));

  interface Cursor {
    training: Training;
    next: Date | null;
    recurring: boolean;
  }

  const cursors: Cursor[] = [
    ...recurring.map((training) => ({ training, next: firstOccurrenceOnOrAfter(training, from), recurring: true })),
    ...oneOff.map((training) => ({
      training,
      next: new Date(training.specific_date! + 'T00:00:00'),
      recurring: false
    }))
  ];

  const cancelledRanges = overrides.filter((o) => o.mode === 'cancelled' || o.mode === 'special');

  const result: TrainingOccurrence[] = [];
  const maxRounds = Math.max(count * 10, 104);
  for (let round = 0; round < maxRounds && result.length < count; round++) {
    const active = cursors.filter((c) => c.next !== null);
    if (active.length === 0) break;
    active.sort((a, b) => a.next!.getTime() - b.next!.getTime());
    const winner = active[0];
    const date = toDateKey(winner.next!);

    const cancelled = winner.recurring && cancelledRanges.some((o) => date >= o.start_date && date <= o.end_date);
    if (!cancelled) {
      let note: string | undefined;
      if (!winner.recurring) {
        const override = winner.training.override_id ? overrides.find((o) => o.id === winner.training.override_id) : undefined;
        note = override?.note ?? 'Sondertermin (Ferien)';
      }
      result.push({ training: winner.training, date, note });
    }

    winner.next = winner.recurring
      ? new Date(winner.next!.getFullYear(), winner.next!.getMonth(), winner.next!.getDate() + 7)
      : null;
  }
  return result;
}

// --- Kampfgericht-Labels für "officiating-reminders" ---

const OFFICIATING_TASK_LABELS: Record<OfficiatingTaskType, string> = {
  uhr: '24-Sekunden-Uhr',
  anschreiber: 'Anschreiben',
  zeit: 'Zeit & Punkte'
};

function officiatingGameLabel(game: { opponent_teams: string; opponent: string | null }): string {
  return game.opponent ? `${game.opponent_teams} vs. ${game.opponent}` : game.opponent_teams;
}

// Bis Element 23 ein festes 'slot_1'|'slot_2'|'slot_3'-Label je Bereich —
// jetzt (Migration 0073) die tatsächliche Minutenzahl als Text, weil die
// Erinnerungen pro Bereich eine frei veränderbare Liste statt drei fester
// Felder sind (ein "Slot 2" wäre nach Löschen/Hinzufügen nicht mehr
// eindeutig demselben Zeitpunkt zuzuordnen).
type ReminderSlot = string;

interface ReminderOffsetRow {
  area: 'training' | 'officiating' | 'squad';
  minutes_before: number;
}

async function fetchReminderOffsets(
  supabase: SupabaseClient,
  area: ReminderOffsetRow['area']
): Promise<{ type: ReminderSlot; minutes: number }[]> {
  const { data } = await withRetry(() => supabase.from('reminder_offsets').select('minutes_before').eq('area', area));
  return ((data as { minutes_before: number }[] | null) ?? []).map((r) => ({
    type: String(r.minutes_before),
    minutes: r.minutes_before
  }));
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

  const kindParam = req.query.kind;
  const kind = typeof kindParam === 'string' ? kindParam : Array.isArray(kindParam) ? kindParam[0] : undefined;

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const body = req.body as NotifyPayload;
  const record = body?.record ?? {};

  switch (kind) {
    // Erste Benachrichtigungsart: neue Meldung (Announcement).
    //
    // Element 22 "Meldungen": der bestehende, von Hand angelegte Datenbank-
    // Trigger (siehe README) feuert weiterhin bei JEDEM Insert und schickt
    // die volle neue Zeile mit — vorher wurde deshalb IMMER an ALLE
    // push_subscriptions gesendet (auch Trainer/Betrachter). Jetzt: nur
    // senden, wenn beim Veröffentlichen tatsächlich ein Push angefordert
    // wurde (record.push_requested, bei 'dringend' clientseitig immer
    // true), und nur an aktive Spieler (players.is_active, über
    // player_auth_links) statt an jede vorhandene Subscription — dieselbe
    // Zielgruppen-Definition wie training-reminders/officiating-reminders
    // weiter unten in dieser Datei.
    case 'announcement': {
      const message = record.message as string | undefined;
      const pushRequested = record.push_requested as boolean | undefined;
      const announcementKind = record.kind as string | undefined;
      if (!message) {
        res.status(400).json({ error: 'Kein Announcement-Text im Webhook-Payload.' });
        return;
      }
      if (!pushRequested && announcementKind !== 'dringend') {
        res.status(200).json({ skipped: 'push_not_requested' });
        return;
      }
      const authorName = record.author_name as string | undefined;

      const playersRes = await supabase.from('players').select('id').eq('is_active', true);
      if (playersRes.error) {
        // eslint-disable-next-line no-console
        console.error('notify[announcement] query error', playersRes.error);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: playersRes.error.message, code: playersRes.error.code });
        return;
      }
      const playerIds = ((playersRes.data as { id: string }[] | null) ?? []).map((p) => p.id);
      if (playerIds.length === 0) {
        res.status(200).json({ sent: 0, reason: 'no_active_players' });
        return;
      }

      const linkRes = await supabase.from('player_auth_links').select('auth_user_id').in('player_id', playerIds);
      if (linkRes.error) {
        // eslint-disable-next-line no-console
        console.error('notify[announcement] query error', linkRes.error);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: linkRes.error.message, code: linkRes.error.code });
        return;
      }
      const authUserIds = ((linkRes.data as { auth_user_id: string }[] | null) ?? []).map((r) => r.auth_user_id);
      if (authUserIds.length === 0) {
        res.status(200).json({ sent: 0, reason: 'no_linked_players' });
        return;
      }

      const { data: subs, error: loadError } = await supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth_key')
        .in('user_id', authUserIds);
      if (loadError) {
        // eslint-disable-next-line no-console
        console.error('notify[announcement] load error', loadError);
        res.status(500).json({ error: 'push_subscriptions konnten nicht geladen werden.', details: loadError.message, code: loadError.code });
        return;
      }

      const payload = JSON.stringify({
        title: authorName ? `Neue Meldung von ${authorName}` : 'Neue Meldung',
        body: message,
        url: '/'
      });
      const { sent, staleIds } = await broadcastPush((subs as PushSubRow[]) ?? [], payload);
      await cleanupStale(supabase, staleIds);
      res.status(200).json({ sent, removed: staleIds.length, total: (subs ?? []).length });
      return;
    }

    // Siebte Benachrichtigungsart: Live-Ticker Zwischenstand nach Viertelwechsel.
    case 'quarter-score': {
      const gameId = record.game_id as string | undefined;
      const quarter = record.quarter as number | undefined;
      const testUserId = record.test_user_id as string | undefined;
      if (!gameId || !quarter) {
        res.status(400).json({ error: 'Kein game_id/quarter im Webhook-Payload.' });
        return;
      }

      const { data: game, error: queryError } = await supabase
        .from('games')
        .select('opponent, game_date, final_score_us, final_score_opponent')
        .eq('id', gameId)
        .maybeSingle();
      if (queryError) {
        // eslint-disable-next-line no-console
        console.error('notify[quarter-score] query error', queryError);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
        return;
      }
      if (!game || game.final_score_us === null || game.final_score_opponent === null) {
        res.status(200).json({ skipped: 'game_or_score_not_found' });
        return;
      }

      const subsQuery = supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth_key');
      const { data: subs, error: loadError } = await (testUserId ? subsQuery.eq('user_id', testUserId) : subsQuery);
      if (loadError) {
        // eslint-disable-next-line no-console
        console.error('notify[quarter-score] load error', loadError);
        res.status(500).json({ error: 'push_subscriptions konnten nicht geladen werden.', details: loadError.message, code: loadError.code });
        return;
      }

      const payload = JSON.stringify({
        title: `Zwischenstand nach Q${quarter}`,
        body: `TB Wülfrath ${game.final_score_us}:${game.final_score_opponent} ${game.opponent} (${fmtDateDe(game.game_date)})`,
        url: '/spiele?kader=1'
      });
      const { sent, staleIds } = await broadcastPush((subs as PushSubRow[]) ?? [], payload);
      await cleanupStale(supabase, staleIds);
      res.status(200).json({ sent, removed: staleIds.length, total: (subs ?? []).length });
      return;
    }

    // Neunte Benachrichtigungsart: Dreier fürs eigene Team.
    case 'three-pointer': {
      const gameId = record.game_id as string | undefined;
      const playerId = record.player_id as string | undefined;
      const testUserId = record.test_user_id as string | undefined;
      if (!gameId || !playerId) {
        res.status(400).json({ error: 'Kein game_id/player_id im Webhook-Payload.' });
        return;
      }

      const [gameRes, playerRes] = await Promise.all([
        supabase.from('games').select('opponent, final_score_us, final_score_opponent').eq('id', gameId).maybeSingle(),
        supabase.from('players').select('name').eq('id', playerId).maybeSingle()
      ]);
      if (gameRes.error || playerRes.error) {
        const queryError = gameRes.error ?? playerRes.error!;
        // eslint-disable-next-line no-console
        console.error('notify[three-pointer] query error', queryError);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
        return;
      }
      const game = gameRes.data;
      const player = playerRes.data;
      if (!game || game.final_score_us === null || game.final_score_opponent === null || !player) {
        res.status(200).json({ skipped: 'game_or_player_not_found' });
        return;
      }

      const subsQuery = supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth_key');
      const { data: subs, error: loadError } = await (testUserId ? subsQuery.eq('user_id', testUserId) : subsQuery);
      if (loadError) {
        // eslint-disable-next-line no-console
        console.error('notify[three-pointer] load error', loadError);
        res.status(500).json({ error: 'push_subscriptions konnten nicht geladen werden.', details: loadError.message, code: loadError.code });
        return;
      }

      const firstName = player.name.split(' ')[0];
      const payload = JSON.stringify({
        title: '💥 Bang!',
        body: `${firstName} from Downtown — TB Wülfrath ${game.final_score_us}:${game.final_score_opponent} ${game.opponent}`,
        url: '/spiele?kader=1'
      });
      const { sent, staleIds } = await broadcastPush((subs as PushSubRow[]) ?? [], payload);
      await cleanupStale(supabase, staleIds);
      res.status(200).json({ sent, removed: staleIds.length, total: (subs ?? []).length });
      return;
    }

    // Achte Benachrichtigungsart: Endstand mit Sieg/Niederlage/Unentschieden.
    case 'game-finished': {
      const gameId = record.game_id as string | undefined;
      const testUserId = record.test_user_id as string | undefined;
      if (!gameId) {
        res.status(400).json({ error: 'Kein game_id im Webhook-Payload.' });
        return;
      }

      const { data: game, error: queryError } = await supabase
        .from('games')
        .select('opponent, game_date, final_score_us, final_score_opponent')
        .eq('id', gameId)
        .maybeSingle();
      if (queryError) {
        // eslint-disable-next-line no-console
        console.error('notify[game-finished] query error', queryError);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
        return;
      }
      if (!game || game.final_score_us === null || game.final_score_opponent === null) {
        res.status(200).json({ skipped: 'game_or_score_not_found' });
        return;
      }

      const subsQuery = supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth_key');
      const { data: subs, error: loadError } = await (testUserId ? subsQuery.eq('user_id', testUserId) : subsQuery);
      if (loadError) {
        // eslint-disable-next-line no-console
        console.error('notify[game-finished] load error', loadError);
        res.status(500).json({ error: 'push_subscriptions konnten nicht geladen werden.', details: loadError.message, code: loadError.code });
        return;
      }

      const resultLabel =
        game.final_score_us > game.final_score_opponent
          ? 'Sieg'
          : game.final_score_us < game.final_score_opponent
            ? 'Niederlage'
            : 'Unentschieden';
      const payload = JSON.stringify({
        title: `Spiel beendet — ${resultLabel}`,
        body: `TB Wülfrath ${game.final_score_us}:${game.final_score_opponent} ${game.opponent} (${fmtDateDe(game.game_date)})`,
        url: '/spiele?kader=1'
      });
      const { sent, staleIds } = await broadcastPush((subs as PushSubRow[]) ?? [], payload);
      await cleanupStale(supabase, staleIds);
      res.status(200).json({ sent, removed: staleIds.length, total: (subs ?? []).length });
      return;
    }

    // Zehnte Benachrichtigungsart: "Spiel gestartet" beim ersten Treffer.
    case 'game-started': {
      const gameId = record.game_id as string | undefined;
      const testUserId = record.test_user_id as string | undefined;
      if (!gameId) {
        res.status(400).json({ error: 'Kein game_id im Webhook-Payload.' });
        return;
      }

      const { data: game, error: queryError } = await supabase
        .from('games')
        .select('opponent, final_score_us, final_score_opponent')
        .eq('id', gameId)
        .maybeSingle();
      if (queryError) {
        // eslint-disable-next-line no-console
        console.error('notify[game-started] query error', queryError);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
        return;
      }
      if (!game || game.final_score_us === null || game.final_score_opponent === null) {
        res.status(200).json({ skipped: 'game_or_score_not_found' });
        return;
      }

      const subsQuery = supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth_key');
      const { data: subs, error: loadError } = await (testUserId ? subsQuery.eq('user_id', testUserId) : subsQuery);
      if (loadError) {
        // eslint-disable-next-line no-console
        console.error('notify[game-started] load error', loadError);
        res.status(500).json({ error: 'push_subscriptions konnten nicht geladen werden.', details: loadError.message, code: loadError.code });
        return;
      }

      const payload = JSON.stringify({
        title: '🔴 Live: Spiel gestartet',
        body: `TB Wülfrath ${game.final_score_us}:${game.final_score_opponent} ${game.opponent} — jetzt live mitverfolgen.`,
        url: '/spiele?kader=1'
      });
      const { sent, staleIds } = await broadcastPush((subs as PushSubRow[]) ?? [], payload);
      await cleanupStale(supabase, staleIds);
      res.status(200).json({ sent, removed: staleIds.length, total: (subs ?? []).length });
      return;
    }

    // Dritte Benachrichtigungsart: Training fällt aus.
    case 'training-cancelled': {
      const startDate = record.start_date as string | undefined;
      const endDate = record.end_date as string | undefined;
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'Kein start_date/end_date im Webhook-Payload.' });
        return;
      }
      const note = record.note as string | null | undefined;

      const { data: subs, error: loadError } = await supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth_key');
      if (loadError) {
        // eslint-disable-next-line no-console
        console.error('notify[training-cancelled] load error', loadError);
        res.status(500).json({ error: 'push_subscriptions konnten nicht geladen werden.', details: loadError.message, code: loadError.code });
        return;
      }

      const dateText = startDate === endDate ? `am ${fmtDateDe(startDate)}` : `vom ${fmtDateDe(startDate)} bis ${fmtDateDe(endDate)}`;
      const payload = JSON.stringify({
        title: 'Training fällt aus',
        body: `Training ${dateText} fällt aus.${note ? ` (${note})` : ''}`,
        url: '/#training'
      });
      const { sent, staleIds } = await broadcastPush((subs as PushSubRow[]) ?? [], payload);
      await cleanupStale(supabase, staleIds);
      res.status(200).json({ sent, removed: staleIds.length, total: (subs ?? []).length });
      return;
    }

    // Vierte Benachrichtigungsart: Kader veröffentlicht.
    case 'squad-published': {
      const opponent = record.opponent as string | undefined;
      const gameDate = record.game_date as string | undefined;
      if (!opponent || !gameDate) {
        res.status(400).json({ error: 'Kein opponent/game_date im Webhook-Payload.' });
        return;
      }

      const { data: subs, error: loadError } = await supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth_key');
      if (loadError) {
        // eslint-disable-next-line no-console
        console.error('notify[squad-published] load error', loadError);
        res.status(500).json({ error: 'push_subscriptions konnten nicht geladen werden.', details: loadError.message, code: loadError.code });
        return;
      }

      const payload = JSON.stringify({
        title: 'Kader veröffentlicht',
        body: `Kader für Spiel gegen ${opponent} am ${fmtDateDe(gameDate)} ist online.`,
        url: '/spiele?kader=1'
      });
      const { sent, staleIds } = await broadcastPush((subs as PushSubRow[]) ?? [], payload);
      await cleanupStale(supabase, staleIds);
      res.status(200).json({ sent, removed: staleIds.length, total: (subs ?? []).length });
      return;
    }

    // Fünfte Benachrichtigungsart: Kader-Absage, geht NUR an Trainer
    // (echte trainers-Zeilen + Spieler mit is_admin).
    case 'squad-decline': {
      const gameId = record.game_id as string | undefined;
      const playerId = record.player_id as string | undefined;
      if (!gameId || !playerId) {
        res.status(400).json({ error: 'Kein game_id/player_id im Webhook-Payload.' });
        return;
      }

      const [gameRes, playerRes, trainersRes, adminPlayersRes] = await Promise.all([
        supabase.from('games').select('opponent, game_date').eq('id', gameId).maybeSingle(),
        supabase.from('players').select('name').eq('id', playerId).maybeSingle(),
        supabase.from('trainers').select('id'),
        supabase.from('players').select('id').eq('is_admin', true)
      ]);
      const queryError = gameRes.error ?? playerRes.error ?? trainersRes.error ?? adminPlayersRes.error;
      if (queryError) {
        // eslint-disable-next-line no-console
        console.error('notify[squad-decline] query error', queryError);
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
          console.error('notify[squad-decline] query error', adminLinkError);
          res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: adminLinkError.message, code: adminLinkError.code });
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
        .select('id, user_id, endpoint, p256dh, auth_key')
        .in('user_id', recipientIds);
      if (loadError) {
        // eslint-disable-next-line no-console
        console.error('notify[squad-decline] load error', loadError);
        res.status(500).json({ error: 'push_subscriptions konnten nicht geladen werden.', details: loadError.message, code: loadError.code });
        return;
      }

      const payload = JSON.stringify({
        title: 'Kader-Absage',
        body: `${playerName} kann leider nicht am Spiel gegen ${opponent} am ${fmtDateDe(gameDate)} teilnehmen.`,
        url: '/spiele?kader=1'
      });
      const { sent, staleIds } = await broadcastPush((subs as PushSubRow[]) ?? [], payload);
      await cleanupStale(supabase, staleIds);
      res.status(200).json({ sent, removed: staleIds.length, total: (subs ?? []).length });
      return;
    }

    // Sechste Benachrichtigungsart: Kader-Nachnominierung, geht NUR an den
    // betroffenen Spieler, nur wenn der Kader schon veröffentlicht war.
    case 'squad-nomination': {
      const gameId = record.game_id as string | undefined;
      const playerId = record.player_id as string | undefined;
      const isSelected = record.is_selected as boolean | undefined;
      if (!gameId || !playerId) {
        res.status(400).json({ error: 'Kein game_id/player_id im Webhook-Payload.' });
        return;
      }
      if (isSelected !== true) {
        res.status(200).json({ skipped: 'not_selected' });
        return;
      }

      const [gameRes, playerRes, linksRes] = await Promise.all([
        supabase.from('games').select('opponent, game_date, squad_published').eq('id', gameId).maybeSingle(),
        supabase.from('players').select('name').eq('id', playerId).maybeSingle(),
        supabase.from('player_auth_links').select('auth_user_id').eq('player_id', playerId)
      ]);
      const queryError = gameRes.error ?? playerRes.error ?? linksRes.error;
      if (queryError) {
        // eslint-disable-next-line no-console
        console.error('notify[squad-nomination] query error', queryError);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
        return;
      }

      if (!gameRes.data?.squad_published) {
        res.status(200).json({ skipped: 'squad_not_yet_published' });
        return;
      }

      const opponent = gameRes.data?.opponent;
      const gameDate = gameRes.data?.game_date;
      const playerName = playerRes.data?.name;
      const authUserIds = ((linksRes.data as { auth_user_id: string }[] | null) ?? []).map((r) => r.auth_user_id);
      if (!opponent || !gameDate || !playerName || authUserIds.length === 0) {
        res.status(200).json({ skipped: 'game_or_player_not_found' });
        return;
      }

      const { data: subs, error: loadError } = await supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth_key')
        .in('user_id', authUserIds);
      if (loadError) {
        // eslint-disable-next-line no-console
        console.error('notify[squad-nomination] load error', loadError);
        res.status(500).json({ error: 'push_subscriptions konnten nicht geladen werden.', details: loadError.message, code: loadError.code });
        return;
      }

      const payload = JSON.stringify({
        title: 'Kader-Nachnominierung',
        body: `Du wurdest für das Spiel gegen ${opponent} am ${fmtDateDe(gameDate)} in den Kader nachnominiert.`,
        url: '/spiele'
      });
      const { sent, staleIds } = await broadcastPush((subs as PushSubRow[]) ?? [], payload);
      await cleanupStale(supabase, staleIds);
      res.status(200).json({ sent, removed: staleIds.length, total: (subs ?? []).length });
      return;
    }

    // Zweite Benachrichtigungsart: Trainings-Erinnerung, per pg_cron.
    case 'training-reminders': {
      const [remindersFlagRes, trainingsRes, overridesRes, playersRes, absencesFlagRes] = await Promise.all([
        withRetry(() => supabase.from('feature_flags').select('enabled').eq('key', 'reminders').maybeSingle()),
        withRetry(() => supabase.from('trainings').select('*')),
        withRetry(() => supabase.from('training_overrides').select('*')),
        withRetry(() => supabase.from('players').select('*').eq('is_active', true)),
        withRetry(() => supabase.from('feature_flags').select('enabled').eq('key', 'absences').maybeSingle())
      ]);

      const queryError = remindersFlagRes.error ?? trainingsRes.error ?? overridesRes.error ?? playersRes.error ?? absencesFlagRes.error;
      if (queryError) {
        // eslint-disable-next-line no-console
        console.error('notify[training-reminders] query error', queryError);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
        return;
      }

      if (!remindersFlagRes.data?.enabled) {
        res.status(200).json({ skipped: 'reminders_disabled' });
        return;
      }

      const now = new Date();
      const occurrence = nextTrainingOccurrences(
        (trainingsRes.data as Training[]) ?? [],
        1,
        now,
        (overridesRes.data as TrainingOverride[]) ?? []
      )[0];
      if (!occurrence) {
        res.status(200).json({ skipped: 'no_upcoming_training' });
        return;
      }

      const [h, m] = occurrence.training.start_time.split(':').map(Number);
      const [y, mo, d] = occurrence.date.split('-').map(Number);
      const startsAt = berlinTimeToUtc(y, mo, d, h, m);
      if (startsAt <= now) {
        res.status(200).json({ skipped: 'already_started', date: occurrence.date });
        return;
      }

      const offsets = await fetchReminderOffsets(supabase, 'training');
      const dueTypes = offsets.map((o) => ({ type: o.type, ms: o.minutes * 60_000 })).filter((o) => startsAt.getTime() - o.ms <= now.getTime());
      if (dueTypes.length === 0) {
        res.status(200).json({ skipped: 'not_due_yet', date: occurrence.date, startsAt: startsAt.toISOString() });
        return;
      }

      const rsvpRes = await withRetry(() =>
        supabase.from('training_rsvps').select('player_id').eq('training_id', occurrence.training.id).eq('session_date', occurrence.date)
      );
      if (rsvpRes.error) {
        // eslint-disable-next-line no-console
        console.error('notify[training-reminders] query error', rsvpRes.error);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: rsvpRes.error.message, code: rsvpRes.error.code });
        return;
      }
      const respondedIds = new Set(((rsvpRes.data as { player_id: string }[] | null) ?? []).map((r) => r.player_id));

      let absentIds = new Set<string>();
      if (absencesFlagRes.data?.enabled) {
        const absenceRes = await withRetry(() =>
          supabase.from('player_absences').select('player_id').lte('start_date', occurrence.date).gte('end_date', occurrence.date)
        );
        if (absenceRes.error) {
          // eslint-disable-next-line no-console
          console.error('notify[training-reminders] query error', absenceRes.error);
          res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: absenceRes.error.message, code: absenceRes.error.code });
          return;
        }
        absentIds = new Set(((absenceRes.data as Pick<PlayerAbsence, 'player_id'>[] | null) ?? []).map((r) => r.player_id));
      }

      const targetPlayers = ((playersRes.data as Player[]) ?? []).filter((p) => !respondedIds.has(p.id) && !absentIds.has(p.id));
      if (targetPlayers.length === 0) {
        res.status(200).json({ sent: 0, attempted: 0, date: occurrence.date, dueTypes: dueTypes.map((t) => t.type) });
        return;
      }

      const logRes = await withRetry(() =>
        supabase
          .from('training_reminder_log')
          .select('player_id, reminder_type')
          .eq('training_id', occurrence.training.id)
          .eq('session_date', occurrence.date)
          .in('player_id', targetPlayers.map((p) => p.id))
      );
      if (logRes.error) {
        // eslint-disable-next-line no-console
        console.error('notify[training-reminders] query error', logRes.error);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: logRes.error.message, code: logRes.error.code });
        return;
      }
      const alreadySent = new Set(
        ((logRes.data as { player_id: string; reminder_type: string }[] | null) ?? []).map((r) => `${r.player_id}:${r.reminder_type}`)
      );

      const candidates = dueTypes.flatMap((type) =>
        targetPlayers.filter((p) => !alreadySent.has(`${p.id}:${type.type}`)).map((player) => ({ player, type: type.type }))
      );
      if (candidates.length === 0) {
        res.status(200).json({ sent: 0, attempted: 0, date: occurrence.date, dueTypes: dueTypes.map((t) => t.type) });
        return;
      }

      const claimRows = candidates.map(({ player, type }) => ({
        training_id: occurrence.training.id,
        session_date: occurrence.date,
        player_id: player.id,
        reminder_type: type
      }));
      const claimRes = await supabase
        .from('training_reminder_log')
        .upsert(claimRows, { onConflict: 'training_id,session_date,player_id,reminder_type', ignoreDuplicates: true })
        .select('player_id, reminder_type');
      if (claimRes.error) {
        // eslint-disable-next-line no-console
        console.error('notify[training-reminders] query error', claimRes.error);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: claimRes.error.message, code: claimRes.error.code });
        return;
      }
      const claimedKeys = new Set(
        ((claimRes.data as { player_id: string; reminder_type: string }[] | null) ?? []).map((r) => `${r.player_id}:${r.reminder_type}`)
      );
      const toSend = candidates.filter(({ player, type }) => claimedKeys.has(`${player.id}:${type}`));
      if (toSend.length === 0) {
        res.status(200).json({ sent: 0, attempted: 0, date: occurrence.date, dueTypes: dueTypes.map((t) => t.type) });
        return;
      }

      const linkRes = await withRetry(() =>
        supabase.from('player_auth_links').select('player_id, auth_user_id').in('player_id', targetPlayers.map((p) => p.id))
      );
      if (linkRes.error) {
        // eslint-disable-next-line no-console
        console.error('notify[training-reminders] query error', linkRes.error);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: linkRes.error.message, code: linkRes.error.code });
        return;
      }
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
        console.error('notify[training-reminders] query error', subRes.error);
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
      const title = `Training ${fmtWeekdayShort(occurrence.date)} ${fmtTime(occurrence.training.start_time)} Uhr`;
      await Promise.all(
        toSend.map(async ({ player }) => {
          const playerAuthUserIds = authUserIdsByPlayer.get(player.id) ?? [];
          const subs = playerAuthUserIds.flatMap((authUserId) => subsByAuthUser.get(authUserId) ?? []);
          const firstName = player.name.split(' ')[0];
          const payload = JSON.stringify({ title, body: `${firstName}, bist du dabei?`, url: '/#training' });
          const { sent: subSent, staleIds } = await broadcastPush(subs, payload);
          sent += subSent;
          staleSubIds.push(...staleIds);
        })
      );
      await cleanupStale(supabase, staleSubIds);
      res.status(200).json({ sent, attempted: toSend.length, removed: staleSubIds.length, date: occurrence.date, dueTypes: dueTypes.map((t) => t.type) });
      return;
    }

    // Kampfgericht-Erinnerung, per pg_cron.
    case 'officiating-reminders': {
      const [remindersFlagRes, officiatingFlagRes, gamesRes, tasksRes, playersRes] = await Promise.all([
        withRetry(() => supabase.from('feature_flags').select('enabled').eq('key', 'reminders').maybeSingle()),
        withRetry(() => supabase.from('feature_flags').select('enabled').eq('key', 'officiating').maybeSingle()),
        withRetry(() => supabase.from('officiating_games').select('*').not('game_time', 'is', null)),
        withRetry(() => supabase.from('officiating_tasks').select('*').not('assigned_player_id', 'is', null)),
        withRetry(() => supabase.from('players').select('*').eq('is_active', true))
      ]);
      const queryError = remindersFlagRes.error ?? officiatingFlagRes.error ?? gamesRes.error ?? tasksRes.error ?? playersRes.error;
      if (queryError) {
        // eslint-disable-next-line no-console
        console.error('notify[officiating-reminders] query error', queryError);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
        return;
      }

      if (!remindersFlagRes.data?.enabled) {
        res.status(200).json({ skipped: 'reminders_disabled' });
        return;
      }
      // Kampfgericht ist seit Element 23 selbst abschaltbar (Migration
      // 0072) — ohne das keine Erinnerung mehr verschicken, sonst würde ein
      // ausgeschaltetes Kampfgericht weiter Pushes auf eine ausgeblendete
      // Funktion schicken (siehe Rückfrage 2 der Vorlage).
      if (!officiatingFlagRes.data?.enabled) {
        res.status(200).json({ skipped: 'officiating_disabled' });
        return;
      }

      const offsets = await fetchReminderOffsets(supabase, 'officiating');
      if (offsets.length === 0) {
        res.status(200).json({ skipped: 'offsets_disabled' });
        return;
      }

      const now = new Date();
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
      const games = (gamesRes.data as OfficiatingGameRow[]) ?? [];
      const tasks = (tasksRes.data as OfficiatingTaskRow[]) ?? [];
      const playersById = new Map(((playersRes.data as Player[]) ?? []).map((p) => [p.id, p] as const));

      interface Candidate {
        task: OfficiatingTaskRow;
        game: OfficiatingGameRow;
        type: ReminderSlot;
        player: Player;
      }
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
        supabase.from('officiating_reminder_log').select('officiating_task_id, reminder_type').in('officiating_task_id', candidates.map((c) => c.task.id))
      );
      if (logRes.error) {
        // eslint-disable-next-line no-console
        console.error('notify[officiating-reminders] query error', logRes.error);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: logRes.error.message, code: logRes.error.code });
        return;
      }
      const alreadySent = new Set(
        ((logRes.data as { officiating_task_id: string; reminder_type: string }[] | null) ?? []).map((r) => `${r.officiating_task_id}:${r.reminder_type}`)
      );
      const stillCandidates = candidates.filter((c) => !alreadySent.has(`${c.task.id}:${c.type}`));
      if (stillCandidates.length === 0) {
        res.status(200).json({ sent: 0, attempted: 0 });
        return;
      }

      const claimRows = stillCandidates.map((c) => ({ officiating_task_id: c.task.id, reminder_type: c.type }));
      const claimRes = await supabase
        .from('officiating_reminder_log')
        .upsert(claimRows, { onConflict: 'officiating_task_id,reminder_type', ignoreDuplicates: true })
        .select('officiating_task_id, reminder_type');
      if (claimRes.error) {
        // eslint-disable-next-line no-console
        console.error('notify[officiating-reminders] query error', claimRes.error);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: claimRes.error.message, code: claimRes.error.code });
        return;
      }
      const claimedKeys = new Set(
        ((claimRes.data as { officiating_task_id: string; reminder_type: string }[] | null) ?? []).map((r) => `${r.officiating_task_id}:${r.reminder_type}`)
      );
      const toSend = stillCandidates.filter((c) => claimedKeys.has(`${c.task.id}:${c.type}`));
      if (toSend.length === 0) {
        res.status(200).json({ sent: 0, attempted: 0 });
        return;
      }

      const playerIds = [...new Set(toSend.map((c) => c.player.id))];
      const linkRes = await withRetry(() => supabase.from('player_auth_links').select('player_id, auth_user_id').in('player_id', playerIds));
      if (linkRes.error) {
        // eslint-disable-next-line no-console
        console.error('notify[officiating-reminders] query error', linkRes.error);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: linkRes.error.message, code: linkRes.error.code });
        return;
      }
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
        console.error('notify[officiating-reminders] query error', subRes.error);
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
          const { sent: subSent, staleIds } = await broadcastPush(subs, payload);
          sent += subSent;
          staleSubIds.push(...staleIds);
        })
      );
      await cleanupStale(supabase, staleSubIds);
      res.status(200).json({ sent, attempted: toSend.length, removed: staleSubIds.length });
      return;
    }

    // Kader-Zu-/Absage-Erinnerung, per pg_cron.
    case 'squad-reminders': {
      const [remindersFlagRes, gamesRes, squadRes, playersRes] = await Promise.all([
        withRetry(() => supabase.from('feature_flags').select('enabled').eq('key', 'reminders').maybeSingle()),
        withRetry(() => supabase.from('games').select('id, game_date, game_time, opponent, squad_published').eq('squad_published', true)),
        withRetry(() => supabase.from('game_squad').select('*').eq('is_selected', true).eq('confirmation', 'pending')),
        withRetry(() => supabase.from('players').select('*').eq('is_active', true))
      ]);
      const queryError = remindersFlagRes.error ?? gamesRes.error ?? squadRes.error ?? playersRes.error;
      if (queryError) {
        // eslint-disable-next-line no-console
        console.error('notify[squad-reminders] query error', queryError);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
        return;
      }

      if (!remindersFlagRes.data?.enabled) {
        res.status(200).json({ skipped: 'reminders_disabled' });
        return;
      }

      const offsets = await fetchReminderOffsets(supabase, 'squad');
      if (offsets.length === 0) {
        res.status(200).json({ skipped: 'offsets_disabled' });
        return;
      }

      const now = new Date();
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
      const games = (gamesRes.data as GameRow[]) ?? [];
      const pendingSquadRows = (squadRes.data as GameSquadRow[]) ?? [];
      const playersById = new Map(((playersRes.data as Player[]) ?? []).map((p) => [p.id, p] as const));

      interface Candidate {
        game: GameRow;
        type: ReminderSlot;
        player: Player;
      }
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
        supabase.from('squad_reminder_log').select('game_id, player_id, reminder_type').in('game_id', candidates.map((c) => c.game.id))
      );
      if (logRes.error) {
        // eslint-disable-next-line no-console
        console.error('notify[squad-reminders] query error', logRes.error);
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

      const claimRows = stillCandidates.map((c) => ({ game_id: c.game.id, player_id: c.player.id, reminder_type: c.type }));
      const claimRes = await supabase
        .from('squad_reminder_log')
        .upsert(claimRows, { onConflict: 'game_id,player_id,reminder_type', ignoreDuplicates: true })
        .select('game_id, player_id, reminder_type');
      if (claimRes.error) {
        // eslint-disable-next-line no-console
        console.error('notify[squad-reminders] query error', claimRes.error);
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
      const linkRes = await withRetry(() => supabase.from('player_auth_links').select('player_id, auth_user_id').in('player_id', playerIds));
      if (linkRes.error) {
        // eslint-disable-next-line no-console
        console.error('notify[squad-reminders] query error', linkRes.error);
        res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: linkRes.error.message, code: linkRes.error.code });
        return;
      }
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
        console.error('notify[squad-reminders] query error', subRes.error);
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
            body: `${firstName}, bitte zu- oder absagen fürs Spiel gegen ${c.game.opponent}.`,
            url: '/spiele?kader=1'
          });
          const { sent: subSent, staleIds } = await broadcastPush(subs, payload);
          sent += subSent;
          staleSubIds.push(...staleIds);
        })
      );
      await cleanupStale(supabase, staleSubIds);
      res.status(200).json({ sent, attempted: toSend.length, removed: staleSubIds.length });
      return;
    }

    default:
      res.status(400).json({ error: `Unbekannter Notification-Typ: ${kind ?? '(keiner)'}` });
      return;
  }
}
