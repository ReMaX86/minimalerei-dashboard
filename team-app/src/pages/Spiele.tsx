import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { useTipoffLoader } from '../hooks/useTipoffLoader';
import { NextGameSquadCard } from '../components/NextGameSquadCard';
import { SpielplanTabelle } from '../components/SpielplanTabelle';
import type { Game } from '../types/database';

export function Spiele() {
  const [nextGame, setNextGame] = useState<Game | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error: loadError } = await supabase
      .from('games')
      .select('*')
      .gte('game_date', today)
      .is('stats_finalized_at', null)
      .order('game_date')
      .order('game_time')
      .limit(1);
    if (loadError) {
      setError('Fehler beim Laden der Spiele.');
      return;
    }
    setNextGame(((data as Game[]) ?? [])[0] ?? null);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Spiele.'));
  }, [load]);

  const showLoader = useTipoffLoader(nextGame === undefined);

  if (error) return <ErrorNote message={error} />;
  if (showLoader) return <LoadingSpinner />;
  if (nextGame === undefined) return null;

  return (
    <div className="space-y-4">
      {nextGame ? <NextGameSquadCard game={nextGame} /> : <p className="card text-sm text-to-text3">Kein anstehendes Spiel geplant.</p>}
      <SpielplanTabelle />
    </div>
  );
}
