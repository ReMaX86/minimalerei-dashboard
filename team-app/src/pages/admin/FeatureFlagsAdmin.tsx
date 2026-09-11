import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ErrorNote } from '../../components/ErrorNote';
import { useFeatureFlags } from '../../context/FeatureFlagsContext';
import { FEATURE_LABELS, type FeatureKey, type ReminderSettings } from '../../types/database';

interface ReminderForm {
  enabled: boolean;
  squad_reminder_days_before: string;
  training_reminder_days_before: string;
  officiating_season_min: string;
}

function reminderFormFromSettings(row: ReminderSettings): ReminderForm {
  return {
    enabled: row.enabled,
    squad_reminder_days_before: String(row.squad_reminder_days_before),
    training_reminder_days_before: String(row.training_reminder_days_before),
    officiating_season_min: String(row.officiating_season_min)
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
          officiating_season_min: Math.max(0, Number(reminderForm.officiating_season_min) || 0)
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
            <li key={key} className="card flex items-center justify-between gap-3">
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
              "Admin → Spieler" von der Kampfgericht-Erinnerung ausnehmen.
            </p>
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
