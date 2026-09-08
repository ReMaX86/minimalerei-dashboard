import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorNote } from './ErrorNote';
import { DateField } from './DateTimeField';
import { fmtDateShort } from '../lib/format';
import type { PlayerAbsence } from '../types/database';

export function AbsenceSection() {
  const { player } = useAuth();
  const [absences, setAbsences] = useState<PlayerAbsence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!player) return;
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error: loadError } = await supabase
      .from('player_absences')
      .select('*')
      .eq('player_id', player.id)
      .gte('end_date', today)
      .order('start_date');
    if (loadError) {
      setError('Fehler beim Laden deiner Abwesenheiten.');
      return;
    }
    setAbsences((data as PlayerAbsence[]) ?? []);
  }, [player]);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden deiner Abwesenheiten.'));
  }, [load]);

  if (!player) return null;
  if (error) return <ErrorNote message={error} />;
  if (!absences) return <LoadingSpinner />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!player || !startDate || !endDate) return;
    setBusy(true);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('player_absences')
        .insert({ player_id: player.id, start_date: startDate, end_date: endDate, note: note.trim() || null });
      if (insertError) throw insertError;
      setShowForm(false);
      setStartDate('');
      setEndDate('');
      setNote('');
      await load();
    } catch {
      setError('Abwesenheit konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const { error: delError } = await supabase.from('player_absences').delete().eq('id', id);
      if (delError) throw delError;
      await load();
    } catch {
      setError('Abwesenheit konnte nicht gelöscht werden.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <p className="text-sm font-bold text-tbw-navyDark">🌴 Urlaub / Abwesenheit</p>
      <p className="mt-1 text-xs text-tbw-ink/50">
        Training in diesem Zeitraum wird automatisch abgesagt, beim Kader sieht der Trainer einen Hinweis.
      </p>

      {absences.length > 0 && (
        <ul className="mt-3 space-y-2">
          {absences.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-xl bg-tbw-bg p-3">
              <div>
                <p className="text-sm font-semibold text-tbw-navyDark">
                  {fmtDateShort(a.start_date)} – {fmtDateShort(a.end_date)}
                </p>
                {a.note && <p className="text-xs text-tbw-ink/50">{a.note}</p>}
              </div>
              <button
                className="btn-secondary shrink-0 !px-2 !py-1 text-xs !text-tbw-red"
                disabled={busy}
                onClick={() => remove(a.id)}
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-black/5 pt-3">
        {showForm ? (
          <form onSubmit={submit} className="space-y-2">
            <div className="space-y-2">
              <DateField label="Von" required value={startDate} onChange={setStartDate} />
              <DateField label="Bis" required min={startDate || undefined} value={endDate} onChange={setEndDate} />
            </div>
            <input
              type="text"
              placeholder="Notiz (optional, z. B. Urlaub, verletzt)"
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={busy}>
                Eintragen
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                Abbrechen
              </button>
            </div>
          </form>
        ) : (
          <button className="btn-secondary w-full text-sm" onClick={() => setShowForm(true)}>
            Abwesenheit eintragen
          </button>
        )}
      </div>
    </section>
  );
}
