import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { fmtDate, fmtDateShort, fmtTime, isFuture } from '../lib/format';
import {
  OFFICIATING_TASK_LABELS,
  officiatingGameLabel,
  type OfficiatingAssignmentLogRow,
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
  taskById: Record<string, OfficiatingTask>;
  players: Player[];
  assignmentLog: OfficiatingAssignmentLogRow[];
  signupDeadline: string | null;
}

export function Kampfgericht() {
  const { role, player, isAdmin } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [showPlayerCounts, setShowPlayerCounts] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [gamesRes, tasksRes, playersRes, logRes, settingsRes] = await Promise.all([
      supabase.from('officiating_games').select('*').order('game_date'),
      supabase.from('officiating_tasks').select('*'),
      supabase.from('players').select('*').eq('is_active', true),
      supabase.from('officiating_assignment_log').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('reminder_settings').select('officiating_signup_deadline').limit(1).maybeSingle()
    ]);
    if (gamesRes.error || tasksRes.error || playersRes.error || logRes.error) {
      setError('Fehler beim Laden der Kampfgericht-Termine.');
      return;
    }
    const tasksByGame: Record<string, OfficiatingTask[]> = {};
    const taskById: Record<string, OfficiatingTask> = {};
    (tasksRes.data as OfficiatingTask[]).forEach((t) => {
      (tasksByGame[t.officiating_game_id] ??= []).push(t);
      taskById[t.id] = t;
    });
    setState({
      games: (gamesRes.data as OfficiatingGame[]) ?? [],
      tasksByGame,
      taskById,
      players: (playersRes.data as Player[]) ?? [],
      assignmentLog: (logRes.data as OfficiatingAssignmentLogRow[]) ?? [],
      signupDeadline:
        (settingsRes.data as { officiating_signup_deadline: string | null } | null)?.officiating_signup_deadline ??
        null
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

  const taskCountByPlayer = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!state) return counts;
    Object.values(state.tasksByGame)
      .flat()
      .forEach((t) => {
        if (t.assigned_player_id) counts[t.assigned_player_id] = (counts[t.assigned_player_id] ?? 0) + 1;
      });
    return counts;
  }, [state]);

  if (error) return <ErrorNote message={error} />;
  if (!state) return <LoadingSpinner />;

  const upcoming = state.games.filter((g) => isFuture(g.game_date));
  const past = state.games.filter((g) => !isFuture(g.game_date)).reverse();
  const sortedPlayersByCount = [...state.players].sort(
    (a, b) => (taskCountByPlayer[a.id] ?? 0) - (taskCountByPlayer[b.id] ?? 0) || a.name.localeCompare(b.name, 'de')
  );
  const upcomingOpenCount = upcoming.reduce(
    (sum, game) => sum + (state.tasksByGame[game.id] ?? []).filter((t) => !t.assigned_player_id).length,
    0
  );

  // Kapitän/Co-Kapitän dürfen wie der Trainer Zuteilungen manuell ändern
  // (siehe admin_assign_officiating_task(), Migration 0050) — genau die
  // Rolle, die laut Nutzer nachträgliche, privat abgesprochene Tausche in
  // die App einträgt, sobald die Meldefrist um ist.
  const isCaptain = !!player && (player.is_captain || player.is_co_captain);
  const canReassign = isAdmin || isCaptain;
  const today = new Date().toISOString().slice(0, 10);
  const deadlinePassed = state.signupDeadline !== null && today > state.signupDeadline;

  async function assign(taskId: string, playerId: string | null) {
    setBusyTaskId(taskId);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_assign_officiating_task', {
        p_task_id: taskId,
        p_player_id: playerId
      });
      if (rpcError) throw rpcError;
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
    const { error: rpcError } = await supabase.rpc('claim_officiating_task', { p_task_id: taskId });
    if (rpcError) {
      setError(
        rpcError.message.includes('deadline_passed')
          ? 'Die Meldefrist ist abgelaufen — Änderungen bitte bei Trainer oder Kapitän melden.'
          : 'Der Slot wurde gerade schon vergeben. Bitte Seite aktualisieren.'
      );
      setBusyTaskId(null);
      return;
    }
    await load();
    setBusyTaskId(null);
  }

  async function release(taskId: string) {
    setBusyTaskId(taskId);
    setError(null);
    const { error: rpcError } = await supabase.rpc('release_officiating_task', { p_task_id: taskId });
    if (rpcError) {
      setError(
        rpcError.message.includes('deadline_passed')
          ? 'Die Meldefrist ist abgelaufen — Änderungen bitte bei Trainer oder Kapitän melden.'
          : 'Abwählen fehlgeschlagen. Bitte Seite aktualisieren.'
      );
      setBusyTaskId(null);
      return;
    }
    await load();
    setBusyTaskId(null);
  }

  return (
    <div className="space-y-4">
      {role === 'player' && (
        <section className="card flex items-center justify-between">
          <p className="text-sm font-semibold text-to-text">Deine Einsätze diese Saison</p>
          <span className={ownCount >= SEASON_TARGET_MIN ? 'pill pill-ok' : 'pill pill-warn'}>{ownCount}×</span>
        </section>
      )}

      <section className="card flex items-center justify-between">
        <p className="text-sm font-semibold text-to-text">Offene Kampfgericht-Positionen</p>
        <span className={upcomingOpenCount > 0 ? 'pill pill-warn' : 'pill pill-ok'}>
          {upcomingOpenCount > 0 ? `${upcomingOpenCount} offen` : 'Alles besetzt'}
        </span>
      </section>

      {state.signupDeadline && (
        <section className="card flex items-center justify-between gap-3">
          <p className="text-sm text-to-text2">
            {deadlinePassed
              ? `Zuteilungen sind seit ${fmtDate(state.signupDeadline)} fix. Kann jemand spontan doch nicht, bitte privat einen Tausch klären und danach Trainer oder Kapitän Bescheid geben.`
              : `Bis ${fmtDate(state.signupDeadline)} könnt ihr eure Kampfgericht-Termine hier noch selbst übernehmen und abwählen.`}
          </p>
          <span className={deadlinePassed ? 'pill pill-warn shrink-0' : 'pill pill-ok shrink-0'}>
            {deadlinePassed ? 'fix' : 'offen'}
          </span>
        </section>
      )}

      <GameList
        title="Kommende Termine"
        games={upcoming}
        tasksByGame={state.tasksByGame}
        playersById={playersById}
        players={state.players}
        canReassign={canReassign}
        deadlinePassed={deadlinePassed}
        currentPlayerId={player?.id ?? null}
        busyTaskId={busyTaskId}
        onAssign={assign}
        onClaim={claim}
        onRelease={release}
        emptyText="Keine anstehenden Kampfgericht-Termine."
      />

      <section className="card">
        <button
          className="flex w-full items-center justify-between text-sm font-bold text-to-text"
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
              canReassign={canReassign}
              deadlinePassed={deadlinePassed}
              currentPlayerId={player?.id ?? null}
              busyTaskId={busyTaskId}
              onAssign={assign}
              onClaim={claim}
              onRelease={release}
              emptyText="Keine vergangenen Termine."
              flat
            />
          </div>
        )}
      </section>

      <section className="card">
        <button
          className="flex w-full items-center justify-between text-sm font-bold text-to-text"
          onClick={() => setShowPlayerCounts((v) => !v)}
        >
          Einsätze pro Spieler
          <span>{showPlayerCounts ? '▲' : '▼'}</span>
        </button>
        {showPlayerCounts && (
          <ul className="mt-3 divide-y divide-to-divider">
            {sortedPlayersByCount.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-to-text">{p.name}</span>
                <span className={(taskCountByPlayer[p.id] ?? 0) > 0 ? 'pill pill-ok' : 'pill pill-warn'}>
                  {taskCountByPlayer[p.id] ?? 0}×
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <button
          className="flex w-full items-center justify-between text-sm font-bold text-to-text"
          onClick={() => setShowLog((v) => !v)}
        >
          Letzte Änderungen
          <span>{showLog ? '▲' : '▼'}</span>
        </button>
        {showLog &&
          (state.assignmentLog.length === 0 ? (
            <p className="mt-3 text-sm text-to-text3">Noch keine Änderungen protokolliert.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {state.assignmentLog.map((row) => {
                const task = state.taskById[row.officiating_task_id];
                const game = task ? state.games.find((g) => g.id === task.officiating_game_id) : undefined;
                const fromName = row.from_player_id ? (playersById[row.from_player_id]?.name ?? '?') : 'offen';
                const toName = row.to_player_id ? (playersById[row.to_player_id]?.name ?? '?') : 'offen';
                return (
                  <li key={row.id} className="border-b border-to-divider pb-2 text-sm last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-to-text">
                        {task ? OFFICIATING_TASK_LABELS[task.task_type] : 'Aufgabe gelöscht'}
                        {game ? ` · ${officiatingGameLabel(game)}` : ''}
                      </span>
                      <span className="shrink-0 text-xs text-to-text3">
                        {fmtDateShort(row.created_at.slice(0, 10))}
                      </span>
                    </div>
                    <p className="text-xs text-to-text3">
                      {fromName} → {toName} · geändert von {row.changed_by_label}
                    </p>
                  </li>
                );
              })}
            </ul>
          ))}
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
  canReassign,
  deadlinePassed,
  currentPlayerId,
  busyTaskId,
  onAssign,
  onClaim,
  onRelease,
  emptyText,
  flat
}: {
  title: string;
  games: OfficiatingGame[];
  tasksByGame: Record<string, OfficiatingTask[]>;
  playersById: Record<string, Player>;
  players: Player[];
  canReassign: boolean;
  deadlinePassed: boolean;
  currentPlayerId: string | null;
  busyTaskId: string | null;
  onAssign: (taskId: string, playerId: string | null) => void;
  onClaim: (taskId: string) => void;
  onRelease: (taskId: string) => void;
  emptyText: string;
  flat?: boolean;
}) {
  return (
    <div className={flat ? 'space-y-3' : 'space-y-3'}>
      {title && <p className="text-sm font-bold text-to-text">{title}</p>}
      {games.length === 0 && <p className="text-sm text-to-text3">{emptyText}</p>}
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
        const openCount = tasks.filter((t) => t.id && !t.assigned_player_id).length;
        return (
          <div key={game.id} className={flat ? 'rounded-xl bg-to-bg p-3' : 'card'}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-to-text">{officiatingGameLabel(game)}</p>
                <p className="text-xs text-to-text3">
                  {fmtDate(game.game_date)}
                  {game.game_time ? ` · ${fmtTime(game.game_time)} Uhr` : ''} · {game.location}
                </p>
              </div>
              {canReassign && (
                <span className={openCount > 0 ? 'pill pill-warn shrink-0' : 'pill pill-ok shrink-0'}>
                  {openCount > 0 ? `${openCount} offen` : 'komplett'}
                </span>
              )}
            </div>
            <ul className="mt-2 space-y-2">
              {tasks.map((task) => (
                <li key={task.task_type} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-to-text2">{OFFICIATING_TASK_LABELS[task.task_type]}</span>
                  {!task.id ? (
                    <span className="text-sm text-to-text3">–</span>
                  ) : canReassign ? (
                    <select
                      className={`input !w-auto !py-1 text-xs ${
                        task.assigned_player_id
                          ? '!border-to-accent/40 !bg-to-accentSoft/10'
                          : '!border-to-danger !bg-to-dangerSoft'
                      }`}
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
                    <div className="flex items-center gap-2">
                      <span className={task.assigned_player_id === currentPlayerId ? 'pill pill-warn' : 'pill pill-ok'}>
                        {task.assigned_player_id === currentPlayerId
                          ? 'Du'
                          : (playersById[task.assigned_player_id]?.name ?? '?')}
                      </span>
                      {task.assigned_player_id === currentPlayerId && !deadlinePassed && (
                        <button
                          className="btn-secondary !px-2 !py-1 text-xs"
                          disabled={busyTaskId === task.id}
                          onClick={() => onRelease(task.id)}
                        >
                          Abwählen
                        </button>
                      )}
                    </div>
                  ) : currentPlayerId && !deadlinePassed ? (
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
