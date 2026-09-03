import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { fmtTime } from '../../lib/format';
import { weekdayIndex, WEEKDAY_ORDER } from '../../lib/weekdays';
import type { Training } from '../../types/database';

const EMPTY_FORM = { weekday: WEEKDAY_ORDER[0], start_time: '', end_time: '', location: '' };

export function TrainingsAdmin() {
  const [trainings, setTrainings] = useState<Training[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase.from('trainings').select('*');
    if (loadError) {
      setError('Fehler beim Laden der Trainingszeiten.');
      return;
    }
    setTrainings(
      [...((data as Training[]) ?? [])].sort(
        (a, b) => weekdayIndex(a.weekday) - weekdayIndex(b.weekday) || a.start_time.localeCompare(b.start_time)
      )
    );
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Trainingszeiten.'));
  }, [load]);

  async function addTraining(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('trainings').insert({
        weekday: form.weekday,
        start_time: form.start_time,
        end_time: form.end_time,
        location: form.location.trim()
      });
      if (insertError) throw insertError;
      setForm(EMPTY_FORM);
      await load();
    } catch {
      setError('Trainingszeit konnte nicht angelegt werden.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const { error: delError } = await supabase.from('trainings').delete().eq('id', id);
      if (delError) throw delError;
      await load();
    } catch {
      setError('Löschen fehlgeschlagen.');
    }
  }

  if (error) return <ErrorNote message={error} />;
  if (!trainings) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <form onSubmit={addTraining} className="card space-y-2">
        <p className="text-sm font-bold text-tbw-navyDark">Neue Trainingszeit</p>
        <select
          className="input"
          value={form.weekday}
          onChange={(e) => setForm((f) => ({ ...f, weekday: e.target.value }))}
        >
          {WEEKDAY_ORDER.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="time"
            required
            className="input"
            value={form.start_time}
            onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
          />
          <input
            type="time"
            required
            className="input"
            value={form.end_time}
            onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
          />
        </div>
        <input
          required
          placeholder="Halle / Adresse"
          className="input"
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
        />
        <button className="btn-primary w-full" disabled={busy}>
          Anlegen
        </button>
      </form>

      <ul className="space-y-2">
        {trainings.map((t) => (
          <li key={t.id} className="card flex items-center justify-between">
            <div>
              <p className="font-semibold text-tbw-navyDark">{t.weekday}</p>
              <p className="text-sm text-tbw-ink/60">
                {fmtTime(t.start_time)}–{fmtTime(t.end_time)} · {t.location}
              </p>
            </div>
            <button className="btn-secondary !px-2 !py-1 text-xs !text-tbw-red" onClick={() => remove(t.id)}>
              Löschen
            </button>
          </li>
        ))}
        {trainings.length === 0 && <p className="text-sm text-tbw-ink/50">Noch keine Trainingszeiten eingetragen.</p>}
      </ul>
    </div>
  );
}
