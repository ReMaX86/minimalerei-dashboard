import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { useScrollResetOnChange } from '../hooks/useScrollResetOnChange';
import { useTipoffLoader } from '../hooks/useTipoffLoader';
import {
  computeBoxScore,
  computePlusMinus,
  computeQuarterScores,
  computeTeamScore,
  computeTeamTotals,
  countPlayerFouls,
  countTeamFouls,
  fgPct,
  fmtPlusMinus,
  quarterLabel,
  type PlayerBoxScore
} from '../lib/gameStats';
import { fmtDate, fmtTime, shortPlayerName } from '../lib/format';
import {
  STAT_TYPE_LABELS,
  type Game,
  type GameCourtState,
  type GameLineupLogRow,
  type GamePlayerNumber,
  type GameStatEvent,
  type GameStatSessionState,
  type Player,
  type StatType
} from '../types/database';

// Element 24 "Live-Tracking" — Vorlage: docs/design/tipoff-design/elements/
// 24-tracking/tracking.html. Eine Datei, zwei Layouts (Handy-Stapel, Querformat
// mit drei Spalten) — dieselben Unterkomponenten (Keypad/Bestätigung/
// Spielerauswahl/Verlauf/Box-Score) werden in beiden Layouts wiederverwendet.
// Welches Layout läuft, entscheidet ein JS-State (nicht mehr nur eine
// min-[900px]:-Media-Query): "auto" zählt ab 900px Breite ODER ab 700px in
// echter Querlage als Querformat (ein iPad hochkant bei 768–834px landet
// sonst fälschlich im kompakten Layout), plus ein Umschalter oben rechts
// (LayoutSwitcher) für "Kompakt"/"Querformat" fest, gemerkt pro Gerät in
// localStorage. Siehe computeAutoWide() weiter unten.

const COURT_SIZE = 5;
const HEARTBEAT_MS = 15_000;

// §1 (Update): reine Fensterbreite reicht nicht — ein iPad hochkant (768–834px)
// landet sonst in der kompakten Ansicht, obwohl der Schirm groß ist. "auto"
// zählt deshalb auch echte Querlage ab 700px als Querformat; zusätzlich kann
// die Wahl über den Umschalter (LayoutSwitcher) fest auf "compact"/"wide"
// gestellt werden — gemerkt pro Gerät in localStorage.
type LayoutMode = 'auto' | 'compact' | 'wide';
const LAYOUT_STORAGE_KEY = 'tipoff-tracking-layout';

function computeAutoWide(): boolean {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w >= 900) return true;
  if (w >= 700 && w > h) return true;
  return false;
}

const SHOT_BUTTONS: { made: StatType; miss: StatType; label: string; sub: string }[] = [
  { made: 'fg2_made', miss: 'fg2_miss', label: '2er', sub: '2 PUNKTE' },
  { made: 'fg3_made', miss: 'fg3_miss', label: '3er', sub: '3 PUNKTE' },
  { made: 'ft_made', miss: 'ft_miss', label: 'FW', sub: '1 PUNKT' }
];

// Für den Gegner wird laut Schema (Migration 0028) nur der Punktestand
// getrackt — kein Fehlwurf, kein Box-Score. Nur diese drei Aktionen tauchen
// deshalb in der eigenen "GEGNER TRIFFT"-Zeile auf (§6), keine
// Spielerauswahl nötig.
const OPPONENT_BUTTONS: { statType: StatType; label: string; pts: number }[] = [
  { statType: 'ft_made', label: '+1', pts: 1 },
  { statType: 'fg2_made', label: '+2', pts: 2 },
  { statType: 'fg3_made', label: '+3', pts: 3 }
];

type LockState =
  | { kind: 'loading' }
  | { kind: 'readonly' }
  | { kind: 'blocked'; session: GameStatSessionState }
  | { kind: 'takenOver' }
  | { kind: 'held' };

type Sheet = 'quarter' | 'finish' | null;

interface LogEntry {
  id: string;
  quarter: number;
  num: string;
  text: string;
  pts: number;
  opp?: boolean;
  sub?: boolean;
}

function foulTone(fouls: number): 'warn' | 'danger' | null {
  if (fouls >= 5) return 'danger';
  if (fouls >= 4) return 'warn';
  return null;
}

// ---------- Icons (self-contained, wie in den übrigen Admin-Screens) ----------
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
function XMarkIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
function SwapIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13" />
    </svg>
  );
}
function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#7C8594" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8.6" r="3.7" />
      <path d="M4.8 20.2a7.6 7.6 0 0 1 14.4 0" />
    </svg>
  );
}
function BackChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

// ---------- Kleine, in beiden Layouts wiederverwendete Bausteine ----------

function Photo({ player, size }: { player: Player; size: number }) {
  const initials = player.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-to-border bg-to-surface2"
      style={{ width: size, height: size }}
    >
      {player.photo_url ? (
        <img src={player.photo_url} alt="" className="h-full w-full object-cover" />
      ) : player.photo_url === null ? (
        <PersonIcon />
      ) : null}
      {!player.photo_url && <span className="text-xs font-semibold text-to-text3">{initials}</span>}
    </span>
  );
}

function ShotButton({
  label,
  sub,
  make,
  height,
  onClick
}: {
  label: string;
  sub: string;
  make: boolean;
  height: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ height }}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-to-lg border font-semibold ${
        make
          ? 'border-to-borderMatchday bg-to-accentSoft text-to-accent'
          : 'border-to-dangerFrame bg-to-dangerSoft text-to-dangerText'
      }`}
    >
      <span className="flex items-center gap-1.5 text-[19px] font-bold">
        {label}
        {make ? <CheckIcon /> : <XMarkIcon />}
      </span>
      <span className="to-data text-[8px] tracking-[0.08em] opacity-70">{sub}</span>
    </button>
  );
}

function PadButton({
  label,
  sub,
  danger,
  volt,
  height,
  onClick
}: {
  label: string;
  sub?: string;
  danger?: boolean;
  volt?: boolean;
  height: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ height }}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-to-lg border text-[15px] font-semibold ${
        danger
          ? 'border-to-dangerFrame bg-to-dangerSoft text-to-dangerText'
          : volt
            ? 'flex-row gap-2 border-to-borderMatchday bg-to-accentWash text-to-accent'
            : 'border-to-line bg-to-surface2 text-to-text'
      }`}
    >
      {volt && <SwapIcon />}
      {label}
      {sub && <span className="to-data text-[8px] tracking-[0.08em] text-to-textDisabled">{sub}</span>}
    </button>
  );
}

function PlayerTile({
  player,
  number,
  fouls,
  size,
  photoSize,
  selected,
  onClick
}: {
  player: Player;
  number?: number;
  fouls: number;
  size: number;
  photoSize: number;
  selected: boolean;
  onClick: () => void;
}) {
  const tone = foulTone(fouls);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ height: size }}
      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-to-lg border px-2.5 text-left ${
        selected
          ? 'border-to-accent bg-to-accentWash'
          : tone === 'danger'
            ? 'border-to-dangerFrame bg-to-surface2'
            : 'border-to-line bg-to-surface2'
      }`}
    >
      <Photo player={player} size={photoSize} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={`to-number text-[26px] leading-none ${tone === 'danger' ? 'text-to-dangerText' : 'text-to-text'}`}>
          {number ?? '–'}
        </span>
        <span className="truncate text-xs font-semibold text-to-text">{shortPlayerName(player.name)}</span>
        <span
          className={`to-data text-[8px] tracking-[0.06em] ${
            tone === 'danger' ? 'text-to-dangerText' : tone === 'warn' ? 'text-to-vacation' : 'text-to-textDisabled'
          }`}
        >
          {fouls} {fouls === 1 ? 'FOUL' : 'FOULS'}
        </span>
      </span>
    </button>
  );
}

function CancelTile({ size, onClick }: { size: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ height: size }}
      className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-to-lg border border-dashed border-to-dangerFrame text-[13px] font-semibold text-to-dangerText"
    >
      <XMarkIcon size={22} />
      Abbrechen
    </button>
  );
}

function CourtChip({ player, number, fouls }: { player: Player; number?: number; fouls: number }) {
  const tone = foulTone(fouls);
  return (
    <span className="flex flex-1 flex-col items-center gap-1 rounded-to-md border border-to-border bg-to-surface2 py-2">
      <span
        className={`flex h-[34px] w-[34px] items-center justify-center rounded-to-sm ${
          tone === 'danger' ? 'bg-to-dangerSoft text-to-dangerText' : 'bg-to-surface text-to-text'
        }`}
      >
        <span className="to-number text-base leading-none">{number ?? '–'}</span>
      </span>
      <span className="truncate text-[10px] text-to-text2">{player.name.split(' ')[0]}</span>
      <span
        className={`to-data text-[8px] ${
          tone === 'danger' ? 'text-to-dangerText' : tone === 'warn' ? 'text-to-vacation' : 'text-to-textDisabled'
        }`}
      >
        {fouls} F
      </span>
    </span>
  );
}

export function GameStatsTracker() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { isAdmin, trainer, player, viewer } = useAuth();
  const myName = trainer?.name ?? player?.name ?? viewer?.name ?? 'Unbekannt';

  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [squadPlayerIds, setSquadPlayerIds] = useState<string[]>([]);
  const [onCourtIds, setOnCourtIds] = useState<string[]>([]);
  const [events, setEvents] = useState<GameStatEvent[]>([]);
  const [lineupLog, setLineupLog] = useState<GameLineupLogRow[]>([]);
  const [numbers, setNumbers] = useState<Record<string, number>>({});
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});
  const [manualNumbersEdit, setManualNumbersEdit] = useState(false);
  const [numbersDismissed, setNumbersDismissed] = useState(false);
  const [lockState, setLockState] = useState<LockState>({ kind: 'loading' });
  const showLockLoader = useTipoffLoader(lockState.kind === 'loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ?layout=wide|compact erzwingt zum Testen einen Modus, ohne ihn dauerhaft
  // zu merken (siehe Persistenz-Effekt unten, skipInitialPersist).
  const [layoutFromQuery] = useState<LayoutMode | null>(() => {
    const forced = new URLSearchParams(window.location.search).get('layout');
    return forced === 'wide' || forced === 'compact' ? forced : null;
  });
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    if (layoutFromQuery) return layoutFromQuery;
    try {
      const saved = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved === 'auto' || saved === 'compact' || saved === 'wide') return saved;
    } catch {
      // localStorage kann blockiert sein (privates Fenster) — dann eben nicht merken.
    }
    return 'auto';
  });
  const [wide, setWide] = useState<boolean>(() => (layoutMode === 'auto' ? computeAutoWide() : layoutMode === 'wide'));
  const skipInitialPersist = useRef(layoutFromQuery !== null);

  useEffect(() => {
    function recompute() {
      const next = layoutMode === 'auto' ? computeAutoWide() : layoutMode === 'wide';
      setWide((prev) => (prev === next ? prev : next));
    }
    recompute();
    // Drehen muss sofort greifen: iOS meldet die neuen Maße nach
    // orientationchange verzögert, darum zweimal nachfassen (~120ms/~400ms)
    // statt uns auf ein einzelnes resize zu verlassen. Die Timer-IDs merken
    // wir uns, damit ein Moduswechsel (layoutMode ändert sich, dieser Effekt
    // läuft neu) noch ausstehende Timer aus der alten Closure abräumt — sonst
    // könnte ein Timer mit dem alten layoutMode kurz nach einem manuellen
    // Umschalten den gerade gesetzten Wert wieder überschreiben.
    const pendingTimers: number[] = [];
    function onRotate() {
      recompute();
      pendingTimers.push(window.setTimeout(recompute, 120));
      pendingTimers.push(window.setTimeout(recompute, 400));
    }
    window.addEventListener('resize', onRotate);
    window.addEventListener('orientationchange', onRotate);
    const mq = window.matchMedia?.('(orientation: landscape)');
    mq?.addEventListener?.('change', onRotate);
    window.visualViewport?.addEventListener('resize', onRotate);
    return () => {
      pendingTimers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener('resize', onRotate);
      window.removeEventListener('orientationchange', onRotate);
      mq?.removeEventListener?.('change', onRotate);
      window.visualViewport?.removeEventListener('resize', onRotate);
    };
  }, [layoutMode]);

  useEffect(() => {
    if (skipInitialPersist.current) {
      skipInitialPersist.current = false;
      return;
    }
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, layoutMode);
    } catch {
      // localStorage kann blockiert sein (privates Fenster) — dann eben nicht merken.
    }
  }, [layoutMode]);

  // Erst Aktion, dann Spieler — oder umgekehrt (Querformat, §2): sobald
  // beide gesetzt sind, wird sofort gebucht. Bleibt pendingPlayer nach einem
  // Freiwurf stehen (Rückfrage 6, "kurz ausgewählt bleiben"), reicht beim
  // nächsten Freiwurf derselben Serie ein Tipp auf FW.
  const [pendingAction, setPendingAction] = useState<StatType | null>(null);
  const [pendingPlayer, setPendingPlayer] = useState<string | null>(null);
  const [subMode, setSubMode] = useState<'out' | 'in' | null>(null);
  const [outgoingId, setOutgoingId] = useState<string | null>(null);
  const [showBox, setShowBox] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [foulOutPlayerId, setFoulOutPlayerId] = useState<string | null>(null);

  const quarter = game?.current_quarter ?? 1;
  const insertedStack = useRef<string[]>([]);
  const heartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPlayersAndEvents = useCallback(async () => {
    if (!gameId) return;
    const [playersRes, eventsRes, squadRes, courtRes, numbersRes, lineupLogRes] = await Promise.all([
      supabase.from('players').select('*').eq('is_active', true).order('name'),
      supabase.from('game_stat_events').select('*').eq('game_id', gameId).order('created_at'),
      supabase.from('game_squad').select('player_id').eq('game_id', gameId).eq('is_selected', true),
      supabase.from('game_court_state').select('*').eq('game_id', gameId).maybeSingle(),
      supabase.from('game_player_numbers').select('player_id, number').eq('game_id', gameId),
      supabase.from('game_lineup_log').select('*').eq('game_id', gameId).order('created_at')
    ]);
    setPlayers((playersRes.data as Player[]) ?? []);
    setEvents((eventsRes.data as GameStatEvent[]) ?? []);
    setSquadPlayerIds(((squadRes.data as { player_id: string }[]) ?? []).map((r) => r.player_id));
    setOnCourtIds((courtRes.data as GameCourtState | null)?.on_court_player_ids ?? []);
    setLineupLog((lineupLogRes.data as GameLineupLogRow[]) ?? []);
    setNumbers(
      Object.fromEntries(
        ((numbersRes.data as Pick<GamePlayerNumber, 'player_id' | 'number'>[]) ?? []).map((r) => [r.player_id, r.number])
      )
    );
  }, [gameId]);

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
      supabase
        .from('game_lineup_log')
        .insert({ game_id: gameId, on_court_player_ids: next })
        .select()
        .single()
        .then(({ data, error: logError }) => {
          if (logError) {
            setError('Aufstellungswechsel konnte nicht protokolliert werden.');
          } else if (data) {
            setLineupLog((prev) => [...prev, data as GameLineupLogRow]);
          }
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
    setPendingAction(null);
    setPendingPlayer(null);
    setSubMode('out');
    setOutgoingId(null);
  }
  function cancelSubstitution() {
    setSubMode(null);
    setOutgoingId(null);
  }
  function pickOutgoing(id: string) {
    setOutgoingId(id);
    setSubMode('in');
  }
  function confirmSubstitution(incomingId: string) {
    if (!outgoingId) return;
    const outP = playersById[outgoingId];
    const inP = playersById[incomingId];
    persistOnCourt(onCourtIds.map((id) => (id === outgoingId ? incomingId : id)));
    if (outP && inP) {
      pushLog({ quarter, num: inP ? String(numbers[inP.id] ?? '') : '', text: `${inP.name} kommt für ${outP.name}`, pts: 0, sub: true });
    }
    setSubMode(null);
    setOutgoingId(null);
    setPendingPlayer(null);
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
      const { data: gameRow, error: gameError } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle();
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

  function pushLog(_entry: Omit<LogEntry, 'id'>) {
    // Verlauf/Bestätigung werden direkt aus events/lineupLog abgeleitet
    // (siehe recentLog unten) — Substitutionen tragen sich über lineupLog
    // schon selbst ein, ein zusätzlicher lokaler Log-Eintrag ist dafür nicht
    // nötig. Funktion bleibt als Hook für spätere reine UI-Events bestehen.
  }

  async function addStat(team: 'us' | 'opponent', statType: StatType, playerId: string | null) {
    if (!gameId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase
        .from('game_stat_events')
        .insert({ game_id: gameId, team, player_id: playerId, quarter, stat_type: statType, created_by_name: myName })
        .select()
        .single();
      if (insertError) throw insertError;
      const row = data as GameStatEvent;
      insertedStack.current.push(row.id);
      setEvents((prev) => [...prev, row]);
      setPendingAction(null);
      // Freiwurf-Serie (Rückfrage 6): denselben Spieler nach einem Freiwurf
      // ausgewählt lassen, jede andere Aktion hebt die Auswahl wieder auf.
      if (statType === 'ft_made' || statType === 'ft_miss') {
        setPendingPlayer(playerId);
      } else {
        setPendingPlayer(null);
      }
      if (statType === 'foul' && playerId && countPlayerFouls([...events, row], playerId) >= 5) {
        setFoulOutPlayerId(playerId);
      }
    } catch {
      setError('Aktion konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  }

  function handleAction(statType: StatType) {
    if (pendingPlayer) {
      const isOpponentOnly = false;
      void isOpponentOnly;
      addStat('us', statType, pendingPlayer);
      return;
    }
    setPendingAction(statType);
  }

  function handlePlayerTap(playerId: string) {
    if (pendingAction) {
      addStat('us', pendingAction, playerId);
      return;
    }
    setPendingPlayer((prev) => (prev === playerId ? null : playerId));
  }

  function cancelPicker() {
    setPendingAction(null);
    setPendingPlayer(null);
  }

  // "Zurück" (Rückfrage 3): beliebig viele Schritte, solange das Viertel
  // läuft — nimmt immer den zuletzt gespeicherten Eintrag DES AKTUELLEN
  // VIERTELS aus der Datenbank zurück statt nur aus einem lokalen Array,
  // damit der Knopf auch nach einem Neuladen oder einer Übernahme des
  // Trackings weiter funktioniert.
  const quarterEvents = events.filter((e) => e.quarter === quarter);
  const lastQuarterEvent = quarterEvents[quarterEvents.length - 1] ?? null;

  async function undo() {
    if (!lastQuarterEvent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: delError } = await supabase.from('game_stat_events').delete().eq('id', lastQuarterEvent.id);
      if (delError) throw delError;
      setEvents((prev) => prev.filter((e) => e.id !== lastQuarterEvent.id));
      insertedStack.current = insertedStack.current.filter((id) => id !== lastQuarterEvent.id);
      setPendingPlayer(null);
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

  // Viertel beenden (§8, NEU): manuell über das Blatt, nie automatisch.
  // "Push senden" ruft dieselbe bestehende announce_quarter_score()-RPC auf
  // (Migration 0042/0053, broadcastet an ALLE mit aktivem Push — siehe
  // api/notify.ts "quarter-score", unverändert übernommen) — bisher lief
  // das automatisch bei jedem Viertelwechsel, jetzt nur noch auf Wunsch.
  // current_quarter wird dabei serverseitig mit fortgeschrieben (Migration
  // 0074), damit ein Reload/eine Übernahme nicht auf Q1 zurückspringt.
  async function endQuarter(withPush: boolean) {
    if (!gameId || busy || !game) return;
    setBusy(true);
    setError(null);
    try {
      if (withPush) {
        await supabase.rpc('announce_quarter_score', { p_game_id: gameId, p_quarter: quarter });
      }
      const nextQuarter = Math.min(9, quarter + 1);
      const { error: quarterError } = await supabase.rpc('set_game_quarter', { p_game_id: gameId, p_quarter: nextQuarter });
      if (quarterError) throw quarterError;
      setGame((g) => (g ? { ...g, current_quarter: nextQuarter } : g));
      setSheet(null);
    } catch {
      setError('Viertel konnte nicht beendet werden.');
    } finally {
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
  const trackablePlayers = squadPlayerIds.length > 0 ? players.filter((p) => squadPlayerIds.includes(p.id)) : players;
  const useCourtSplit = trackablePlayers.length > COURT_SIZE;
  const onCourtPlayers = trackablePlayers.filter((p) => onCourtIds.includes(p.id));
  const benchPlayers = trackablePlayers.filter((p) => !onCourtIds.includes(p.id));
  const pickablePlayers = useCourtSplit ? onCourtPlayers : trackablePlayers;

  const showNumbersCard =
    (trackablePlayers.length > 0 && onCourtIds.length === 0 && Object.keys(numbers).length === 0 && !numbersDismissed) ||
    manualNumbersEdit;

  function openNumbersEditor() {
    setNumberDrafts(Object.fromEntries(trackablePlayers.map((p) => [p.id, numbers[p.id] !== undefined ? String(numbers[p.id]) : ''])));
    setManualNumbersEdit(true);
  }
  function closeNumbersEditor() {
    setManualNumbersEdit(false);
  }
  function skipNumbers() {
    setNumbersDismissed(true);
  }

  async function saveNumbers() {
    if (!gameId || busy) return;
    for (const [playerId, raw] of Object.entries(numberDrafts)) {
      if (raw.trim() === '') continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 99) {
        setError(`Ungültige Nummer bei ${playersById[playerId]?.name ?? 'einem Spieler'} — bitte 0-99.`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const { error: delError } = await supabase
        .from('game_player_numbers')
        .delete()
        .eq('game_id', gameId)
        .in('player_id', trackablePlayers.map((p) => p.id));
      if (delError) throw delError;
      const toInsert = Object.entries(numberDrafts)
        .filter(([, v]) => v.trim() !== '')
        .map(([playerId, v]) => ({ game_id: gameId, player_id: playerId, number: Number(v) }));
      if (toInsert.length > 0) {
        const { error: insertError } = await supabase.from('game_player_numbers').insert(toInsert);
        if (insertError) throw insertError;
      }
      setNumbers(Object.fromEntries(toInsert.map((r) => [r.player_id, r.number])));
      setManualNumbersEdit(false);
      setNumbersDismissed(true);
    } catch {
      setError('Trikotnummern konnten nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  }

  const boxScore = computeBoxScore(events);
  const teamTotals = computeTeamTotals(boxScore);
  // fallbackOnCourtIds greift nur, solange zu einem Event noch kein
  // Log-Eintrag existiert — siehe computePlusMinus()-Kommentar in gameStats.ts.
  const plusMinusByPlayer = computePlusMinus(
    events,
    lineupLog,
    trackablePlayers.map((p) => p.id)
  );
  const teamScore =
    lockState.kind === 'readonly' && events.length === 0 && game?.final_score_us !== null && game?.final_score_us !== undefined
      ? { us: game.final_score_us, opponent: game.final_score_opponent ?? 0 }
      : computeTeamScore(events);
  const quarterScores = computeQuarterScores(events);
  const teamFouls = countTeamFouls(events, quarter);

  // Verlauf (Element 24 §7) — Stats-Events und Wechsel gemeinsam,
  // zeitlich sortiert, neueste zuerst.
  const statLogEntries: (LogEntry & { created_at: string })[] = events.map((e) => ({
    id: e.id,
    quarter: e.quarter,
    num: e.team === 'opponent' ? '' : e.player_id ? String(numbers[e.player_id] ?? '') : '',
    text:
      e.team === 'opponent'
        ? `Gegner · ${STAT_TYPE_LABELS[e.stat_type]}`
        : `${playersById[e.player_id ?? '']?.name ?? '?'} · ${STAT_TYPE_LABELS[e.stat_type]}${
            e.stat_type === 'foul' && e.player_id ? ` (${countPlayerFouls(events.filter((x) => x.created_at <= e.created_at), e.player_id)}.)` : ''
          }`,
    pts: e.stat_type === 'fg2_made' ? 2 : e.stat_type === 'fg3_made' ? 3 : e.stat_type === 'ft_made' ? 1 : 0,
    opp: e.team === 'opponent',
    created_at: e.created_at
  }));

  const subLogEntries: (LogEntry & { created_at: string })[] = [];
  for (let i = 1; i < lineupLog.length; i++) {
    const prev = lineupLog[i - 1];
    const l = lineupLog[i];
    const inId = l.on_court_player_ids.find((id) => !prev.on_court_player_ids.includes(id));
    const outId = prev.on_court_player_ids.find((id) => !l.on_court_player_ids.includes(id));
    const inP = inId ? playersById[inId] : undefined;
    const outP = outId ? playersById[outId] : undefined;
    if (inP && outP) {
      subLogEntries.push({
        id: l.id,
        quarter: 0,
        num: String(numbers[inP.id] ?? ''),
        text: `${inP.name} kommt für ${outP.name}`,
        pts: 0,
        sub: true,
        created_at: l.created_at
      });
    }
  }

  const logEntries = [...statLogEntries, ...subLogEntries].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const lastLogEntry = logEntries[0] ?? null;

  const screenKey =
    trackablePlayers.length === 0
      ? 'empty'
      : showNumbersCard
        ? 'numbers'
        : useCourtSplit && onCourtIds.length < COURT_SIZE
          ? 'lineup'
          : subMode
            ? `sub-${subMode}`
            : pendingAction && !pendingPlayer
              ? `picker-${pendingAction}`
              : showBox
                ? 'box'
                : 'idle';
  useScrollResetOnChange(screenKey);

  if (error && !game) return <ErrorNote message={error} />;

  // ============ Ansicht-Umschalter ============
  const LAYOUT_OPTIONS: { value: LayoutMode; label: string }[] = [
    { value: 'auto', label: 'Automatisch' },
    { value: 'compact', label: 'Kompakt' },
    { value: 'wide', label: 'Querformat' }
  ];

  function LayoutSwitcher() {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="to-data text-[8px] tracking-[0.12em] text-to-textDisabled">ANSICHT</span>
        <span className="flex gap-[3px] rounded-to-pill border border-to-divider bg-to-surface2 p-[3px]">
          {LAYOUT_OPTIONS.map((opt) => {
            const active = layoutMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setLayoutMode(opt.value);
                  setPendingAction(null);
                  setPendingPlayer(null);
                }}
                className={`h-[26px] rounded-to-pill px-[11px] text-[11px] font-semibold ${
                  active ? 'bg-to-accent text-to-onAccent' : 'text-to-text3'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </span>
      </div>
    );
  }

  // ============ Kopf ============
  // "wide" statt einer reinen min-[900px]:-Media-Query, weil der Umschalter
  // (LayoutSwitcher) das Layout auch unabhängig von der Fensterbreite fest
  // auf "compact"/"wide" stellen kann (§1).
  function Header({ withEndButton, wide: headerWide }: { withEndButton: boolean; wide: boolean }) {
    return (
      <div
        className={`flex flex-col gap-2.5 rounded-to-xl border border-to-border bg-to-surface p-3.5 ${
          headerWide ? 'flex-row items-center gap-4' : ''
        }`}
      >
        <div className="flex flex-1 flex-col gap-2.5">
          <div className="flex items-end justify-center gap-2.5">
            <span className="flex flex-col items-end gap-0.5">
              <span className="to-data text-[9px] tracking-[0.1em] text-to-accent">TBW</span>
              <span className={`to-number leading-none text-to-text ${headerWide ? 'text-[44px]' : 'text-[64px]'}`}>{teamScore.us}</span>
            </span>
            <span className={`to-number text-to-textDisabled ${headerWide ? 'pb-1 text-xl' : 'pb-2 text-2xl'}`}>:</span>
            <span className="flex flex-col gap-0.5">
              <span className="to-data text-[9px] tracking-[0.1em] text-to-text3">{game?.opponent?.slice(0, 3).toUpperCase() ?? 'GEG'}</span>
              <span className={`to-number leading-none text-to-text2 ${headerWide ? 'text-[44px]' : 'text-[64px]'}`}>{teamScore.opponent}</span>
            </span>
          </div>
          {/* Nur noch Anzeige, nicht mehr antippbar — Viertel wechseln geht
              ausschließlich über den "Viertel beenden"-Knopf/das Blatt unten,
              damit es nur einen einzigen Weg dafür gibt (auf Nutzerwunsch:
              zwei verschiedene Bestätigungsdialoge für dieselbe Aktion waren
              verwirrend). */}
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((q) => {
              const qs = quarterScores.find((x) => x.quarter === q);
              const done = q < quarter;
              const live = q === quarter;
              return (
                <span
                  key={q}
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded-to-md border py-2 ${
                    live
                      ? 'flex-[1.4] border-to-accent bg-to-accent'
                      : done
                        ? 'border-to-border bg-to-surface2'
                        : 'border-to-divider bg-transparent'
                  }`}
                >
                  <span className={`to-data text-[11px] font-bold ${live ? 'text-to-onAccent' : done ? 'text-to-text2' : 'text-to-textDisabled'}`}>
                    Q{q}
                  </span>
                  <span className={`to-data text-[8px] ${live ? 'text-to-onAccent' : 'text-to-textDisabled'}`}>
                    {live ? 'LÄUFT' : qs ? `${qs.us}:${qs.opponent}` : '–'}
                  </span>
                </span>
              );
            })}
            <span
              className={`flex flex-col items-center gap-0.5 rounded-to-md border px-3 py-2 ${
                quarter > 4 ? 'border-to-accent bg-to-accent' : 'border-to-divider bg-transparent'
              }`}
            >
              <span className={`to-data text-[11px] font-bold ${quarter > 4 ? 'text-to-onAccent' : 'text-to-textDisabled'}`}>
                {quarter > 4 ? quarterLabel(quarter) : 'OT'}
              </span>
              <span className={`to-data text-[8px] ${quarter > 4 ? 'text-to-onAccent' : 'text-to-textDisabled'}`}>{quarter > 4 ? 'LÄUFT' : '–'}</span>
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="to-data text-[9px] tracking-[0.12em] text-to-text3">TEAMFOULS Q{quarter}</span>
            <span className="flex gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={`h-2 w-2 rounded-full ${i < teamFouls ? 'bg-to-vacation' : 'bg-to-border'}`} />
              ))}
            </span>
            <span className="to-data ml-auto text-[9px] text-to-vacation">{teamFouls >= 5 ? 'IM BONUS' : `${5 - teamFouls} BIS BONUS`}</span>
          </div>
        </div>
        {withEndButton && headerWide && (
          <button
            type="button"
            onClick={() => setSheet('quarter')}
            className="h-11 shrink-0 rounded-to-pill border border-to-line px-5 text-sm font-semibold text-to-text2"
          >
            Viertel beenden
          </button>
        )}
      </div>
    );
  }

  // ============ Tastenfeld ============
  function Keypad({ shotHeight, actionHeight }: { shotHeight: number; actionHeight: number }) {
    return (
      <div className="flex flex-col gap-2">
        <span className="to-data pl-0.5 text-[9px] tracking-[0.1em] text-to-text3">
          {game?.opponent ? `TB WÜLFRATH · WAS IST PASSIERT?` : 'WAS IST PASSIERT?'}
        </span>
        {SHOT_BUTTONS.map(({ made, miss, label, sub }) => (
          <div key={made} className="flex gap-2.5">
            <ShotButton label={label} sub={sub} make height={shotHeight} onClick={() => handleAction(made)} />
            <ShotButton label={label} sub="DANEBEN" make={false} height={shotHeight} onClick={() => handleAction(miss)} />
          </div>
        ))}
        <div className="flex gap-2.5">
          <PadButton label="Reb DEF" sub="DEFENSIV" height={actionHeight} onClick={() => handleAction('rebound_def')} />
          <PadButton label="Reb OFF" sub="OFFENSIV" height={actionHeight} onClick={() => handleAction('rebound_off')} />
        </div>
        <div className="flex gap-2.5">
          <PadButton label="Assist" height={actionHeight} onClick={() => handleAction('assist')} />
          <PadButton label="Steal" height={actionHeight} onClick={() => handleAction('steal')} />
        </div>
        <div className="flex gap-2.5">
          <PadButton label="Block" height={actionHeight} onClick={() => handleAction('block')} />
          <PadButton label="Turnover" height={actionHeight} onClick={() => handleAction('turnover')} />
        </div>
        <div className="flex gap-2.5">
          <PadButton label="Foul" danger height={actionHeight} onClick={() => handleAction('foul')} />
          <PadButton label="Wechseln" volt height={actionHeight} onClick={startSubstitution} />
        </div>
        <div className="flex items-center gap-2.5 rounded-to-lg border border-to-dangerFrame bg-to-dangerSoft px-3.5" style={{ height: actionHeight }}>
          <span className="to-data flex-1 text-[9px] tracking-[0.1em] text-to-dangerText">GEGNER TRIFFT</span>
          {OPPONENT_BUTTONS.map((o) => (
            <button
              key={o.statType}
              type="button"
              disabled={busy}
              onClick={() => addStat('opponent', o.statType, null)}
              className="h-[42px] w-[58px] rounded-to-md border border-to-dangerFrame bg-to-dangerSoft text-[16px] font-bold text-to-dangerText"
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ============ Bestätigung ============
  function ConfirmBar() {
    return (
      <div className="flex items-center gap-2.5 rounded-to-lg border border-to-border bg-to-surface2 py-2.5 pl-3.5 pr-2.5">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="to-data text-[8px] tracking-[0.12em] text-to-textDisabled">ZULETZT GETIPPT</span>
          <span className="flex min-w-0 items-center gap-2">
            {lastLogEntry?.num && (
              <span className="to-data flex h-[22px] min-w-[26px] shrink-0 items-center justify-center rounded-to-sm bg-to-surface2 px-1.5 text-[11px] text-to-text2">
                {lastLogEntry.num}
              </span>
            )}
            <span className="truncate text-sm font-semibold text-to-text">{lastLogEntry ? lastLogEntry.text : 'Noch nichts getippt'}</span>
            {!!lastLogEntry?.pts && (
              <span className={`to-data shrink-0 text-xs font-bold ${lastLogEntry.opp ? 'text-to-dangerText' : 'text-to-accent'}`}>
                +{lastLogEntry.pts}
              </span>
            )}
          </span>
        </span>
        <button
          type="button"
          disabled={!lastQuarterEvent || busy}
          onClick={undo}
          className="flex h-[46px] shrink-0 items-center gap-1.5 rounded-to-md border border-to-dangerFrame bg-to-dangerSoft px-4 text-sm font-semibold text-to-dangerText disabled:opacity-40"
        >
          <UndoIcon />
          Zurück
        </button>
      </div>
    );
  }

  // ============ Spielerauswahl ============
  function RosterGrid({
    label,
    list,
    tileSize,
    photoSize,
    showCancel,
    onCancel,
    onPick,
    selectedId
  }: {
    label: string;
    list: Player[];
    tileSize: number;
    photoSize: number;
    showCancel: boolean;
    onCancel: () => void;
    onPick: (id: string) => void;
    selectedId: string | null;
  }) {
    const rows: Player[][] = [];
    for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2));
    return (
      <div className="flex flex-col gap-2.5 rounded-to-xl border border-to-borderMatchday bg-to-surface p-3.5">
        {label && <span className="to-data pl-1 text-[9px] tracking-[0.12em] text-to-accent">{label}</span>}
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2.5">
            {row.map((p) => (
              <PlayerTile
                key={p.id}
                player={p}
                number={numbers[p.id]}
                fouls={countPlayerFouls(events, p.id)}
                size={tileSize}
                photoSize={photoSize}
                selected={selectedId === p.id}
                onClick={() => onPick(p.id)}
              />
            ))}
            {row.length === 1 && showCancel && <CancelTile size={tileSize} onClick={onCancel} />}
            {row.length === 1 && !showCancel && <span className="flex-1" />}
          </div>
        ))}
        {list.length % 2 === 0 && showCancel && (
          <div className="flex gap-2.5">
            <CancelTile size={tileSize} onClick={onCancel} />
            <span className="flex-1" />
          </div>
        )}
      </div>
    );
  }

  // ============ Auf dem Feld (Handy) ============
  function CourtRow() {
    return (
      <div className="flex flex-col gap-2.5 rounded-to-xl border border-to-border bg-to-surface p-3">
        <span className="to-data pl-0.5 text-[9px] tracking-[0.1em] text-to-text3">AUF DEM FELD</span>
        <div className="flex gap-1.5">
          {onCourtPlayers.map((p) => (
            <CourtChip key={p.id} player={p} number={numbers[p.id]} fouls={countPlayerFouls(events, p.id)} />
          ))}
        </div>
      </div>
    );
  }

  // ============ Verlauf ============
  function HistoryPanel({ limit }: { limit: number }) {
    const rows = logEntries.slice(0, limit);
    return (
      <div className="overflow-hidden rounded-to-xl border border-to-border bg-to-surface">
        <span className="to-data block px-3.5 pb-2 pt-2.5 text-[9px] tracking-[0.1em] text-to-text3">VERLAUF</span>
        {rows.length === 0 ? (
          <p className="border-t border-to-surface2 px-3.5 py-2.5 text-[13px] text-to-text2">Noch keine Aktionen.</p>
        ) : (
          rows.map((l) => (
            <div key={l.id} className="flex items-center gap-2.5 border-t border-to-surface2 px-3.5 py-2.5">
              <span className="to-data w-6 shrink-0 text-[9px] text-to-textDisabled">{l.quarter > 0 ? `Q${l.quarter}` : ''}</span>
              <span className="to-data flex h-5 min-w-6 shrink-0 items-center justify-center rounded-to-sm bg-to-surface2 px-1.5 text-[10px] text-to-text3">
                {l.num || '–'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-to-text2">{l.text}</span>
              <span className={`to-data shrink-0 text-[11px] font-bold ${l.pts ? (l.opp ? 'text-to-dangerText' : 'text-to-accent') : 'text-to-textDisabled'}`}>
                {l.pts ? `+${l.pts}` : ''}
              </span>
            </div>
          ))
        )}
      </div>
    );
  }

  // ============ Box-Score (Bugfix §9) ============
  // Für Textkontexte, wo eine NumberTile zu groß wäre (Box-Score-Zeilen) —
  // Nummer als Präfix vor dem Namen, wie vor Element 24.
  function numPrefix(playerId: string): string {
    return numbers[playerId] !== undefined ? `#${numbers[playerId]} ` : '';
  }

  // Ausführliche Box-Score-Tabelle (Trefferquoten, Nebenwerte, +/-) mit
  // seitlichem Scrollen und fixierter Spielerspalte — auf Nutzerwunsch
  // wieder auf den Stand vor Element 24 gebracht (§9 hatte nur die dortige
  // Vorlage 1:1 übernommen, die diese Spalten bewusst nicht zeigte; das
  // stellte sich im echten Gebrauch als Rückschritt heraus). onlyCourt
  // filtert für die schmale Seitenleiste im Querformat auf die fünf
  // aktuell auf dem Feld Stehenden, sonst zeigt es jeden mit Einsatz.
  function SimpleBoxScore({ onlyCourt }: { onlyCourt: boolean }) {
    const list = onlyCourt ? onCourtPlayers : trackablePlayers.filter((p) => onCourtIds.includes(p.id) || boxScore.some((b) => b.playerId === p.id));
    const rows = list.map((p) => ({
      player: p,
      box:
        boxScore.find((b) => b.playerId === p.id) ??
        ({
          playerId: p.id,
          points: 0,
          fg2m: 0,
          fg2a: 0,
          fg3m: 0,
          fg3a: 0,
          ftm: 0,
          fta: 0,
          rebounds: 0,
          assists: 0,
          steals: 0,
          blocks: 0,
          turnovers: 0,
          fouls: 0
        } as PlayerBoxScore)
    }));
    return (
      <div className="rounded-to-xl border border-to-border bg-to-surface p-3.5">
        <span className="to-data mb-2 block text-[9px] tracking-[0.12em] text-to-textDisabled">BOX-SCORE</span>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-xs">
            <thead>
              <tr className="text-to-text3">
                <th className="sticky left-0 z-10 border-r border-to-divider bg-to-surface py-1 pr-2 font-semibold">Spieler</th>
                <th className="px-1 py-1 text-right font-semibold">Pkt</th>
                <th className="px-1 py-1 text-right font-semibold">2P</th>
                <th className="px-1 py-1 text-right font-semibold">2P%</th>
                <th className="px-1 py-1 text-right font-semibold">3P</th>
                <th className="px-1 py-1 text-right font-semibold">3P%</th>
                <th className="px-1 py-1 text-right font-semibold">FW</th>
                <th className="px-1 py-1 text-right font-semibold">FW%</th>
                <th className="px-1 py-1 text-right font-semibold">Reb</th>
                <th className="px-1 py-1 text-right font-semibold">Ast</th>
                <th className="px-1 py-1 text-right font-semibold">Stl</th>
                <th className="px-1 py-1 text-right font-semibold">Blk</th>
                <th className="px-1 py-1 text-right font-semibold">TO</th>
                <th className="px-1 py-1 text-right font-semibold">PF</th>
                <th className="pl-1 py-1 text-right font-semibold">+/-</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ player: p, box: b }) => (
                <tr key={p.id} className="border-t border-to-divider">
                  <td className="sticky left-0 z-10 border-r border-to-divider bg-to-surface py-1.5 pr-2 font-semibold text-to-text">
                    <div className="flex items-center gap-2">
                      <Photo player={p} size={20} />
                      {numPrefix(p.id)}
                      {shortPlayerName(p.name)}
                    </div>
                  </td>
                  <td className="px-1 py-1.5 text-right font-bold text-to-text">{b.points}</td>
                  <td className="px-1 py-1.5 text-right text-to-text2">
                    {b.fg2m}/{b.fg2a}
                  </td>
                  <td className="px-1 py-1.5 text-right text-to-textDisabled">{fgPct(b.fg2m, b.fg2a)}</td>
                  <td className="px-1 py-1.5 text-right text-to-text2">
                    {b.fg3m}/{b.fg3a}
                  </td>
                  <td className="px-1 py-1.5 text-right text-to-textDisabled">{fgPct(b.fg3m, b.fg3a)}</td>
                  <td className="px-1 py-1.5 text-right text-to-text2">
                    {b.ftm}/{b.fta}
                  </td>
                  <td className="px-1 py-1.5 text-right text-to-textDisabled">{fgPct(b.ftm, b.fta)}</td>
                  <td className="px-1 py-1.5 text-right text-to-text2">{b.rebounds}</td>
                  <td className="px-1 py-1.5 text-right text-to-text2">{b.assists}</td>
                  <td className="px-1 py-1.5 text-right text-to-text2">{b.steals}</td>
                  <td className="px-1 py-1.5 text-right text-to-text2">{b.blocks}</td>
                  <td className="px-1 py-1.5 text-right text-to-text2">{b.turnovers}</td>
                  <td className="px-1 py-1.5 text-right text-to-text2">{b.fouls}</td>
                  {(() => {
                    const pm = plusMinusByPlayer[p.id] ?? 0;
                    return (
                      <td
                        className={`py-1.5 pl-1 text-right font-semibold ${
                          pm > 0 ? 'text-to-accent' : pm < 0 ? 'text-to-dangerText' : 'text-to-textDisabled'
                        }`}
                      >
                        {fmtPlusMinus(pm)}
                      </td>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
            <tfoot>
              {(() => {
                // Team-+/- ist bewusst der tatsächliche Punktabstand
                // (teamScore.us - teamScore.opponent), NICHT die Summe der
                // einzelnen +/- oben — jeder Korb fließt dort in bis zu 5
                // Spieler-Werte gleichzeitig ein, eine Summe würde also
                // mehrfach zählen.
                const teamNet = teamScore.us - teamScore.opponent;
                return (
                  <tr className="border-t-2 border-to-border bg-to-surface2 font-bold text-to-accent">
                    <td className="sticky left-0 z-10 border-r border-to-divider bg-to-surface2 py-1.5 pr-2">Team</td>
                    <td className="px-1 py-1.5 text-right">{teamTotals.points}</td>
                    <td className="px-1 py-1.5 text-right font-normal text-to-text2">
                      {teamTotals.fg2m}/{teamTotals.fg2a}
                    </td>
                    <td className="px-1 py-1.5 text-right font-normal text-to-textDisabled">{fgPct(teamTotals.fg2m, teamTotals.fg2a)}</td>
                    <td className="px-1 py-1.5 text-right font-normal text-to-text2">
                      {teamTotals.fg3m}/{teamTotals.fg3a}
                    </td>
                    <td className="px-1 py-1.5 text-right font-normal text-to-textDisabled">{fgPct(teamTotals.fg3m, teamTotals.fg3a)}</td>
                    <td className="px-1 py-1.5 text-right font-normal text-to-text2">
                      {teamTotals.ftm}/{teamTotals.fta}
                    </td>
                    <td className="px-1 py-1.5 text-right font-normal text-to-textDisabled">{fgPct(teamTotals.ftm, teamTotals.fta)}</td>
                    <td className="px-1 py-1.5 text-right font-normal text-to-text2">{teamTotals.rebounds}</td>
                    <td className="px-1 py-1.5 text-right font-normal text-to-text2">{teamTotals.assists}</td>
                    <td className="px-1 py-1.5 text-right font-normal text-to-text2">{teamTotals.steals}</td>
                    <td className="px-1 py-1.5 text-right font-normal text-to-text2">{teamTotals.blocks}</td>
                    <td className="px-1 py-1.5 text-right font-normal text-to-text2">{teamTotals.turnovers}</td>
                    <td className="px-1 py-1.5 text-right font-normal text-to-text2">{teamTotals.fouls}</td>
                    <td className="py-1.5 pl-1 text-right">{fmtPlusMinus(teamNet)}</td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  // ============ Blätter ============
  function Sheets() {
    return (
      <>
        {sheet === 'quarter' && game && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setSheet(null)}>
            <div
              className="flex w-full max-w-lg flex-col gap-3.5 rounded-t-[24px] border border-to-border bg-to-surface p-5 sm:rounded-b-[24px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
              <span className="to-display-sm text-to-text">Viertel {quarter} beenden?</span>
              <div className="flex items-center gap-3.5 rounded-to-lg border border-to-divider bg-to-surface2 p-4">
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="to-data text-[9px] tracking-[0.1em] text-to-accent">TB WÜLFRATH</span>
                  <span className="to-number text-[30px] leading-none text-to-text">{teamScore.us}</span>
                </span>
                <span className="to-number text-lg text-to-textDisabled">:</span>
                <span className="flex flex-1 flex-col items-end gap-0.5">
                  <span className="to-data text-[9px] tracking-[0.1em] text-to-text3">{game.opponent.toUpperCase()}</span>
                  <span className="to-number text-[30px] leading-none text-to-text2">{teamScore.opponent}</span>
                </span>
              </div>
              <div className="flex items-start gap-2.5 rounded-to-lg border border-to-borderMatchday bg-to-accentWash p-3.5 text-xs leading-relaxed text-to-text2">
                <CheckIcon />
                <span>
                  Alle im Team bekommen den Zwischenstand als Push:{' '}
                  <strong className="text-to-text">
                    Ende Q{quarter} · {teamScore.us}:{teamScore.opponent}
                  </strong>
                </span>
              </div>
              <p className="text-xs leading-relaxed text-to-textDisabled">
                Danach läuft Viertel {quarter + 1}, die Teamfouls fangen wieder bei null an. Zurückspringen geht über die Viertel-Leiste.
              </p>
              <div className="flex flex-col gap-2">
                <button type="button" disabled={busy} onClick={() => endQuarter(true)} className="btn-primary h-[46px] rounded-to-pill text-[15px] disabled:opacity-60">
                  Viertel beenden und Push senden
                </button>
                <button type="button" disabled={busy} onClick={() => endQuarter(false)} className="btn-secondary h-[46px] rounded-to-pill text-[15px]">
                  Beenden ohne Push
                </button>
                <button type="button" onClick={() => setSheet(null)} className="h-6 text-[13px] text-to-text3">
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        )}

        {sheet === 'finish' && game && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setSheet(null)}>
            <div
              className="flex w-full max-w-lg flex-col gap-3.5 rounded-t-[24px] border border-to-border bg-to-surface p-5 sm:rounded-b-[24px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
              <span className="to-display-sm text-to-text">Spiel beenden?</span>
              <p className="text-xs leading-relaxed text-to-textDisabled">
                Endstand {teamScore.us}:{teamScore.opponent}. Danach wandern Ergebnis und Box-Score in die Statistik, und die Meldung geht an alle.
                Nachträgliche Korrekturen macht der Trainer im Adminbereich unter „Spiele".
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSheet(null);
                    finalize();
                  }}
                  className="btn-primary h-[46px] rounded-to-pill text-[15px] disabled:opacity-60"
                >
                  Spiel beenden
                </button>
                <button type="button" onClick={() => setSheet(null)} className="btn-secondary h-[46px] rounded-to-pill text-[15px]">
                  Weiter tracken
                </button>
              </div>
            </div>
          </div>
        )}

        {foulOutPlayerId && playersById[foulOutPlayerId] && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setFoulOutPlayerId(null)}>
            <div
              className="flex w-full max-w-lg flex-col gap-3.5 rounded-t-[24px] border border-to-border bg-to-surface p-5 sm:rounded-b-[24px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
              <span className="to-display-sm text-to-text">{playersById[foulOutPlayerId].name} hat 5 Fouls</span>
              <p className="text-xs leading-relaxed text-to-textDisabled">
                Nach dem fünften Foul darf {playersById[foulOutPlayerId].name} nicht mehr eingesetzt werden. Wechsle jemanden von der Bank ein — bis
                dahin steht die Nummer rot auf dem Feld.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const outId = foulOutPlayerId;
                    setFoulOutPlayerId(null);
                    setSubMode('in');
                    setOutgoingId(outId);
                  }}
                  className="btn-primary h-[46px] rounded-to-pill text-[15px]"
                >
                  Jetzt wechseln
                </button>
                <button type="button" onClick={() => setFoulOutPlayerId(null)} className="h-6 text-[13px] text-to-text3">
                  Später
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ============ Hauptbereich (Aufstellung/Wechsel/Aktionen, beide Layouts teilen sich Unterkomponenten) ============
  function TrackingBody({ wide }: { wide: boolean }) {
    if (trackablePlayers.length === 0) {
      return (
        <div className="rounded-to-xl border border-to-border bg-to-surface p-4">
          <p className="text-sm text-to-text3">Kein Kader für dieses Spiel hinterlegt.</p>
        </div>
      );
    }

    if (showNumbersCard) {
      return (
        <div className="flex flex-col gap-3 rounded-to-xl border border-to-border bg-to-surface p-4">
          <span className="to-data text-[10px] tracking-[0.12em] text-to-text3">TRIKOTNUMMERN</span>
          <p className="text-xs text-to-textDisabled">Welcher Spieler hat welche Nummer? Kann auch leer bleiben und später ergänzt werden.</p>
          <ul className="flex flex-col divide-y divide-to-divider">
            {trackablePlayers.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2.5 text-sm font-medium text-to-text">
                  <Photo player={p} size={36} />
                  {p.name}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  placeholder="–"
                  value={numberDrafts[p.id] ?? ''}
                  onChange={(e) => setNumberDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  className="input w-16 !py-2 text-center"
                />
              </li>
            ))}
          </ul>
          <div className="flex gap-2.5">
            <button type="button" disabled={busy} onClick={saveNumbers} className="btn-primary h-[56px] flex-1 text-sm">
              {manualNumbersEdit ? 'Speichern' : 'Weiter zur Aufstellung'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={manualNumbersEdit ? closeNumbersEditor : skipNumbers}
              className="btn-secondary h-[56px] flex-1 text-sm"
            >
              {manualNumbersEdit ? 'Abbrechen' : 'Überspringen'}
            </button>
          </div>
        </div>
      );
    }

    if (useCourtSplit && onCourtIds.length < COURT_SIZE) {
      return (
        <div className="flex flex-col gap-3 rounded-to-xl border border-to-border bg-to-surface p-4">
          <span className="to-data text-[10px] tracking-[0.12em] text-to-text3">
            STARTAUFSTELLUNG ({onCourtIds.length}/{COURT_SIZE})
          </span>
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: Math.ceil(trackablePlayers.length / 2) }).map((_, i) => (
              <div key={i} className="flex gap-2.5">
                {trackablePlayers.slice(i * 2, i * 2 + 2).map((p) => (
                  <PlayerTile
                    key={p.id}
                    player={p}
                    number={numbers[p.id]}
                    fouls={0}
                    size={wide ? 100 : 116}
                    photoSize={wide ? 48 : 56}
                    selected={onCourtIds.includes(p.id)}
                    onClick={() => toggleStarter(p.id)}
                  />
                ))}
                {trackablePlayers.slice(i * 2, i * 2 + 2).length === 1 && <span className="flex-1" />}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (subMode) {
      const list = subMode === 'out' ? onCourtPlayers : benchPlayers;
      return (
        <RosterGrid
          label={subMode === 'out' ? 'WER GEHT RAUS?' : 'WER KOMMT REIN?'}
          list={list}
          tileSize={wide ? 100 : 116}
          photoSize={wide ? 48 : 56}
          showCancel
          onCancel={cancelSubstitution}
          onPick={(id) => (subMode === 'out' ? pickOutgoing(id) : confirmSubstitution(id))}
          selectedId={null}
        />
      );
    }

    if (pendingAction && !wide) {
      return (
        <div className="flex flex-col gap-2">
          <RosterGrid
            label={`WER WAR ES? · ${STAT_TYPE_LABELS[pendingAction].toUpperCase()}`}
            list={pickablePlayers}
            tileSize={116}
            photoSize={56}
            showCancel
            onCancel={cancelPicker}
            onPick={(id) => addStat('us', pendingAction, id)}
            selectedId={pendingPlayer}
          />
          <ConfirmBar />
          <p className="px-1 text-xs leading-relaxed text-to-textDisabled">
            Die Auswahl steht an der Stelle des Tastenfelds – kein Scrollen, kein Suchen. Nach dem Tipp ist das Tastenfeld sofort wieder da.
          </p>
        </div>
      );
    }

    if (showBox && !wide) {
      return (
        <div className="flex flex-col gap-3">
          <SimpleBoxScore onlyCourt={false} />
          <button type="button" onClick={() => setShowBox(false)} className="h-[52px] rounded-to-pill border border-to-line text-[15px] font-semibold text-to-text2">
            Zurück zum Tracking
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2.5">
        <Keypad shotHeight={62} actionHeight={58} />
        <ConfirmBar />
        <CourtRow />
        <HistoryPanel limit={3} />
        <button type="button" onClick={() => setShowBox(true)} className="h-[52px] rounded-to-pill border border-to-line text-[15px] font-semibold text-to-text2">
          Box-Score ansehen
        </button>
        <button type="button" onClick={() => setSheet('quarter')} className="h-[52px] rounded-to-pill border border-to-line text-[15px] font-semibold text-to-text2">
          Viertel beenden
        </button>
        <button
          type="button"
          onClick={() => setSheet('finish')}
          className="h-[52px] rounded-to-pill border border-to-dangerFrame bg-to-dangerSoft text-[15px] font-semibold text-to-dangerText"
        >
          Spiel beenden
        </button>
        <p className="px-1 text-xs leading-relaxed text-to-textDisabled">
          Keine Spieluhr. Erst die Aktion, dann der Spieler – „Zurück" nimmt den letzten Eintrag sofort wieder raus.
        </p>
      </div>
    );
  }

  // ============ Querformat (ab 900px, drei Spalten) ============
  function WideBody() {
    const benchRows: Player[][] = [];
    for (let i = 0; i < benchPlayers.length; i += 3) benchRows.push(benchPlayers.slice(i, i + 3));
    const midTitle = pendingAction
      ? `WER WAR ES? · ${STAT_TYPE_LABELS[pendingAction].toUpperCase()}`
      : subMode
        ? subMode === 'out'
          ? 'WER GEHT RAUS?'
          : 'WER KOMMT REIN?'
        : 'MANNSCHAFT · IMMER ANTIPPBAR';
    const midList = subMode === 'in' ? benchPlayers : subMode === 'out' ? onCourtPlayers : pickablePlayers;
    const showCancelInMid = !!pendingAction || !!pendingPlayer || !!subMode;

    return (
      <div className="flex items-start gap-3">
        <div className="flex w-[330px] shrink-0 flex-col gap-2.5 rounded-to-xl border border-to-border bg-to-surface p-3.5 max-[1000px]:w-[288px]">
          <Keypad shotHeight={52} actionHeight={44} />
          <ConfirmBar />
        </div>
        <div className="min-w-0 flex-1 rounded-to-xl border border-to-borderMatchday bg-to-surface p-3.5">
          <span className="to-data mb-2.5 block text-[9px] tracking-[0.12em] text-to-accent">{midTitle}</span>
          {trackablePlayers.length === 0 ? (
            <p className="text-sm text-to-text3">Kein Kader für dieses Spiel hinterlegt.</p>
          ) : useCourtSplit && onCourtIds.length < COURT_SIZE ? (
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: Math.ceil(trackablePlayers.length / 2) }).map((_, i) => (
                <div key={i} className="flex gap-2.5">
                  {trackablePlayers.slice(i * 2, i * 2 + 2).map((p) => (
                    <PlayerTile
                      key={p.id}
                      player={p}
                      number={numbers[p.id]}
                      fouls={0}
                      size={100}
                      photoSize={48}
                      selected={onCourtIds.includes(p.id)}
                      onClick={() => toggleStarter(p.id)}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {(() => {
                const rows: Player[][] = [];
                for (let i = 0; i < midList.length; i += 2) rows.push(midList.slice(i, i + 2));
                return rows.map((row, i) => (
                  <div key={i} className="flex gap-2.5">
                    {row.map((p) => (
                      <PlayerTile
                        key={p.id}
                        player={p}
                        number={numbers[p.id]}
                        fouls={countPlayerFouls(events, p.id)}
                        size={100}
                        photoSize={48}
                        selected={subMode ? false : pendingPlayer === p.id}
                        onClick={() => (subMode === 'out' ? pickOutgoing(p.id) : subMode === 'in' ? confirmSubstitution(p.id) : handlePlayerTap(p.id))}
                      />
                    ))}
                    {row.length === 1 && showCancelInMid && (
                      <CancelTile size={100} onClick={subMode ? cancelSubstitution : cancelPicker} />
                    )}
                    {row.length === 1 && !showCancelInMid && <span className="flex-1" />}
                  </div>
                ));
              })()}
              {!subMode && (
                <>
                  <span className="to-data pt-1.5 text-[9px] tracking-[0.1em] text-to-text3">BANK</span>
                  {benchRows.map((row, i) => (
                    <div key={i} className="flex gap-1.5">
                      {row.map((p) => (
                        <span key={p.id} className="flex flex-1 items-center gap-1.5 rounded-to-md border border-to-border bg-to-surface2 px-2 py-1.5">
                          <span className="to-number text-sm text-to-text">{numbers[p.id] ?? '–'}</span>
                          <span className="truncate text-xs text-to-text2">{shortPlayerName(p.name)}</span>
                        </span>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex w-[262px] shrink-0 flex-col gap-3 max-[1000px]:w-[236px]">
          <HistoryPanel limit={4} />
          <SimpleBoxScore onlyCourt />
          <button
            type="button"
            onClick={() => setSheet('finish')}
            className="h-[44px] rounded-to-pill border border-to-dangerFrame bg-to-dangerSoft text-sm font-semibold text-to-dangerText"
          >
            Spiel beenden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-to-bg pb-8">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-to-divider bg-to-surface px-4 py-3">
        <button type="button" onClick={goBack} className="flex items-center gap-1 text-sm font-semibold text-to-text2">
          <BackChevronIcon />
          Zurück
        </button>
        <p className="text-sm font-bold text-to-text">{game ? `vs. ${game.opponent}` : 'Spiel-Stats'}</p>
        <span className="w-14" />
      </div>
      {game && (
        <p className="pt-2 text-center text-xs text-to-text3">
          {fmtDate(game.game_date)} · {fmtTime(game.game_time)} Uhr
        </p>
      )}

      <div className={`mx-auto flex flex-col gap-3 px-4 py-4 ${wide ? 'max-w-[1180px] px-5' : 'max-w-[1024px]'}`}>
        {error && <ErrorNote message={error} />}
        {showLockLoader && <LoadingSpinner label />}

        {lockState.kind === 'blocked' && (
          <div className="card space-y-3 text-center">
            <p className="text-sm text-to-text2">
              Wird gerade von <span className="font-bold text-to-text">{lockState.session.holder_name}</span> getrackt (seit{' '}
              {new Date(lockState.session.started_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr).
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
            <p className="text-sm text-to-text2">Jemand anderes hat die Eingabe übernommen. Deine Aktionen werden ab jetzt nicht mehr gespeichert.</p>
            <button className="btn-secondary w-full" onClick={goBack}>
              Zurück
            </button>
          </div>
        )}

        {lockState.kind === 'readonly' && (
          <div className="card space-y-3">
            <p className="text-sm font-bold text-to-text">Stats abgeschlossen</p>
            {events.length === 0 ? (
              <p className="text-xs text-to-text3">Für dieses Spiel wurden keine Einzelspieler-Stats erfasst — der Endstand wurde manuell nachgetragen.</p>
            ) : (
              <>
                <p className="text-xs text-to-text3">Nur noch zur Ansicht.</p>
                <SimpleBoxScore onlyCourt={false} />
                {isAdmin && (
                  <button className="btn-secondary w-full" disabled={busy} onClick={reopen}>
                    Wieder öffnen
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {lockState.kind === 'held' && game && (
          <>
            <LayoutSwitcher />
            {wide ? (
              <div className="flex flex-col gap-3">
                <Header withEndButton wide />
                <WideBody />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Header withEndButton={false} wide={false} />
                <TrackingBody wide={false} />
              </div>
            )}
            <Sheets />
          </>
        )}
      </div>
    </div>
  );
}
