import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { fmtDateShort } from '../../lib/format';
import type { Player, TrikotSet } from '../../types/database';

export function TrikotsAdmin() {
  const [sets, setSets] = useState<TrikotSet[] | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [setsRes, playersRes] = await Promise.all([
      supabase.from('trikot_sets').select('*').order('id'),
      supabase.from('players').select('*')
    ]);
    if (setsRes.error || playersRes.error) {
      setError('Fehler beim Laden.');
      return;
    }
    const playersById: Record<string, Player> = {};
    (playersRes.data as Player[]).forEach((p) => (playersById[p.id] = p));
    setSets((setsRes.data as TrikotSet[]) ?? []);
    setPlayers(playersById);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden.'));
  }, [load]);

  async function reset() {
    setResetting(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('reset_trikots');
      if (rpcError) throw rpcError;
      setConfirming(false);
      await load();
    } catch {
      setError('Zurücksetzen fehlgeschlagen.');
    } finally {
      setResetting(false);
    }
  }

  if (error) return <ErrorNote message={error} />;
  if (!sets) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <section className="card">
        <p className="text-sm font-bold text-tbw-navyDark">Aktueller Stand</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {sets.map((set) => (
            <div key={set.id} className="rounded-xl bg-tbw-bg p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/50">{set.label}</p>
              <p className="mt-1 text-sm font-semibold text-tbw-navyDark">
                {set.current_holder_id ? players[set.current_holder_id]?.name ?? '—' : 'Niemand'}
              </p>
              {set.since && <p className="text-xs text-tbw-ink/50">seit {fmtDateShort(set.since)}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <p className="text-sm font-bold text-tbw-navyDark">Rotation zurücksetzen</p>
        <p className="mt-1 text-sm text-tbw-ink/60">
          Löscht den kompletten Übergabe-Verlauf, setzt beide Trikot-Sets auf "Niemand" zurück und die Rotation
          beginnt wieder von vorne. Nützlich z. B. nach Testläufen — nicht während der laufenden Saison.
        </p>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="btn-secondary mt-3 w-full !text-tbw-red !ring-tbw-red/30">
            Zurücksetzen
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-bold text-tbw-red">Bist du sicher? Das kann nicht rückgängig gemacht werden.</p>
            <div className="flex gap-2">
              <button onClick={reset} disabled={resetting} className="btn-primary flex-1 !bg-tbw-red">
                {resetting ? 'Setze zurück…' : 'Ja, zurücksetzen'}
              </button>
              <button onClick={() => setConfirming(false)} disabled={resetting} className="btn-secondary flex-1">
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
