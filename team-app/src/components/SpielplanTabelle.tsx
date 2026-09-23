import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { dayOfMonth, fmtDateShort, fmtDateTimeShort, fmtTime, monthLabel, weekdayBadge } from '../lib/format';
import { NextGameSquadCard } from './NextGameSquadCard';
import { gameResult, type Game, type LeagueStandingRow, type StandingsSyncStatus } from '../types/database';

type Tab = 'plan' | 'results' | 'table';

interface State {
  upcoming: Game[];
  past: Game[];
  trackedGameIds: Set<string>;
  standings: LeagueStandingRow[];
  syncStatus: StandingsSyncStatus | null;
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="card flex flex-col items-center gap-1.5 py-7 text-center">
      <p className="text-[15px] font-semibold text-to-text2">{title}</p>
      <p className="text-[13px] text-to-text3">{text}</p>
    </div>
  );
}

function GameDetailSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-30 flex flex-col bg-to-bg">
      <div className="flex shrink-0 items-center justify-between border-b border-to-divider px-5 py-4">
        <p className="to-display-sm text-to-text">Spieldetails</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-to-surface2 text-to-text2"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <NextGameSquadCard game={game} label="SPIELTAG" />
      </div>
    </div>,
    document.body
  );
}

// Reiter „Spielplan · Ergebnisse · Tabelle" unter der Spielkarte (Element 10
// der Design-Übergabe) — ersetzt den bisherigen Spielplan/Tabelle-
// Umschalter samt der eingeschränkten Vorschauen. Self-contained (eigenes
// load()), wie die anderen Karten dieser Session.
export function SpielplanTabelle() {
  const [tab, setTab] = useState<Tab>('plan');
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openGame, setOpenGame] = useState<Game | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const [upcomingRes, pastRes, eventsRes, standingsRes, syncRes] = await Promise.all([
      supabase.from('games').select('*').gte('game_date', today).is('stats_finalized_at', null).order('game_date').order('game_time'),
      supabase
        .from('games')
        .select('*')
        .not('stats_finalized_at', 'is', null)
        .order('game_date', { ascending: false })
        .order('game_time', { ascending: false }),
      supabase.from('game_stat_events').select('game_id'),
      supabase.from('league_standings').select('*').order('rang'),
      supabase.from('standings_sync_status').select('*').eq('id', 1).maybeSingle()
    ]);
    if (upcomingRes.error || pastRes.error || eventsRes.error || standingsRes.error) {
      setError('Fehler beim Laden.');
      return;
    }
    const trackedGameIds = new Set(((eventsRes.data as { game_id: string }[] | null) ?? []).map((e) => e.game_id));
    setState({
      upcoming: (upcomingRes.data as Game[]) ?? [],
      past: (pastRes.data as Game[]) ?? [],
      trackedGameIds,
      standings: (standingsRes.data as LeagueStandingRow[]) ?? [],
      syncStatus: (syncRes.data as StandingsSyncStatus | null) ?? null
    });
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden.'));
  }, [load]);

  if (error) return <p className="card text-sm text-to-dangerText">{error}</p>;
  if (!state) return <div className="card h-[320px] animate-pulse" />;

  const nextGameId = state.upcoming[0]?.id;
  const groups: { month: string; games: Game[] }[] = [];
  state.upcoming.forEach((g) => {
    const m = monthLabel(g.game_date);
    const existing = groups.find((x) => x.month === m);
    if (existing) existing.games.push(g);
    else groups.push({ month: m, games: [g] });
  });

  // Ein Sync-Lauf räumt last_error bei Erfolg immer ab (siehe
  // api/sync-league-standings.ts) — ein gesetzter Fehler bedeutet also
  // zuverlässig "der letzte Versuch ist schiefgegangen", nicht nur "es ist
  // schon eine Weile her".
  const stale = !!state.syncStatus?.last_error;

  return (
    <div className="flex flex-col gap-3.5">
      <div role="tablist" className="flex gap-[22px] border-b border-to-divider">
        {(
          [
            ['plan', 'Spielplan'],
            ['results', 'Ergebnisse'],
            ['table', 'Tabelle']
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`border-b-2 pb-2.5 text-[15px] font-semibold transition-[color,border-color] duration-150 ${
              tab === t ? 'border-to-accent text-to-accent' : 'border-transparent text-to-text3'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'plan' &&
        (groups.length === 0 ? (
          <EmptyState title="Keine Spiele geplant" text="Sobald der Spielplan steht, taucht er hier auf." />
        ) : (
          <div className="flex flex-col gap-3.5">
            {groups.map((grp) => (
              <div key={grp.month} className="flex flex-col gap-2">
                <span className="to-data text-[10px] tracking-[0.14em] text-to-textDisabled">{grp.month}</span>
                {grp.games.map((g) => {
                  const isNext = g.id === nextGameId;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setOpenGame(g)}
                      className={`flex items-center gap-3.5 rounded-to-lg border p-3.5 text-left ${
                        isNext ? 'border-to-borderMatchday bg-to-accentWash' : 'border-to-border bg-to-surface'
                      }`}
                    >
                      <span className="flex w-10 flex-none flex-col items-center">
                        <span className="to-data text-[10px] text-to-text3">{weekdayBadge(g.game_date)}</span>
                        <span className={`to-number text-[20px] leading-[1.1] ${isNext ? 'text-to-accent' : 'text-to-text'}`}>
                          {dayOfMonth(g.game_date)}
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-semibold -tracking-[0.01em] text-to-text">{g.opponent}</span>
                        <span className="to-data truncate text-[11px] text-to-text3">
                          {fmtTime(g.game_time)} · {g.is_home ? 'HEIM' : 'AUSWÄRTS'} · {g.location.toUpperCase()}
                        </span>
                      </span>
                      {isNext && (
                        <span className="to-data inline-flex h-[22px] shrink-0 items-center rounded-to-pill bg-to-accentSoft px-2.5 text-[9px] font-semibold text-to-accent">
                          NÄCHSTES
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}

      {tab === 'results' &&
        (state.past.length === 0 ? (
          <EmptyState title="Noch keine Ergebnisse" text="Nach dem ersten Spiel steht hier das Ergebnis." />
        ) : (
          <div className="flex flex-col gap-2.5">
            {state.past.map((g) => {
              const result = gameResult(g);
              const win = result === 'sieg';
              const tracked = state.trackedGameIds.has(g.id);
              return (
                <div key={g.id} className="flex flex-col gap-2.5 rounded-to-lg border border-to-border bg-to-surface p-3.5">
                  <div className="flex items-center gap-3">
                    <span
                      className={`to-data flex h-7 w-7 flex-none items-center justify-center rounded-to-sm text-xs font-semibold ${
                        win ? 'bg-to-accentSoft text-to-accent' : 'bg-to-dangerSoft text-to-dangerText'
                      }`}
                    >
                      {win ? 'S' : 'N'}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-semibold -tracking-[0.01em] text-to-text">{g.opponent}</span>
                      <span className="to-data text-[11px] text-to-text3">
                        {weekdayBadge(g.game_date)} {fmtDateShort(g.game_date)} · {g.is_home ? 'HEIM' : 'AUSWÄRTS'}
                      </span>
                    </span>
                    <span className="to-number flex-none text-[22px] text-to-text">
                      {g.final_score_us}:{g.final_score_opponent}
                    </span>
                  </div>
                  {tracked && (
                    <Link
                      to={`/stats/${g.id}`}
                      className="flex min-h-10 items-center gap-2 border-t border-to-divider pt-2.5 text-[13px] font-semibold text-to-accent"
                    >
                      <span className="flex-1">Box-Score ansehen</span>
                      <ChevronRightIcon />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        ))}

      {tab === 'table' &&
        (state.standings.length === 0 ? (
          <EmptyState title="Tabelle nicht verfügbar" text="Die Tabelle konnte noch nicht geladen werden." />
        ) : (
          <section className="card flex flex-col gap-2.5 overflow-hidden !p-0 !pb-3 !pt-3.5">
            {stale && (
              <div className="mx-3 flex items-center gap-2.5 rounded-to-lg bg-to-vacationSoft px-3.5 py-3 text-[13px] text-to-vacation">
                <WarnIcon />
                <span className="flex-1">Letzte Aktualisierung fehlgeschlagen.</span>
                <button type="button" onClick={load} className="shrink-0 whitespace-nowrap text-[13px] font-semibold underline">
                  Erneut laden
                </button>
              </div>
            )}
            <div className="flex items-center gap-0 px-3">
              <span className="to-data w-[22px] shrink-0 text-[9px] text-to-textDisabled">#</span>
              <span className="to-data min-w-0 flex-1 pr-2 text-[9px] text-to-textDisabled">TEAM</span>
              <span className="to-data w-[22px] shrink-0 text-right text-[9px] text-to-textDisabled">SP</span>
              <span className="to-data w-[34px] shrink-0 text-right text-[9px] text-to-textDisabled">S-N</span>
              <span className="to-data w-[26px] shrink-0 text-right text-[9px] text-to-textDisabled">PKT</span>
              <span className="to-data w-[58px] shrink-0 text-right text-[9px] text-to-textDisabled">KÖRBE</span>
            </div>
            {state.standings.map((row) => (
              <div
                key={row.id}
                className={`flex min-h-[38px] items-center px-3 ${row.is_own_team ? 'bg-to-accentWash' : ''}`}
              >
                <span className={`to-data w-[22px] shrink-0 text-[11px] ${row.is_own_team ? 'text-to-accent' : 'text-to-text3'}`}>
                  {row.rang}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate pr-2 text-[13px] ${
                    row.is_own_team ? 'font-bold text-to-accent' : 'font-medium text-to-text'
                  }`}
                >
                  {row.team_name}
                </span>
                <span className="to-data w-[22px] shrink-0 text-right text-[11px] text-to-text3">{row.spiele}</span>
                <span className="to-data w-[34px] shrink-0 text-right text-[11px] text-to-text2">
                  {row.siege}-{row.niederlagen}
                </span>
                <span
                  className={`to-data w-[26px] shrink-0 text-right text-xs font-semibold ${
                    row.is_own_team ? 'text-to-accent' : 'text-to-text'
                  }`}
                >
                  {row.punkte}
                </span>
                <span className="to-data w-[58px] shrink-0 text-right text-[11px] text-to-text3">
                  {row.koerbe_erzielt}:{row.koerbe_erhalten}
                </span>
              </div>
            ))}
            <p className="px-3 pt-2 text-[11px] text-to-textDisabled">
              Quelle: basketball-bund.net ·{' '}
              {state.standings[0] ? `Stand ${fmtDateTimeShort(state.standings[0].updated_at)}` : 'noch nie geladen'}
            </p>
          </section>
        ))}

      {openGame && <GameDetailSheet game={openGame} onClose={() => setOpenGame(null)} />}
    </div>
  );
}
