import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
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
// Welches Layout läuft, entscheidet reine Fensterbreite/-lage
// (computeAutoWide, "auto" zählt ab 900px Breite ODER ab 700px in echter
// Querlage als Querformat — ein iPad hochkant bei 768–834px landet sonst
// fälschlich im kompakten Layout) — kein manueller Umschalter mehr (Element
// 26, auf Nutzerwunsch entfernt: dreht sich das Handy, soll sich die Ansicht
// von selbst anpassen, ohne dass es dafür einen Knopf braucht).
const COURT_SIZE = 5;
const HEARTBEAT_MS = 15_000;

type LayoutMode = 'auto' | 'compact' | 'wide';

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
// getrackt — kein Fehlwurf, kein Box-Score. Die Gegner-Auswahl sitzt
// deshalb als zusätzliche Kachel direkt in der "WER WAR ES?"-Auswahl der
// drei Treffer-Aktionen (wie in der alten Live-App), nicht mehr in einer
// eigenen Zeile — und nur dort, ein Fehlwurf lässt sich für den Gegner
// gar nicht erst auswählen.
const OPPONENT_POINTS: Partial<Record<StatType, number>> = {
  ft_made: 1,
  fg2_made: 2,
  fg3_made: 3
};

// Aktion-ändern-Blatt (§4, NEU): "WAS"-Kacheln in fünf Zeilen. Treffer/
// Fehlwurf/Foul sind rot bzw. volt getönt ("bad"/neutral je nach Auswahl,
// siehe EditWasTile), die mittleren Reihen neutral.
const EDIT_WAS_ROWS: { key: StatType; label: string; bad?: boolean }[][] = [
  [
    { key: 'fg2_made', label: '2er ✓' },
    { key: 'fg3_made', label: '3er ✓' },
    { key: 'ft_made', label: 'FW ✓' }
  ],
  [
    { key: 'fg2_miss', label: '2er ✗', bad: true },
    { key: 'fg3_miss', label: '3er ✗', bad: true },
    { key: 'ft_miss', label: 'FW ✗', bad: true }
  ],
  [
    { key: 'rebound_def', label: 'Reb DEF' },
    { key: 'rebound_off', label: 'Reb OFF' },
    { key: 'assist', label: 'Ast' }
  ],
  [
    { key: 'steal', label: 'Stl' },
    { key: 'block', label: 'Blk' },
    { key: 'turnover', label: 'TO' }
  ],
  [{ key: 'foul', label: 'Foul', bad: true }]
];

// Für den Gegner werden laut Schema nur die drei wurfrelevanten Typen
// akzeptiert (siehe game_stat_events_opponent_scoring_only, Migration 0028)
// — dieselbe Einschränkung wie beim Erfassen gilt auch beim nachträglichen
// Ändern.
const OPPONENT_ONLY_TYPES: StatType[] = ['fg2_made', 'fg3_made', 'ft_made'];

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
function PencilIcon({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
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

// Würfe (Element 26 §1): am Handy echte Kreise (114px, fester Durchmesser,
// zentriert mit Lücke statt flex-1-Streckung) mit Leucht-Schein; im
// Querformat (height="stretch", eigenes Grid-Layout bleibt bestehen) dieselbe
// Farbgebung, aber als flächige Kachel statt Kreis — ein Kreis würde in einer
// nicht-quadratischen Grid-Zelle zur Ellipse verzerrt.
function ShotButton({
  label,
  sub,
  make,
  height,
  onClick,
  style
}: {
  label: string;
  sub: string;
  make: boolean;
  height: number | 'stretch';
  onClick: () => void;
  style?: CSSProperties;
}) {
  if (height === 'stretch') {
    return (
      <button
        type="button"
        onClick={onClick}
        style={style}
        className={`flex h-full flex-col items-center justify-center gap-0.5 rounded-to-lg border font-semibold ${
          make ? 'border-to-borderMatchday bg-to-accentSoft text-to-accent' : 'border-to-dangerFrame bg-to-dangerSoft text-to-dangerText'
        }`}
      >
        <span className="text-[19px] font-bold">{label}</span>
        <span className="to-data text-[8px] tracking-[0.08em] opacity-70">{sub}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: height,
        height,
        boxShadow: make ? '0 0 28px rgba(200,255,46,.10)' : '0 0 28px rgba(255,90,103,.09)',
        ...style
      }}
      className={`flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border-2 ${
        make ? 'border-to-accent bg-to-accentSoft text-to-accent' : 'border-to-danger bg-to-dangerSoft text-to-dangerText'
      }`}
    >
      <span className="text-[25px] font-bold">{label}</span>
      <span className="to-data text-[8px] tracking-[0.1em] opacity-80">{sub}</span>
    </button>
  );
}

// "Übrige Aktionen" (Reb/Ast/Stl/Blk/TO, §1): Pillen statt Kacheln —
// Radius = halbe Höhe, also eine Stadion-Form (rounded-to-pill reicht dafür,
// unabhängig von der tatsächlichen Höhe).
function StatPill({ label, sub, height, onClick, style }: { label: string; sub?: string; height: number | 'stretch'; onClick: () => void; style?: CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={height === 'stretch' ? style : { height, ...style }}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-to-pill border border-to-line bg-to-surface2 text-to-text ${
        height === 'stretch' ? 'h-full' : ''
      }`}
    >
      <span className="text-[19px] font-semibold">{label}</span>
      {sub && <span className="to-data text-[7px] tracking-[0.1em] text-to-textDisabled">{sub}</span>}
    </button>
  );
}

// Unterste Zeile (Foul/Wechseln, §1): schlichte Pillen, "Wechseln" bewusst
// OHNE Volt/Icon (anders als vor Element 26) — der Wechseln-Weg mit Icon
// sitzt jetzt zusätzlich in der "Auf dem Feld"-Karte (siehe CourtRow).
function BottomPill({
  label,
  danger,
  height,
  onClick,
  style
}: {
  label: string;
  danger?: boolean;
  height: number | 'stretch';
  onClick: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={height === 'stretch' ? style : { height, ...style }}
      className={`flex flex-1 items-center justify-center rounded-to-pill border text-[15px] font-semibold ${
        height === 'stretch' ? 'h-full' : ''
      } ${danger ? 'border-to-dangerFrame bg-to-dangerSoft text-to-dangerText' : 'border-to-line bg-to-surface2 text-to-text'}`}
    >
      {label}
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
      style={{ minHeight: size }}
      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-to-lg border px-2.5 text-left ${
        selected
          ? 'border-to-accent bg-to-accentWash'
          : tone === 'danger'
            ? 'border-to-dangerFrame bg-to-surface2'
            : 'border-to-border bg-to-surface2'
      }`}
    >
      <Photo player={player} size={photoSize} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={`to-number text-[19px] leading-none ${tone === 'danger' ? 'text-to-dangerText' : 'text-to-accent'}`}>
          {number ?? '–'}
        </span>
        <span className="truncate text-[13px] font-semibold text-to-text">{shortPlayerName(player.name)}</span>
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

function OpponentTile({ size, teamName, points, onClick }: { size: number; teamName: string; points: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ minHeight: size }}
      className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-to-lg border border-to-dangerFrame bg-to-dangerSoft px-2 py-2 text-center"
    >
      <span className="to-number text-[26px] leading-none text-to-dangerText">+{points}</span>
      <span className="w-full break-words text-xs font-semibold leading-tight text-to-dangerText">{teamName}</span>
      <span className="to-data text-[8px] tracking-[0.06em] text-to-dangerText">GEGNER TRIFFT</span>
    </button>
  );
}

// "Auf dem Feld" (§3): Foto mit Trikotnummer-Plakette statt Zahlen-Chip —
// die Nummer sitzt als kleines volt Badge unten rechts überlappend auf dem
// Foto, darunter Vorname + "PKT · FOULS".
function CourtAvatar({ player, number, points, fouls }: { player: Player; number?: number; points: number; fouls: number }) {
  const tone = foulTone(fouls);
  return (
    <span className="flex flex-1 flex-col items-center gap-1.5">
      <span className="relative flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full border border-to-line bg-to-surface2">
        <Photo player={player} size={54} />
        {number !== undefined && (
          <span className="to-number absolute -bottom-[3px] -right-[3px] flex h-5 min-w-5 items-center justify-center rounded-to-sm bg-to-accent px-1 text-[12px] text-to-onAccent">
            {number}
          </span>
        )}
      </span>
      <span className="max-w-[62px] truncate text-[10px] text-to-text2">{player.name.split(' ')[0]}</span>
      <span className={`to-data text-[9px] ${tone === 'danger' ? 'text-to-dangerText' : tone === 'warn' ? 'text-to-vacation' : 'text-to-text3'}`}>
        {points} · {fouls}
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

  // Kein manueller Umschalter mehr (auf Nutzerwunsch entfernt, Element 26
  // Header-Feinschliff) — die Ansicht wechselt nur noch automatisch beim
  // Drehen (computeAutoWide). "?layout=wide|compact" bleibt als interner
  // Test-Hebel bestehen, ohne dass es dafür eine sichtbare Bedienung gibt.
  const [layoutMode] = useState<LayoutMode>(() => {
    const forced = new URLSearchParams(window.location.search).get('layout');
    return forced === 'wide' || forced === 'compact' ? forced : 'auto';
  });
  const [wide, setWide] = useState<boolean>(() => (layoutMode === 'auto' ? computeAutoWide() : layoutMode === 'wide'));

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

  // Erst Aktion, dann Spieler — oder umgekehrt (Querformat, §2): sobald
  // beide gesetzt sind, wird sofort gebucht. Bleibt pendingPlayer nach einem
  // Freiwurf stehen (Rückfrage 6, "kurz ausgewählt bleiben"), reicht beim
  // nächsten Freiwurf derselben Serie ein Tipp auf FW.
  const [pendingAction, setPendingAction] = useState<StatType | null>(null);
  const [pendingPlayer, setPendingPlayer] = useState<string | null>(null);
  const [subMode, setSubMode] = useState<'out' | 'in' | null>(null);
  const [outgoingId, setOutgoingId] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [foulOutPlayerId, setFoulOutPlayerId] = useState<string | null>(null);

  const quarter = game?.current_quarter ?? 1;
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

  function cancelPicker() {
    setPendingAction(null);
    setPendingPlayer(null);
  }

  // Bearbeiten/Löschen (Element 26 §4/§5, NEU): ersetzt das bisherige
  // "Zurück nimmt den letzten Eintrag zurück" — über den Stift lässt sich
  // jetzt JEDER Eintrag ändern oder löschen, nicht nur der letzte im
  // aktuellen Viertel. Erreichbar nur innerhalb von lockState "held" (siehe
  // ganz unten), also ausschließlich für die Person, die die Tracking-
  // Sitzung gerade hält — "jeder der tracken darf" (Rückfrage 3) bedeutet
  // hier: jeder, der es bis zu diesem Punkt geschafft hat, die Sitzung zu
  // halten, nicht zusätzlich eine zweite Rechteprüfung pro Eintrag.
  const [editTarget, setEditTarget] = useState<GameStatEvent | null>(null);
  const [editWer, setEditWer] = useState<string | 'opponent' | null>(null);
  const [editWas, setEditWas] = useState<StatType | null>(null);
  const [editBankShown, setEditBankShown] = useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<GameStatEvent | null>(null);

  function openEditSheet(ev: GameStatEvent) {
    setEditTarget(ev);
    setEditWer(ev.team === 'opponent' ? 'opponent' : ev.player_id);
    setEditWas(ev.stat_type);
    setEditBankShown(false);
  }
  function closeEditSheet() {
    setEditTarget(null);
    setEditWer(null);
    setEditWas(null);
    setEditBankShown(false);
  }
  function selectEditWer(id: string | 'opponent') {
    setEditWer(id);
    // Gegner lässt nur die drei Treffer-Typen zu — eine bisher gewählte
    // andere Aktion (z. B. "Reb DEF") wäre dafür ungültig, also zurück auf
    // "noch nichts gewählt" statt eine unzulässige Kombination stehen zu
    // lassen.
    if (id === 'opponent' && editWas && !OPPONENT_ONLY_TYPES.includes(editWas)) {
      setEditWas(null);
    }
  }

  async function saveEdit() {
    if (!editTarget || !editWas || !editWer || busy) return;
    setBusy(true);
    setError(null);
    try {
      const patch = {
        team: editWer === 'opponent' ? ('opponent' as const) : ('us' as const),
        player_id: editWer === 'opponent' ? null : editWer,
        stat_type: editWas
      };
      const { data, error: updateError } = await supabase.from('game_stat_events').update(patch).eq('id', editTarget.id).select().single();
      if (updateError) throw updateError;
      const row = data as GameStatEvent;
      setEvents((prev) => prev.map((e) => (e.id === row.id ? row : e)));
      closeEditSheet();
    } catch {
      setError('Änderung konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  }

  function askDeleteEvent(ev: GameStatEvent) {
    closeEditSheet();
    setConfirmDeleteTarget(ev);
  }

  async function confirmDeleteEvent() {
    if (!confirmDeleteTarget || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: delError } = await supabase.from('game_stat_events').delete().eq('id', confirmDeleteTarget.id);
      if (delError) throw delError;
      setEvents((prev) => prev.filter((e) => e.id !== confirmDeleteTarget.id));
      setConfirmDeleteTarget(null);
    } catch {
      setError('Eintrag konnte nicht gelöscht werden.');
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
  // Gemeinsam für Verlauf, Zuletzt-Zeile und die "so steht der Eintrag
  // gerade"-Anzeige im Bearbeiten-/Löschen-Blatt — ein einzelner Eintrag
  // immer gleich beschrieben, egal an welcher Stelle er auftaucht.
  function describeEvent(e: GameStatEvent): LogEntry & { created_at: string } {
    return {
      id: e.id,
      quarter: e.quarter,
      num: e.team === 'opponent' ? '' : e.player_id ? String(numbers[e.player_id] ?? '') : '',
      text:
        e.team === 'opponent'
          ? `Gegner · ${STAT_TYPE_LABELS[e.stat_type]}`
          : `${playersById[e.player_id ?? '']?.name ?? '?'} · ${STAT_TYPE_LABELS[e.stat_type]}${
              e.stat_type === 'foul' && e.player_id
                ? ` (${countPlayerFouls(events.filter((x) => x.created_at <= e.created_at), e.player_id)}.)`
                : ''
            }`,
      pts: e.stat_type === 'fg2_made' ? 2 : e.stat_type === 'fg3_made' ? 3 : e.stat_type === 'ft_made' ? 1 : 0,
      opp: e.team === 'opponent',
      created_at: e.created_at
    };
  }

  const statLogEntries: (LogEntry & { created_at: string })[] = events.map(describeEvent);

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
  // Zuletzt-Zeile (§1, NEU) zeigt nur echte Stat-Events, keine Wechsel —
  // "events" ist aufsteigend sortiert geladen und bleibt es (Insert hängt
  // an, Update/Delete ändern die Reihenfolge nicht), das letzte Element ist
  // also immer das zuletzt getrackte.
  const lastStatEvent = events.length > 0 ? events[events.length - 1] : null;

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
              : 'idle';
  useScrollResetOnChange(screenKey);

  if (error && !game) return <ErrorNote message={error} />;

  // ============ Kopf ============
  // Im Querformat (Element-24-Änderung §1) liegt der ganze Kopf jetzt in
  // EINER Zeile statt gestapelt
  // — Punktestand/Viertel-Leiste/Teamfouls werden dafür als eigene Blöcke
  // zusammengesetzt statt in einer gemeinsamen Spalte.
  function Header({ withEndButton, wide: headerWide }: { withEndButton: boolean; wide: boolean }) {
    const score = (
      <div className="flex items-end justify-center gap-2.5">
        <span className="flex flex-col items-end gap-0.5">
          <span className="to-data text-[9px] tracking-[0.1em] text-to-accent">TBW</span>
          <span className={`to-number leading-none text-to-text ${headerWide ? 'text-[44px]' : 'text-[34px]'}`}>{teamScore.us}</span>
        </span>
        <span className={`to-number text-to-textDisabled ${headerWide ? 'pb-1 text-xl' : 'pb-1 text-base'}`}>:</span>
        <span className="flex flex-col gap-0.5">
          <span className="to-data text-[9px] tracking-[0.1em] text-to-text3">{game?.opponent?.slice(0, 3).toUpperCase() ?? 'GEG'}</span>
          <span className={`to-number leading-none text-to-text2 ${headerWide ? 'text-[44px]' : 'text-[34px]'}`}>{teamScore.opponent}</span>
        </span>
      </div>
    );

    // Nur noch Anzeige, nicht mehr antippbar — Viertel wechseln geht
    // ausschließlich über den "Viertel beenden"-Knopf/das Blatt unten,
    // damit es nur einen einzigen Weg dafür gibt (auf Nutzerwunsch: zwei
    // verschiedene Bestätigungsdialoge für dieselbe Aktion waren
    // verwirrend).
    const quarters = (
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((q) => {
          const qs = quarterScores.find((x) => x.quarter === q);
          const done = q < quarter;
          const live = q === quarter;
          return (
            <span
              key={q}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-to-md border ${headerWide ? 'py-1.5' : 'py-1'} ${
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
          className={`flex flex-col items-center gap-0.5 rounded-to-md border px-3 ${headerWide ? 'py-1.5' : 'py-1'} ${
            quarter > 4 ? 'border-to-accent bg-to-accent' : 'border-to-divider bg-transparent'
          }`}
        >
          <span className={`to-data text-[11px] font-bold ${quarter > 4 ? 'text-to-onAccent' : 'text-to-textDisabled'}`}>
            {quarter > 4 ? quarterLabel(quarter) : 'OT'}
          </span>
          <span className={`to-data text-[8px] ${quarter > 4 ? 'text-to-onAccent' : 'text-to-textDisabled'}`}>{quarter > 4 ? 'LÄUFT' : '–'}</span>
        </span>
      </div>
    );

    const fouls = (
      <div className={headerWide ? 'flex shrink-0 flex-col items-start gap-1.5' : 'flex items-center gap-2.5'}>
        <span className="to-data text-[9px] tracking-[0.12em] text-to-text3">TEAMFOULS Q{quarter}</span>
        <span className="flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`h-2 w-2 rounded-full ${i < teamFouls ? 'bg-to-vacation' : 'bg-to-border'}`} />
          ))}
        </span>
        <span className={`to-data text-[9px] text-to-vacation ${headerWide ? '' : 'ml-auto'}`}>
          {teamFouls >= 5 ? 'IM BONUS' : `${5 - teamFouls} BIS BONUS`}
        </span>
      </div>
    );

    if (headerWide) {
      return (
        <div className="flex items-center gap-[22px] rounded-to-xl border border-to-border bg-to-surface px-4 py-2.5">
          <div className="flex flex-1 items-center gap-[22px]">
            {score}
            <div className="max-w-[430px] flex-1">{quarters}</div>
            {fouls}
          </div>
          {withEndButton && (
            <div className="flex shrink-0 gap-2.5">
              <button
                type="button"
                onClick={() => setSheet('quarter')}
                className="h-11 shrink-0 rounded-to-pill border border-to-line px-[18px] text-sm font-semibold text-to-text2"
              >
                Viertel beenden
              </button>
              <button
                type="button"
                onClick={() => setSheet('finish')}
                className="h-11 shrink-0 rounded-to-pill border border-to-dangerFrame bg-to-dangerSoft px-[18px] text-sm font-semibold text-to-dangerText"
              >
                Spiel beenden
              </button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2.5 rounded-to-xl border border-to-border bg-to-surface p-3.5">
        {score}
        {quarters}
        {fouls}
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
          <div key={made} className="flex justify-center gap-[26px]">
            <ShotButton label={label} sub={sub} make height={shotHeight} onClick={() => handleAction(made)} />
            <ShotButton label={label} sub="FEHLWURF" make={false} height={shotHeight} onClick={() => handleAction(miss)} />
          </div>
        ))}
        <div className="flex gap-[11px]">
          <StatPill label="Reb" sub="DEFENSIV" height={actionHeight} onClick={() => handleAction('rebound_def')} />
          <StatPill label="Reb" sub="OFFENSIV" height={actionHeight} onClick={() => handleAction('rebound_off')} />
          <StatPill label="Ast" sub="ASSIST" height={actionHeight} onClick={() => handleAction('assist')} />
        </div>
        <div className="flex gap-[11px]">
          <StatPill label="Stl" sub="STEAL" height={actionHeight} onClick={() => handleAction('steal')} />
          <StatPill label="Blk" sub="BLOCK" height={actionHeight} onClick={() => handleAction('block')} />
          <StatPill label="TO" sub="TURNOVER" height={actionHeight} onClick={() => handleAction('turnover')} />
        </div>
        <div className="flex gap-[11px]">
          <BottomPill label="Foul" danger height={58} onClick={() => handleAction('foul')} />
          <BottomPill label="Wechseln" height={58} onClick={startSubstitution} />
        </div>
      </div>
    );
  }

  // ============ Tastenfeld Querformat (Element 24-Änderung §1/§2) ============
  // Vier Spalten in zwei Blöcken gedacht: links die Würfe (Treffer/Fehlwurf
  // je Zeile nebeneinander), rechts alles andere — ein eigenes Grid statt
  // Keypad()s gestapelter Zeilen, weil die Anordnung nicht mehr linear ist.
  const OTHER_ACTION_ROWS: { key: StatType; label: string; sub?: string }[][] = [
    [
      { key: 'rebound_def', label: 'Reb DEF', sub: 'DEFENSIV' },
      { key: 'rebound_off', label: 'Reb OFF', sub: 'OFFENSIV' }
    ],
    [
      { key: 'assist', label: 'Assist' },
      { key: 'steal', label: 'Steal' }
    ],
    [
      { key: 'block', label: 'Block' },
      { key: 'turnover', label: 'Turnover' }
    ]
  ];

  function WideKeypad() {
    return (
      <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-[auto_repeat(4,minmax(56px,1fr))] gap-2.5">
        <span className="to-data col-span-4 pl-0.5 text-[9px] tracking-[0.1em] text-to-text3" style={{ gridRow: 1 }}>
          TB WÜLFRATH · WAS IST PASSIERT?
        </span>
        {SHOT_BUTTONS.map(({ made, miss, label, sub }, i) => (
          <Fragment key={made}>
            <ShotButton label={label} sub={sub} make height="stretch" onClick={() => handleAction(made)} style={{ gridRow: i + 2, gridColumn: 1 }} />
            <ShotButton label={label} sub="DANEBEN" make={false} height="stretch" onClick={() => handleAction(miss)} style={{ gridRow: i + 2, gridColumn: 2 }} />
          </Fragment>
        ))}
        {OTHER_ACTION_ROWS.map((row, i) => (
          <Fragment key={row[0].key}>
            <StatPill
              label={row[0].label}
              sub={row[0].sub}
              height="stretch"
              onClick={() => handleAction(row[0].key)}
              style={{ gridRow: i + 2, gridColumn: 3 }}
            />
            <StatPill
              label={row[1].label}
              sub={row[1].sub}
              height="stretch"
              onClick={() => handleAction(row[1].key)}
              style={{ gridRow: i + 2, gridColumn: 4 }}
            />
          </Fragment>
        ))}
        <BottomPill label="Foul" danger height="stretch" onClick={() => handleAction('foul')} style={{ gridRow: 5, gridColumn: '1 / 3' }} />
        <BottomPill label="Wechseln" height="stretch" onClick={startSubstitution} style={{ gridRow: 5, gridColumn: '3 / 5' }} />
      </div>
    );
  }

  // ============ Bestätigung ============
  // Zuletzt-Zeile (§1, NEU): ersetzt die bisherige ConfirmBar/"Zurück".
  // Leer-Zustand (7-noch-nichts.png): gestrichelter Rahmen, kein Stift.
  // Einzeilig und kompakt (auf Nutzerwunsch, angelehnt an die Live-App) —
  // vorher zweizeilig mit eigener "ZULETZT GETRACKT"-Unterzeile.
  function LastTrackedRow() {
    if (!lastStatEvent) {
      return (
        <div className="flex h-[38px] items-center gap-2 rounded-to-lg border border-dashed border-to-line bg-to-surface px-3">
          <span className="to-data shrink-0 text-[9px] tracking-[0.08em] text-to-textDisabled">ZULETZT</span>
          <span className="truncate text-[13px] text-to-textDisabled">Noch nichts getrackt</span>
        </div>
      );
    }
    const entry = describeEvent(lastStatEvent);
    return (
      <div className="flex h-[38px] items-center gap-2 rounded-to-lg border border-to-border bg-to-surface pl-3 pr-1.5">
        <span className="to-data shrink-0 text-[9px] tracking-[0.08em] text-to-textDisabled">ZULETZT</span>
        {entry.num && (
          <span className="to-data flex h-5 min-w-6 shrink-0 items-center justify-center rounded-to-sm bg-to-surface2 px-1.5 text-[10px] text-to-text2">
            {entry.num}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-to-text">{entry.text}</span>
        {!!entry.pts && (
          <span className={`to-data shrink-0 text-xs font-bold ${entry.opp ? 'text-to-dangerText' : 'text-to-accent'}`}>+{entry.pts}</span>
        )}
        <button
          type="button"
          onClick={() => openEditSheet(lastStatEvent)}
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-to-line bg-to-surface2 text-to-accent"
          aria-label="Aktion ändern"
        >
          <PencilIcon size={13} />
        </button>
      </div>
    );
  }

  // ============ Spielerauswahl ============
  function RosterGrid({
    label,
    rightLabel,
    list,
    tileSize,
    photoSize,
    showCancel,
    onCancel,
    onPick,
    selectedId,
    cols = 2,
    opponent
  }: {
    label: string;
    // "2 PUNKTE" / "OHNE PUNKTE" rechts neben dem Label (tracking.html
    // .pickhead .r) — nur bei der Treffer-/Aktions-Auswahl gesetzt, nicht
    // bei der Wechsel-Auswahl.
    rightLabel?: string;
    list: Player[];
    tileSize: number;
    photoSize: number;
    showCancel: boolean;
    onCancel: () => void;
    onPick: (id: string) => void;
    selectedId: string | null;
    cols?: number;
    // Zusätzliche Kachel für "Gegner trifft" (wie in der alten Live-App):
    // taucht nur in der "WER WAR ES?"-Auswahl der drei Treffer-Aktionen auf
    // (siehe OPPONENT_POINTS), nicht bei Fehlwürfen oder der Wechsel-Auswahl.
    opponent?: { points: number; onPick: () => void };
  }) {
    // Zellen (Spieler + optional "Gegner") auf volle Zeilen auffüllen, damit
    // auch bei "cols=3" (Querformat) die letzte Reihe sauber aufgeht statt
    // krumm zu werden. "Abbrechen" ist bewusst keine Gitterzelle mehr
    // (Rückfrage): als schmale Leiste über die volle Breite unter dem
    // Raster statt als quadratische Kachel mit Leerraum daneben.
    const cells: (Player | 'opponent' | null)[] = [...list];
    if (opponent) cells.push('opponent');
    while (cells.length % cols !== 0) cells.push(null);
    const rows: (Player | 'opponent' | null)[][] = [];
    for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
    return (
      <div className="flex flex-col gap-2.5 rounded-to-xl border border-to-borderMatchday bg-to-surface p-3.5">
        {label && (
          <span className="flex items-center gap-1.5 pl-1">
            <span className="to-data text-[9px] tracking-[0.12em] text-to-accent">{label}</span>
            {rightLabel && <span className="to-data ml-auto text-[8px] tracking-[0.08em] text-to-textDisabled">{rightLabel}</span>}
          </span>
        )}
        {rows.map((row, i) => (
          // Grid statt flex: bei einer ungeraden letzten Zeile (z. B. 5
          // Spieler + leere Füllzelle) verteilt "flex: 1 1 0%" die Breite
          // NICHT gleichmäßig, sobald ein Kind (PlayerTile: Border+Padding)
          // und das andere (leere Füllzelle) unterschiedliche Border-/
          // Padding-Breiten haben — eine bekannte Flexbox-Falle. Grid-
          // Spalten (1fr) sind davon unabhängig und immer exakt gleich breit.
          <div key={i} className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {row.map((cell, j) =>
              cell === 'opponent' ? (
                <OpponentTile
                  key="opponent"
                  size={tileSize}
                  teamName={game?.opponent ?? 'Gegner'}
                  points={opponent!.points}
                  onClick={opponent!.onPick}
                />
              ) : cell === null ? (
                <span key={j} className="flex-1" />
              ) : (
                <PlayerTile
                  key={cell.id}
                  player={cell}
                  number={numbers[cell.id]}
                  fouls={countPlayerFouls(events, cell.id)}
                  size={tileSize}
                  photoSize={photoSize}
                  selected={selectedId === cell.id}
                  onClick={() => onPick(cell.id)}
                />
              )
            )}
          </div>
        ))}
        {showCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex h-11 items-center justify-center gap-1.5 rounded-to-pill border border-dashed border-to-dangerFrame text-[13px] font-semibold text-to-dangerText"
          >
            <XMarkIcon size={16} />
            Abbrechen
          </button>
        )}
      </div>
    );
  }

  // ============ Auf dem Feld (Handy) ============
  function CourtRow() {
    return (
      <div className="flex flex-col gap-3 rounded-to-xl border border-to-border bg-to-surface p-3.5">
        <span className="flex items-center gap-2">
          <span className="to-data text-[9px] tracking-[0.1em] text-to-text3">AUF DEM FELD</span>
          <span className="to-data flex h-[17px] items-center rounded-to-sm bg-to-accentSoft px-1.5 text-[9px] font-bold text-to-accent">
            {onCourtPlayers.length}
          </span>
          <span className="to-data ml-auto text-[8px] tracking-[0.08em] text-to-textDisabled">PKT · FOULS</span>
        </span>
        <div className="flex gap-2">
          {onCourtPlayers.map((p) => (
            <CourtAvatar
              key={p.id}
              player={p}
              number={numbers[p.id]}
              points={boxScore.find((b) => b.playerId === p.id)?.points ?? 0}
              fouls={countPlayerFouls(events, p.id)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={startSubstitution}
          className="flex h-12 items-center justify-center gap-2 rounded-to-pill border border-to-line bg-to-surface2 text-[15px] font-semibold text-to-text"
        >
          <span className="text-to-accent">
            <SwapIcon />
          </span>
          Wechseln
        </button>
      </div>
    );
  }

  // ============ Verlauf ============
  // `grow` (Querformat, §4): Panel füllt die verbleibende Höhe der rechten
  // Spalte, statt wie am Handy nur so hoch wie nötig zu sein — der
  // Box-Score darunter behält seine natürliche Höhe.
  function HistoryPanel({ limit, grow }: { limit: number; grow?: boolean }) {
    const effectiveLimit = historyExpanded ? logEntries.length : limit;
    const rows = logEntries.slice(0, effectiveLimit);
    return (
      <div className={`overflow-hidden rounded-to-xl border border-to-border bg-to-surface ${grow ? 'flex flex-1 flex-col' : ''}`}>
        <span className="flex items-center gap-2 px-3.5 pb-2 pt-2.5">
          <span className="to-data text-[9px] tracking-[0.1em] text-to-text3">VERLAUF</span>
          <span className="to-data ml-auto text-[8px] tracking-[0.08em] text-to-textDisabled">STIFT = ÄNDERN</span>
        </span>
        <div className={grow ? 'flex-1 overflow-y-auto' : ''}>
          {rows.length === 0 ? (
            <p className="border-t border-to-surface2 px-3.5 py-2.5 text-[13px] text-to-text2">Noch keine Aktionen.</p>
          ) : (
            rows.map((l) => {
              const isLast = l.id === lastStatEvent?.id;
              const sourceEvent = l.sub ? null : events.find((e) => e.id === l.id) ?? null;
              return (
                <div
                  key={l.id}
                  className={`flex items-center gap-2.5 border-t border-to-surface2 py-2.5 pl-3.5 pr-2.5 ${isLast ? 'bg-to-accentWash' : ''}`}
                >
                  <span className="to-data w-6 shrink-0 text-[9px] text-to-textDisabled">{l.quarter > 0 ? `Q${l.quarter}` : ''}</span>
                  <span className="to-data flex h-5 min-w-6 shrink-0 items-center justify-center rounded-to-sm bg-to-surface2 px-1.5 text-[10px] text-to-text2">
                    {l.num || '–'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-to-text2">{l.text}</span>
                  <span
                    className={`to-data shrink-0 text-[11px] font-bold ${l.pts ? (l.opp ? 'text-to-dangerText' : 'text-to-accent') : 'text-to-textDisabled'}`}
                  >
                    {l.pts ? `+${l.pts}` : ''}
                  </span>
                  {sourceEvent && (
                    <button
                      type="button"
                      onClick={() => openEditSheet(sourceEvent)}
                      aria-label="Eintrag ändern"
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                        isLast ? 'border-to-borderMatchday bg-to-accentSoft text-to-accent' : 'border-to-line bg-to-surface2 text-to-text3'
                      }`}
                    >
                      <PencilIcon size={13} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
        {!historyExpanded && logEntries.length > limit && (
          <button
            type="button"
            onClick={() => setHistoryExpanded(true)}
            className="to-data flex h-[42px] items-center justify-center border-t border-to-surface2 text-[9px] tracking-[0.08em] text-to-accent"
          >
            ALLE {logEntries.length} ANZEIGEN
          </button>
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

        {editTarget &&
          (() => {
            const cur = describeEvent(editTarget);
            const werList = editBankShown ? trackablePlayers : onCourtPlayers;
            const canShowBank = !editBankShown && benchPlayers.length > 0;
            return (
              <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={closeEditSheet}>
                <div
                  className="flex max-h-[92vh] w-full max-w-lg flex-col gap-3.5 overflow-y-auto rounded-t-[24px] border border-to-border bg-to-surface p-5 sm:rounded-b-[24px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={closeEditSheet}
                      aria-label="Schließen"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-to-line text-to-text2"
                    >
                      <XMarkIcon size={14} />
                    </button>
                    <span className="flex-1 text-[17px] font-semibold text-to-text">Aktion ändern</span>
                    <button
                      type="button"
                      disabled={!editWer || !editWas || busy}
                      onClick={saveEdit}
                      className="flex h-9 items-center rounded-to-pill bg-to-accent px-4 text-sm font-semibold text-to-onAccent disabled:opacity-40"
                    >
                      Sichern
                    </button>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-to-lg border border-to-border bg-to-surface2 px-3 py-2.5">
                    <span className="to-data text-[9px] text-to-textDisabled">{cur.quarter > 0 ? `Q${cur.quarter}` : ''}</span>
                    {cur.num && (
                      <span className="to-data flex h-5 min-w-6 items-center justify-center rounded-to-sm bg-to-surface2 px-1.5 text-[10px] text-to-text2">
                        {cur.num}
                      </span>
                    )}
                    <span className="flex-1 text-[13px] font-semibold text-to-text">{cur.text}</span>
                    <span className="to-data text-[11px] font-bold text-to-accent">{cur.pts ? `+${cur.pts}` : ''}</span>
                  </div>

                  <span className="to-data text-[9px] tracking-[0.12em] text-to-text3">WER</span>
                  <div className="flex flex-col gap-2.5">
                    {Array.from({ length: Math.ceil((werList.length + 1) / 3) }).map((_, i) => {
                      const cells: (Player | 'opponent')[] = [...werList, 'opponent' as const].slice(i * 3, i * 3 + 3);
                      return (
                        <div key={i} className="grid grid-cols-3 gap-2.5">
                          {cells.map((cell) =>
                            cell === 'opponent' ? (
                              <button
                                key="opponent"
                                type="button"
                                onClick={() => selectEditWer('opponent')}
                                className={`flex h-[54px] flex-col items-center justify-center gap-0.5 rounded-[14px] border ${
                                  editWer === 'opponent' ? 'border-to-accent bg-to-accentWash' : 'border-to-dangerFrame bg-to-dangerSoft'
                                }`}
                              >
                                <span className={`to-number text-[15px] leading-none ${editWer === 'opponent' ? 'text-to-accent' : 'text-to-dangerText'}`}>
                                  {editWas && OPPONENT_POINTS[editWas] ? `+${OPPONENT_POINTS[editWas]}` : '+2'}
                                </span>
                                <span className={`text-[11px] ${editWer === 'opponent' ? 'text-to-text' : 'text-to-dangerText'}`}>Gegner</span>
                              </button>
                            ) : (
                              <button
                                key={cell.id}
                                type="button"
                                onClick={() => selectEditWer(cell.id)}
                                className={`flex h-[54px] flex-col items-center justify-center gap-0.5 rounded-[14px] border ${
                                  editWer === cell.id ? 'border-to-accent bg-to-accentWash' : 'border-to-border bg-to-surface2'
                                }`}
                              >
                                <span className={`to-number text-[15px] leading-none ${editWer === cell.id ? 'text-to-accent' : 'text-to-text3'}`}>
                                  {numbers[cell.id] ?? '–'}
                                </span>
                                <span className={`text-[11px] ${editWer === cell.id ? 'text-to-text' : 'text-to-text2'}`}>
                                  {cell.name.split(' ')[0]}
                                </span>
                              </button>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {canShowBank && (
                    <button
                      type="button"
                      onClick={() => setEditBankShown(true)}
                      className="to-data text-center text-[9px] tracking-[0.08em] text-to-accent"
                    >
                      BANK ZEIGEN
                    </button>
                  )}

                  <span className="to-data text-[9px] tracking-[0.12em] text-to-text3">WAS</span>
                  <div className="flex flex-col gap-2">
                    {EDIT_WAS_ROWS.map((row, i) => (
                      <div key={i} className="flex gap-2.5">
                        {row.map((a) => {
                          const disabled = editWer === 'opponent' && !OPPONENT_ONLY_TYPES.includes(a.key);
                          const selected = editWas === a.key;
                          return (
                            <button
                              key={a.key}
                              type="button"
                              disabled={disabled}
                              onClick={() => setEditWas(a.key)}
                              className={`flex h-11 flex-1 items-center justify-center rounded-to-md border text-[13px] font-semibold disabled:opacity-30 ${
                                selected
                                  ? 'border-to-accent bg-to-accentWash text-to-accent'
                                  : a.bad
                                    ? 'border-to-dangerFrame bg-to-dangerSoft text-to-dangerText'
                                    : 'border-to-border bg-to-surface2 text-to-text2'
                              }`}
                            >
                              {a.label}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <span className="h-px bg-to-divider" />
                  <button
                    type="button"
                    onClick={() => askDeleteEvent(editTarget)}
                    className="flex h-[50px] items-center justify-center gap-2 rounded-to-pill border border-to-dangerFrame text-[15px] font-semibold text-to-dangerText"
                  >
                    <TrashIcon />
                    Eintrag löschen
                  </button>
                </div>
              </div>
            );
          })()}

        {confirmDeleteTarget &&
          (() => {
            const cur = describeEvent(confirmDeleteTarget);
            return (
              <div
                className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center"
                onClick={() => setConfirmDeleteTarget(null)}
              >
                <div
                  className="flex w-full max-w-lg flex-col gap-3.5 rounded-t-[24px] border border-to-border bg-to-surface p-5 sm:rounded-b-[24px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
                  <span className="text-[17px] font-semibold text-to-text">Eintrag löschen?</span>
                  <div className="flex items-center gap-2.5 rounded-to-lg border border-to-border bg-to-surface2 px-3 py-2.5">
                    <span className="to-data text-[9px] text-to-textDisabled">{cur.quarter > 0 ? `Q${cur.quarter}` : ''}</span>
                    {cur.num && (
                      <span className="to-data flex h-5 min-w-6 items-center justify-center rounded-to-sm bg-to-surface2 px-1.5 text-[10px] text-to-text2">
                        {cur.num}
                      </span>
                    )}
                    <span className="flex-1 text-[13px] font-semibold text-to-text">{cur.text}</span>
                    <span className="to-data text-[11px] font-bold text-to-accent">{cur.pts ? `+${cur.pts}` : ''}</span>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-to-lg border border-to-dangerFrame bg-to-dangerSoft p-3.5 text-xs leading-relaxed text-to-text2">
                    <TrashIcon />
                    <span>Der Eintrag verschwindet aus dem Verlauf. Punktestand und Boxscore rechnen sich neu – auch der Live-Ticker.</span>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={confirmDeleteEvent}
                    className="flex h-[52px] items-center justify-center rounded-to-pill bg-to-danger text-[15px] font-semibold text-[#120507] disabled:opacity-60"
                  >
                    Löschen
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteTarget(null)}
                    className="flex h-[50px] items-center justify-center rounded-to-pill border border-to-line text-[15px] font-semibold text-to-text2"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            );
          })()}
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
              <div key={i} className="grid grid-cols-2 gap-2.5">
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
        RosterGrid({
          label: subMode === 'out' ? 'WER GEHT RAUS?' : 'WER KOMMT REIN?',
          list,
          tileSize: wide ? 100 : 116,
          photoSize: wide ? 48 : 56,
          showCancel: true,
          onCancel: cancelSubstitution,
          onPick: (id) => (subMode === 'out' ? pickOutgoing(id) : confirmSubstitution(id)),
          selectedId: null
        })
      );
    }

    if (pendingAction && !wide) {
      return (
        <div className="flex flex-col gap-2">
          {LastTrackedRow()}
          {RosterGrid({
            label: `WER WAR ES? · ${STAT_TYPE_LABELS[pendingAction].toUpperCase()}`,
            rightLabel: OPPONENT_POINTS[pendingAction] ? `${OPPONENT_POINTS[pendingAction]} PUNKTE` : 'OHNE PUNKTE',
            list: pickablePlayers,
            tileSize: 102,
            photoSize: 56,
            showCancel: true,
            onCancel: cancelPicker,
            onPick: (id) => addStat('us', pendingAction, id),
            selectedId: pendingPlayer,
            opponent: OPPONENT_POINTS[pendingAction]
              ? { points: OPPONENT_POINTS[pendingAction]!, onPick: () => addStat('opponent', pendingAction, null) }
              : undefined
          })}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2.5">
        {LastTrackedRow()}
        {Keypad({ shotHeight: 114, actionHeight: 112 })}
        {CourtRow()}
        {HistoryPanel({ limit: 3 })}
        {SimpleBoxScore({ onlyCourt: false })}
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
        <p className="px-1 text-xs leading-relaxed text-to-textDisabled">Keine Spieluhr. Erst die Aktion, dann der Spieler.</p>
      </div>
    );
  }

  // ============ Querformat (ab 900px, drei Spalten) ============
  // Querformat (Element-24-Änderung §2/§4): "Aktion" und "Mannschaft" sind
  // jetzt EIN Panel mit zwei Zuständen (Tastenfeld/"Auf dem Feld" ODER
  // Spielerauswahl), statt zwei parallelen Panels von denen eines immer
  // funktionslos war. Damit entfällt zwangsläufig "erst Spieler, dann
  // Aktion" im Querformat — überall gilt jetzt erst Aktion, dann Spieler,
  // wie am Handy (§3). Rechts nur noch Verlauf + Box-Score, kein eigener
  // "Spiel beenden"-Knopf mehr (der sitzt jetzt oben im Kopf, siehe Header).
  function WideBody() {
    const picking = !!pendingAction || !!subMode;
    const pickTitle = subMode
      ? subMode === 'out'
        ? 'WER GEHT RAUS?'
        : 'WER KOMMT REIN?'
      : pendingAction
        ? `WER WAR ES? · ${STAT_TYPE_LABELS[pendingAction].toUpperCase()}`
        : '';
    const pickList = subMode === 'in' ? benchPlayers : subMode === 'out' ? onCourtPlayers : pickablePlayers;

    return (
      <div className="flex gap-3">
        <div
          className={`flex min-w-0 flex-1 flex-col gap-2.5 rounded-to-xl border bg-to-surface p-3 ${
            picking ? 'border-to-borderMatchday' : 'border-to-border'
          }`}
        >
          {trackablePlayers.length === 0 ? (
            <p className="text-sm text-to-text3">Kein Kader für dieses Spiel hinterlegt.</p>
          ) : useCourtSplit && onCourtIds.length < COURT_SIZE ? (
            // Startaufstellung, außerhalb des Umfangs dieser Änderung —
            // Logik/Größen unverändert gelassen.
            <div className="flex flex-col gap-2.5">
              <span className="to-data pl-0.5 text-[9px] tracking-[0.1em] text-to-text3">
                STARTAUFSTELLUNG ({onCourtIds.length}/{COURT_SIZE})
              </span>
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
          ) : picking ? (
            RosterGrid({
              label: pickTitle,
              rightLabel: !subMode && pendingAction ? (OPPONENT_POINTS[pendingAction] ? `${OPPONENT_POINTS[pendingAction]} PUNKTE` : 'OHNE PUNKTE') : undefined,
              list: pickList,
              tileSize: 124,
              photoSize: 48,
              showCancel: true,
              onCancel: subMode ? cancelSubstitution : cancelPicker,
              onPick: (id) => {
                if (subMode === 'out') pickOutgoing(id);
                else if (subMode === 'in') confirmSubstitution(id);
                else if (pendingAction) addStat('us', pendingAction, id);
              },
              selectedId: subMode ? null : pendingPlayer,
              cols: 3,
              opponent:
                !subMode && pendingAction && OPPONENT_POINTS[pendingAction]
                  ? { points: OPPONENT_POINTS[pendingAction]!, onPick: () => addStat('opponent', pendingAction, null) }
                  : undefined
            })
          ) : (
            <>
              {WideKeypad()}
              <div className="flex flex-col gap-2">
                <span className="to-data pl-0.5 text-[9px] tracking-[0.1em] text-to-text3">AUF DEM FELD</span>
                <div className="flex gap-1.5">
                  {onCourtPlayers.map((p) => (
                    <CourtAvatar
                      key={p.id}
                      player={p}
                      number={numbers[p.id]}
                      points={boxScore.find((b) => b.playerId === p.id)?.points ?? 0}
                      fouls={countPlayerFouls(events, p.id)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="mt-auto">{LastTrackedRow()}</div>
        </div>
        <div className="flex w-[300px] shrink-0 flex-col gap-3 max-[1000px]:w-[236px]">
          {HistoryPanel({ limit: 9, grow: true })}
          {SimpleBoxScore({ onlyCourt: true })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-to-bg pb-8">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-to-divider bg-to-surface px-4 py-3">
        <button type="button" onClick={goBack} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-to-text2">
          <BackChevronIcon />
          Zurück
        </button>
        <p className="min-w-0 flex-1 truncate text-right text-sm font-bold text-to-text">{game ? `vs. ${game.opponent}` : 'Spiel-Stats'}</p>
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
                {SimpleBoxScore({ onlyCourt: false })}
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
            {wide ? (
              <div className="flex flex-col gap-3">
                {Header({ withEndButton: true, wide: true })}
                {WideBody()}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {Header({ withEndButton: false, wide: false })}
                {TrackingBody({ wide: false })}
              </div>
            )}
            {Sheets()}
          </>
        )}
      </div>
    </div>
  );
}
