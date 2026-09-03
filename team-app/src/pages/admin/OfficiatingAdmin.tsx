import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { fmtDate } from '../../lib/format';
import {
  OFFICIATING_TASK_LABELS,
  type OfficiatingGame,
  type OfficiatingTask,
  type OfficiatingTaskType,
  type Player
} from '../../types/database';

const TASK_TYPES: OfficiatingTaskType[] = ['uhr', 'anschreiber', 'zeit'];
const EMPTY_FORM = { game_date: '', opponent_teams: '', location: '' };

export function OfficiatingAdmin() {
  const [games, setGames] = useState<OfficiatingGame[] | null>(null);
  const [tasksByGame, setTasksByGame] = useState<Record<string, OfficiatingTask[]>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [gamesRes, tasksRes, playersRes] = await Promise.all([
      supabase.from('officiating_games').select('*').order('game_date'),
      supabase.from('officiating_tasks').select('*'),
      supabase.from('players').select('*').eq('is_active', true).order('name')
    ]);
    if (gamesRes.error || tasksRes.error || playersRes.error) {
      setError('Fehler beim Laden der Kampfgericht-Termine.');
      return;
    }
    const grouped: Record<string, OfficiatingTask[]> = {};
    (tasksRes.data as OfficiatingTask[]).forEach((t) => {
      (grouped[t.officiating_game_id] ??= []).push(t);
    });
    setGames((gamesRes.data as OfficiatingGame[]) ?? []);
    setTasksByGame(grouped);
    setPlayers((playersRes.data as Player[]) ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Kampfgericht-Termine.'));
  }, [load]);

  async function addGame(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data: inserted, error: insertError } = await supabase
        .from('officiating_games')
        .insert({
          game_date: form.game_date,
          opponent_teams: form.opponent_teams.trim(),
          location: form.location.trim()
        })
        .select()
        .single();
      if (insertError) throw insertError;
      const { error: tasksError } = await supabase
        .from('officiating_tasks')
        .insert(TASK_TYPES.map((task_type) => ({ officiating_game_id: inserted.id, task_type })));
      if (tasksError) throw tasksError;
      setForm(EMPTY_FORM);
      await load();
    } catch {
      setError('Termin konnte nicht angelegt werden.');
    } finally {
      setBusy(false);
    }
  }

  async function assign(taskId: string, playerId: string | null) {
    setError(null);
    try {
      const { error: updError } = await supabase
        .from('officiating_tasks')
        .update({ assigned_player_id: playerId })
        .eq('id', taskId);
      if (updError) throw updError;
      await load();
    } catch {
      setError('Zuweisung fehlgeschlagen.');
    }
  }

  async function removeGame(id: string) {
    setError(null);
    try {
      const { error: delError } = await supabase.from('officiating_games').delete().eq('id', id);
      if (delError) throw delError;
      await load();
    } catch {
      setError('Löschen fehlgeschlagen.');
    }
  }

  if (error) return <ErrorNote message={error} />;
  if (!games) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <form onSubmit={addGame} className="card space-y-2">
        <p className="text-sm font-bold text-tbw-navyDark">Neuer Kampfgericht-Termin</p>
        <input
          type="date"
          required
          className="input"
          value={form.game_date}
          onChange={(e) => setForm((f) => ({ ...f, game_date: e.target.value }))}
        />
        <input
          required
          placeholder="Gegnerische Teams, z. B. DJK Erkrath U16"
          className="input"
          value={form.opponent_teams}
          onChange={(e) => setForm((f) => ({ ...f, opponent_teams: e.target.value }))}
        />
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
        {games.map((g) => (
          <li key={g.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-tbw-navyDark">{g.opponent_teams}</p>
                <p className="text-sm text-tbw-ink/60">
                  {fmtDate(g.game_date)} · {g.location}
                </p>
              </div>
              <button className="btn-secondary !px-2 !py-1 text-xs !text-tbw-red" onClick={() => removeGame(g.id)}>
                Löschen
              </button>
            </div>
            <ul className="mt-2 space-y-2">
              {TASK_TYPES.map((type) => {
                const task = tasksByGame[g.id]?.find((t) => t.task_type === type);
                return (
                  <li key={type} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-tbw-ink/70">{OFFICIATING_TASK_LABELS[type]}</span>
                    <select
                      className="input !w-auto !py-1 text-xs"
                      value={task?.assigned_player_id ?? ''}
                      onChange={(e) => task && assign(task.id, e.target.value || null)}
                    >
                      <option value="">offen</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
        {games.length === 0 && <p className="text-sm text-tbw-ink/50">Noch keine Termine eingetragen.</p>}
      </ul>
    </div>
  );
}
