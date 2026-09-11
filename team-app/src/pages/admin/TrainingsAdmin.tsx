import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { DateField, TimeField } from '../../components/DateTimeField';
import { fmtDateShort, fmtTime } from '../../lib/format';
import { weekdayIndex, WEEKDAY_ORDER } from '../../lib/weekdays';
import type { Training, TrainingOverride } from '../../types/database';

const EMPTY_FORM = { weekday: WEEKDAY_ORDER[0], start_time: '', end_time: '', location: '' };

const EMPTY_OVERRIDE_FORM = {
  start_date: '',
  end_date: '',
  weekday: '', // '' = alle Trainingstage
  status: 'cancelled' as 'cancelled' | 'special',
  start_time: '',
  end_time: '',
  location: '',
  note: ''
};

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

  const [overrides, setOverrides] = useState<TrainingOverride[] | null>(null);
  const [overrideForm, setOverrideForm] = useState(EMPTY_OVERRIDE_FORM);
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const loadOverrides = useCallback(async () => {
    setOverrideError(null);
    const { data, error: loadError } = await supabase.from('training_overrides').select('*');
    if (loadError) {
      setOverrideError('Fehler beim Laden der Ferienzeiten.');
      return;
    }
    setOverrides([...((data as TrainingOverride[]) ?? [])].sort((a, b) => a.start_date.localeCompare(b.start_date)));
  }, []);

  useEffect(() => {
    loadOverrides().catch(() => setOverrideError('Fehler beim Laden der Ferienzeiten.'));
  }, [loadOverrides]);

  async function addOverride(e: FormEvent) {
    e.preventDefault();
    setOverrideBusy(true);
    setOverrideError(null);
    try {
      const isSpecial = overrideForm.status === 'special';
      const { error: insertError } = await supabase.from('training_overrides').insert({
        start_date: overrideForm.start_date,
        end_date: overrideForm.end_date,
        weekday: overrideForm.weekday || null,
        status: overrideForm.status,
        start_time: isSpecial ? overrideForm.start_time : null,
        end_time: isSpecial ? overrideForm.end_time : null,
        location: isSpecial && overrideForm.location.trim() ? overrideForm.location.trim() : null,
        note: overrideForm.note.trim() || null
      });
      if (insertError) throw insertError;
      setOverrideForm(EMPTY_OVERRIDE_FORM);
      await loadOverrides();
    } catch {
      setOverrideError('Ausnahme konnte nicht angelegt werden.');
    } finally {
      setOverrideBusy(false);
    }
  }

  async function removeOverride(id: string) {
    setOverrideError(null);
    try {
      const { error: delError } = await supabase.from('training_overrides').delete().eq('id', id);
      if (delError) throw delError;
      await loadOverrides();
    } catch {
      setOverrideError('Löschen fehlgeschlagen.');
    }
  }

  if (error) return <ErrorNote message={error} />;
  if (!trainings) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold uppercase tracking-wide text-tbw-ink/40">Wöchentliche Trainingszeiten</p>
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
        <div className="space-y-2">
          <TimeField
            label="Beginn"
            required
            value={form.start_time}
            onChange={(v) => setForm((f) => ({ ...f, start_time: v }))}
          />
          <TimeField
            label="Ende"
            required
            value={form.end_time}
            onChange={(v) => setForm((f) => ({ ...f, end_time: v }))}
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

      <p className="pt-2 text-xs font-bold uppercase tracking-wide text-tbw-ink/40">
        Ferienzeiten &amp; Sonderregelungen
      </p>
      {overrideError && <ErrorNote message={overrideError} />}
      {overrides === null ? (
        <LoadingSpinner />
      ) : (
        <>
          <form onSubmit={addOverride} className="card space-y-2">
            <p className="text-sm font-bold text-tbw-navyDark">Neue Ausnahme</p>
            <div className="grid grid-cols-2 gap-2">
              <DateField
                label="Von"
                required
                value={overrideForm.start_date}
                onChange={(v) => setOverrideForm((f) => ({ ...f, start_date: v }))}
              />
              <DateField
                label="Bis"
                required
                min={overrideForm.start_date || undefined}
                value={overrideForm.end_date}
                onChange={(v) => setOverrideForm((f) => ({ ...f, end_date: v }))}
              />
            </div>
            <select
              className="input"
              value={overrideForm.weekday}
              onChange={(e) => setOverrideForm((f) => ({ ...f, weekday: e.target.value }))}
            >
              <option value="">Alle Trainingstage</option>
              {WEEKDAY_ORDER.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOverrideForm((f) => ({ ...f, status: 'cancelled' }))}
                className={`btn-secondary flex-1 !py-2 text-sm ${
                  overrideForm.status === 'cancelled' ? '!bg-tbw-red/10 !text-tbw-red !ring-tbw-red/30' : ''
                }`}
              >
                Fällt aus
              </button>
              <button
                type="button"
                onClick={() => setOverrideForm((f) => ({ ...f, status: 'special' }))}
                className={`btn-secondary flex-1 !py-2 text-sm ${
                  overrideForm.status === 'special' ? '!bg-tbw-gold/10 !text-tbw-navyDark !ring-tbw-gold/30' : ''
                }`}
              >
                Sonderzeit
              </button>
            </div>
            {overrideForm.status === 'special' && (
              <div className="space-y-2 rounded-xl bg-tbw-bg p-3">
                <TimeField
                  label="Beginn"
                  required
                  value={overrideForm.start_time}
                  onChange={(v) => setOverrideForm((f) => ({ ...f, start_time: v }))}
                />
                <TimeField
                  label="Ende"
                  required
                  value={overrideForm.end_time}
                  onChange={(v) => setOverrideForm((f) => ({ ...f, end_time: v }))}
                />
                <input
                  placeholder="Halle / Adresse (leer = wie gewohnt)"
                  className="input"
                  value={overrideForm.location}
                  onChange={(e) => setOverrideForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
            )}
            <input
              placeholder="Notiz (z. B. Herbstferien)"
              className="input"
              value={overrideForm.note}
              onChange={(e) => setOverrideForm((f) => ({ ...f, note: e.target.value }))}
            />
            <button className="btn-primary w-full" disabled={overrideBusy}>
              Anlegen
            </button>
          </form>

          <ul className="space-y-2">
            {overrides.map((o) => (
              <li key={o.id} className="card flex items-center justify-between">
                <div>
                  <p className="font-semibold text-tbw-navyDark">
                    {fmtDateShort(o.start_date)}–{fmtDateShort(o.end_date)} · {o.weekday ?? 'alle Tage'}
                  </p>
                  <p className="text-sm text-tbw-ink/60">
                    {o.status === 'cancelled'
                      ? 'Fällt aus'
                      : `Sonderzeit ${fmtTime(o.start_time!)}–${fmtTime(o.end_time!)}${o.location ? ` · ${o.location}` : ''}`}
                    {o.note ? ` · ${o.note}` : ''}
                  </p>
                </div>
                <button
                  className="btn-secondary !px-2 !py-1 text-xs !text-tbw-red"
                  onClick={() => removeOverride(o.id)}
                >
                  Löschen
                </button>
              </li>
            ))}
            {overrides.length === 0 && (
              <p className="text-sm text-tbw-ink/50">Keine Ferienzeiten/Sonderregelungen eingetragen.</p>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
