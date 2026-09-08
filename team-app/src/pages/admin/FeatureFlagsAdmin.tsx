import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ErrorNote } from '../../components/ErrorNote';
import { useFeatureFlags } from '../../context/FeatureFlagsContext';
import { FEATURE_LABELS, type FeatureKey } from '../../types/database';

export function FeatureFlagsAdmin() {
  const { flags, loading, refresh } = useFeatureFlags();
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<FeatureKey | null>(null);

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
    </div>
  );
}
