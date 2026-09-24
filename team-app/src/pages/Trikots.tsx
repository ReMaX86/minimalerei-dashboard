import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { useTipoffLoader } from '../hooks/useTipoffLoader';
import { TrikotPickSheet, type PickOption } from '../components/TrikotPickSheet';
import { fmtDateBadge, fmtDateShort, fmtTime, hasKickedOff } from '../lib/format';
import { latestTransferFrom, pendingWasherFor } from '../lib/trikots';
import { washRotationOrder } from '../lib/rotation';
import {
  benoetigterSatz,
  type Game,
  type GameSquadRow,
  type Player,
  type TrikotAskResolutionRow,
  type TrikotSetId,
  type TrikotSet,
  type TrikotHandoverLogRow,
  type TrikotTransferLogRow,
  type TrikotWashLogRow
} from '../types/database';

// Element 13 "Trikots" — Waschrotation, Übergabe, Nachfrage, Verlauf. Die
// fachliche Logik (Rotationsregel, Zähler, Berechtigungen) übernimmt
// unverändert aus rotation.ts/trikots.ts; dieser Screen ist die
// Neugestaltung von Darstellung + Wortwahl nach der Vorlage
// docs/design/tipoff-design/elements/13-trikots/.

const HALL = 'hall';

interface State {
  nextGame: Game | null;
  squad: GameSquadRow[];
  pastGame: Game | null;
  pastSquad: GameSquadRow[];
  players: Player[];
  sets: TrikotSet[];
  washLog: TrikotWashLogRow[];
  transferLog: TrikotTransferLogRow[];
  handoverLog: TrikotHandoverLogRow[];
  askResolutions: TrikotAskResolutionRow[];
}

interface ConfirmTarget {
  gameId: string;
  setId: TrikotSetId;
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

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Dots({ n }: { n: number }) {
  return (
    <span className="flex gap-[2px]">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`h-[5px] w-[5px] rounded-full ${i < n ? 'bg-to-accent' : 'bg-to-border'}`} />
      ))}
    </span>
  );
}

function KitSwatch({ setId, size }: { setId: TrikotSetId; size: number }) {
  const white = setId === 'weiss';
  return (
    <span
      className={`shrink-0 rounded-[30%] border ${white ? 'border-to-text bg-to-text' : 'border-to-lineMuted bg-to-bg'}`}
      style={{ width: size, height: size, borderRadius: size >= 30 ? 14 : 6 }}
    />
  );
}

export function Trikots() {
  const { player, isAdmin } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pickingAlternate, setPickingAlternate] = useState(false);
  const [handoverBusy, setHandoverBusy] = useState(false);

  const [handoverSetId, setHandoverSetId] = useState<TrikotSetId | null>(null);
  const [handoverDefault, setHandoverDefault] = useState<string>(HALL);
  const [transferBusy, setTransferBusy] = useState(false);

  const [askPicking, setAskPicking] = useState(false);
  const [askBusy, setAskBusy] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const today = new Date().toISOString().slice(0, 10);

    const [gameRes, pastGameRes, playersRes, setsRes, washRes, transferRes, handoverRes, askRes] = await Promise.all([
      supabase.from('games').select('*').gte('game_date', today).order('game_date').order('game_time').limit(1).maybeSingle(),
      supabase.from('games').select('*').lt('game_date', today).order('game_date', { ascending: false }).order('game_time', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('players').select('*').eq('is_active', true),
      supabase.from('trikot_sets').select('*').order('id'),
      supabase.from('trikot_wash_log').select('*').order('created_at', { ascending: false }),
      supabase.from('trikot_transfer_log').select('*').order('created_at', { ascending: false }),
      supabase.from('trikot_handover_log').select('*').order('created_at', { ascending: false }),
      supabase.from('trikot_ask_resolutions').select('*')
    ]);

    if (
      gameRes.error ||
      pastGameRes.error ||
      playersRes.error ||
      setsRes.error ||
      washRes.error ||
      transferRes.error ||
      handoverRes.error ||
      askRes.error
    ) {
      setError('Fehler beim Laden der Trikot-Daten.');
      return;
    }

    let squad: GameSquadRow[] = [];
    if (gameRes.data) {
      const { data: squadRows } = await supabase.from('game_squad').select('*').eq('game_id', gameRes.data.id);
      squad = (squadRows as GameSquadRow[]) ?? [];
    }

    let pastSquad: GameSquadRow[] = [];
    if (pastGameRes.data) {
      const { data: pastSquadRows } = await supabase.from('game_squad').select('*').eq('game_id', pastGameRes.data.id);
      pastSquad = (pastSquadRows as GameSquadRow[]) ?? [];
    }

    setState({
      nextGame: (gameRes.data as Game) ?? null,
      squad,
      pastGame: (pastGameRes.data as Game) ?? null,
      pastSquad,
      players: (playersRes.data as Player[]) ?? [],
      sets: (setsRes.data as TrikotSet[]) ?? [],
      washLog: (washRes.data as TrikotWashLogRow[]) ?? [],
      transferLog: (transferRes.data as TrikotTransferLogRow[]) ?? [],
      handoverLog: (handoverRes.data as TrikotHandoverLogRow[]) ?? [],
      askResolutions: (askRes.data as TrikotAskResolutionRow[]) ?? []
    });
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Trikot-Daten.'));
  }, [load]);

  const showLoader = useTipoffLoader(!state);

  if (error) return <ErrorNote message={error} />;
  if (showLoader) return <LoadingSpinner />;
  if (!state) return null;

  const gameStarted = !!state.nextGame && hasKickedOff(state.nextGame.game_date, state.nextGame.game_time);

  const washCount: Record<string, number> = {};
  state.washLog.forEach((row) => {
    washCount[row.player_id] = (washCount[row.player_id] ?? 0) + 1;
  });

  const neededSet = state.nextGame ? benoetigterSatz(state.nextGame) : null;
  const confirmedForGame = state.nextGame
    ? state.washLog.find((w) => w.game_id === state.nextGame!.id && w.set_id === neededSet) ?? null
    : null;
  const suggestion = state.nextGame ? pendingWasherFor(state.nextGame, state.squad, state.players, state.washLog)?.player ?? null : null;
  const isMe = !!suggestion && player?.id === suggestion.id;
  const phase: 'before' | 'live' | 'done' = confirmedForGame ? 'done' : gameStarted && isMe ? 'live' : 'before';

  const pastNeededSet = state.pastGame ? benoetigterSatz(state.pastGame) : null;
  const pastSuggestion = state.pastGame
    ? pendingWasherFor(state.pastGame, state.pastSquad, state.players, state.washLog)?.player ?? null
    : null;
  const canConfirmPast =
    !!pastSuggestion && (isAdmin || player?.id === pastSuggestion.id || player?.is_captain || player?.is_co_captain);
  const askResolved = state.askResolutions.some((r) => r.game_id === state.pastGame?.id && r.set_id === pastNeededSet);
  const showAsk = !!state.pastGame && !!pastNeededSet && !!pastSuggestion && !askResolved;

  const playersById: Record<string, Player> = {};
  state.players.forEach((p) => (playersById[p.id] = p));

  async function confirmHandover(target: ConfirmTarget, playerId: string, suggestedPlayerId: string) {
    setHandoverBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('confirm_trikot_handover', {
        p_set_id: target.setId,
        p_player_id: playerId,
        p_game_id: target.gameId,
        p_suggested_player_id: suggestedPlayerId
      });
      if (rpcError) throw rpcError;
      setPickingAlternate(false);
      await load();
    } catch {
      setError('Übergabe konnte nicht bestätigt werden.');
    } finally {
      setHandoverBusy(false);
    }
  }

  async function transferSet(setId: TrikotSetId, toPlayerId: string | null) {
    setTransferBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('transfer_trikot_set', { p_set_id: setId, p_to_player_id: toPlayerId });
      if (rpcError) throw rpcError;
      setHandoverSetId(null);
      await load();
    } catch {
      setError('Übergabe konnte nicht gespeichert werden.');
    } finally {
      setTransferBusy(false);
    }
  }

  async function resolveAskNo(toPlayerId: string | null) {
    if (!state!.pastGame || !pastNeededSet) return;
    setAskBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('resolve_trikot_ask_no', {
        p_game_id: state!.pastGame.id,
        p_set_id: pastNeededSet,
        p_to_player_id: toPlayerId
      });
      if (rpcError) throw rpcError;
      setAskPicking(false);
      await load();
    } catch {
      setError('Konnte nicht gespeichert werden.');
    } finally {
      setAskBusy(false);
    }
  }

  function canActOnSet(set: TrikotSet): boolean {
    if (isAdmin) return true;
    if (player?.is_captain || player?.is_co_captain) return true;
    if (set.current_holder_id) return player?.id === set.current_holder_id;
    return !!player;
  }

  // "Wer übernimmt das Waschen?" — nur Kader-Mitglieder, nach der
  // Rotationsregel geordnet, der Vorschlagende selbst ausgeschlossen.
  const declineOptions: PickOption[] = suggestion
    ? washRotationOrder(state.players, state.squad, washCount)
        .filter((r) => r.inSquad && r.player.id !== suggestion.id)
        .map((r) => ({ id: r.player.id, avatarLabel: initialsOf(r.player.name), name: r.player.name, meta: `${r.washCount}× GEWASCHEN` }))
    : [];

  // "Wer hat den Satz jetzt?" / "Wer hat das Set dann?" — alle Teammitglieder
  // plus "In der Halle abgelegt". TRAINER-Meta = admin-geflaggter Spieler
  // (spielender Trainer), da die separate trainers-Tabelle keine eigene
  // player_id hat und ein Satz laut Schema nur an players gehen kann.
  function teamOptions(excludeId?: string | null): PickOption[] {
    const rows: PickOption[] = state!.players
      .filter((p) => p.id !== excludeId)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map((p) => ({
        id: p.id,
        avatarLabel: initialsOf(p.name),
        name: p.name,
        meta: p.is_admin ? 'TRAINER' : p.id === player?.id ? 'DU' : ''
      }));
    return [...rows, { id: HALL, avatarLabel: '—', name: 'In der Halle abgelegt', meta: 'NIEMAND' }];
  }

  return (
    <div className="flex flex-col gap-3.5">
      {showAsk && state.pastGame && pastSuggestion && (
        <section className="flex flex-col gap-3.5 rounded-to-2xl border border-to-danger/30 bg-to-dangerSoft px-5 py-[18px]">
          <span className="to-data text-[10px] tracking-[0.12em] text-to-dangerText">BITTE NACHTRAGEN</span>
          <div className="flex items-center gap-3">
            <span className="to-data flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-to-surface2 text-xs text-to-text2">
              {initialsOf(pastSuggestion.name)}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-[16px] font-semibold leading-tight -tracking-[0.01em] text-to-text">
                Hat {pastSuggestion.name.split(' ')[0]} die Trikots mitgenommen?
              </p>
              <p className="to-data text-[11px] text-to-text3">
                {fmtDateBadge(state.pastGame.game_date)} · GEGEN {state.pastGame.opponent.toUpperCase()}
              </p>
            </div>
          </div>

          {canConfirmPast ? (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={handoverBusy}
                onClick={() =>
                  confirmHandover({ gameId: state.pastGame!.id, setId: pastNeededSet! }, pastSuggestion.id, pastSuggestion.id)
                }
                className="btn-primary !h-[52px] text-[15px]"
              >
                Ja, hat er
              </button>
              <button
                type="button"
                disabled={askBusy}
                onClick={() => setAskPicking(true)}
                className="flex h-[52px] items-center justify-center rounded-to-md border border-to-danger/30 text-[15px] font-semibold text-to-dangerText"
              >
                Nein
              </button>
            </div>
          ) : (
            <p className="text-xs text-to-text3">
              Nur {pastSuggestion.name}, Captains oder der Trainer können das beantworten.
            </p>
          )}
        </section>
      )}

      {state.nextGame && neededSet && (
        <section className={`flex flex-col overflow-hidden rounded-to-2xl border bg-to-surface ${state.nextGame.squad_published ? 'border-to-borderMatchday' : 'border-to-border'}`}>
          <div className="flex items-center gap-3.5 px-5 py-[18px]">
            <KitSwatch setId={neededSet} size={44} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="to-data text-[10px] tracking-[0.12em] text-to-text3">
                FÜR {fmtDateBadge(state.nextGame.game_date)} BENÖTIGT
              </span>
              <span className="text-[17px] font-semibold -tracking-[0.01em] text-to-text">
                {neededSet === 'weiss' ? 'Weißes' : 'Schwarzes'} Set · {state.nextGame.is_home ? 'Heim' : 'Auswärts'}
              </span>
            </div>
          </div>

          {!state.nextGame.squad_published ? (
            <div className="border-t border-to-divider px-5 pb-5 pt-4">
              <p className="text-sm text-to-text3">
                Kader für dieses Spiel noch nicht veröffentlicht – sobald er steht, schlägt die App den nächsten Wäscher vor.
              </p>
            </div>
          ) : !suggestion ? (
            <div className="border-t border-to-divider bg-to-surface2 px-5 pb-5 pt-4">
              <p className="text-sm text-to-text3">Niemand aus dem Kader verfügbar.</p>
            </div>
          ) : (
            <div className={`flex flex-col gap-3 border-t border-to-divider px-5 pb-5 pt-4 ${phase === 'live' ? 'bg-to-accentWash' : 'bg-to-surface2'}`}>
              {phase === 'done' && (
                <>
                  <span className="to-data text-[10px] tracking-[0.12em] text-to-accent">ERLEDIGT</span>
                  <div className="flex items-center gap-3.5">
                    <span className="to-data flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-to-accent text-[13px] text-to-accent">
                      {initialsOf(suggestion.name)}
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="to-display-sm text-to-text">{suggestion.name}</p>
                      <p className="text-[13px] text-to-text2">nimmt das Set nach dem Spiel mit</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-to-md bg-to-accentSoft px-3.5 py-2.5 text-to-accent">
                    <CheckIcon />
                    <span className="text-[13px]">Übernahme bestätigt · Waschzähler steht jetzt bei {washCount[suggestion.id] ?? 0}×</span>
                  </div>
                </>
              )}

              {phase === 'before' && (
                <>
                  <span className="to-data text-[10px] tracking-[0.12em] text-to-accent">NÄCHSTER WÄSCHER</span>
                  <div className="flex items-center gap-3.5">
                    <span className="to-data flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-to-accent text-[13px] text-to-accent">
                      {initialsOf(suggestion.name)}
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="to-display-sm text-to-text">{suggestion.name}</p>
                      <p className="text-[13px] text-to-text2">nimmt das Set nach dem Spiel mit</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-to-md bg-to-surface2 px-3.5 py-2.5 text-to-text2">
                    <span className="shrink-0 text-to-text3">
                      <ClockIcon />
                    </span>
                    <span className="text-[13px]">Bestätigen ab Spielbeginn, {fmtTime(state.nextGame.game_time)} Uhr</span>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2.5 border-t border-to-divider pt-2.5">
                      <span className="to-label flex-1">TRAINER</span>
                      <button type="button" onClick={() => setPickingAlternate(true)} className="text-[13px] font-semibold text-to-accent">
                        Anderen bestimmen
                      </button>
                    </div>
                  )}
                </>
              )}

              {phase === 'live' && (
                <>
                  <span className="to-data text-[10px] tracking-[0.12em] text-to-accent">DU BIST DRAN</span>
                  <p className="text-[13px] text-to-text2">Nimmst du das {neededSet === 'weiss' ? 'weiße' : 'schwarze'} Set heute mit nach Hause?</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={handoverBusy}
                      onClick={() => confirmHandover({ gameId: state.nextGame!.id, setId: neededSet }, suggestion.id, suggestion.id)}
                      className="btn-primary flex !h-[52px] items-center justify-center gap-2 text-[15px]"
                    >
                      <CheckIcon />
                      Nehme ich mit
                    </button>
                    <button
                      type="button"
                      disabled={handoverBusy}
                      onClick={() => setPickingAlternate(true)}
                      className="flex h-[52px] items-center justify-center gap-2 rounded-to-md border border-to-line text-[15px] font-semibold text-to-text"
                    >
                      <XIcon />
                      Kann nicht
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      <span className="to-label">WO SIND DIE SÄTZE GERADE</span>
      <div className="grid grid-cols-2 gap-2.5">
        {state.sets.map((set) => {
          const isHeld = !!set.current_holder_id;
          const holderName = isHeld ? playersById[set.current_holder_id!]?.name ?? '—' : 'In der Halle';
          const iAmHolder = isHeld && set.current_holder_id === player?.id;
          const actionLabel = iAmHolder ? 'Jemandem geben' : 'Ich hab ihn';
          return (
            <div key={set.id} className="flex flex-col gap-2.5 rounded-to-xl border border-to-border bg-to-surface p-4">
              <div className="flex items-center gap-2">
                <KitSwatch setId={set.id} size={20} />
                <span className="to-label leading-tight">{set.label}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className={`text-[15px] font-semibold -tracking-[0.01em] ${isHeld ? 'text-to-text' : 'text-to-text2'}`}>{holderName}</span>
                <span className="to-data text-[10px] text-to-textDisabled">
                  {isHeld ? 'SEIT' : 'ABGEGEBEN'} {set.since ? fmtDateShort(set.since) : '—'}
                </span>
              </div>
              {canActOnSet(set) && (
                <button
                  type="button"
                  onClick={() => {
                    setHandoverSetId(set.id);
                    setHandoverDefault(iAmHolder || !isHeld ? HALL : player?.id ?? HALL);
                  }}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="text-[13px] font-semibold text-to-accent">{actionLabel}</span>
                  <span className="text-[11px] text-to-textDisabled">zählt nicht als Wäsche</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <span className="to-label">REIHENFOLGE</span>
      <div className="flex flex-col overflow-hidden rounded-to-xl border border-to-border bg-to-surface pb-3">
        {washRotationOrder(state.players, state.squad, washCount).map((row, i) => {
          const isNext = i === 0 && row.inSquad;
          return (
            <div
              key={row.player.id}
              className={`flex min-h-[50px] items-center gap-3 border-t border-to-surface2 px-4 first:border-t-0 ${isNext ? 'bg-to-accentWash' : ''}`}
            >
              <span className={`to-data w-3.5 shrink-0 text-[11px] ${isNext ? 'text-to-accent' : 'text-to-text3'}`}>
                {row.inSquad ? i + 1 : '—'}
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={`truncate text-sm ${isNext ? 'font-bold text-to-accent' : row.inSquad ? 'font-medium text-to-text' : 'font-medium text-to-text3'}`}
                >
                  {row.player.name}
                </span>
                <span
                  className={`to-data inline-flex h-[18px] shrink-0 items-center rounded-to-pill px-1.5 text-[8px] font-semibold ${
                    row.inSquad ? 'bg-to-accentSoft text-to-accent' : 'bg-to-surface2 text-to-text3'
                  }`}
                >
                  {row.inSquad ? 'IM KADER' : 'NICHT IM KADER'}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Dots n={row.washCount} />
                <span className={`to-data w-6 text-right text-xs ${isNext ? 'text-to-accent' : row.inSquad ? 'text-to-text2' : 'text-to-textDisabled'}`}>
                  {row.washCount}×
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <span className="to-label">VERLAUF</span>
      {(() => {
        type HistoryRow =
          | { kind: 'wash'; id: string; created_at: string; setId: TrikotSetId; playerId: string; gameId: string | null }
          | { kind: 'transfer'; id: string; created_at: string; setId: TrikotSetId; fromId: string | null; toId: string | null };
        const handoverByGameSet: Record<string, TrikotHandoverLogRow> = {};
        state.handoverLog.forEach((h) => {
          handoverByGameSet[`${h.game_id}:${h.set_id}`] = h;
        });
        const history: HistoryRow[] = [
          ...state.washLog.map(
            (w): HistoryRow => ({ kind: 'wash', id: w.id, created_at: w.created_at, setId: w.set_id, playerId: w.player_id, gameId: w.game_id })
          ),
          ...state.transferLog.map(
            (t): HistoryRow => ({ kind: 'transfer', id: t.id, created_at: t.created_at, setId: t.set_id, fromId: t.from_player_id, toId: t.to_player_id })
          )
        ].sort((a, b) => b.created_at.localeCompare(a.created_at));

        if (history.length === 0) {
          return <p className="rounded-to-xl border border-to-border bg-to-surface p-4 text-sm text-to-text3">Noch keine Übergaben erfasst.</p>;
        }

        const shown = historyOpen ? history : history.slice(0, 5);

        return (
          <div className="flex flex-col overflow-hidden rounded-to-xl border border-to-border bg-to-surface pb-3">
            {shown.map((row) => {
              let name: string;
              let sub: string;
              let kind: 'wash' | 'transfer';
              if (row.kind === 'wash') {
                kind = 'wash';
                name = playersById[row.playerId]?.name ?? '?';
                const handover = row.gameId ? handoverByGameSet[`${row.gameId}:${row.setId}`] : undefined;
                if (handover?.suggested_player_id && handover.suggested_player_id !== handover.confirmed_player_id) {
                  const suggestedName = playersById[handover.suggested_player_id]?.name ?? '?';
                  sub = `Vorschlag war ${suggestedName} · ${suggestedName.split(' ')[0]} konnte nicht`;
                } else if (handover) {
                  sub = 'Vorschlag bestätigt';
                } else {
                  sub = '';
                }
              } else {
                kind = 'transfer';
                const fromLabel = row.fromId ? playersById[row.fromId]?.name ?? '?' : 'niemandem';
                if (row.toId) {
                  name = playersById[row.toId]?.name ?? '?';
                  sub = `von ${fromLabel} weitergegeben · keine Wäsche`;
                } else {
                  name = 'In der Halle abgelegt';
                  sub = `von ${fromLabel} abgegeben · keine Wäsche`;
                }
              }
              return (
                <div key={`${row.kind}-${row.id}`} className="flex gap-3 border-t border-to-surface2 px-4 py-3 first:border-t-0">
                  <KitSwatch setId={row.setId} size={16} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`to-data inline-flex h-[17px] shrink-0 items-center rounded-to-pill px-1.5 text-[8px] font-semibold ${
                          kind === 'wash' ? 'bg-to-accentSoft text-to-accent' : 'bg-to-surface2 text-to-text3'
                        }`}
                      >
                        {kind === 'wash' ? 'WÄSCHE' : 'ÜBERGABE'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold -tracking-[0.01em] text-to-text">{name}</span>
                      <span className="to-data shrink-0 text-[11px] text-to-textDisabled">{fmtDateShort(row.created_at.slice(0, 10))}</span>
                    </div>
                    {sub && <span className="text-xs leading-snug text-to-text3">{sub}</span>}
                  </div>
                </div>
              );
            })}
            {history.length > 5 && (
              <button
                type="button"
                onClick={() => setHistoryOpen((o) => !o)}
                className="mt-1.5 flex min-h-[44px] items-center gap-2 border-t border-to-surface2 px-4 pt-2 text-left text-[13px] text-to-text2"
              >
                <span className="flex-1">{historyOpen ? 'Weniger anzeigen' : 'Ganzen Verlauf anzeigen'}</span>
                <ChevronIcon open={historyOpen} />
              </button>
            )}
          </div>
        );
      })()}

      {pickingAlternate && suggestion && neededSet && state.nextGame && (
        <TrikotPickSheet
          title="Wer übernimmt das Waschen?"
          subtitle="Vorschläge in der Reihenfolge: im Kader, wenigste Wäschen, alphabetisch. Der Waschzähler zählt bei der Person hoch."
          options={declineOptions}
          defaultId={declineOptions[0]?.id ?? ''}
          cta="Weitergeben"
          busy={handoverBusy}
          onConfirm={(id) => confirmHandover({ gameId: state.nextGame!.id, setId: neededSet }, id, suggestion.id)}
          onCancel={() => setPickingAlternate(false)}
        />
      )}

      {handoverSetId && (
        <TrikotPickSheet
          title="Wer hat den Satz jetzt?"
          subtitle="Nur wer ihn gerade zu Hause oder dabei hat. Der Waschzähler ändert sich dadurch NICHT – gewaschen hat weiterhin, wer ihn mitgenommen hat."
          options={teamOptions(state.sets.find((s) => s.id === handoverSetId)?.current_holder_id)}
          defaultId={handoverDefault}
          cta="Weitergeben"
          busy={transferBusy}
          onConfirm={(id) => transferSet(handoverSetId, id === HALL ? null : id)}
          onCancel={() => setHandoverSetId(null)}
        />
      )}

      {askPicking && (
        <TrikotPickSheet
          title="Wer hat das Set dann?"
          subtitle={`${pastSuggestion?.name.split(' ')[0] ?? 'Er'} hat es nicht mitgenommen. Sag kurz, wo es gelandet ist – der Waschzähler zählt nur bei dem hoch, der wirklich wäscht.`}
          options={teamOptions()}
          defaultId={HALL}
          cta="Speichern"
          busy={askBusy}
          onConfirm={(id) => resolveAskNo(id === HALL ? null : id)}
          onCancel={() => setAskPicking(false)}
        />
      )}
    </div>
  );
}
