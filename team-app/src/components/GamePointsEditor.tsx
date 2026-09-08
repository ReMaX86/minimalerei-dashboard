import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorNote } from './ErrorNote';
import type { GamePlayerPoints, Player } from '../types/database';

export function GamePointsEditor({ gameId, players }: { gameId: string; players: Player[] }) {
  const [rows, setRows] = useState<GamePlayerPoints[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase
      .from('game_player_points')
      .select('*')
      .eq('game_id', gameId);
    if (loadError) {
      setError('Fehler beim Laden der Punkte.');
      return;
    }
    const fetched = (data as GamePlayerPoints[]) ?? [];
    setRows(fetched);
    const next: Record<string, string> = {};
    fetched.forEach((r) => (next[r.player_id] = String(r.points)));
    setValues(next);
  }, [gameId]);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Punkte.'));
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!rows) return <LoadingSpinner />;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const entries = Object.entries(values).filter(([, v]) => v.trim() !== '');
      const upserts = entries.map(([player_id, v]) => ({ game_id: gameId, player_id, points: Number(v) }));
      if (upserts.length > 0) {
        const { error: upsertError } = await supabase
          .from('game_player_points')
          .upsert(upserts, { onConflict: 'game_id,player_id' });
        if (upsertError) throw upsertError;
      }
      // Zeilen, deren Feld geleert wurde, wieder entfernen statt mit 0 zu überschreiben.
      const clearedIds = Object.entries(values)
        .filter(([, v]) => v.trim() === '')
        .map(([playerId]) => playerId);
      if (clearedIds.length > 0) {
        const { error: delError } = await supabase
          .from('game_player_points')
          .delete()
          .eq('game_id', gameId)
          .in('player_id', clearedIds);
        if (delError) throw delError;
      }
      setSaved(true);
      await load();
    } catch {
      setError('Punkte konnten nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-black/5 pt-3">
      <p className="text-xs font-semibold text-tbw-ink/50">Punkte pro Spieler</p>
      <ul className="space-y-1.5">
        {players.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2">
            <span className="text-sm text-tbw-navyDark">{p.name}</span>
            <input
              type="number"
              min={0}
              placeholder="—"
              className="input !w-20 text-center"
              value={values[p.id] ?? ''}
              onChange={(e) => {
                setSaved(false);
                setValues((v) => ({ ...v, [p.id]: e.target.value }));
              }}
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button className="btn-secondary !px-3 !py-1.5 text-xs" disabled={busy} onClick={save}>
          {busy ? 'Speichere…' : 'Punkte speichern'}
        </button>
        {saved && <span className="text-xs font-semibold text-status-ok">Gespeichert</span>}
      </div>
    </div>
  );
}
