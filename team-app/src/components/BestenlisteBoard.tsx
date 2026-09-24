import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { computeBoxScore, type PlayerBoxScore } from '../lib/gameStats';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorNote } from './ErrorNote';
import { useTipoffLoader } from '../hooks/useTipoffLoader';
import type { GameStatEvent, Player } from '../types/database';

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Für den Nachname-Tiebreak bei Punktgleichstand (siehe PROMPT.md) — alles
// nach dem ersten Namensteil, wie schon bei nameLines() in PlayerProfiles.tsx.
function lastName(name: string): string {
  const [, ...rest] = name.split(' ');
  return rest.join(' ') || name;
}

type CategoryKey = 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks';

const CATEGORIES: { key: CategoryKey; label: string; field: keyof PlayerBoxScore }[] = [
  { key: 'points', label: 'Punkte', field: 'points' },
  { key: 'rebounds', label: 'Rebounds', field: 'rebounds' },
  { key: 'assists', label: 'Assists', field: 'assists' },
  { key: 'steals', label: 'Steals', field: 'steals' },
  { key: 'blocks', label: 'Blöcke', field: 'blocks' }
];

interface Row {
  player: Player;
  value: number | null;
  games: number;
}

const CHEVRON = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

// Element 12 "Bestenliste" — sitzt unter dem Kader-Raster (Element 11), im
// selben Reiter „Team". Saison-Ranglisten je Kategorie, jeweils als SUMME
// aller game_stat_events über die ganze Saison (kein Schnitt). Lädt seine
// Daten selbst statt sie von PlayerProfiles.tsx als Props zu bekommen,
// gleiche Konvention wie PlayerProfileSheet.tsx.
export function BestenlisteBoard() {
  const { player: me } = useAuth();
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [events, setEvents] = useState<GameStatEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<CategoryKey>('points');
  const [open, setOpen] = useState(false);
  const catsRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setError(null);
    const [playersRes, eventsRes] = await Promise.all([
      supabase.from('players').select('*').eq('is_active', true).order('name'),
      supabase.from('game_stat_events').select('*')
    ]);
    if (playersRes.error || eventsRes.error) {
      setError('Fehler beim Laden der Bestenliste.');
      return;
    }
    setPlayers((playersRes.data as Player[]) ?? []);
    setEvents((eventsRes.data as GameStatEvent[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const computed = useMemo(() => {
    if (!players || !events) return null;

    const totalTrackedGames = new Set(events.map((e) => e.game_id)).size;

    const gamesByPlayer = new Map<string, Set<string>>();
    for (const e of events) {
      if (e.team !== 'us' || !e.player_id) continue;
      const set = gamesByPlayer.get(e.player_id) ?? new Set<string>();
      set.add(e.game_id);
      gamesByPlayer.set(e.player_id, set);
    }

    const boxByPlayer = new Map(computeBoxScore(events).map((b) => [b.playerId, b]));

    const tracked: Row[] = [];
    const untracked: Row[] = [];
    for (const p of players) {
      const games = gamesByPlayer.get(p.id)?.size ?? 0;
      if (games > 0) {
        tracked.push({ player: p, value: null, games });
      } else {
        untracked.push({ player: p, value: null, games: 0 });
      }
    }
    untracked.sort((a, b) => a.player.name.localeCompare(b.player.name));

    return { totalTrackedGames, gamesByPlayer, boxByPlayer, tracked, untracked };
  }, [players, events]);

  const showLoader = useTipoffLoader(!computed);

  if (error) return <ErrorNote message={error} />;
  if (showLoader) return <LoadingSpinner size="card" />;
  if (!computed) return null;

  const { totalTrackedGames, boxByPlayer, tracked, untracked } = computed;
  const category = CATEGORIES.find((c) => c.key === cat)!;

  const rankedTracked = [...tracked]
    .map((r) => ({ ...r, value: (boxByPlayer.get(r.player.id)?.[category.field] as number) ?? 0 }))
    .sort(
      (a, b) =>
        b.value! - a.value! || a.games - b.games || lastName(a.player.name).localeCompare(lastName(b.player.name))
    );
  const max = rankedTracked[0]?.value || 1;

  const shown = open ? [...rankedTracked, ...untracked] : rankedTracked.slice(0, 6);
  const totalPlayers = rankedTracked.length + untracked.length;

  function selectCat(key: CategoryKey) {
    setCat(key);
    requestAnimationFrame(() => {
      const btn = catsRef.current?.querySelector<HTMLButtonElement>(`[data-key="${key}"]`);
      btn?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <span className="to-display-sm text-to-text">Bestenliste</span>
        <span className="h-px flex-1 bg-to-divider" />
        <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">SAISON</span>
      </div>

      <div
        ref={catsRef}
        role="tablist"
        aria-label="Kategorie"
        className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            data-key={c.key}
            aria-selected={c.key === cat}
            onClick={() => selectCat(c.key)}
            className={`flex h-[34px] shrink-0 items-center whitespace-nowrap rounded-to-pill border px-3.5 text-[13px] font-semibold ${
              c.key === cat ? 'border-to-accent bg-to-accent text-to-onAccent' : 'border-to-line text-to-text2'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {totalTrackedGames === 0 ? (
        <div className="flex flex-col gap-1.5 rounded-to-xl border border-to-border bg-to-surface px-[18px] py-[26px] text-center">
          <p className="text-[15px] font-semibold text-to-text2">Noch keine Statistik</p>
          <p className="text-[13px] text-to-text3">Sobald ein Spiel über die App getrackt wurde, steht hier die Bestenliste.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col overflow-hidden rounded-to-xl border border-to-border bg-to-surface pt-1.5">
            {shown.map((r, i) => {
              const isFirst = i === 0;
              const isMe = r.player.id === me?.id;
              const isUntracked = r.games === 0;
              return (
                <div
                  key={r.player.id}
                  className={`flex min-h-[54px] items-center gap-3 px-4 ${isMe ? 'bg-to-accentWash' : ''}`}
                >
                  <span className={`to-data w-4 shrink-0 text-xs ${isFirst ? 'text-to-accent' : 'text-to-text3'}`}>{i + 1}</span>
                  <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-to-surface2">
                    {r.player.photo_url ? (
                      <img src={r.player.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="to-data text-[11px] text-to-text2">{initialsOf(r.player.name)}</span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
                    <span className={`truncate text-sm font-semibold -tracking-[0.01em] ${isMe ? 'text-to-accent' : isUntracked ? 'text-to-text3' : 'text-to-text'}`}>
                      {r.player.name}
                    </span>
                    <span className="h-1.5 rounded-full bg-to-surface2">
                      <span
                        className={`block h-1.5 rounded-full ${isFirst ? 'bg-to-accent' : isMe ? 'bg-to-text3' : 'bg-to-lineMuted'}`}
                        style={{ width: isUntracked ? 0 : `${Math.max(2, Math.round((r.value! / max) * 100))}%` }}
                      />
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-px">
                    <span className={`to-number text-[19px] leading-none ${isFirst ? 'text-to-accent' : isUntracked ? 'text-to-text3' : 'text-to-text'}`}>
                      {isUntracked ? '—' : r.value}
                    </span>
                    <span className="to-data text-[9px] text-to-textDisabled">{r.games} SP</span>
                  </span>
                </div>
              );
            })}

            {(rankedTracked.length > 6 || untracked.length > 0) && (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className="mb-3 mt-1.5 flex min-h-[44px] items-center gap-2 border-t border-to-surface2 px-4 pt-2 text-left text-[13px] text-to-text2"
              >
                <span className="flex-1">{open ? 'Weniger anzeigen' : `Alle ${totalPlayers} Spieler anzeigen`}</span>
                <span className={`text-to-text3 transition-transform ${open ? 'rotate-180' : ''}`}>{CHEVRON}</span>
              </button>
            )}
          </div>

          <span className="text-[11px] text-to-textDisabled">
            Summe aus {totalTrackedGames} getrackten Spielen · kleine Zahl = Spiele des Spielers
          </span>
        </>
      )}
    </div>
  );
}
