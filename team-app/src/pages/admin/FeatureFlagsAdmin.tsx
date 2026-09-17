import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ErrorNote } from '../../components/ErrorNote';
import { PushSubscribersList } from '../../components/admin/PushSubscribersList';
import { useFeatureFlags } from '../../context/FeatureFlagsContext';
import { FEATURE_LABELS, type FeatureKey, type ReminderSettings } from '../../types/database';

interface ReminderForm {
  enabled: boolean;
  squad_reminder_days_before: string;
  training_reminder_days_before: string;
  officiating_season_min: string;
  // Trotz "_min"-Namen (passend zur DB-Spalte/zum Speichern) hält das
  // Formular hier Stunden als String — siehe minutesToHoursStr/
  // hoursStrToMinutes.
  training_push_offset_1_min: string;
  training_push_offset_2_min: string;
  training_push_offset_3_min: string;
  officiating_push_offset_1_min: string;
  officiating_push_offset_2_min: string;
  officiating_push_offset_3_min: string;
  // Anders als bei den beiden obigen (Stunden) hält das Formular hier ganze
  // Tage — siehe daysToMinutes/minutesToDaysStr.
  squad_push_offset_1_min: string;
  squad_push_offset_2_min: string;
  squad_push_offset_3_min: string;
}

// Minuten (Datenbank) <-> Stunden (Admin-Eingabe) — die drei
// Erinnerungs-Zeitpunkte waren bisher in Minuten einzugeben (z. B. 1440 für
// "1 Tag vorher"), was bei größeren Abständen unhandlich zu rechnen ist.
// Gespeichert wird weiterhin in Minuten (keine Migration nötig, andere Stellen
// wie api/send-training-reminders.ts rechnen ebenfalls in Minuten) — nur die
// Anzeige/Eingabe im Formular rechnet um. Bruchteile bleiben möglich (0.5 =
// 30 Minuten), damit sich der bisherige Default (30 Minuten) weiter abbilden
// lässt.
function minutesToHoursStr(minutes: number): string {
  return String(minutes / 60);
}

function hoursStrToMinutes(hours: string): number {
  return Math.max(0, Math.round((Number(hours) || 0) * 60));
}

// Dieselbe Umrechnung fürs Kader-Zusage-Erinnerung, nur in ganzen Tagen
// statt Stunden — passend zur Bitte "5 Tage vorher + 3 Tage vorher + 1 Tag
// vorher" statt eines Stunden-Werts.
function minutesToDaysStr(minutes: number): string {
  return String(minutes / (60 * 24));
}

function daysStrToMinutes(days: string): number {
  return Math.max(0, Math.round((Number(days) || 0) * 60 * 24));
}

function reminderFormFromSettings(row: ReminderSettings): ReminderForm {
  return {
    enabled: row.enabled,
    squad_reminder_days_before: String(row.squad_reminder_days_before),
    training_reminder_days_before: String(row.training_reminder_days_before),
    officiating_season_min: String(row.officiating_season_min),
    training_push_offset_1_min: minutesToHoursStr(row.training_push_offset_1_min),
    training_push_offset_2_min: minutesToHoursStr(row.training_push_offset_2_min),
    training_push_offset_3_min: minutesToHoursStr(row.training_push_offset_3_min),
    officiating_push_offset_1_min: minutesToHoursStr(row.officiating_push_offset_1_min),
    officiating_push_offset_2_min: minutesToHoursStr(row.officiating_push_offset_2_min),
    officiating_push_offset_3_min: minutesToHoursStr(row.officiating_push_offset_3_min),
    squad_push_offset_1_min: minutesToDaysStr(row.squad_push_offset_1_min),
    squad_push_offset_2_min: minutesToDaysStr(row.squad_push_offset_2_min),
    squad_push_offset_3_min: minutesToDaysStr(row.squad_push_offset_3_min)
  };
}

export function FeatureFlagsAdmin() {
  const { flags, loading, refresh } = useFeatureFlags();
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<FeatureKey | null>(null);

  const [reminderForm, setReminderForm] = useState<ReminderForm | null>(null);
  const [savingReminders, setSavingReminders] = useState(false);
  const [reminderSaved, setReminderSaved] = useState(false);

  useEffect(() => {
    supabase
      .from('reminder_settings')
      .select('*')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setReminderForm(reminderFormFromSettings(data as ReminderSettings));
      });
  }, []);

  async function toggle(key: FeatureKey) {
    setSavingKey(key);
    setError(null);
    try {
      const { error: upsertError } = await supabase
        .from('feature_flags')
        .upsert({ key, enabled: !flags[key] }, { onConflict: 'key' });
      if (upsertError) throw upsertError;
      await refresh();
    } catch {
      setError('Einstellung konnte nicht gespeichert werden.');
    } finally {
      setSavingKey(null);
    }
  }

  async function saveReminders() {
    if (!reminderForm) return;
    setSavingReminders(true);
    setError(null);
    setReminderSaved(false);
    try {
      const { error: updError } = await supabase
        .from('reminder_settings')
        .update({
          enabled: reminderForm.enabled,
          squad_reminder_days_before: Math.max(0, Number(reminderForm.squad_reminder_days_before) || 0),
          training_reminder_days_before: Math.max(0, Number(reminderForm.training_reminder_days_before) || 0),
          officiating_season_min: Math.max(0, Number(reminderForm.officiating_season_min) || 0),
          training_push_offset_1_min: hoursStrToMinutes(reminderForm.training_push_offset_1_min),
          training_push_offset_2_min: hoursStrToMinutes(reminderForm.training_push_offset_2_min),
          training_push_offset_3_min: hoursStrToMinutes(reminderForm.training_push_offset_3_min),
          officiating_push_offset_1_min: hoursStrToMinutes(reminderForm.officiating_push_offset_1_min),
          officiating_push_offset_2_min: hoursStrToMinutes(reminderForm.officiating_push_offset_2_min),
          officiating_push_offset_3_min: hoursStrToMinutes(reminderForm.officiating_push_offset_3_min),
          squad_push_offset_1_min: daysStrToMinutes(reminderForm.squad_push_offset_1_min),
          squad_push_offset_2_min: daysStrToMinutes(reminderForm.squad_push_offset_2_min),
          squad_push_offset_3_min: daysStrToMinutes(reminderForm.squad_push_offset_3_min)
        })
        .eq('id', 1);
      if (updError) throw updError;
      setReminderSaved(true);
    } catch {
      setError('Erinnerungen konnten nicht gespeichert werden.');
    } finally {
      setSavingReminders(false);
    }
  }

  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-tbw-ink/60">
        Zusatzfunktionen, die nicht jedes Team braucht — deaktiviert sind sie in der gesamten App
        ausgeblendet (Nav, Startseite, Admin-Reiter), außer hier.
      </p>

      <ul className="space-y-2">
        {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => {
          const meta = FEATURE_LABELS[key];
          const enabled = flags[key];
          return (
            <li key={key} className="card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-tbw-navyDark">{meta.label}</p>
                  <p className="text-xs text-tbw-ink/50">{meta.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={loading || savingKey === key}
                  onClick={() => toggle(key)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${
                    enabled ? 'bg-tbw-gold' : 'bg-black/15'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                      enabled ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
              {key === 'push_notifications' && enabled && <PushSubscribersList />}
            </li>
          );
        })}
      </ul>

      {reminderForm && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-tbw-navyDark">Erinnerungen</p>
              <p className="text-xs text-tbw-ink/50">
                Auffällige "Für dich zu erledigen"-Karte auf der Spieler-Startseite ab den unten
                eingestellten Fristen.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={reminderForm.enabled}
              onClick={() => setReminderForm({ ...reminderForm, enabled: !reminderForm.enabled })}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                reminderForm.enabled ? 'bg-tbw-gold' : 'bg-black/15'
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                  reminderForm.enabled ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>

          <div className="space-y-2 border-t border-black/5 pt-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-tbw-ink/70">
                Kader-Zusage: Erinnerung ab wie vielen Tagen vor dem Spiel?
              </span>
              <input
                type="number"
                min={0}
                className="input !w-20 text-center"
                value={reminderForm.squad_reminder_days_before}
                onChange={(e) => setReminderForm({ ...reminderForm, squad_reminder_days_before: e.target.value })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-tbw-ink/70">
                Training-Zusage: Erinnerung ab wie vielen Tagen vor dem Termin?
              </span>
              <input
                type="number"
                min={0}
                className="input !w-20 text-center"
                value={reminderForm.training_reminder_days_before}
                onChange={(e) =>
                  setReminderForm({ ...reminderForm, training_reminder_days_before: e.target.value })
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-tbw-ink/70">Kampfgericht: Mindesteinsätze pro Saison</span>
              <input
                type="number"
                min={0}
                className="input !w-20 text-center"
                value={reminderForm.officiating_season_min}
                onChange={(e) => setReminderForm({ ...reminderForm, officiating_season_min: e.target.value })}
              />
            </label>
            <p className="text-xs text-tbw-ink/40">
              U18-Spieler, die schon über ihre eigene Mannschaft eingeteilt werden, lassen sich unter
              "Admin → Spieler" von der Kampfgericht-Erinnerung ausnehmen. Die Meldefrist für die
              Selbstverwaltung der Kampfgericht-Termine ist im Admin unter "Kampfgericht" einstellbar.
            </p>
          </div>

          <div className="space-y-2 border-t border-black/5 pt-3">
            <p className="text-sm font-semibold text-tbw-navyDark">Push-Erinnerung fürs Training</p>
            <p className="text-xs text-tbw-ink/50">
              Bis zu drei Zeitpunkte vor Trainingsbeginn, zu denen Spieler ohne Antwort per
              Push erinnert werden (in Stunden, 0 = aus; z. B. 0,5 für 30 Minuten). Wirkt nur,
              wenn "Push-Benachrichtigungen" unter Funktionen aktiviert ist.
            </p>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-tbw-ink/70">1. Erinnerung (z. B. 24 = 1 Tag vorher)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                className="input !w-20 text-center"
                value={reminderForm.training_push_offset_1_min}
                onChange={(e) =>
                  setReminderForm({ ...reminderForm, training_push_offset_1_min: e.target.value })
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-tbw-ink/70">2. Erinnerung (z. B. 1 = 1 Stunde vorher)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                className="input !w-20 text-center"
                value={reminderForm.training_push_offset_2_min}
                onChange={(e) =>
                  setReminderForm({ ...reminderForm, training_push_offset_2_min: e.target.value })
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-tbw-ink/70">3. Erinnerung (z. B. 0,5 = 30 Minuten vorher)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                className="input !w-20 text-center"
                value={reminderForm.training_push_offset_3_min}
                onChange={(e) =>
                  setReminderForm({ ...reminderForm, training_push_offset_3_min: e.target.value })
                }
              />
            </label>
          </div>

          <div className="space-y-2 border-t border-black/5 pt-3">
            <p className="text-sm font-semibold text-tbw-navyDark">Push-Erinnerung fürs Kampfgericht</p>
            <p className="text-xs text-tbw-ink/50">
              Bis zu drei Zeitpunkte vor Spielbeginn, zu denen Spieler mit einer zugewiesenen
              Kampfgericht-Aufgabe per Push erinnert werden (in Stunden, 0 = aus). Anders als bei
              der Training-Erinnerung gibt es hier keine Zu-/Absage — die Aufgabe ist bereits fest
              zugewiesen, die Erinnerung ist reine Gedächtnisstütze. Wirkt nur, wenn
              "Push-Benachrichtigungen" unter Funktionen aktiviert ist.
            </p>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-tbw-ink/70">1. Erinnerung (z. B. 120 = 5 Tage vorher)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                className="input !w-20 text-center"
                value={reminderForm.officiating_push_offset_1_min}
                onChange={(e) =>
                  setReminderForm({ ...reminderForm, officiating_push_offset_1_min: e.target.value })
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-tbw-ink/70">2. Erinnerung (z. B. 24 = 1 Tag vorher)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                className="input !w-20 text-center"
                value={reminderForm.officiating_push_offset_2_min}
                onChange={(e) =>
                  setReminderForm({ ...reminderForm, officiating_push_offset_2_min: e.target.value })
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-tbw-ink/70">3. Erinnerung (z. B. 2 = 2 Stunden vorher)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                className="input !w-20 text-center"
                value={reminderForm.officiating_push_offset_3_min}
                onChange={(e) =>
                  setReminderForm({ ...reminderForm, officiating_push_offset_3_min: e.target.value })
                }
              />
            </label>
          </div>

          <div className="space-y-2 border-t border-black/5 pt-3">
            <p className="text-sm font-semibold text-tbw-navyDark">Push-Erinnerung für Kader-Zusage</p>
            <p className="text-xs text-tbw-ink/50">
              Bis zu drei Zeitpunkte vor Spielbeginn, zu denen Spieler im veröffentlichten Kader ohne
              Zu-/Absage per Push erinnert werden (in ganzen Tagen, 0 = aus). Nur Spieler, die im Kader
              stehen und noch nicht geantwortet haben, bekommen die Push. Wirkt nur, wenn
              "Push-Benachrichtigungen" unter Funktionen aktiviert ist.
            </p>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-tbw-ink/70">1. Erinnerung (Tage vorher, z. B. 5)</span>
              <input
                type="number"
                min={0}
                step={1}
                className="input !w-20 text-center"
                value={reminderForm.squad_push_offset_1_min}
                onChange={(e) => setReminderForm({ ...reminderForm, squad_push_offset_1_min: e.target.value })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-tbw-ink/70">2. Erinnerung (Tage vorher, z. B. 3)</span>
              <input
                type="number"
                min={0}
                step={1}
                className="input !w-20 text-center"
                value={reminderForm.squad_push_offset_2_min}
                onChange={(e) => setReminderForm({ ...reminderForm, squad_push_offset_2_min: e.target.value })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-tbw-ink/70">3. Erinnerung (Tage vorher, z. B. 1)</span>
              <input
                type="number"
                min={0}
                step={1}
                className="input !w-20 text-center"
                value={reminderForm.squad_push_offset_3_min}
                onChange={(e) => setReminderForm({ ...reminderForm, squad_push_offset_3_min: e.target.value })}
              />
            </label>
          </div>

          <div className="flex items-center gap-3 border-t border-black/5 pt-3">
            <button
              type="button"
              className="btn-primary !px-4 !py-2 text-sm"
              disabled={savingReminders}
              onClick={saveReminders}
            >
              {savingReminders ? 'Speichere…' : 'Speichern'}
            </button>
            {reminderSaved && <span className="text-xs font-semibold text-status-ok">Gespeichert ✓</span>}
          </div>
        </div>
      )}
    </div>
  );
}
