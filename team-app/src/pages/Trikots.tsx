import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { fmtDate, fmtDateShort } from '../lib/format';
import { naechsterSpieler } from '../lib/rotation';
import { benoetigterSatz, type Game, type GameSquadRow, type Player, type TrikotSet, type TrikotWashLogRow } from '../types/database';

interface State {
  nextGame: Game | null;
  squad: GameSquadRow[];
  players: Player[];
  sets: TrikotSet[];
  lastAssignedPlayerId: string | null;
  washLog: TrikotWashLogRow[];
}

export function Trikots() {
  const { role, player } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pickingAlternate, setPickingAlternate] = useState(false);
  const [alternateId, setAlternateId] = useState('');

  const load = useCallback(async () => {
    setError(null);
    const today = new Date().toISOString().slice(0, 10);

    const [gameRes, playersRes, setsRes, rotationRes, washRes] = await Promise.all([
      supabase.from('games').select('*').gte('game_date', today).order('game_date').order('game_time').limit(1).maybeSingle(),
      supabase.from('players').select('*').eq('is_active', true),
      supabase.from('trikot_sets').select('*').order('id'),
      supabase.from('trikot_rotation_state').select('*').eq('id', 1).maybeSingle(),
      supabase.from('trikot_wash_log').select('*').order('created_at', { ascending: false })
    ]);

    if (gameRes.error || playersRes.error || setsRes.error || rotationRes.error || washRes.error) {
      setError('Fehler beim Laden der Trikot-Daten.');
      return;
    }

    let squad: GameSquadRow[] = [];
    if (gameRes.data) {
      const { data: squadRows } = await supabase.from('game_squad').select('*').eq('game_id', gameRes.data.id);
      squad = (squadRows as GameSquadRow[]) ?? [];
    }

    setState({
      nextGame: (gameRes.data as Game) ?? null,
      squad,
      players: (playersRes.data as Player[]) ?? [],
      sets: (setsRes.data as TrikotSet[]) ?? [],
      lastAssignedPlayerId: (rotationRes.data as { last_assigned_player_id: string | null } | null)?.last_assigned_player_id ?? null,
      washLog: (washRes.data as TrikotWashLogRow[]) ?? []
    });
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Trikot-Daten.'));
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!state) return <LoadingSpinner />;

  const neededSet = state.nextGame ? benoetigterSatz(state.nextGame) : null;
  const confirmedForGame = state.nextGame
    ? state.washLog.find((w) => w.game_id === state.nextGame!.id && w.set_id === neededSet) ?? null
    : null;
  const suggestion =
    state.nextGame && state.nextGame.squad_published && !confirmedForGame
      ? naechsterSpieler(state.nextGame, state.players, state.squad, state.lastAssignedPlayerId)
      : null;
  const canConfirm =
    !!suggestion && (role === 'trainer' || (role === 'player' && player?.id === suggestion.id));

  const washCount: Record<string, number> = {};
  state.washLog.forEach((row) => {
    washCount[row.player_id] = (washCount[row.player_id] ?? 0) + 1;
  });
  const selectedIds = new Set(state.squad.filter((s) => s.is_selected).map((s) => s.player_id));
  const sortedPlayers = [...state.players].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const playersById: Record<string, Player> = {};
  state.players.forEach((p) => (playersById[p.id] = p));

  async function confirmHandover(playerId: string) {
    if (!neededSet) return;
    setConfirming(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('confirm_trikot_handover', {
        p_set_id: neededSet,
        p_player_id: playerId,
        p_game_id: state!.nextGame?.id ?? null
      });
      if (rpcError) throw rpcError;
      setPickingAlternate(false);
      setAlternateId('');
      await load();
    } catch (err) {
      setError('Übergabe konnte nicht bestätigt werden.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
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
            <div className="mt-3 flex items-center gap-2">
              <span className="pill pill-ok">✓ Bestätigt</span>
              <p className="text-sm text-tbw-ink/70">
                {playersById[confirmedForGame.player_id]?.name ?? '?'} hat übernommen.
              </p>
            </div>
          ) : suggestion ? (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-tbw-ink/60">Laut Rotation vorgeschlagen</p>
                  <p className="font-semibold text-tbw-navyDark">{suggestion.name}</p>
                </div>
                {canConfirm && !pickingAlternate && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => confirmHandover(suggestion.id)}
                      disabled={confirming}
                      title="Übergabe bestätigen"
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-status-ok text-xl font-bold text-white transition active:scale-95 disabled:opacity-50"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setPickingAlternate(true)}
                      disabled={confirming}
                      title="Kann die Trikots nicht nehmen"
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-tbw-red text-xl font-bold text-white transition active:scale-95 disabled:opacity-50"
                    >
                      ✗
                    </button>
                  </div>
                )}
              </div>

              {canConfirm && pickingAlternate && (
                <div className="mt-3 space-y-2 rounded-xl bg-tbw-bg p-3">
                  <p className="text-sm text-tbw-ink/70">Wer nimmt die Trikots stattdessen mit?</p>
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
                      onClick={() => confirmHandover(alternateId)}
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
            <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/50">{set.label}</p>
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
