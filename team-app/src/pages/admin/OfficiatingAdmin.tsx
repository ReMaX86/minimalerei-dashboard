import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { fmtDate, fmtTime } from '../../lib/format';
import {
  OFFICIATING_TASK_LABELS,
  officiatingGameLabel,
  type OfficiatingGame,
  type OfficiatingTask,
  type OfficiatingTaskType,
  type OfficiatingTeam,
  type Player
} from '../../types/database';

const TASK_TYPES: OfficiatingTaskType[] = ['uhr', 'anschreiber', 'zeit'];
const EMPTY_FORM = { game_date: '', game_time: '', opponent_teams: '', opponent: '', location: '' };
const EMPTY_TASK_SELECTION: Record<OfficiatingTaskType, boolean> = { uhr: false, anschreiber: false, zeit: false };

export function OfficiatingAdmin() {
  const [games, setGames] = useState<OfficiatingGame[] | null>(null);
  const [tasksByGame, setTasksByGame] = useState<Record<string, OfficiatingTask[]>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<OfficiatingTeam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [taskSelection, setTaskSelection] = useState(EMPTY_TASK_SELECTION);
  const [busy, setBusy] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);
  const [showTeams, setShowTeams] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [gamesRes, tasksRes, playersRes, teamsRes] = await Promise.all([
      supabase.from('officiating_games').select('*').order('game_date'),
      supabase.from('officiating_tasks').select('*'),
      supabase.from('players').select('*').eq('is_active', true).order('name'),
      supabase.from('officiating_teams').select('*').order('name')
    ]);
    if (gamesRes.error || tasksRes.error || playersRes.error || teamsRes.error) {
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
    setTeams((teamsRes.data as OfficiatingTeam[]) ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Kampfgericht-Termine.'));
  }, [load]);

  async function addGame(e: FormEvent) {
    e.preventDefault();
    const selectedTypes = TASK_TYPES.filter((type) => taskSelection[type]);
    if (selectedTypes.length === 0) {
      setError('Bitte mindestens eine Aufgabe auswählen, die wir stellen müssen.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data: inserted, error: insertError } = await supabase
        .from('officiating_games')
        .insert({
          game_date: form.game_date,
          game_time: form.game_time || null,
          opponent_teams: form.opponent_teams.trim(),
          opponent: form.opponent.trim() || null,
          location: form.location.trim()
        })
        .select()
        .single();
      if (insertError) throw insertError;
      const { error: tasksError } = await supabase
        .from('officiating_tasks')
        .insert(selectedTypes.map((task_type) => ({ officiating_game_id: inserted.id, task_type })));
      if (tasksError) throw tasksError;
      setForm(EMPTY_FORM);
      setTaskSelection(EMPTY_TASK_SELECTION);
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

  async function addTeam(e: FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setTeamBusy(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('officiating_teams').insert({ name: newTeamName.trim() });
      if (insertError) throw insertError;
      setNewTeamName('');
      await load();
    } catch {
      setError('Team konnte nicht angelegt werden (existiert es evtl. schon?).');
    } finally {
      setTeamBusy(false);
    }
  }

  async function removeTeam(id: string) {
    setError(null);
    try {
      const { error: delError } = await supabase.from('officiating_teams').delete().eq('id', id);
      if (delError) throw delError;
      await load();
    } catch {
      setError('Team konnte nicht gelöscht werden.');
    }
  }

  if (error) return <ErrorNote message={error} />;
  if (!games) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <button
          className="flex w-full items-center justify-between text-sm font-bold text-tbw-navyDark"
          onClick={() => setShowTeams((v) => !v)}
          type="button"
        >
          Jahrgänge / Teams
          <span>{showTeams ? '▲' : '▼'}</span>
        </button>
        {showTeams && (
          <>
            <form onSubmit={addTeam} className="flex gap-2">
              <input
                className="input"
                placeholder="z. B. TBW U16"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
              <button className="btn-secondary shrink-0" disabled={teamBusy || !newTeamName.trim()}>
                Hinzufügen
              </button>
            </form>
            {teams.length === 0 ? (
              <p className="text-sm text-tbw-ink/50">Noch keine Teams eingetragen.</p>
            ) : (
              <ul className="divide-y divide-black/5">
                {teams.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-tbw-navyDark">{t.name}</span>
                    <button
                      className="text-xs font-semibold text-tbw-red"
                      onClick={() => removeTeam(t.id)}
                      type="button"
                    >
                      Löschen
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <form onSubmit={addGame} className="card space-y-2">
        <p className="text-sm font-bold text-tbw-navyDark">Neuer Kampfgericht-Termin</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block min-w-0 text-xs">
            <span className="font-semibold text-tbw-ink/50">Datum</span>
            <input
              type="date"
              required
              className="input mt-1"
              value={form.game_date}
              onChange={(e) => setForm((f) => ({ ...f, game_date: e.target.value }))}
            />
          </label>
          <label className="block min-w-0 text-xs">
            <span className="font-semibold text-tbw-ink/50">Uhrzeit</span>
            <input
              type="time"
              className="input mt-1"
              value={form.game_time}
              onChange={(e) => setForm((f) => ({ ...f, game_time: e.target.value }))}
            />
          </label>
        </div>
        <select
          required
          className="input"
          value={form.opponent_teams}
          onChange={(e) => setForm((f) => ({ ...f, opponent_teams: e.target.value }))}
        >
          <option value="" disabled>
            Team wählen…
          </option>
          {teams.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Gegner (optional), z. B. DJK Erkrath"
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
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tbw-ink/50">
            Welche Aufgaben müssen wir stellen?
          </p>
          <div className="flex flex-wrap gap-3">
            {TASK_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-1.5 text-sm text-tbw-ink/80">
                <input
                  type="checkbox"
                  checked={taskSelection[type]}
                  onChange={(e) => setTaskSelection((s) => ({ ...s, [type]: e.target.checked }))}
                />
                {OFFICIATING_TASK_LABELS[type]}
              </label>
            ))}
          </div>
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          Anlegen
        </button>
      </form>

      <ul className="space-y-2">
        {games.map((g) => (
          <li key={g.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-tbw-navyDark">{officiatingGameLabel(g)}</p>
                <p className="text-sm text-tbw-ink/60">
                  {fmtDate(g.game_date)}
                  {g.game_time ? ` · ${fmtTime(g.game_time)} Uhr` : ''} · {g.location}
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
                    {task ? (
                      <select
                        className="input !w-auto !py-1 text-xs"
                        value={task.assigned_player_id ?? ''}
                        onChange={(e) => assign(task.id, e.target.value || null)}
                      >
                        <option value="">offen</option>
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="pill pill-open">nicht unsere Aufgabe</span>
                    )}
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
