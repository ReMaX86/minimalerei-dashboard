import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { DateField, TimeField } from '../../components/DateTimeField';
import { fmtDate, fmtDateShort, fmtTime } from '../../lib/format';
import { weekdayIndex, WEEKDAY_ORDER } from '../../lib/weekdays';
import type { Training, TrainingOverride } from '../../types/database';

const EMPTY_FORM = { weekday: WEEKDAY_ORDER[0], start_time: '', end_time: '', location: '' };

const EMPTY_OVERRIDE_FORM = { start_date: '', end_date: '', mode: 'regular' as 'regular' | 'cancelled' | 'special', note: '' };

const EMPTY_SESSION_FORM = { date: '', start_time: '', end_time: '', location: '' };

function ModeToggle({
  value,
  onChange
}: {
  value: 'regular' | 'cancelled' | 'special';
  onChange: (mode: 'regular' | 'cancelled' | 'special') => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange('regular')}
        className={`btn-secondary flex-1 !py-2 text-sm ${
          value === 'regular' ? '!bg-status-ok/10 !text-status-ok !ring-status-ok/30' : ''
        }`}
      >
        Regulär
      </button>
      <button
        type="button"
        onClick={() => onChange('cancelled')}
        className={`btn-secondary flex-1 !py-2 text-sm ${
          value === 'cancelled' ? '!bg-tbw-red/10 !text-tbw-red !ring-tbw-red/30' : ''
        }`}
      >
        Fällt aus
      </button>
      <button
        type="button"
        onClick={() => onChange('special')}
        className={`btn-secondary flex-1 !py-2 text-sm ${
          value === 'special' ? '!bg-tbw-gold/10 !text-tbw-navyDark !ring-tbw-gold/30' : ''
        }`}
      >
        Sonderzeiten
      </button>
    </div>
  );
}

function ModeHint({ mode }: { mode: 'regular' | 'cancelled' | 'special' }) {
  return (
    <p className="text-xs text-tbw-ink/40">
      {mode === 'regular' && 'Reguläres Training findet wie gewohnt statt — nur zur eigenen Notiz.'}
      {mode === 'cancelled' && 'Alle regulären Trainings entfallen im ganzen Zeitraum, ohne Ersatztermine.'}
      {mode === 'special' &&
        'Die regulären Trainings entfallen im ganzen Zeitraum; einzelne Sondertermine trägst du nach dem Anlegen darunter ein.'}
    </p>
  );
}

export function TrainingsAdmin() {
  const [trainings, setTrainings] = useState<Training[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [showTrainingForm, setShowTrainingForm] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase.from('trainings').select('*');
    if (loadError) {
      setError('Fehler beim Laden der Trainingszeiten.');
      return;
    }
    // Sondertermine (specific_date gesetzt) gehören zu einer Ferienzeit und
    // werden dort verwaltet, nicht in dieser wöchentlichen Liste.
    setTrainings(
      [...((data as Training[]) ?? [])]
        .filter((t) => t.weekday !== null)
        .sort((a, b) => weekdayIndex(a.weekday!) - weekdayIndex(b.weekday!) || a.start_time.localeCompare(b.start_time))
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
      setShowTrainingForm(false);
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
  const [sessions, setSessions] = useState<Training[] | null>(null);
  const [overrideForm, setOverrideForm] = useState(EMPTY_OVERRIDE_FORM);
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [sessionForms, setSessionForms] = useState<Record<string, typeof EMPTY_SESSION_FORM>>({});
  const [sessionBusy, setSessionBusy] = useState<string | null>(null);
  const [openSessionForms, setOpenSessionForms] = useState<Set<string>>(new Set());
  const [editingOverrideId, setEditingOverrideId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_OVERRIDE_FORM);
  const [editBusy, setEditBusy] = useState(false);

  const loadOverrides = useCallback(async () => {
    setOverrideError(null);
    const [overridesRes, sessionsRes] = await Promise.all([
      supabase.from('training_overrides').select('*'),
      supabase.from('trainings').select('*').not('override_id', 'is', null)
    ]);
    if (overridesRes.error || sessionsRes.error) {
      setOverrideError('Fehler beim Laden der Ferienzeiten.');
      return;
    }
    setOverrides([...((overridesRes.data as TrainingOverride[]) ?? [])].sort((a, b) => a.start_date.localeCompare(b.start_date)));
    setSessions((sessionsRes.data as Training[]) ?? []);
  }, []);

  useEffect(() => {
    loadOverrides().catch(() => setOverrideError('Fehler beim Laden der Ferienzeiten.'));
  }, [loadOverrides]);

  async function addOverride(e: FormEvent) {
    e.preventDefault();
    setOverrideBusy(true);
    setOverrideError(null);
    try {
      const { error: insertError } = await supabase.from('training_overrides').insert({
        start_date: overrideForm.start_date,
        end_date: overrideForm.end_date,
        mode: overrideForm.mode,
        note: overrideForm.note.trim() || null
      });
      if (insertError) throw insertError;
      setOverrideForm(EMPTY_OVERRIDE_FORM);
      setShowOverrideForm(false);
      await loadOverrides();
    } catch {
      setOverrideError('Ferienzeit konnte nicht angelegt werden.');
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

  function startEditOverride(o: TrainingOverride) {
    setEditingOverrideId(o.id);
    setEditForm({ start_date: o.start_date, end_date: o.end_date, mode: o.mode, note: o.note ?? '' });
  }

  async function saveOverrideEdit(id: string, e: FormEvent) {
    e.preventDefault();
    setEditBusy(true);
    setOverrideError(null);
    try {
      const { error: updateError } = await supabase
        .from('training_overrides')
        .update({
          start_date: editForm.start_date,
          end_date: editForm.end_date,
          mode: editForm.mode,
          note: editForm.note.trim() || null
        })
        .eq('id', id);
      if (updateError) throw updateError;
      setEditingOverrideId(null);
      await loadOverrides();
    } catch {
      setOverrideError('Ferienzeit konnte nicht gespeichert werden.');
    } finally {
      setEditBusy(false);
    }
  }

  function sessionForm(overrideId: string) {
    return sessionForms[overrideId] ?? EMPTY_SESSION_FORM;
  }

  function setSessionField(overrideId: string, patch: Partial<typeof EMPTY_SESSION_FORM>) {
    setSessionForms((prev) => ({ ...prev, [overrideId]: { ...sessionForm(overrideId), ...patch } }));
  }

  function toggleSessionForm(overrideId: string) {
    setOpenSessionForms((prev) => {
      const next = new Set(prev);
      next.has(overrideId) ? next.delete(overrideId) : next.add(overrideId);
      return next;
    });
  }

  async function addSession(overrideId: string, e: FormEvent) {
    e.preventDefault();
    const form = sessionForm(overrideId);
    setSessionBusy(overrideId);
    setOverrideError(null);
    try {
      const { error: insertError } = await supabase.from('trainings').insert({
        weekday: null,
        specific_date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        location: form.location.trim(),
        override_id: overrideId
      });
      if (insertError) throw insertError;
      // Bleibt offen, damit mehrere Sondertermine hintereinander ohne
      // erneutes Aufklappen eingetragen werden können — nur die Felder
      // werden zurückgesetzt.
      setSessionForms((prev) => ({ ...prev, [overrideId]: EMPTY_SESSION_FORM }));
      await loadOverrides();
    } catch {
      setOverrideError('Sondertermin konnte nicht angelegt werden.');
    } finally {
      setSessionBusy(null);
    }
  }

  async function removeSession(id: string) {
    setOverrideError(null);
    try {
      const { error: delError } = await supabase.from('trainings').delete().eq('id', id);
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
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-tbw-ink/40">Wöchentliche Trainingszeiten</p>
        {!showTrainingForm && (
          <button className="text-xs font-bold text-tbw-navy" onClick={() => setShowTrainingForm(true)}>
            + Neu
          </button>
        )}
      </div>

      {showTrainingForm && (
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
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy}>
              Anlegen
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => {
                setShowTrainingForm(false);
                setForm(EMPTY_FORM);
              }}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}

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

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs font-bold uppercase tracking-wide text-tbw-ink/40">Ferienzeiten &amp; Sonderregelungen</p>
        {overrides !== null && !showOverrideForm && (
          <button className="text-xs font-bold text-tbw-navy" onClick={() => setShowOverrideForm(true)}>
            + Neu
          </button>
        )}
      </div>
      {overrideError && <ErrorNote message={overrideError} />}
      {overrides === null || sessions === null ? (
        <LoadingSpinner />
      ) : (
        <>
          {showOverrideForm && (
            <form onSubmit={addOverride} className="card space-y-2">
              <p className="text-sm font-bold text-tbw-navyDark">Neue Ferienzeit</p>
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
              <input
                placeholder="Notiz (z. B. Herbstferien)"
                className="input"
                value={overrideForm.note}
                onChange={(e) => setOverrideForm((f) => ({ ...f, note: e.target.value }))}
              />
              <ModeToggle value={overrideForm.mode} onChange={(mode) => setOverrideForm((f) => ({ ...f, mode }))} />
              <ModeHint mode={overrideForm.mode} />
              <div className="flex gap-2">
                <button className="btn-primary flex-1" disabled={overrideBusy}>
                  Anlegen
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => {
                    setShowOverrideForm(false);
                    setOverrideForm(EMPTY_OVERRIDE_FORM);
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </form>
          )}

          <ul className="space-y-2">
            {overrides.map((o) => {
              const ownSessions = sessions
                .filter((s) => s.override_id === o.id)
                .sort((a, b) => (a.specific_date ?? '').localeCompare(b.specific_date ?? ''));
              const sform = sessionForm(o.id);
              const isEditing = editingOverrideId === o.id;
              const sessionFormOpen = openSessionForms.has(o.id);

              if (isEditing) {
                return (
                  <li key={o.id} className="card">
                    <form onSubmit={(e) => saveOverrideEdit(o.id, e)} className="space-y-2">
                      <p className="text-sm font-bold text-tbw-navyDark">Ferienzeit bearbeiten</p>
                      <div className="grid grid-cols-2 gap-2">
                        <DateField
                          label="Von"
                          required
                          value={editForm.start_date}
                          onChange={(v) => setEditForm((f) => ({ ...f, start_date: v }))}
                        />
                        <DateField
                          label="Bis"
                          required
                          min={editForm.start_date || undefined}
                          value={editForm.end_date}
                          onChange={(v) => setEditForm((f) => ({ ...f, end_date: v }))}
                        />
                      </div>
                      <input
                        placeholder="Notiz (z. B. Herbstferien)"
                        className="input"
                        value={editForm.note}
                        onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                      />
                      <ModeToggle value={editForm.mode} onChange={(mode) => setEditForm((f) => ({ ...f, mode }))} />
                      <ModeHint mode={editForm.mode} />
                      <div className="flex gap-2">
                        <button className="btn-primary flex-1" disabled={editBusy}>
                          Speichern
                        </button>
                        <button
                          type="button"
                          className="btn-secondary flex-1"
                          onClick={() => setEditingOverrideId(null)}
                        >
                          Abbrechen
                        </button>
                      </div>
                    </form>
                  </li>
                );
              }

              return (
                <li key={o.id} className="card space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-tbw-navyDark">
                        {fmtDateShort(o.start_date)}–{fmtDateShort(o.end_date)}
                      </p>
                      <p className="text-sm text-tbw-ink/60">
                        {o.mode === 'regular' ? 'Reguläres Training' : o.mode === 'cancelled' ? 'Fällt aus' : 'Sonderzeiten'}
                        {o.note ? ` · ${o.note}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => startEditOverride(o)}>
                        Bearbeiten
                      </button>
                      <button
                        className="btn-secondary !px-2 !py-1 text-xs !text-tbw-red"
                        onClick={() => removeOverride(o.id)}
                      >
                        Löschen
                      </button>
                    </div>
                  </div>

                  {o.mode === 'special' && (
                    <div className="space-y-2 border-t border-black/5 pt-3">
                      {ownSessions.length > 0 ? (
                        <ul className="space-y-1.5">
                          {ownSessions.map((s) => (
                            <li key={s.id} className="flex items-center justify-between rounded-xl bg-tbw-bg p-2 text-sm">
                              <span className="text-tbw-navyDark">
                                {fmtDate(s.specific_date!)} · {fmtTime(s.start_time)}–{fmtTime(s.end_time)} · {s.location}
                              </span>
                              <button className="text-xs font-bold text-tbw-red" onClick={() => removeSession(s.id)}>
                                ✕
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-tbw-ink/40">Noch keine Sondertermine eingetragen.</p>
                      )}

                      {sessionFormOpen ? (
                        <form onSubmit={(e) => addSession(o.id, e)} className="space-y-2 rounded-xl bg-tbw-bg p-3">
                          <p className="text-xs font-bold text-tbw-ink/50">Sondertermin hinzufügen</p>
                          <DateField
                            label="Datum"
                            required
                            min={o.start_date}
                            max={o.end_date}
                            value={sform.date}
                            onChange={(v) => setSessionField(o.id, { date: v })}
                          />
                          <div className="space-y-2">
                            <TimeField
                              label="Beginn"
                              required
                              value={sform.start_time}
                              onChange={(v) => setSessionField(o.id, { start_time: v })}
                            />
                            <TimeField
                              label="Ende"
                              required
                              value={sform.end_time}
                              onChange={(v) => setSessionField(o.id, { end_time: v })}
                            />
                          </div>
                          <input
                            required
                            placeholder="Halle / Adresse"
                            className="input"
                            value={sform.location}
                            onChange={(e) => setSessionField(o.id, { location: e.target.value })}
                          />
                          <div className="flex gap-2">
                            <button className="btn-secondary flex-1 !py-2 text-sm" disabled={sessionBusy === o.id}>
                              Hinzufügen
                            </button>
                            <button
                              type="button"
                              className="btn-secondary flex-1 !py-2 text-sm"
                              onClick={() => toggleSessionForm(o.id)}
                            >
                              Fertig
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          className="text-xs font-bold text-tbw-navy"
                          onClick={() => toggleSessionForm(o.id)}
                        >
                          + Sondertermin hinzufügen
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            {overrides.length === 0 && <p className="text-sm text-tbw-ink/50">Keine Ferienzeiten eingetragen.</p>}
          </ul>
        </>
      )}
    </div>
  );
}
