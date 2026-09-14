import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import type { Player, PlayerAbsence, ReminderSettings, Training, TrainingOverride } from '../src/types/database';

// Zweite Benachrichtigungsart nach "neue Meldung" (siehe send-push.ts):
// erinnert Spieler, die für den nächsten Trainingstermin noch nicht
// geantwortet haben, zu bis zu drei Zeitpunkten vor Trainingsbeginn —
// unabhängig voneinander, ein Spieler kann also mehrere Erinnerungen für
// denselben Termin bekommen, sofern er bis dahin nicht geantwortet hat. Die
// drei Zeitpunkte (in Minuten vor Trainingsbeginn, 0 = abgeschaltet) stehen
// in reminder_settings.training_push_offset_{1,2,3}_min (Migration 0039,
// Default 1440/60/30 = 1 Tag/1 Stunde/30 Minuten) und sind im Admin unter
// Funktionen -> Erinnerungen änderbar. training_reminder_log (Migration
// 0038) verhindert Mehrfachversand derselben Erinnerungsart für denselben
// Termin — geloggt wird nach Position (slot_1/2/3), nicht nach dem
// konkreten Minutenwert, damit eine spätere Änderung der Einstellung nicht
// zu doppeltem Versand führt.
//
// Aufgerufen wird dieser Endpunkt NICHT mehr per täglichem GitHub-Actions-
// Cron (zu grob für ein 30-Minuten-Fenster, und ein Free-Tier-Cron im
// 10-15-Minuten-Takt hätte schnell die kostenlosen GitHub-Actions-Minuten
// aufgebraucht) — stattdessen per pg_cron direkt in Supabase (kostenlos,
// keine separate Abrechnung pro Aufruf), siehe README "Push-
// Benachrichtigungen" für die genaue Einrichtung. Jederzeit auch manuell
// auslösbar, z. B. testweise per net.http_post im SQL-Editor.
//
// Bewusst KOMPLETT ohne eigene lokale Imports (weder aus src/lib/ noch aus
// einer api/_lib/-Hilfsdatei) — beide Varianten scheiterten live bei Vercel
// mit ERR_MODULE_NOT_FOUND. Diese Vercel-Umgebung bündelt offenbar keine
// lokalen Dateiabhängigkeiten für api/-Functions dieses Projekts (anders
// als bei den meisten Vercel/Next.js-Setups üblich) — nur Pakete aus
// node_modules funktionieren zuverlässig (siehe send-push.ts). Die
// Terminlogik unten ist deshalb eine bewusste Kopie von
// src/lib/trainingSchedule.ts (nur nextTrainingOccurrences) — bei
// Änderungen an der Terminlogik dort bitte hier synchron nachziehen.

// --- Terminlogik (Kopie von src/lib/trainingSchedule.ts) ---

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
    const startsAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
    if (startsAt <= from) d.setDate(d.getDate() + 7);
  }
  return d;
}

function isOneOffUpcoming(training: Training, from: Date): boolean {
  const today = toDateKey(from);
  if (training.specific_date! > today) return true;
  if (training.specific_date! < today) return false;
  const [h, m] = training.start_time.split(':').map(Number);
  const startsAt = new Date(from.getFullYear(), from.getMonth(), from.getDate(), h, m);
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

// --- Format-Helfer (Kopie von src/lib/format.ts) ---

// Kurzes Wochentagskürzel ("Mo.", "Di." ...) für die Push — bewusst ohne
// volles Datum/Jahr, siehe Push-Text unten. `weekday: 'short'` allein liefert
// von Node/ICU (anders als in Kombination mit weiteren Datumsfeldern, siehe
// fmtDate in src/lib/format.ts) keinen Punkt ("Mo" statt "Mo.") — deshalb
// hier manuell angehängt, für dieselbe Schreibweise wie im Rest der App.
function fmtWeekdayShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${d.toLocaleDateString('de-DE', { weekday: 'short' })}.`;
}

function fmtTime(time: string): string {
  return time.slice(0, 5);
}

// --- Die drei Erinnerungszeitpunkte (Minuten vor Trainingsbeginn, im Admin
// unter Funktionen -> Erinnerungen änderbar — siehe reminder_settings) ---

type ReminderSlot = 'slot_1' | 'slot_2' | 'slot_3';

interface PushSubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

// Supabase-Anfragen scheitern auf dem Free-Tier (Nano-Compute) gelegentlich
// mit "Gateway Timeout", obwohl die Datenbank selbst gesund ist — live
// beobachtet als wiederholt fehlschlagende Erinnerungsläufe an mehreren
// Tagen. Ein einziger kurzer Retry behebt die meisten dieser Aussetzer,
// ohne bei echten Fehlern (z. B. fehlende Rechte) spürbar Zeit zu kosten.
async function withRetry<T>(fn: () => PromiseLike<T>): Promise<T> {
  const first = await fn();
  if (!(first as { error?: unknown }).error) return first;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return fn();
}

// --- Handler ---

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

  const [settingsRes, trainingsRes, overridesRes, playersRes, absencesFlagRes] = await Promise.all([
    withRetry(() => supabase.from('reminder_settings').select('*').limit(1).maybeSingle()),
    withRetry(() => supabase.from('trainings').select('*')),
    withRetry(() => supabase.from('training_overrides').select('*')),
    withRetry(() => supabase.from('players').select('*').eq('is_active', true)),
    withRetry(() => supabase.from('feature_flags').select('enabled').eq('key', 'absences').maybeSingle())
  ]);

  // Fehler bei einer dieser Abfragen (z. B. fehlende service_role-Rechte auf
  // einer der Tabellen) nicht stillschweigend als "settings null" behandeln
  // — sonst sieht ein Berechtigungsfehler von außen identisch aus wie
  // "Erinnerungen sind einfach deaktiviert" (live so aufgefallen).
  const queryError =
    settingsRes.error ?? trainingsRes.error ?? overridesRes.error ?? playersRes.error ?? absencesFlagRes.error;
  if (queryError) {
    // eslint-disable-next-line no-console
    console.error('send-training-reminders query error', queryError);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: queryError.message, code: queryError.code });
    return;
  }

  const settings = settingsRes.data as ReminderSettings | null;
  if (!settings?.enabled) {
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
  const startsAt = new Date(y, mo - 1, d, h, m);

  if (startsAt <= now) {
    res.status(200).json({ skipped: 'already_started', date: occurrence.date });
    return;
  }

  const offsets = (
    [
      { type: 'slot_1', minutes: settings.training_push_offset_1_min },
      { type: 'slot_2', minutes: settings.training_push_offset_2_min },
      { type: 'slot_3', minutes: settings.training_push_offset_3_min }
    ] satisfies { type: ReminderSlot; minutes: number }[]
  ).filter((o) => o.minutes > 0);

  const dueTypes = offsets
    .map((o) => ({ type: o.type, ms: o.minutes * 60_000 }))
    .filter((o) => startsAt.getTime() - o.ms <= now.getTime());
  if (dueTypes.length === 0) {
    res.status(200).json({ skipped: 'not_due_yet', date: occurrence.date, startsAt: startsAt.toISOString() });
    return;
  }

  // Ab hier wird bei einem Fehler bewusst abgebrochen statt mit leeren
  // Daten weiterzumachen: würde z. B. die Zusagen-Abfrage unbemerkt leer
  // bleiben, würden Spieler, die längst zugesagt haben, trotzdem als
  // "noch nicht geantwortet" behandelt — und schlimmer noch, unten
  // trotzdem dauerhaft als "erinnert" protokolliert, obwohl nie eine
  // Push verschickt wurde (siehe Kommentar bei newLogRows).
  const rsvpRes = await withRetry(() =>
    supabase.from('training_rsvps').select('player_id').eq('training_id', occurrence.training.id).eq('session_date', occurrence.date)
  );
  if (rsvpRes.error) {
    // eslint-disable-next-line no-console
    console.error('send-training-reminders query error', rsvpRes.error);
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
      console.error('send-training-reminders query error', absenceRes.error);
      res
        .status(500)
        .json({ error: 'Daten konnten nicht geladen werden.', details: absenceRes.error.message, code: absenceRes.error.code });
      return;
    }
    absentIds = new Set(((absenceRes.data as Pick<PlayerAbsence, 'player_id'>[] | null) ?? []).map((r) => r.player_id));
  }

  const targetPlayers = ((playersRes.data as Player[]) ?? []).filter(
    (p) => !respondedIds.has(p.id) && !absentIds.has(p.id)
  );

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
      .in(
        'player_id',
        targetPlayers.map((p) => p.id)
      )
  );
  if (logRes.error) {
    // eslint-disable-next-line no-console
    console.error('send-training-reminders query error', logRes.error);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: logRes.error.message, code: logRes.error.code });
    return;
  }
  const alreadySent = new Set(
    ((logRes.data as { player_id: string; reminder_type: string }[] | null) ?? []).map(
      (r) => `${r.player_id}:${r.reminder_type}`
    )
  );

  const candidates = dueTypes.flatMap((type) =>
    targetPlayers
      .filter((p) => !alreadySent.has(`${p.id}:${type.type}`))
      .map((player) => ({ player, type: type.type }))
  );

  if (candidates.length === 0) {
    res.status(200).json({ sent: 0, attempted: 0, date: occurrence.date, dueTypes: dueTypes.map((t) => t.type) });
    return;
  }

  // Claim VOR dem Versand, nicht danach: pg_cron ruft diesen Endpunkt alle
  // 10 Minuten auf und kann — z. B. bei einem doppelt angelegten Cron-Job
  // oder einem langsamen/erneut ausgelösten Vercel-Aufruf — auch zwei
  // überlappende Durchläufe gleichzeitig starten. Beide hätten beim alten
  // "erst senden, danach loggen" denselben `alreadySent`-Stand gesehen und
  // wären beide gesendet worden (live so beobachtet: dieselbe Erinnerung
  // mehrfach zur exakt gleichen Zeit). `upsert(... ignoreDuplicates: true)`
  // + `.select()` nutzt stattdessen den Unique-Key von training_reminder_log
  // selbst als atomaren Lock: von zwei parallelen INSERTs auf denselben
  // (training_id, session_date, player_id, reminder_type) gewinnt einer,
  // der andere bekommt die Zeile nicht zurück — nur wer sie tatsächlich neu
  // beanspruchen konnte, verschickt anschließend die Push.
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
    console.error('send-training-reminders query error', claimRes.error);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: claimRes.error.message, code: claimRes.error.code });
    return;
  }
  const claimedKeys = new Set(
    ((claimRes.data as { player_id: string; reminder_type: string }[] | null) ?? []).map(
      (r) => `${r.player_id}:${r.reminder_type}`
    )
  );
  const toSend = candidates.filter(({ player, type }) => claimedKeys.has(`${player.id}:${type}`));

  if (toSend.length === 0) {
    res.status(200).json({ sent: 0, attempted: 0, date: occurrence.date, dueTypes: dueTypes.map((t) => t.type) });
    return;
  }

  const linkRes = await withRetry(() =>
    supabase
      .from('player_auth_links')
      .select('player_id, auth_user_id')
      .in(
        'player_id',
        targetPlayers.map((p) => p.id)
      )
  );
  if (linkRes.error) {
    // eslint-disable-next-line no-console
    console.error('send-training-reminders query error', linkRes.error);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: linkRes.error.message, code: linkRes.error.code });
    return;
  }
  // Ein Spieler kann mehrere Zeilen haben (Mehrgeräte-Login mit demselben
  // Zugangscode, siehe player_auth_links in supabase/migrations/0001_init.sql)
  // — deshalb Liste statt einzelnem Wert je Spieler, sonst bekämen Spieler
  // mit mehreren Geräten die Erinnerung nur auf einem davon.
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
    console.error('send-training-reminders query error', subRes.error);
    res.status(500).json({ error: 'Daten konnten nicht geladen werden.', details: subRes.error.message, code: subRes.error.code });
    return;
  }
  const subRows = subRes.data;

  const subsByAuthUser = new Map<string, PushSubRow[]>();
  for (const sub of (subRows as PushSubRow[] | null) ?? []) {
    const list = subsByAuthUser.get(sub.user_id) ?? [];
    list.push(sub);
    subsByAuthUser.set(sub.user_id, list);
  }

  const staleSubIds: string[] = [];
  let sent = 0;

  // Bewusst kein Hinweis mehr auf den Erinnerungs-Zeitpunkt ("in 1 Tag"/
  // "in 1 Stunde") in der Push selbst — für den Spieler ist ohnehin nur
  // relevant, wann das Training ist, nicht zu welchem der drei
  // Erinnerungs-Zeitpunkte gerade erinnert wird. Dieselbe Nachricht für
  // alle drei Erinnerungsarten, deshalb einmalig vor der Schleife gebaut.
  const payload = JSON.stringify({
    title: `Training ${fmtWeekdayShort(occurrence.date)} ${fmtTime(occurrence.training.start_time)} Uhr`,
    body: 'Bist du dabei?',
    url: '/#training'
  });

  await Promise.all(
    toSend.map(async ({ player }) => {
      const playerAuthUserIds = authUserIdsByPlayer.get(player.id) ?? [];
      const subs = playerAuthUserIds.flatMap((authUserId) => subsByAuthUser.get(authUserId) ?? []);

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
      // als erledigt, unabhängig davon, ob gerade eines erreichbar war.
    })
  );

  if (staleSubIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleSubIds);
  }

  res.status(200).json({
    sent,
    attempted: toSend.length,
    removed: staleSubIds.length,
    date: occurrence.date,
    dueTypes: dueTypes.map((t) => t.type)
  });
}
