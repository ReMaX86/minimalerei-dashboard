import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { fmtDate, fmtTime, isFuture } from '../lib/format';
import {
  OFFICIATING_TASK_LABELS,
  type OfficiatingGame,
  type OfficiatingTask,
  type OfficiatingTaskType,
  type Player
} from '../types/database';

const TASK_TYPES: OfficiatingTaskType[] = ['uhr', 'anschreiber', 'zeit'];
const SEASON_TARGET_MIN = 2;
const SEASON_TARGET_MAX = 3;

interface State {
  games: OfficiatingGame[];
  tasksByGame: Record<string, OfficiatingTask[]>;
  players: Player[];
}

export function Kampfgericht() {
  const { role, player } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [gamesRes, tasksRes, playersRes] = await Promise.all([
      supabase.from('officiating_games').select('*').order('game_date'),
      supabase.from('officiating_tasks').select('*'),
      supabase.from('players').select('*').eq('is_active', true)
    ]);
    if (gamesRes.error || tasksRes.error || playersRes.error) {
      setError('Fehler beim Laden der Kampfgericht-Termine.');
      return;
    }
    const tasksByGame: Record<string, OfficiatingTask[]> = {};
    (tasksRes.data as OfficiatingTask[]).forEach((t) => {
      (tasksByGame[t.officiating_game_id] ??= []).push(t);
    });
    setState({
      games: (gamesRes.data as OfficiatingGame[]) ?? [],
      tasksByGame,
      players: (playersRes.data as Player[]) ?? []
    });
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Kampfgericht-Termine.'));
  }, [load]);

  const playersById = useMemo(() => {
    const map: Record<string, Player> = {};
    state?.players.forEach((p) => (map[p.id] = p));
    return map;
  }, [state]);

  const ownCount = useMemo(() => {
    if (!state || !player) return 0;
    return Object.values(state.tasksByGame)
      .flat()
      .filter((t) => t.assigned_player_id === player.id).length;
  }, [state, player]);

  if (error) return <ErrorNote message={error} />;
  if (!state) return <LoadingSpinner />;

  const upcoming = state.games.filter((g) => isFuture(g.game_date));
  const past = state.games.filter((g) => !isFuture(g.game_date)).reverse();

  async function assign(taskId: string, playerId: string | null) {
    setBusyTaskId(taskId);
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
    } finally {
      setBusyTaskId(null);
    }
  }

  async function claim(taskId: string) {
    setBusyTaskId(taskId);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('claim_officiating_task', { p_task_id: taskId });
      if (rpcError) throw rpcError;
      await load();
    } catch {
      setError('Der Slot wurde gerade schon vergeben. Bitte Seite aktualisieren.');
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <div className="space-y-4">
      {role === 'player' && (
        <section className="card flex items-center justify-between">
          <p className="text-sm font-semibold text-tbw-navyDark">Deine Einsätze diese Saison</p>
          <span className={ownCount >= SEASON_TARGET_MIN ? 'pill pill-ok' : 'pill pill-warn'}>
            {ownCount} von {SEASON_TARGET_MIN}–{SEASON_TARGET_MAX}
          </span>
        </section>
      )}

      <GameList
        title="Kommende Termine"
        games={upcoming}
        tasksByGame={state.tasksByGame}
        playersById={playersById}
        players={state.players}
        role={role}
        currentPlayerId={player?.id ?? null}
        busyTaskId={busyTaskId}
        onAssign={assign}
        onClaim={claim}
        emptyText="Keine anstehenden Kampfgericht-Termine."
      />

      <section className="card">
        <button
          className="flex w-full items-center justify-between text-sm font-bold text-tbw-navyDark"
          onClick={() => setShowPast((v) => !v)}
        >
          Vergangene Termine
          <span>{showPast ? '▲' : '▼'}</span>
        </button>
        {showPast && (
          <div className="mt-3">
            <GameList
              title=""
              games={past}
              tasksByGame={state.tasksByGame}
              playersById={playersById}
              players={state.players}
              role={role}
              currentPlayerId={player?.id ?? null}
              busyTaskId={busyTaskId}
              onAssign={assign}
              onClaim={claim}
              emptyText="Keine vergangenen Termine."
              flat
            />
          </div>
        )}
      </section>
    </div>
  );
}

function GameList({
  title,
  games,
  tasksByGame,
  playersById,
  players,
  role,
  currentPlayerId,
  busyTaskId,
  onAssign,
  onClaim,
  emptyText,
  flat
}: {
  title: string;
  games: OfficiatingGame[];
  tasksByGame: Record<string, OfficiatingTask[]>;
  playersById: Record<string, Player>;
  players: Player[];
  role: 'trainer' | 'player' | 'guest' | 'loading';
  currentPlayerId: string | null;
  busyTaskId: string | null;
  onAssign: (taskId: string, playerId: string | null) => void;
  onClaim: (taskId: string) => void;
  emptyText: string;
  flat?: boolean;
}) {
  return (
    <div className={flat ? 'space-y-3' : 'space-y-3'}>
      {title && <p className="text-sm font-bold text-tbw-navyDark">{title}</p>}
      {games.length === 0 && <p className="text-sm text-tbw-ink/50">{emptyText}</p>}
      {games.map((game) => {
        const tasks = TASK_TYPES.map(
          (type) =>
            tasksByGame[game.id]?.find((t) => t.task_type === type) ?? {
              id: '',
              officiating_game_id: game.id,
              task_type: type,
              assigned_player_id: null
            }
        );
        return (
          <div key={game.id} className={flat ? 'rounded-xl bg-tbw-bg p-3' : 'card'}>
            <p className="text-sm font-semibold text-tbw-navyDark">{game.opponent_teams}</p>
            <p className="text-xs text-tbw-ink/50">
              {fmtDate(game.game_date)}
              {game.game_time ? ` · ${fmtTime(game.game_time)} Uhr` : ''} · {game.location}
            </p>
            <ul className="mt-2 space-y-2">
              {tasks.map((task) => (
                <li key={task.task_type} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-tbw-ink/70">{OFFICIATING_TASK_LABELS[task.task_type]}</span>
                  {!task.id ? (
                    <span className="text-sm text-tbw-ink/30">–</span>
                  ) : role === 'trainer' ? (
                    <select
                      className="input !w-auto !py-1 text-xs"
                      value={task.assigned_player_id ?? ''}
                      disabled={busyTaskId === task.id}
                      onChange={(e) => onAssign(task.id, e.target.value || null)}
                    >
                      <option value="">offen</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ) : task.assigned_player_id ? (
                    <span className={task.assigned_player_id === currentPlayerId ? 'pill pill-warn' : 'pill pill-ok'}>
                      {playersById[task.assigned_player_id]?.name ?? '?'}
                    </span>
                  ) : currentPlayerId ? (
                    <button
                      className="btn-secondary !px-3 !py-1 text-xs"
                      disabled={busyTaskId === task.id}
                      onClick={() => onClaim(task.id)}
                    >
                      Ich übernehme
                    </button>
                  ) : (
                    <span className="pill pill-open">offen</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
