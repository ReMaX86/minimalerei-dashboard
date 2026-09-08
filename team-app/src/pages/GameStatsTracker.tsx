import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/Avatar';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { computeBoxScore, computeQuarterScores, computeTeamScore, quarterLabel } from '../lib/gameStats';
import { fmtDate, fmtTime, shortPlayerName } from '../lib/format';
import {
  STAT_TYPE_LABELS,
  type Game,
  type GameCourtState,
  type GameStatEvent,
  type GameStatSessionState,
  type Player,
  type StatType
} from '../types/database';

const COURT_SIZE = 5;

const SCORING_BUTTONS: { made: StatType; miss: StatType; label: string }[] = [
  { made: 'fg2_made', miss: 'fg2_miss', label: '2er' },
  { made: 'fg3_made', miss: 'fg3_miss', label: '3er' },
  { made: 'ft_made', miss: 'ft_miss', label: 'FW' }
];

const OTHER_STATS: StatType[] = ['rebound', 'assist', 'steal', 'block', 'turnover', 'foul'];

// Kurzform für die kleineren Aktions-Kreise — die vollen Bezeichnungen aus
// STAT_TYPE_LABELS (z. B. "Ballverlust") sind für einen Kreis zu lang,
// werden aber weiterhin im "Zuletzt"-Log und der Box-Score-Kopfzeile genutzt.
const OTHER_STAT_SHORT: Partial<Record<StatType, string>> = {
  rebound: 'Reb',
  assist: 'Ast',
  steal: 'Stl',
  block: 'Blk',
  turnover: 'TO',
  foul: 'Foul'
};

const HEARTBEAT_MS = 15_000;

type LockState =
  | { kind: 'loading' }
  | { kind: 'readonly' }
  | { kind: 'blocked'; session: GameStatSessionState }
  | { kind: 'takenOver' }
  | { kind: 'held' };

function PlayerTile({
  player,
  onClick,
  selected,
  disabled
}: {
  player: Player;
  onClick: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-2 text-center disabled:opacity-30 ${
        selected ? 'border-status-ok bg-status-ok/5' : 'border-transparent bg-tbw-bg active:scale-[0.97]'
      }`}
    >
      <Avatar player={player} size="sm" />
      <span className="text-xs font-semibold leading-tight text-tbw-navyDark">{shortPlayerName(player.name)}</span>
    </button>
  );
}

function ActionCircle({
  label,
  sublabel,
  tone,
  onClick,
  disabled,
  size = 'md'
}: {
  label: string;
  sublabel?: string;
  tone: 'make' | 'miss' | 'neutral';
  onClick: () => void;
  disabled?: boolean;
  size?: 'md' | 'sm';
}) {
  const toneClasses =
    tone === 'make'
      ? 'border-status-ok text-status-ok'
      : tone === 'miss'
        ? 'border-tbw-red text-tbw-red'
        : 'border-tbw-navy/15 text-tbw-navyDark';
  // Feste Größe statt an die Grid-Spalte gestreckt (aspect-square) — sonst
  // werden die Kreise auf einem Handy riesig und die Aktionsliste passt
  // nicht mehr auf einen Bildschirm.
  const dims = size === 'md' ? 'h-16 w-16' : 'h-14 w-14';
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex ${dims} shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border-2 bg-white text-center active:scale-95 disabled:opacity-30 ${toneClasses}`}
    >
      <span className="text-sm font-extrabold leading-none">{label}</span>
      {sublabel && <span className="text-[8px] font-semibold uppercase tracking-wide opacity-70">{sublabel}</span>}
    </button>
  );
}

export function GameStatsTracker() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { isAdmin, trainer, player } = useAuth();
  const myName = trainer?.name ?? player?.name ?? 'Unbekannt';

  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [squadPlayerIds, setSquadPlayerIds] = useState<string[]>([]);
  const [onCourtIds, setOnCourtIds] = useState<string[]>([]);
  const [substituting, setSubstituting] = useState(false);
  const [outgoingId, setOutgoingId] = useState<string | null>(null);
  const [events, setEvents] = useState<GameStatEvent[]>([]);
  const [lockState, setLockState] = useState<LockState>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);
  // Erst Aktion, dann Spieler: pendingAction ist gesetzt, sobald eine
  // Aktion angetippt wurde, und wartet auf den zugehörigen Spieler.
  const [pendingAction, setPendingAction] = useState<StatType | null>(null);
  const [quarter, setQuarter] = useState(1);
  const [busy, setBusy] = useState(false);
  const insertedStack = useRef<string[]>([]);
  const heartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPlayersAndEvents = useCallback(async () => {
    if (!gameId) return;
    const [playersRes, eventsRes, squadRes, courtRes] = await Promise.all([
      supabase.from('players').select('*').eq('is_active', true).order('name'),
      supabase.from('game_stat_events').select('*').eq('game_id', gameId).order('created_at'),
      supabase.from('game_squad').select('player_id').eq('game_id', gameId).eq('is_selected', true),
      supabase.from('game_court_state').select('*').eq('game_id', gameId).maybeSingle()
    ]);
    setPlayers((playersRes.data as Player[]) ?? []);
    setEvents((eventsRes.data as GameStatEvent[]) ?? []);
    setSquadPlayerIds(((squadRes.data as { player_id: string }[]) ?? []).map((r) => r.player_id));
    setOnCourtIds((courtRes.data as GameCourtState | null)?.on_court_player_ids ?? []);
  }, [gameId]);

  // Optimistisch lokal setzen und im Hintergrund speichern — bleibt über
  // eine Übernahme des Trackings hinweg erhalten (siehe Migration 0029).
  const persistOnCourt = useCallback(
    (next: string[]) => {
      setOnCourtIds(next);
      if (!gameId) return;
      supabase
        .from('game_court_state')
        .upsert({ game_id: gameId, on_court_player_ids: next, updated_at: new Date().toISOString() }, { onConflict: 'game_id' })
        .then(({ error: upsertError }) => {
          if (upsertError) setError('Aufstellung konnte nicht gespeichert werden.');
        });
    },
    [gameId]
  );

  function toggleStarter(id: string) {
    if (onCourtIds.includes(id)) {
      persistOnCourt(onCourtIds.filter((x) => x !== id));
    } else if (onCourtIds.length < COURT_SIZE) {
      persistOnCourt([...onCourtIds, id]);
    }
  }

  function startSubstitution() {
    setSubstituting(true);
    setOutgoingId(null);
  }

  function cancelSubstitution() {
    setSubstituting(false);
    setOutgoingId(null);
  }

  function confirmSubstitution(incomingId: string) {
    if (!outgoingId) return;
    persistOnCourt(onCourtIds.map((id) => (id === outgoingId ? incomingId : id)));
    setSubstituting(false);
    setOutgoingId(null);
  }

  const stopHeartbeat = useCallback(() => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatInterval.current = setInterval(async () => {
      if (!gameId) return;
      const { data } = await supabase.rpc('heartbeat_stat_session', { p_game_id: gameId });
      if (data === false) {
        stopHeartbeat();
        setLockState({ kind: 'takenOver' });
      }
    }, HEARTBEAT_MS);
  }, [gameId, stopHeartbeat]);

  const claim = useCallback(
    async (force: boolean) => {
      if (!gameId) return;
      const { data, error: claimError } = await supabase.rpc('claim_stat_session', {
        p_game_id: gameId,
        p_holder_name: myName,
        p_force: force
      });
      if (claimError) {
        setError('Sitzung konnte nicht gestartet werden.');
        return;
      }
      const session = (Array.isArray(data) ? data[0] : data) as GameStatSessionState | undefined;
      if (!session) {
        setError('Sitzung konnte nicht gestartet werden.');
        return;
      }
      if (session.is_me) {
        await loadPlayersAndEvents();
        setLockState({ kind: 'held' });
        startHeartbeat();
      } else {
        setLockState({ kind: 'blocked', session });
      }
    },
    [gameId, myName, loadPlayersAndEvents, startHeartbeat]
  );

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;

    async function init() {
      setError(null);
      const { data: gameRow, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .maybeSingle();
      if (cancelled) return;
      if (gameError || !gameRow) {
        setError('Spiel nicht gefunden.');
        return;
      }
      const g = gameRow as Game;
      setGame(g);

      if (g.stats_finalized_at) {
        await loadPlayersAndEvents();
        if (!cancelled) setLockState({ kind: 'readonly' });
        return;
      }

      await claim(false);
    }

    init().catch(() => setError('Sitzung konnte nicht gestartet werden.'));

    return () => {
      cancelled = true;
      stopHeartbeat();
      if (gameId) {
        supabase.rpc('release_stat_session', { p_game_id: gameId }).then(
          () => {},
          () => {}
        );
      }
    };
    // Bewusst nur an gameId gebunden — soll genau einmal pro aufgerufenem
    // Spiel laufen (Claim starten/Session laden), nicht bei jedem Re-Render.
  }, [gameId]);

  async function addStat(team: 'us' | 'opponent', statType: StatType, playerId: string | null) {
    if (!gameId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase
        .from('game_stat_events')
        .insert({
          game_id: gameId,
          team,
          player_id: playerId,
          quarter,
          stat_type: statType,
          created_by_name: myName
        })
        .select()
        .single();
      if (insertError) throw insertError;
      const row = data as GameStatEvent;
      insertedStack.current.push(row.id);
      setEvents((prev) => [...prev, row]);
      setPendingAction(null);
    } catch {
      setError('Aktion konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    const lastId = insertedStack.current.pop();
    if (!lastId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: delError } = await supabase.from('game_stat_events').delete().eq('id', lastId);
      if (delError) throw delError;
      setEvents((prev) => prev.filter((e) => e.id !== lastId));
    } catch {
      setError('Rückgängig machen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!gameId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: finalizeError } = await supabase.rpc('finalize_game_stats', { p_game_id: gameId });
      if (finalizeError) throw finalizeError;
      stopHeartbeat();
      navigate('/');
    } catch {
      setError('Spiel konnte nicht abgeschlossen werden.');
      setBusy(false);
    }
  }

  async function reopen() {
    if (!gameId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: reopenError } = await supabase.rpc('reopen_game_stats', { p_game_id: gameId });
      if (reopenError) throw reopenError;
      setGame((g) => (g ? { ...g, stats_finalized_at: null } : g));
      setLockState({ kind: 'loading' });
      await claim(false);
    } catch {
      setError('Konnte nicht wieder geöffnet werden.');
    } finally {
      setBusy(false);
    }
  }

  async function goBack() {
    stopHeartbeat();
    if (gameId) await supabase.rpc('release_stat_session', { p_game_id: gameId });
    navigate('/');
  }

  const playersById: Record<string, Player> = {};
  players.forEach((p) => (playersById[p.id] = p));
  // Nur den veröffentlichten Kader dieses Spiels zum Tracken anbieten — ist
  // (noch) keiner gesetzt, auf alle aktiven Spieler zurückfallen, damit das
  // Tracken nicht blockiert, nur weil der Kader vergessen wurde.
  const trackablePlayers =
    squadPlayerIds.length > 0 ? players.filter((p) => squadPlayerIds.includes(p.id)) : players;
  // Bei einem sehr kleinen Kader (z. B. beim Testen) ergibt eine
  // Auf-dem-Feld/Bank-Unterscheidung keinen Sinn — dann direkt alle
  // antippbar lassen.
  const useCourtSplit = trackablePlayers.length > COURT_SIZE;
  const onCourtPlayers = trackablePlayers.filter((p) => onCourtIds.includes(p.id));
  const benchPlayers = trackablePlayers.filter((p) => !onCourtIds.includes(p.id));
  const boxScore = computeBoxScore(events);
  const teamScore = computeTeamScore(events);
  const quarterScores = computeQuarterScores(events);
  const recentEvents = [...events].slice(-6).reverse();

  return (
    <div className="min-h-screen bg-tbw-bg pb-8">
      <div className="sticky top-0 z-10 bg-tbw-navyDark px-4 py-3 text-white">
        <div className="flex items-center justify-between">
          <button className="text-sm font-semibold text-white/70" onClick={goBack}>
            ← Zurück
          </button>
          <p className="text-sm font-bold">{game ? `vs. ${game.opponent}` : 'Spiel-Stats'}</p>
          <span className="w-12" />
        </div>
        {game && (
          <p className="mt-0.5 text-center text-xs text-white/50">
            {fmtDate(game.game_date)} · {fmtTime(game.game_time)} Uhr
          </p>
        )}
        <p className="mt-2 text-center text-3xl font-extrabold">
          {teamScore.us} : {teamScore.opponent}
        </p>
        {quarterScores.length > 0 && (
          <p className="mt-1 text-center text-xs text-white/50">
            {quarterScores.map((q) => `${quarterLabel(q.quarter)} ${q.us}:${q.opponent}`).join(' · ')}
          </p>
        )}
      </div>

      <div className="px-4 py-4">
        {error && (
          <div className="mb-3">
            <ErrorNote message={error} />
          </div>
        )}

        {lockState.kind === 'loading' && <LoadingSpinner />}

        {lockState.kind === 'blocked' && (
          <div className="card space-y-3 text-center">
            <p className="text-sm text-tbw-ink/70">
              Wird gerade von <span className="font-bold text-tbw-navyDark">{lockState.session.holder_name}</span>{' '}
              getrackt (seit{' '}
              {new Date(lockState.session.started_at).toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit'
              })}{' '}
              Uhr).
            </p>
            <button className="btn-primary w-full" disabled={busy} onClick={() => claim(true)}>
              Trotzdem übernehmen
            </button>
            <button className="btn-secondary w-full" onClick={goBack}>
              Zurück
            </button>
          </div>
        )}

        {lockState.kind === 'takenOver' && (
          <div className="card space-y-3 text-center">
            <p className="text-sm text-tbw-ink/70">
              Jemand anderes hat die Eingabe übernommen. Deine Aktionen werden ab jetzt nicht mehr gespeichert.
            </p>
            <button className="btn-secondary w-full" onClick={goBack}>
              Zurück
            </button>
          </div>
        )}

        {lockState.kind === 'readonly' && (
          <div className="card mb-3">
            <p className="text-sm font-bold text-tbw-navyDark">Stats abgeschlossen</p>
            <p className="mt-1 text-xs text-tbw-ink/50">Nur noch zur Ansicht.</p>
            {isAdmin && (
              <button className="btn-secondary mt-3 w-full" disabled={busy} onClick={reopen}>
                Wieder öffnen
              </button>
            )}
          </div>
        )}

        {lockState.kind === 'held' && (
          <>
            <div className="card space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/40">Viertel</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((q) => (
                  <button
                    key={q}
                    className={`flex-1 rounded-xl py-2 text-sm font-bold ${
                      quarter === q ? 'bg-tbw-navy text-white' : 'bg-tbw-bg text-tbw-ink/60'
                    }`}
                    onClick={() => setQuarter(q)}
                  >
                    Q{q}
                  </button>
                ))}
                <button
                  className={`rounded-xl px-3 py-2 text-sm font-bold ${
                    quarter > 4 ? 'bg-tbw-navy text-white' : 'bg-tbw-bg text-tbw-ink/60'
                  }`}
                  onClick={() => setQuarter((q) => (q > 4 ? q + 1 : 5))}
                >
                  {quarter > 4 ? quarterLabel(quarter) : 'OT'}
                </button>
              </div>
            </div>

            <div className="card mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/40">Gegner</p>
              <div className="mt-2 flex gap-2">
                <button className="btn-secondary flex-1" disabled={busy} onClick={() => addStat('opponent', 'fg2_made', null)}>
                  +2
                </button>
                <button className="btn-secondary flex-1" disabled={busy} onClick={() => addStat('opponent', 'fg3_made', null)}>
                  +3
                </button>
                <button className="btn-secondary flex-1" disabled={busy} onClick={() => addStat('opponent', 'ft_made', null)}>
                  +1
                </button>
              </div>
            </div>

            {trackablePlayers.length === 0 && (
              <div className="card mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/40">Spieler</p>
                <p className="mt-2 text-sm text-tbw-ink/40">Kein Kader für dieses Spiel hinterlegt.</p>
              </div>
            )}

            {trackablePlayers.length > 0 && useCourtSplit && onCourtIds.length < COURT_SIZE && (
              <div className="card mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/40">
                  Startaufstellung ({onCourtIds.length}/{COURT_SIZE})
                </p>
                <p className="mt-1 text-xs text-tbw-ink/50">Wer steht auf dem Feld?</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {trackablePlayers.map((p) => (
                    <PlayerTile
                      key={p.id}
                      player={p}
                      selected={onCourtIds.includes(p.id)}
                      disabled={!onCourtIds.includes(p.id) && onCourtIds.length >= COURT_SIZE}
                      onClick={() => toggleStarter(p.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {trackablePlayers.length > 0 && useCourtSplit && onCourtIds.length === COURT_SIZE && substituting && (
              <div className="card mt-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/40">
                    {outgoingId ? 'Wer kommt rein?' : 'Wer geht raus?'}
                  </p>
                  <button className="text-xs font-bold text-tbw-red" onClick={cancelSubstitution}>
                    Abbrechen
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(outgoingId ? benchPlayers : onCourtPlayers).map((p) => (
                    <PlayerTile
                      key={p.id}
                      player={p}
                      onClick={() => (outgoingId ? confirmSubstitution(p.id) : setOutgoingId(p.id))}
                    />
                  ))}
                </div>
              </div>
            )}

            {trackablePlayers.length > 0 &&
              (!useCourtSplit || onCourtIds.length === COURT_SIZE) &&
              !substituting &&
              pendingAction && (
                <div className="card mt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/40">
                      Wer? — {STAT_TYPE_LABELS[pendingAction]}
                    </p>
                    <button className="text-xs font-bold text-tbw-red" onClick={() => setPendingAction(null)}>
                      Abbrechen
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {(useCourtSplit ? onCourtPlayers : trackablePlayers).map((p) => (
                      <PlayerTile key={p.id} player={p} disabled={busy} onClick={() => addStat('us', pendingAction, p.id)} />
                    ))}
                  </div>
                </div>
              )}

            {trackablePlayers.length > 0 &&
              (!useCourtSplit || onCourtIds.length === COURT_SIZE) &&
              !substituting &&
              !pendingAction && (
                <>
                  <div className="card mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/40">Aktion</p>
                    <div className="mt-2 flex flex-col items-center gap-2">
                      {SCORING_BUTTONS.map(({ made, miss, label }) => (
                        <div key={made} className="flex gap-4">
                          <ActionCircle label={label} sublabel="Treffer" tone="make" onClick={() => setPendingAction(made)} />
                          <ActionCircle label={label} sublabel="Fehlwurf" tone="miss" onClick={() => setPendingAction(miss)} />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-3 justify-items-center gap-2">
                      {OTHER_STATS.map((statType) => (
                        <ActionCircle
                          key={statType}
                          size="sm"
                          label={OTHER_STAT_SHORT[statType] ?? STAT_TYPE_LABELS[statType]}
                          tone="neutral"
                          onClick={() => setPendingAction(statType)}
                        />
                      ))}
                    </div>
                  </div>

                  {useCourtSplit && (
                    <div className="card mt-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/40">Auf dem Feld</p>
                        <button className="text-xs font-bold text-tbw-navy" onClick={startSubstitution}>
                          🔄 Wechseln
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-5 gap-1">
                        {onCourtPlayers.map((p) => (
                          <div key={p.id} className="flex flex-col items-center gap-1">
                            <Avatar player={p} size="xs" />
                            <span className="text-center text-[9px] font-semibold leading-tight text-tbw-navyDark">
                              {shortPlayerName(p.name)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {benchPlayers.length > 0 && (
                        <>
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-tbw-ink/30">Bank</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {benchPlayers.map((p) => (
                              <span key={p.id} className="rounded-full bg-tbw-bg px-2.5 py-1 text-xs text-tbw-ink/40">
                                {shortPlayerName(p.name)}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

            <div className="card mt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/40">Zuletzt</p>
                <button
                  className="text-xs font-bold text-tbw-red disabled:opacity-30"
                  disabled={insertedStack.current.length === 0 || busy}
                  onClick={undo}
                >
                  Rückgängig
                </button>
              </div>
              {recentEvents.length === 0 ? (
                <p className="mt-1 text-xs text-tbw-ink/40">Noch keine Aktionen.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {recentEvents.map((e) => {
                    const evPlayer = e.player_id ? playersById[e.player_id] : undefined;
                    return (
                      <li key={e.id} className="flex items-center gap-2 text-xs text-tbw-ink/60">
                        {evPlayer && <Avatar player={evPlayer} size="xs" />}
                        <span>
                          {quarterLabel(e.quarter)} · {e.team === 'opponent' ? 'Gegner' : (evPlayer?.name ?? '?')} ·{' '}
                          {STAT_TYPE_LABELS[e.stat_type]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <button className="btn-primary mt-3 w-full" disabled={busy} onClick={finalize}>
              Spiel beenden
            </button>
          </>
        )}

        {boxScore.length > 0 && (
          <div className="card mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/40">Box-Score</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead>
                  <tr className="text-tbw-ink/40">
                    <th className="py-1 pr-2 font-semibold">Spieler</th>
                    <th className="px-1 py-1 text-right font-semibold">Pkt</th>
                    <th className="px-1 py-1 text-right font-semibold">2P</th>
                    <th className="px-1 py-1 text-right font-semibold">3P</th>
                    <th className="px-1 py-1 text-right font-semibold">FW</th>
                    <th className="px-1 py-1 text-right font-semibold">Reb</th>
                    <th className="px-1 py-1 text-right font-semibold">Ast</th>
                    <th className="px-1 py-1 text-right font-semibold">Stl</th>
                    <th className="px-1 py-1 text-right font-semibold">Blk</th>
                    <th className="px-1 py-1 text-right font-semibold">TO</th>
                    <th className="pl-1 py-1 text-right font-semibold">PF</th>
                  </tr>
                </thead>
                <tbody>
                  {boxScore.map((b) => (
                    <tr key={b.playerId} className="border-t border-black/5">
                      <td className="py-1.5 pr-2 font-semibold text-tbw-navyDark">
                        <div className="flex items-center gap-2">
                          {playersById[b.playerId] && <Avatar player={playersById[b.playerId]} size="xs" />}
                          {playersById[b.playerId]?.name ?? '?'}
                        </div>
                      </td>
                      <td className="px-1 py-1.5 text-right font-bold text-tbw-navyDark">{b.points}</td>
                      <td className="px-1 py-1.5 text-right text-tbw-ink/60">
                        {b.fg2m}/{b.fg2a}
                      </td>
                      <td className="px-1 py-1.5 text-right text-tbw-ink/60">
                        {b.fg3m}/{b.fg3a}
                      </td>
                      <td className="px-1 py-1.5 text-right text-tbw-ink/60">
                        {b.ftm}/{b.fta}
                      </td>
                      <td className="px-1 py-1.5 text-right text-tbw-ink/60">{b.rebounds}</td>
                      <td className="px-1 py-1.5 text-right text-tbw-ink/60">{b.assists}</td>
                      <td className="px-1 py-1.5 text-right text-tbw-ink/60">{b.steals}</td>
                      <td className="px-1 py-1.5 text-right text-tbw-ink/60">{b.blocks}</td>
                      <td className="px-1 py-1.5 text-right text-tbw-ink/60">{b.turnovers}</td>
                      <td className="py-1.5 pl-1 text-right text-tbw-ink/60">{b.fouls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
