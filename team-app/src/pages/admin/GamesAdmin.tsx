import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { fmtDate, fmtTime } from '../../lib/format';
import type { Game, TrikotSetId } from '../../types/database';

const EMPTY_FORM = {
  game_date: '',
  game_time: '',
  opponent: '',
  is_home: true,
  trikot_override: '' as '' | TrikotSetId,
  location: ''
};

export function GamesAdmin() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase.from('games').select('*').order('game_date').order('game_time');
    if (loadError) {
      setError('Fehler beim Laden der Spiele.');
      return;
    }
    setGames((data as Game[]) ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Spiele.'));
  }, [load]);

  function edit(g: Game) {
    setEditingId(g.id);
    setForm({
      game_date: g.game_date,
      game_time: g.game_time.slice(0, 5),
      opponent: g.opponent,
      is_home: g.is_home,
      trikot_override: g.trikot_override ?? '',
      location: g.location
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      game_date: form.game_date,
      game_time: form.game_time,
      opponent: form.opponent.trim(),
      is_home: form.is_home,
      trikot_override: form.trikot_override || null,
      location: form.location.trim()
    };
    try {
      const { error: saveError } = editingId
        ? await supabase.from('games').update(payload).eq('id', editingId)
        : await supabase.from('games').insert(payload);
      if (saveError) throw saveError;
      resetForm();
      await load();
    } catch {
      setError('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const { error: delError } = await supabase.from('games').delete().eq('id', id);
      if (delError) throw delError;
      if (editingId === id) resetForm();
      await load();
    } catch {
      setError('Löschen fehlgeschlagen.');
    }
  }

  if (error) return <ErrorNote message={error} />;
  if (!games) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card space-y-2">
        <p className="text-sm font-bold text-tbw-navyDark">{editingId ? 'Spiel bearbeiten' : 'Neues Spiel'}</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            required
            className="input"
            value={form.game_date}
            onChange={(e) => setForm((f) => ({ ...f, game_date: e.target.value }))}
          />
          <input
            type="time"
            required
            className="input"
            value={form.game_time}
            onChange={(e) => setForm((f) => ({ ...f, game_time: e.target.value }))}
          />
        </div>
        <input
          required
          placeholder="Gegner"
          className="input"
          value={form.opponent}
          onChange={(e) => setForm((f) => ({ ...f, opponent: e.target.value }))}
        />
        <input
          required
          placeholder="Halle / Adresse"
          className="input"
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
        />
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_home}
              onChange={(e) => setForm((f) => ({ ...f, is_home: e.target.checked }))}
            />
            Heimspiel
          </label>
          <select
            className="input !w-auto"
            value={form.trikot_override}
            onChange={(e) => setForm((f) => ({ ...f, trikot_override: e.target.value as '' | TrikotSetId }))}
          >
            <option value="">Trikot automatisch</option>
            <option value="weiss">Trikot: Weiß erzwingen</option>
            <option value="schwarz">Trikot: Schwarz erzwingen</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={busy}>
            {editingId ? 'Speichern' : 'Anlegen'}
          </button>
          {editingId && (
            <button type="button" className="btn-secondary" onClick={resetForm}>
              Abbrechen
            </button>
          )}
        </div>
      </form>

      <ul className="space-y-2">
        {games.map((g) => (
          <li key={g.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-tbw-navyDark">
                  vs. {g.opponent} <span className="pill pill-open ml-1">{g.is_home ? 'Heim' : 'Auswärts'}</span>
                </p>
                <p className="text-sm text-tbw-ink/60">
                  {fmtDate(g.game_date)} · {fmtTime(g.game_time)} Uhr · {g.location}
                </p>
                <p className="text-xs text-tbw-ink/40">
                  Kader: {g.squad_published ? 'veröffentlicht' : 'Entwurf'}
                  {g.trikot_override ? ` · Trikot fix: ${g.trikot_override === 'weiss' ? 'Weiß' : 'Schwarz'}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => edit(g)}>
                  Bearbeiten
                </button>
                <button className="btn-secondary !px-2 !py-1 text-xs !text-tbw-red" onClick={() => remove(g.id)}>
                  Löschen
                </button>
              </div>
            </div>
          </li>
        ))}
        {games.length === 0 && <p className="text-sm text-tbw-ink/50">Noch keine Spiele eingetragen.</p>}
      </ul>
    </div>
  );
}
