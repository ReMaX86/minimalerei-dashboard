import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { useTipoffLoader } from '../hooks/useTipoffLoader';
import { fmtDate, fmtDateBadge, fmtDateShort, fmtTime, isFuture, seasonLabel } from '../lib/format';
import {
  OFFICIATING_TASK_LABELS,
  type OfficiatingAssignmentLogRow,
  type OfficiatingGame,
  type OfficiatingTask,
  type OfficiatingTaskType,
  type Player
} from '../types/database';

// Element 14 "Kampfgericht" — Neugestaltung von Darstellung/Wortlaut nach
// docs/design/tipoff-design/elements/14-kampfgericht/. Datenmodell, Rechte,
// Rotations-/Zuteilungsregeln bleiben unverändert (PROMPT.md "WICHTIG"),
// siehe §7 der Rückmeldung für die drei Stellen, an denen Vorlage und
// bestehende Logik auseinanderliefen und dazu Rückfrage gehalten wurde.

const TASK_TYPES: OfficiatingTaskType[] = ['uhr', 'anschreiber', 'zeit'];
const SEASON_TARGET_MIN = 2;
const TALLY_COLLAPSED = 6;
const LOG_SHOWN = 4;

// Kurzform nur für diese Rollenzeile (44px Chip-Höhe zu knapp für
// "24-Sekunden-Uhr") — gleiche Begründung/gleiches Muster wie
// OTHER_STAT_SHORT in GameStatsTracker.tsx. OFFICIATING_TASK_LABELS selbst
// bleibt unverändert, da Admin/Notify-Texte weiterhin die volle Form
// brauchen.
const TASK_LABEL_SHORT: Record<OfficiatingTaskType, string> = {
  uhr: '24-Sek.-Uhr',
  anschreiber: 'Anschreiben',
  zeit: 'Zeit & Punkte'
};

interface State {
  games: OfficiatingGame[];
  tasksByGame: Record<string, OfficiatingTask[]>;
  taskById: Record<string, OfficiatingTask>;
  players: Player[];
  assignmentLog: OfficiatingAssignmentLogRow[];
  signupDeadline: string | null;
}

interface RoleRow {
  task: OfficiatingTask | null; // null = "anderes Team" (keine Zeile in officiating_tasks)
  type: OfficiatingTaskType;
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="opacity-55" aria-hidden="true">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
    </svg>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-to-text3 transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 pt-1.5">
      <span className="to-display-sm text-to-text">{title}</span>
      <span className="h-px flex-1 bg-to-divider" />
    </div>
  );
}

interface SheetState {
  mode: 'confirm' | 'release' | 'assign';
  taskType: OfficiatingTaskType;
  game: OfficiatingGame;
  task: OfficiatingTask | null; // vorhandene Zuteilung, falls schon besetzt (release/assign)
}

export function Kampfgericht() {
  const { role, player, isAdmin } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pastOpen, setPastOpen] = useState(false);
  const [tallyOpen, setTallyOpen] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);

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

  const showLoader = useTipoffLoader(!state);

  if (error) return <ErrorNote message={error} />;
  if (showLoader) return <LoadingSpinner />;
  if (!state) return null;

  // Nur Termine, bei denen unser Verein mindestens eine Position stellt
  // (= mindestens eine echte Zeile in officiating_tasks existiert) — Spiele
  // ohne jede eigene Rolle stellt laut Adminbereich ein anderes Team
  // komplett, für uns ist dort nichts zu tun.
  const upcoming = state.games
    .filter((g) => isFuture(g.game_date))
    .filter((g) => (state.tasksByGame[g.id]?.length ?? 0) > 0);
  const past = state.games.filter((g) => !isFuture(g.game_date)).reverse();
  const sortedPlayersByCount = [...state.players].sort(
    (a, b) => (taskCountByPlayer[a.id] ?? 0) - (taskCountByPlayer[b.id] ?? 0) || a.name.localeCompare(b.name, 'de')
  );
  const upcomingOpenCount = upcoming.reduce(
    (sum, game) => sum + (state.tasksByGame[game.id] ?? []).filter((t) => !t.assigned_player_id).length,
    0
  );

  // Kapitän/Co-Kapitän dürfen wie der Trainer Zuteilungen manuell ändern
  // (siehe admin_assign_officiating_task(), Migration 0050).
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
      setSheet(null);
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
    setSheet(null);
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
    setSheet(null);
    await load();
    setBusyTaskId(null);
  }

  function roleRows(game: OfficiatingGame): RoleRow[] {
    return TASK_TYPES.map((type) => ({ type, task: state!.tasksByGame[game.id]?.find((t) => t.task_type === type) ?? null }));
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-end gap-3">
        <span className="to-display-lg text-to-text">Kampfgericht</span>
        <span className="to-data pb-0.5 text-[10px] tracking-[0.12em] text-to-textDisabled">SAISON {seasonLabel()}</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-2 rounded-to-xl border border-to-border bg-to-surface p-4">
          <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">DEINE EINSÄTZE</span>
          <span className="flex items-baseline gap-1.5">
            <span className="to-number text-[30px] leading-none text-to-accent">{ownCount}</span>
            <span className="to-data text-[11px] text-to-text3">DIESE SAISON</span>
          </span>
        </div>
        <div className={`flex flex-col gap-2 rounded-to-xl border bg-to-surface p-4 ${upcomingOpenCount > 0 ? 'border-to-danger/30' : 'border-to-border'}`}>
          <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">NOCH OFFEN</span>
          <span className="flex items-baseline gap-1.5">
            <span className={`to-number text-[30px] leading-none ${upcomingOpenCount > 0 ? 'text-to-dangerText' : 'text-to-accent'}`}>{upcomingOpenCount}</span>
            <span className="to-data text-[11px] text-to-text3">POSITIONEN</span>
          </span>
        </div>
      </div>

      {state.signupDeadline && (
        <div className="flex items-center justify-between gap-3 rounded-to-lg bg-to-surface2 px-3.5 py-2.5">
          <p className="text-[12px] leading-snug text-to-text2">
            {deadlinePassed
              ? `Zuteilungen sind seit ${fmtDate(state.signupDeadline)} fix. Kann jemand spontan doch nicht, bitte privat einen Tausch klären und danach Trainer oder Kapitän Bescheid geben.`
              : `Bis ${fmtDate(state.signupDeadline)} könnt ihr eure Kampfgericht-Termine hier noch selbst übernehmen und abwählen.`}
          </p>
          <span
            className={`to-data inline-flex h-[18px] shrink-0 items-center rounded-to-pill px-1.5 text-[8px] font-semibold ${
              deadlinePassed ? 'bg-to-dangerSoft text-to-dangerText' : 'bg-to-accentSoft text-to-accent'
            }`}
          >
            {deadlinePassed ? 'FIX' : 'OFFEN'}
          </span>
        </div>
      )}

      <SectionHead title="Kommende Termine" />

      {upcoming.length === 0 ? (
        <div className="flex flex-col gap-1.5 rounded-to-xl border border-dashed border-to-line bg-to-surface px-5 py-[26px] text-center">
          <p className="text-[15px] font-semibold text-to-text">Keine Termine offen</p>
          <p className="text-[13px] leading-relaxed text-to-text3">
            Für die nächsten Wochen muss unser Verein kein Kampfgericht stellen.
            <br />
            Neue Termine pflegt der Trainer im Adminbereich.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {upcoming.map((game) => {
            const roles = roleRows(game);
            const open = roles.filter((r) => r.task && !r.task.assigned_player_id).length;
            const mine = roles.some((r) => r.task?.assigned_player_id === player?.id);
            return (
              <section
                key={game.id}
                className={`flex flex-col overflow-hidden rounded-to-2xl border bg-to-surface pb-2 ${
                  open > 0 ? 'border-to-danger/30' : mine ? 'border-to-borderMatchday' : 'border-to-border'
                }`}
              >
                <div className="flex items-start gap-3 px-[18px] pb-3 pt-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[16px] font-semibold -tracking-[0.01em] text-to-text">{game.opponent_teams}</span>
                    <span className="to-data text-[11px] text-to-text3">
                      {fmtDateBadge(game.game_date)}
                      {game.game_time ? ` · ${fmtTime(game.game_time)}` : ''}
                    </span>
                    {game.opponent && <span className="to-data text-[10px] text-to-textDisabled">GEGEN {game.opponent.toUpperCase()}</span>}
                  </div>
                  <span
                    className={`to-data inline-flex h-6 shrink-0 items-center gap-1.5 rounded-to-pill px-2.5 text-[9px] font-semibold tracking-[0.04em] ${
                      open > 0 ? 'bg-to-dangerSoft text-to-dangerText' : 'bg-to-accentSoft text-to-accent'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {open > 0 ? `${open} OFFEN` : 'KOMPLETT'}
                  </span>
                </div>

                {roles.map((r) => {
                  const other = !r.task;
                  const isOpen = !!r.task && !r.task.assigned_player_id;
                  const isMe = !!r.task && r.task.assigned_player_id === player?.id;
                  const canClaim = isOpen && !!player && !deadlinePassed && !canReassign;
                  const canTapOpen = isOpen && (canReassign || canClaim);
                  return (
                    <div key={r.type} className="flex min-h-[46px] items-center gap-3 border-t border-to-surface2 px-[18px]">
                      <span
                        className={`flex-1 text-sm ${
                          other ? 'text-to-textDisabled' : isOpen || isMe ? 'text-to-text' : 'text-to-text2'
                        }`}
                      >
                        {TASK_LABEL_SHORT[r.type]}
                      </span>
                      {other ? (
                        <span className="text-[13px] text-to-textDisabled">anderes Team</span>
                      ) : isOpen ? (
                        canTapOpen ? (
                          <button
                            type="button"
                            disabled={busyTaskId === r.task!.id}
                            onClick={() => setSheet({ mode: canReassign ? 'assign' : 'confirm', taskType: r.type, game, task: r.task })}
                            className="flex h-[30px] shrink-0 items-center rounded-to-pill border border-to-danger/30 px-3 text-[13px] font-semibold text-to-dangerText"
                          >
                            Übernehmen
                          </button>
                        ) : (
                          <span className="flex h-[30px] shrink-0 items-center rounded-to-pill border border-to-danger/30 px-3 text-[13px] font-semibold text-to-dangerText opacity-60">
                            Übernehmen
                          </span>
                        )
                      ) : isMe ? (
                        <button
                          type="button"
                          disabled={busyTaskId === r.task!.id}
                          onClick={() =>
                            setSheet({ mode: canReassign ? 'assign' : 'release', taskType: r.type, game, task: r.task })
                          }
                          className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-to-pill border border-to-borderMatchday bg-to-accentSoft px-3 text-[13px] font-semibold text-to-accent"
                        >
                          Du
                          {canReassign && <PenIcon />}
                        </button>
                      ) : canReassign ? (
                        <button
                          type="button"
                          onClick={() => setSheet({ mode: 'assign', taskType: r.type, game, task: r.task })}
                          className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-to-pill bg-to-surface2 px-3 text-[13px] font-medium text-to-text"
                        >
                          {playersById[r.task!.assigned_player_id!]?.name ?? '?'}
                          <PenIcon />
                        </button>
                      ) : (
                        <span className="flex h-[30px] shrink-0 items-center rounded-to-pill bg-to-surface2 px-3 text-[13px] font-medium text-to-text">
                          {playersById[r.task!.assigned_player_id!]?.name ?? '?'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      <button type="button" onClick={() => setPastOpen((o) => !o)} aria-expanded={pastOpen} className="flex items-center gap-3 pt-1.5 text-left">
        <span className="to-display-sm text-to-text">Vergangene Termine</span>
        <span className="h-px flex-1 bg-to-divider" />
        <ChevronIcon open={pastOpen} />
      </button>

      {pastOpen && (
        <div className="flex flex-col gap-2.5">
          {past.length === 0 ? (
            <p className="rounded-to-xl border border-to-hairline bg-to-surface p-4 text-sm text-to-text3">Keine vergangenen Termine.</p>
          ) : (
            past.map((game) => (
              <section key={game.id} className="flex flex-col overflow-hidden rounded-to-2xl border border-to-hairline bg-to-surface pb-1.5 opacity-90">
                <div className="flex items-start gap-3 px-[18px] pb-2.5 pt-3.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[15px] font-semibold -tracking-[0.01em] text-to-text2">{game.opponent_teams}</span>
                    <span className="to-data text-[10px] text-to-textDisabled">
                      {fmtDateBadge(game.game_date)}
                      {game.game_time ? ` · ${fmtTime(game.game_time)}` : ''}
                    </span>
                    {game.opponent && <span className="to-data text-[9px] text-to-textDisabled">GEGEN {game.opponent.toUpperCase()}</span>}
                  </div>
                  <span className="to-data inline-flex h-6 shrink-0 items-center rounded-to-pill bg-to-surface2 px-2.5 text-[9px] font-semibold tracking-[0.04em] text-to-text3">
                    KOMPLETT
                  </span>
                </div>
                {roleRows(game).map((r) => {
                  if (!r.task) return null;
                  const isMe = r.task.assigned_player_id === player?.id;
                  return (
                    <div key={r.type} className="flex min-h-[38px] items-center gap-3 border-t border-to-surface3 px-[18px]">
                      <span className="flex-1 text-[13px] text-to-text3">{TASK_LABEL_SHORT[r.type]}</span>
                      <span className={`shrink-0 text-[13px] font-medium ${isMe ? 'font-semibold text-to-accent' : 'text-to-text2'}`}>
                        {r.task.assigned_player_id ? (isMe ? 'Du' : (playersById[r.task.assigned_player_id]?.name ?? '?')) : 'offen'}
                      </span>
                    </div>
                  );
                })}
              </section>
            ))
          )}
        </div>
      )}

      <SectionHead title="Einsätze pro Spieler" />
      <section className="flex flex-col overflow-hidden rounded-to-2xl border border-to-border bg-to-surface">
        <div className="flex items-center gap-3 px-[18px] py-3">
          <span className="to-data flex-1 text-[10px] tracking-[0.12em] text-to-text3">GANZE SAISON</span>
          <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">EINSÄTZE</span>
        </div>
        {(tallyOpen ? sortedPlayersByCount : sortedPlayersByCount.slice(0, TALLY_COLLAPSED)).map((p) => {
          const count = taskCountByPlayer[p.id] ?? 0;
          const isMe = p.id === player?.id;
          return (
            <div key={p.id} className={`flex min-h-[42px] items-center gap-3 border-t border-to-surface2 px-[18px] ${isMe ? 'bg-to-accentWash' : ''}`}>
              <span className={`min-w-0 flex-1 truncate text-sm ${isMe ? 'font-semibold text-to-accent' : 'text-to-text'}`}>{p.name}</span>
              <span
                className={`to-data flex h-6 min-w-[34px] shrink-0 items-center justify-center rounded-to-pill px-2 text-[11px] font-semibold ${
                  count === 0 ? 'text-to-textDisabled' : 'bg-to-surface2 text-to-text2'
                }`}
              >
                {count}×
              </span>
            </div>
          );
        })}
        {sortedPlayersByCount.length > TALLY_COLLAPSED && (
          <button
            type="button"
            onClick={() => setTallyOpen((o) => !o)}
            className="flex min-h-[44px] items-center justify-center border-t border-to-surface2 text-[13px] font-semibold text-to-accent"
          >
            {tallyOpen ? 'Weniger anzeigen' : 'Alle Spieler anzeigen'}
          </button>
        )}
      </section>

      <SectionHead title="Letzte Änderungen" />
      <section className="flex flex-col overflow-hidden rounded-to-2xl border border-to-border bg-to-surface">
        {state.assignmentLog.length === 0 ? (
          <p className="p-[18px] text-sm text-to-text3">Noch keine Änderungen protokolliert.</p>
        ) : (
          state.assignmentLog.slice(0, LOG_SHOWN).map((row) => {
            const task = state.taskById[row.officiating_task_id];
            const game = task ? state.games.find((g) => g.id === task.officiating_game_id) : undefined;
            const fromName = row.from_player_id ? (playersById[row.from_player_id]?.name ?? '?') : 'offen';
            const toName = row.to_player_id ? (playersById[row.to_player_id]?.name ?? '?') : 'offen';
            return (
              <div key={row.id} className="flex flex-col gap-1 border-t border-to-surface2 px-[18px] py-3 first:border-t-0">
                <div className="flex items-baseline gap-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold -tracking-[0.01em] text-to-text">
                    {task ? OFFICIATING_TASK_LABELS[task.task_type] : 'Aufgabe gelöscht'}
                    {game ? ` · ${game.opponent_teams}` : ''}
                  </span>
                  <span className="to-data shrink-0 text-[10px] text-to-textDisabled">{fmtDateShort(row.created_at.slice(0, 10))}</span>
                </div>
                <span className="to-data text-[10px] leading-relaxed text-to-text3">
                  {fromName} → {toName} · geändert von {row.changed_by_label}
                </span>
              </div>
            );
          })
        )}
      </section>

      {sheet && <TaskSheet sheet={sheet} me={player} players={state.players} taskCountByPlayer={taskCountByPlayer} busy={!!busyTaskId} onClaim={claim} onRelease={release} onAssign={assign} onClose={() => setSheet(null)} />}
    </div>
  );
}

function TaskSheet({
  sheet,
  me,
  players,
  taskCountByPlayer,
  busy,
  onClaim,
  onRelease,
  onAssign,
  onClose
}: {
  sheet: SheetState;
  me: Player | null;
  players: Player[];
  taskCountByPlayer: Record<string, number>;
  busy: boolean;
  onClaim: (taskId: string) => void;
  onRelease: (taskId: string) => void;
  onAssign: (taskId: string, playerId: string | null) => void;
  onClose: () => void;
}) {
  const { mode, taskType, game, task } = sheet;
  const roleLabel = TASK_LABEL_SHORT[taskType];
  const metaLine = `${fmtDateBadge(game.game_date)}${game.game_time ? ` · ${fmtTime(game.game_time)}` : ''}${game.opponent ? ` · gegen ${game.opponent}` : ''}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col gap-3.5 overflow-y-auto rounded-t-[24px] border border-to-line bg-to-surface p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />

        {mode === 'confirm' || mode === 'release' ? (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="to-display-sm text-to-text">{mode === 'confirm' ? 'Position übernehmen?' : 'Position abwählen?'}</h2>
              <p className="to-data text-[10px] tracking-[0.1em] text-to-text3">
                {mode === 'confirm' ? 'DU TRÄGST DICH VERBINDLICH EIN' : 'DU TRÄGST DICH WIEDER AUS'}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 rounded-to-lg border border-to-divider bg-to-surface2 p-4">
              <span className="text-[16px] font-semibold -tracking-[0.01em] text-to-text">{roleLabel}</span>
              <span className="to-data text-[11px] text-to-text3">{game.opponent_teams}</span>
              <span className="to-data text-[11px] text-to-text3">{metaLine}</span>
            </div>
            <p className="text-[12px] leading-relaxed text-to-textDisabled">
              {mode === 'confirm'
                ? 'Danach stehst du bei diesem Termin als verantwortlich drin.'
                : 'Die Position gilt danach wieder als offen, bis sich jemand anderes einträgt.'}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => (mode === 'confirm' ? onClaim(task!.id) : onRelease(task!.id))}
              className={mode === 'confirm' ? 'btn-primary !h-[46px] text-[15px]' : 'flex h-[46px] items-center justify-center rounded-to-pill border border-to-line text-[15px] font-semibold text-to-text2'}
            >
              {busy ? 'Speichere…' : mode === 'confirm' ? 'Ja, ich übernehme' : 'Ja, abwählen'}
            </button>
            <button type="button" disabled={busy} onClick={onClose} className="h-6 text-[13px] font-normal text-to-text3">
              Abbrechen
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="to-display-sm text-to-text">Wer übernimmt?</h2>
              <p className="to-data text-[10px] tracking-[0.1em] text-to-text3">
                {`${roleLabel} · ${game.opponent_teams} · ${metaLine}`.toUpperCase()}
              </p>
            </div>

            <div className="flex max-h-[300px] flex-col overflow-y-auto rounded-to-lg border border-to-hairline bg-to-bg">
              {me && (
                <button
                  type="button"
                  onClick={() => onAssign(task!.id, me.id)}
                  className="flex min-h-[50px] items-center gap-3 border-b border-to-surface2 bg-to-accentWash px-3.5 text-left"
                >
                  <span className="to-data flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-to-borderMatchday bg-to-accentSoft text-[11px] text-to-accent">
                    {initialsOf(me.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-to-accent">Du ({me.name})</span>
                  <span className="to-data shrink-0 text-[10px] text-to-text3">{taskCountByPlayer[me.id] ?? 0}×</span>
                </button>
              )}
              {players
                .filter((p) => p.id !== me?.id)
                .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onAssign(task!.id, p.id)}
                    className="flex min-h-[50px] items-center gap-3 border-b border-to-surface2 px-3.5 text-left last:border-b-0"
                  >
                    <span className="to-data flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-to-surface2 text-[11px] text-to-text3">
                      {initialsOf(p.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-to-text">{p.name}</span>
                    <span className="to-data shrink-0 text-[10px] text-to-text3">{taskCountByPlayer[p.id] ?? 0}×</span>
                  </button>
                ))}
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => onAssign(task!.id, null)}
              className="flex h-[46px] items-center justify-center rounded-to-pill border border-to-line text-[15px] font-semibold text-to-text2"
            >
              Position frei lassen
            </button>
            <button type="button" disabled={busy} onClick={onClose} className="h-6 text-[13px] font-normal text-to-text3">
              Abbrechen
            </button>
          </>
        )}
      </div>
    </div>
  );
}
