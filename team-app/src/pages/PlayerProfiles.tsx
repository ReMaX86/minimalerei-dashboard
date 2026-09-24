import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { useTipoffLoader } from '../hooks/useTipoffLoader';
import { PlayerProfileSheet } from '../components/PlayerProfileSheet';
import { BestenlisteBoard } from '../components/BestenlisteBoard';
import { type Player, type PlayerPosition } from '../types/database';

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function nameLines(name: string): [string, string] {
  const [first, ...rest] = name.split(' ');
  return [first, rest.join(' ')];
}

// Gröbere Positionsfamilie fürs Raster ("FLÜGEL"/"AUFBAU"/"CENTER" statt der
// fünf feinen Positionen) — die Vorlage kennt nur diese drei Kürzel, unser
// Schema führt fünf (siehe PlayerPosition). Eigene, dokumentierte Zuordnung,
// da es dafür keinen bestehenden Wert gibt.
const GRID_POSITION: Record<PlayerPosition, string> = {
  pg: 'AUFBAU',
  sg: 'FLÜGEL',
  sf: 'FLÜGEL',
  pf: 'FLÜGEL',
  c: 'CENTER'
};

export function PlayerProfiles() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Player | null>(null);

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

  const showLoader = useTipoffLoader(!players);

  if (error) return <ErrorNote message={error} />;
  if (showLoader) return <LoadingSpinner />;
  if (!players) return null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <span className="to-display-sm text-to-text">Kader</span>
        <span className="h-px flex-1 bg-to-divider" />
        <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">{players.length} SPIELER</span>
      </div>

      {players.length === 0 ? (
        <p className="card text-sm text-to-text3">Noch keine Spieler eingetragen.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {players.map((p) => {
            const role = p.is_admin ? 'T' : p.is_captain || p.is_co_captain ? 'C' : null;
            const [first, last] = nameLines(p.name);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                className={`flex flex-col items-center gap-2 rounded-to-xl border px-2 pb-3.5 pt-4 text-center ${
                  role ? 'border-to-borderMatchday' : 'border-to-border'
                } bg-to-surface`}
              >
                <span className="relative flex">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt="" className="h-[58px] w-[58px] rounded-full border border-to-line object-cover" />
                  ) : (
                    <span className="to-data flex h-[58px] w-[58px] items-center justify-center rounded-full border border-to-line bg-to-surface2 text-[15px] text-to-text2">
                      {initialsOf(p.name)}
                    </span>
                  )}
                  {role && (
                    <span className="to-data absolute -bottom-0.5 -right-1 flex h-[17px] items-center rounded-to-pill border-2 border-to-surface bg-to-accent px-1.5 text-[8px] font-bold text-to-onAccent">
                      {role}
                    </span>
                  )}
                </span>
                <span className="flex w-full flex-col items-center gap-0.5">
                  <span className="w-full truncate text-xs font-semibold -tracking-[0.01em] text-to-text">{first}</span>
                  <span className="w-full truncate text-xs font-semibold -tracking-[0.01em] text-to-text">{last}</span>
                  {p.position && (
                    <span className="to-data pt-0.5 text-[9px] tracking-[0.06em] text-to-textDisabled">{GRID_POSITION[p.position]}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <BestenlisteBoard />

      {selected && <PlayerProfileSheet player={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
