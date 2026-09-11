import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { fmtDate, fmtDateShort } from '../lib/format';
import { pendingWasherFor } from '../lib/trikots';
import { benoetigterSatz, type Game, type GameSquadRow, type Player, type TrikotSetId, type TrikotSet, type TrikotWashLogRow } from '../types/database';

interface State {
  nextGame: Game | null;
  squad: GameSquadRow[];
  pastGame: Game | null;
  pastSquad: GameSquadRow[];
  players: Player[];
  sets: TrikotSet[];
  washLog: TrikotWashLogRow[];
}

interface ConfirmTarget {
  gameId: string;
  setId: TrikotSetId;
}

export function Trikots() {
  const { player, isAdmin } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pickingAlternate, setPickingAlternate] = useState(false);
  const [alternateId, setAlternateId] = useState('');
  const [pastConfirming, setPastConfirming] = useState(false);
  const [pastPickingAlternate, setPastPickingAlternate] = useState(false);
  const [pastAlternateId, setPastAlternateId] = useState('');

  const load = useCallback(async () => {
    setError(null);
    const today = new Date().toISOString().slice(0, 10);

    const [gameRes, pastGameRes, playersRes, setsRes, washRes] = await Promise.all([
      supabase.from('games').select('*').gte('game_date', today).order('game_date').order('game_time').limit(1).maybeSingle(),
      supabase.from('games').select('*').lt('game_date', today).order('game_date', { ascending: false }).order('game_time', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('players').select('*').eq('is_active', true),
      supabase.from('trikot_sets').select('*').order('id'),
      supabase.from('trikot_wash_log').select('*').order('created_at', { ascending: false })
    ]);

    if (gameRes.error || pastGameRes.error || playersRes.error || setsRes.error || washRes.error) {
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
      washLog: (washRes.data as TrikotWashLogRow[]) ?? []
    });
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Trikot-Daten.'));
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!state) return <LoadingSpinner />;

  const today = new Date().toISOString().slice(0, 10);
  const isGameDay = !!state.nextGame && state.nextGame.game_date === today;

  const washCount: Record<string, number> = {};
  state.washLog.forEach((row) => {
    washCount[row.player_id] = (washCount[row.player_id] ?? 0) + 1;
  });

  const neededSet = state.nextGame ? benoetigterSatz(state.nextGame) : null;
  const confirmedForGame = state.nextGame
    ? state.washLog.find((w) => w.game_id === state.nextGame!.id && w.set_id === neededSet) ?? null
    : null;
  const suggestion = state.nextGame ? pendingWasherFor(state.nextGame, state.squad, state.players, state.washLog)?.player ?? null : null;
  const canConfirm =
    !!suggestion && (isAdmin || player?.id === suggestion.id || player?.is_captain || player?.is_co_captain);

  const pastNeededSet = state.pastGame ? benoetigterSatz(state.pastGame) : null;
  const pastSuggestion = state.pastGame
    ? pendingWasherFor(state.pastGame, state.pastSquad, state.players, state.washLog)?.player ?? null
    : null;
  const canConfirmPast =
    !!pastSuggestion && (isAdmin || player?.id === pastSuggestion.id || player?.is_captain || player?.is_co_captain);

  const selectedIds = new Set(state.squad.filter((s) => s.is_selected).map((s) => s.player_id));
  const pastSelectedIds = new Set(state.pastSquad.filter((s) => s.is_selected).map((s) => s.player_id));
  const sortedPlayers = [...state.players].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const playersById: Record<string, Player> = {};
  state.players.forEach((p) => (playersById[p.id] = p));

  async function confirmHandover(
    target: ConfirmTarget,
    playerId: string,
    setters: {
      setConfirming: (v: boolean) => void;
      setPickingAlternate: (v: boolean) => void;
      setAlternateId: (v: string) => void;
    }
  ) {
    setters.setConfirming(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('confirm_trikot_handover', {
        p_set_id: target.setId,
        p_player_id: playerId,
        p_game_id: target.gameId
      });
      if (rpcError) throw rpcError;
      setters.setPickingAlternate(false);
      setters.setAlternateId('');
      await load();
    } catch {
      setError('Übergabe konnte nicht bestätigt werden.');
    } finally {
      setters.setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      {state.pastGame && pastNeededSet && pastSuggestion && (
        <section className="card !bg-tbw-red/10 !ring-tbw-red/30 border-l-4 border-tbw-red">
          <p className="text-xs font-semibold uppercase tracking-wide text-tbw-red">Bitte nachtragen</p>
          <p className="mt-1 text-sm font-bold text-tbw-navyDark">
            Hat {pastSuggestion.name} beim Spiel vs. {state.pastGame.opponent} die Trikots mitgenommen?
          </p>
          <p className="mt-0.5 text-xs text-tbw-ink/50">{fmtDate(state.pastGame.game_date)}</p>

          {canConfirmPast && !pastPickingAlternate && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() =>
                  confirmHandover({ gameId: state.pastGame!.id, setId: pastNeededSet }, pastSuggestion.id, {
                    setConfirming: setPastConfirming,
                    setPickingAlternate: setPastPickingAlternate,
                    setAlternateId: setPastAlternateId
                  })
                }
                disabled={pastConfirming}
                className="btn-primary flex-1 !bg-status-ok"
              >
                Ja
              </button>
              <button
                onClick={() => setPastPickingAlternate(true)}
                disabled={pastConfirming}
                className="btn-secondary flex-1 !text-tbw-red !ring-tbw-red/30"
              >
                Nein
              </button>
            </div>
          )}

          {canConfirmPast && pastPickingAlternate && (
            <div className="mt-3 space-y-2 rounded-xl bg-white/70 p-3">
              <p className="text-sm text-tbw-ink/70">Wer hat das Set stattdessen mitgenommen?</p>
              <select className="input" value={pastAlternateId} onChange={(e) => setPastAlternateId(e.target.value)}>
                <option value="">Spieler wählen…</option>
                {sortedPlayers
                  .filter((p) => p.id !== pastSuggestion.id && pastSelectedIds.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    confirmHandover({ gameId: state.pastGame!.id, setId: pastNeededSet }, pastAlternateId, {
                      setConfirming: setPastConfirming,
                      setPickingAlternate: setPastPickingAlternate,
                      setAlternateId: setPastAlternateId
                    })
                  }
                  disabled={!pastAlternateId || pastConfirming}
                  className="btn-primary flex-1"
                >
                  {pastConfirming ? 'Speichere…' : 'Bestätigen'}
                </button>
                <button
                  onClick={() => {
                    setPastPickingAlternate(false);
                    setPastAlternateId('');
                  }}
                  disabled={pastConfirming}
                  className="btn-secondary flex-1"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {!canConfirmPast && (
            <p className="mt-2 text-xs text-tbw-ink/60">
              Nur {pastSuggestion.name}, Captains oder der Trainer können das bestätigen.
            </p>
          )}
        </section>
      )}

      {state.nextGame && neededSet && (
        <section className="card border-l-4 border-tbw-gold">
          <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/50">
            Für {fmtDate(state.nextGame.game_date)} gegen {state.nextGame.opponent} benötigt
          </p>
          <p className="mt-1 text-lg font-bold text-tbw-navyDark">
            {neededSet === 'weiss' ? 'Weißes' : 'Schwarzes'} Trikot-Set
          </p>
          {!state.nextGame.squad_published ? (
            <p className="mt-2 text-sm text-tbw-ink/50">Kader für dieses Spiel noch nicht veröffentlicht.</p>
          ) : confirmedForGame ? (
            <div className="mt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-tbw-navy/70">🧺 Trikotwäscher</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="pill pill-ok">✓ Bestätigt</span>
                <p className="text-sm font-semibold text-tbw-navyDark">
                  {playersById[confirmedForGame.player_id]?.name ?? '?'}
                </p>
              </div>
            </div>
          ) : suggestion ? (
            <div className="mt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-tbw-navy/70">
                🧺 Nächster Trikotwäscher
              </p>
              <p className="mt-0.5 text-lg font-bold text-tbw-navyDark">{suggestion.name}</p>
              <p className="text-xs text-tbw-ink/50">
                nimmt das Set nach diesem Spiel zum Waschen mit nach Hause
              </p>

              {!isGameDay && (
                <p className="mt-2 text-xs text-tbw-ink/40">Bestätigen kann {suggestion.name} ab dem Spieltag.</p>
              )}

              {isGameDay && canConfirm && !pickingAlternate && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() =>
                      confirmHandover({ gameId: state.nextGame!.id, setId: neededSet }, suggestion.id, {
                        setConfirming,
                        setPickingAlternate,
                        setAlternateId
                      })
                    }
                    disabled={confirming}
                    className="btn-primary flex-1 !bg-status-ok"
                  >
                    ✓ Übernimmt
                  </button>
                  <button
                    onClick={() => setPickingAlternate(true)}
                    disabled={confirming}
                    className="btn-secondary flex-1 !text-tbw-red !ring-tbw-red/30"
                  >
                    ✗ Kann nicht
                  </button>
                </div>
              )}

              {isGameDay && canConfirm && pickingAlternate && (
                <div className="mt-3 space-y-2 rounded-xl bg-tbw-bg p-3">
                  <p className="text-sm text-tbw-ink/70">Wer nimmt das Set stattdessen mit nach Hause?</p>
                  <select
                    className="input"
                    value={alternateId}
                    onChange={(e) => setAlternateId(e.target.value)}
                  >
                    <option value="">Spieler wählen…</option>
                    {sortedPlayers
                      .filter((p) => p.id !== suggestion.id && selectedIds.has(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        confirmHandover({ gameId: state.nextGame!.id, setId: neededSet }, alternateId, {
                          setConfirming,
                          setPickingAlternate,
                          setAlternateId
                        })
                      }
                      disabled={!alternateId || confirming}
                      className="btn-primary flex-1"
                    >
                      {confirming ? 'Speichere…' : 'Bestätigen'}
                    </button>
                    <button
                      onClick={() => {
                        setPickingAlternate(false);
                        setAlternateId('');
                      }}
                      disabled={confirming}
                      className="btn-secondary flex-1"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-tbw-ink/50">Niemand aus dem Kader verfügbar.</p>
          )}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        {state.sets.map((set) => (
          <div key={set.id} className="card">
            <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/50">
              {set.label.split(' · ').map((part, i) => (
                <span key={i} className="block">
                  {part}
                </span>
              ))}
            </p>
            <p className="mt-1 font-bold text-tbw-navyDark">
              {set.current_holder_id ? playersById[set.current_holder_id]?.name ?? '—' : 'Niemand'}
            </p>
            {set.since && <p className="text-xs text-tbw-ink/50">seit {fmtDateShort(set.since)}</p>}
          </div>
        ))}
      </section>

      <section className="card">
        <p className="mb-2 text-sm font-bold text-tbw-navyDark">Spieler</p>
        <ul className="divide-y divide-black/5">
          {sortedPlayers.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-tbw-navyDark">{p.name}</span>
                {suggestion?.id === p.id && <span className="pill pill-warn">nächster dran</span>}
              </div>
              <div className="flex items-center gap-2 text-tbw-ink/60">
                {state.nextGame && (
                  <span className={selectedIds.has(p.id) ? 'pill pill-ok' : 'pill pill-open'}>
                    {selectedIds.has(p.id) ? 'im Kader' : 'nicht im Kader'}
                  </span>
                )}
                <span>{washCount[p.id] ?? 0}×</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <p className="mb-2 text-sm font-bold text-tbw-navyDark">Verlauf</p>
        {state.washLog.length === 0 ? (
          <p className="text-sm text-tbw-ink/50">Noch keine Übergaben erfasst.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {state.washLog.slice(0, 15).map((row) => (
              <li key={row.id} className="flex items-center justify-between">
                <span className="text-tbw-ink/70">
                  {row.set_id === 'weiss' ? 'Weiß' : 'Schwarz'} → {playersById[row.player_id]?.name ?? '?'}
                </span>
                <span className="text-xs text-tbw-ink/40">{fmtDateShort(row.created_at.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
