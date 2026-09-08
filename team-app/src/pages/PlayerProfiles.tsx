import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { Avatar } from '../components/Avatar';
import { ageFromBirthDate } from '../lib/format';
import { POSITION_LABELS, type Player } from '../types/database';

export function PlayerProfiles() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase
      .from('players')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (loadError) {
      setError('Fehler beim Laden der Spielerprofile.');
      return;
    }
    setPlayers((data as Player[]) ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Spielerprofile.'));
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!players) return <LoadingSpinner />;

  const selected = players.find((p) => p.id === selectedId);

  if (selected) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedId(null)} className="text-sm font-semibold text-tbw-ink/60">
          ← Zurück
        </button>
        <div className="card text-center">
          <Avatar player={selected} size="lg" />
          <p className="mt-3 headline text-2xl text-tbw-navyDark">{selected.name}</p>
          <p className="mt-1 text-sm text-tbw-ink/50">
            {selected.position ? POSITION_LABELS[selected.position] : 'Position unbekannt'}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-left">
            <div className="rounded-xl bg-tbw-bg p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-tbw-ink/40">Größe</p>
              <p className="mt-1 text-sm font-semibold text-tbw-navyDark">
                {selected.height_cm ? `${selected.height_cm} cm` : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-tbw-bg p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-tbw-ink/40">Alter</p>
              <p className="mt-1 text-sm font-semibold text-tbw-navyDark">
                {selected.birth_date ? `${ageFromBirthDate(selected.birth_date)} Jahre` : '—'}
              </p>
            </div>
          </div>

          {selected.skills.length > 0 && (
            <div className="mt-4 text-left">
              <p className="text-[10px] font-bold uppercase tracking-wide text-tbw-ink/40">Stärken</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selected.skills.map((s) => (
                  <span key={s} className="pill pill-ok">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {players.map((p) => (
        <button
          key={p.id}
          onClick={() => setSelectedId(p.id)}
          className="card flex flex-col items-center gap-2 !p-3 text-center"
        >
          <Avatar player={p} size="sm" />
          <span className="text-xs font-semibold text-tbw-navyDark">{p.name}</span>
        </button>
      ))}
      {players.length === 0 && <p className="col-span-3 text-sm text-tbw-ink/50">Noch keine Spieler eingetragen.</p>}
    </div>
  );
}
