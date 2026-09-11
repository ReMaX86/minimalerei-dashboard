import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { nextTrainingOccurrences } from './_lib/trainingSchedule';
import type { Player, PlayerAbsence, ReminderSettings, Training, TrainingOverride } from '../src/types/database';

// daysUntil/fmtDate/fmtTime sind hier statt aus src/lib/format importiert
// bewusst als winzige, stabile Kopien inline gehalten — siehe Kommentar in
// api/_lib/trainingSchedule.ts zum Grund (Cross-Verzeichnis-Import aus api/
// nach src/lib/ scheiterte live bei Vercel mit ERR_MODULE_NOT_FOUND).
function daysUntil(iso: string, today: Date): number {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(iso + 'T00:00:00');
  return Math.round((target.getTime() - from.getTime()) / 86_400_000);
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtTime(time: string): string {
  return time.slice(0, 5);
}

// Zweite Benachrichtigungsart nach "neue Meldung" (siehe send-push.ts):
// erinnert Spieler, die für den nächsten Trainingstermin noch nicht
// geantwortet haben, sobald die in reminder_settings konfigurierte Frist
// erreicht ist — dieselbe Logik wie die "Für dich zu erledigen"-Karte auf
// der Startseite (lib/reminders.ts), nur serverseitig für den Push-Versand.
//
// Anders als send-push.ts (Datenbank-Trigger auf INSERT) gibt es hier keine
// einzelne auslösende Zeile — dieser Endpunkt wird stattdessen zeitgesteuert
// aufgerufen (siehe .github/workflows/training-reminders.yml), ist aber
// jederzeit auch manuell auslösbar (z. B. testweise per net.http_post im
// SQL-Editor oder curl mit demselben x-webhook-secret wie send-push.ts).
//
// Bewusst (noch) ohne "schon benachrichtigt"-Sperre — ein Spieler bekommt
// bei jedem Lauf, an dem er noch nicht geantwortet hat, erneut eine Push.
// Bei täglichem Cron wäre das mehrfach vor jedem Training; siehe README für
// die aktuell gewählte, seltene Frequenz als Kompromiss.

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
    supabase.from('reminder_settings').select('*').limit(1).maybeSingle(),
    supabase.from('trainings').select('*'),
    supabase.from('training_overrides').select('*'),
    supabase.from('players').select('*').eq('is_active', true),
    supabase.from('feature_flags').select('enabled').eq('key', 'absences').maybeSingle()
  ]);

  const settings = settingsRes.data as ReminderSettings | null;
  if (!settings?.enabled) {
    res.status(200).json({ skipped: 'reminders_disabled' });
    return;
  }

  const today = new Date();
  const occurrence = nextTrainingOccurrences(
    (trainingsRes.data as Training[]) ?? [],
    1,
    today,
    (overridesRes.data as TrainingOverride[]) ?? []
  )[0];

  if (!occurrence) {
    res.status(200).json({ skipped: 'no_upcoming_training' });
    return;
  }

  if (daysUntil(occurrence.date, today) > settings.training_reminder_days_before) {
    res.status(200).json({ skipped: 'not_due_yet', date: occurrence.date });
    return;
  }

  const { data: rsvpRows } = await supabase
    .from('training_rsvps')
    .select('player_id')
    .eq('training_id', occurrence.training.id)
    .eq('session_date', occurrence.date);
  const respondedIds = new Set(((rsvpRows as { player_id: string }[] | null) ?? []).map((r) => r.player_id));

  let absentIds = new Set<string>();
  if (absencesFlagRes.data?.enabled) {
    const { data: absenceRows } = await supabase
      .from('player_absences')
      .select('player_id')
      .lte('start_date', occurrence.date)
      .gte('end_date', occurrence.date);
    absentIds = new Set(((absenceRows as Pick<PlayerAbsence, 'player_id'>[] | null) ?? []).map((r) => r.player_id));
  }

  const targetPlayers = ((playersRes.data as Player[]) ?? []).filter(
    (p) => !respondedIds.has(p.id) && !absentIds.has(p.id)
  );

  if (targetPlayers.length === 0) {
    res.status(200).json({ sent: 0, targeted: 0, date: occurrence.date });
    return;
  }

  const { data: linkRows } = await supabase
    .from('player_auth_links')
    .select('player_id, auth_user_id')
    .in(
      'player_id',
      targetPlayers.map((p) => p.id)
    );
  const authUserIds = ((linkRows as { player_id: string; auth_user_id: string }[] | null) ?? []).map(
    (r) => r.auth_user_id
  );

  const { data: subRows } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .in('user_id', authUserIds.length > 0 ? authUserIds : ['00000000-0000-0000-0000-000000000000']);

  const payload = JSON.stringify({
    title: 'Training noch nicht beantwortet',
    body: `Bist du am ${fmtDate(occurrence.date)} um ${fmtTime(occurrence.training.start_time)} Uhr dabei?`,
    url: '/#training'
  });

  const staleIds: string[] = [];
  let sent = 0;

  await Promise.all(
    ((subRows as { id: string; endpoint: string; p256dh: string; auth_key: string }[] | null) ?? []).map(
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

  res.status(200).json({
    sent,
    targeted: targetPlayers.length,
    subscriptions: (subRows ?? []).length,
    removed: staleIds.length,
    date: occurrence.date
  });
}
