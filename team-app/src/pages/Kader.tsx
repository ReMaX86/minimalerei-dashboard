import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { fmtDate, fmtTime } from '../lib/format';
import type { Game, GameSquadRow, Player } from '../types/database';

const MAX_SQUAD_SIZE = 12;

interface State {
  nextGame: Game | null;
  upcomingGames: Game[];
  squad: GameSquadRow[];
  players: Player[];
}

export function Kader() {
  const { role } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const [gamesRes, playersRes] = await Promise.all([
      supabase.from('games').select('*').gte('game_date', today).order('game_date').order('game_time').limit(15),
      supabase.from('players').select('*').eq('is_active', true)
    ]);
    if (gamesRes.error || playersRes.error) {
      setError('Fehler beim Laden des Kaders.');
      return;
    }
    const games = (gamesRes.data as Game[]) ?? [];
    const nextGame = games[0] ?? null;
    let squad: GameSquadRow[] = [];
    if (nextGame) {
      const { data: squadRows } = await supabase.from('game_squad').select('*').eq('game_id', nextGame.id);
      squad = (squadRows as GameSquadRow[]) ?? [];
    }
    setState({
      nextGame,
      upcomingGames: games.slice(1),
      squad,
      players: ((playersRes.data as Player[]) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'de'))
    });
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden des Kaders.'));
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!state) return <LoadingSpinner />;

  if (!state.nextGame) {
    return <p className="card text-sm text-tbw-ink/50">Kein anstehendes Spiel geplant.</p>;
  }

  const selectedByPlayer: Record<string, boolean> = {};
  state.squad.forEach((row) => (selectedByPlayer[row.player_id] = row.is_selected));

  async function toggle(playerId: string) {
    const willSelect = !selectedByPlayer[playerId];
    // Defensive guard against the max-12 cap; the toggle button for players
    // not yet selected is already disabled once the cap is reached, so this
    // should only ever trigger on a race (e.g. two people toggling at once).
    if (willSelect && selectedCount >= MAX_SQUAD_SIZE) return;
    setTogglingId(playerId);
    setError(null);
    try {
      const { error: upsertError } = await supabase
        .from('game_squad')
        .upsert(
          { game_id: state!.nextGame!.id, player_id: playerId, is_selected: willSelect },
          { onConflict: 'game_id,player_id' }
        );
      if (upsertError) throw upsertError;
      await load();
    } catch {
      setError('Änderung konnte nicht gespeichert werden.');
    } finally {
      setTogglingId(null);
    }
  }

  async function togglePublish() {
    setPublishing(true);
    setError(null);
    try {
      const { error: updError } = await supabase
        .from('games')
        .update({ squad_published: !state!.nextGame!.squad_published })
        .eq('id', state!.nextGame!.id);
      if (updError) throw updError;
      await load();
    } catch {
      setError('Status konnte nicht geändert werden.');
    } finally {
      setPublishing(false);
    }
  }

  const selectedCount = state.squad.filter((s) => s.is_selected).length;
  const atCap = selectedCount >= MAX_SQUAD_SIZE;
  const sortedForTrainer = [...state.players].sort(
    (a, b) => Number(!!selectedByPlayer[b.id]) - Number(!!selectedByPlayer[a.id]) || a.name.localeCompare(b.name, 'de')
  );

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/50">Nächster Spieltag</p>
            <p className="text-base font-bold text-tbw-navyDark">vs. {state.nextGame.opponent}</p>
            <p className="text-sm text-tbw-ink/60">
              {fmtDate(state.nextGame.game_date)} · {fmtTime(state.nextGame.game_time)} Uhr ·{' '}
              {state.nextGame.is_home ? 'Heim' : 'Auswärts'}
            </p>
          </div>
          <span className={state.nextGame.squad_published ? 'pill pill-ok' : 'pill pill-open'}>
            {state.nextGame.squad_published ? 'veröffentlicht' : 'Entwurf'}
          </span>
        </div>

        {role === 'trainer' && (
          <>
            <ul className="mt-3 divide-y divide-black/5">
              {sortedForTrainer.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-tbw-navyDark">{p.name}</span>
                  <button
                    disabled={togglingId === p.id || (atCap && !selectedByPlayer[p.id])}
                    onClick={() => toggle(p.id)}
                    className={`pill ${selectedByPlayer[p.id] ? 'pill-ok' : 'pill-open'} disabled:opacity-40`}
                  >
                    {selectedByPlayer[p.id] ? 'im Kader' : 'nicht im Kader'}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-tbw-ink/50">
              {selectedCount} von max. {MAX_SQUAD_SIZE} im Kader
              {atCap && ' · Kader ist voll'}
            </p>
            <button onClick={togglePublish} disabled={publishing} className="btn-primary mt-3 w-full">
              {publishing
                ? 'Speichere…'
                : state.nextGame.squad_published
                ? 'Zurückziehen'
                : 'Veröffentlichen'}
            </button>
          </>
        )}

        {role === 'player' &&
          (state.nextGame.squad_published ? (
            state.players.filter((p) => selectedByPlayer[p.id]).length === 0 ? (
              <p className="mt-3 text-sm text-tbw-ink/50">Niemand im Kader.</p>
            ) : (
              <ul className="mt-3 divide-y divide-black/5">
                {state.players
                  .filter((p) => selectedByPlayer[p.id])
                  .map((p) => (
                    <li key={p.id} className="py-2 text-sm font-medium text-tbw-navyDark">
                      {p.name}
                    </li>
                  ))}
              </ul>
            )
          ) : (
            <p className="mt-3 text-sm text-tbw-ink/50">Kader für dieses Spiel noch nicht veröffentlicht.</p>
          ))}
      </section>

      <section className="card">
        <button
          className="flex w-full items-center justify-between text-sm font-bold text-tbw-navyDark"
          onClick={() => setShowMore((v) => !v)}
        >
          Weitere Spieltage anzeigen
          <span>{showMore ? '▲' : '▼'}</span>
        </button>
        {showMore && (
          <ul className="mt-3 space-y-2">
            {state.upcomingGames.length === 0 && (
              <p className="text-sm text-tbw-ink/50">Keine weiteren Spiele geplant.</p>
            )}
            {state.upcomingGames.map((g) => (
              <li key={g.id} className="rounded-xl bg-tbw-bg p-3 text-sm">
                <p className="font-semibold text-tbw-navyDark">
                  vs. {g.opponent} <span className="pill pill-open ml-1">{g.is_home ? 'Heim' : 'Auswärts'}</span>
                </p>
                <p className="text-tbw-ink/60">
                  {fmtDate(g.game_date)} · {fmtTime(g.game_time)} Uhr · {g.location}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
