import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { NextGameSquadCard } from '../components/NextGameSquadCard';
import { fmtDate, fmtDateTimeShort, fmtTime } from '../lib/format';
import { gameResult, type Game, type LeagueStandingRow } from '../types/database';

const UPCOMING_PREVIEW_COUNT = 3;
const PAST_PREVIEW_COUNT = 3;

const RESULT_LABELS = { sieg: 'Sieg', niederlage: 'Niederlage', unentschieden: 'Unentschieden' } as const;

interface State {
  nextGame: Game | null;
  upcomingGames: Game[];
  pastGames: Game[];
  leagueStandings: LeagueStandingRow[];
}

function GameListItem({ game }: { game: Game }) {
  return (
    <li className="rounded-xl bg-to-bg p-3 text-sm">
      <p className="font-semibold text-to-text">
        vs. {game.opponent} <span className="pill pill-open ml-1">{game.is_home ? 'Heim' : 'Auswärts'}</span>
      </p>
      <p className="text-to-text2">
        {fmtDate(game.game_date)} · {fmtTime(game.game_time)} Uhr · {game.location}
      </p>
    </li>
  );
}

// Zeigt jedes abgeschlossene Spiel mit Endstand + Link zum Box-Score — bisher
// hatten normale Spieler nur für das jeweils letzte Spiel einen solchen Link
// (Startseite "Letztes Ergebnis"), ältere waren nur über Admin -> Spiele
// erreichbar. Kein Zugriffsunterschied dahinter (game_stat_events ist für
// jeden angemeldeten Nutzer lesbar), nur ein fehlender Einstiegspunkt.
function PastGameListItem({ game }: { game: Game }) {
  const result = gameResult(game);
  return (
    <li className="rounded-xl bg-to-bg p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-to-text">
            vs. {game.opponent} <span className="pill pill-open ml-1">{game.is_home ? 'Heim' : 'Auswärts'}</span>
          </p>
          <p className="text-to-text2">{fmtDate(game.game_date)}</p>
        </div>
        {result && (
          <div className="shrink-0 text-right">
            <p className="font-bold text-to-text">
              {game.final_score_us}:{game.final_score_opponent}
            </p>
            <span
              className={`pill !text-[10px] ${
                result === 'sieg' ? 'pill-ok' : result === 'niederlage' ? 'pill-open' : ''
              }`}
            >
              {RESULT_LABELS[result]}
            </span>
          </div>
        )}
      </div>
      <Link to={`/stats/${game.id}`} className="mt-1.5 inline-block text-xs font-bold text-to-accent">
        Box-Score ansehen →
      </Link>
    </li>
  );
}

export function Spiele() {
  const { flags } = useFeatureFlags();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [showPastMore, setShowPastMore] = useState(false);
  // Auf Nutzeranfrage: Tabelle ist prominenter untergebracht (eigener Tab
  // statt ganz unten auf der Seite) und standardmäßig vorausgewählt.
  const [activeTab, setActiveTab] = useState<'spielplan' | 'tabelle'>('tabelle');

  const load = useCallback(async () => {
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const [gamesRes, pastGamesRes, standingsRes] = await Promise.all([
      supabase
        .from('games')
        .select('*')
        .gte('game_date', today)
        .is('stats_finalized_at', null)
        .order('game_date')
        .order('game_time')
        .limit(15),
      flags.stats
        ? supabase
            .from('games')
            .select('*')
            .not('stats_finalized_at', 'is', null)
            .order('game_date', { ascending: false })
            .order('game_time', { ascending: false })
            .limit(15)
        : Promise.resolve({ data: [] as Game[], error: null }),
      flags.standings
        ? supabase.from('league_standings').select('*').order('rang')
        : Promise.resolve({ data: [] as LeagueStandingRow[], error: null })
    ]);
    if (gamesRes.error || pastGamesRes.error || standingsRes.error) {
      setError('Fehler beim Laden der Spiele.');
      return;
    }
    const games = (gamesRes.data as Game[]) ?? [];
    setState({
      nextGame: games[0] ?? null,
      upcomingGames: games.slice(1),
      pastGames: (pastGamesRes.data as Game[]) ?? [],
      leagueStandings: (standingsRes.data as LeagueStandingRow[]) ?? []
    });
  }, [flags.stats, flags.standings]);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Spiele.'));
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!state) return <LoadingSpinner />;

  const pastPreview = state.pastGames.slice(0, PAST_PREVIEW_COUNT);
  const pastRest = state.pastGames.slice(PAST_PREVIEW_COUNT);
  const pastGamesSection = flags.stats && state.pastGames.length > 0 && (
    <section className="card">
      <p className="text-sm font-bold text-to-text">Vergangene Spiele</p>
      <ul className="mt-2 space-y-2">
        {pastPreview.map((g) => (
          <PastGameListItem key={g.id} game={g} />
        ))}
      </ul>
      {pastRest.length > 0 && (
        <>
          <button
            className="mt-3 flex w-full items-center justify-between text-sm font-bold text-to-text"
            onClick={() => setShowPastMore((v) => !v)}
          >
            Weitere vergangene Spiele anzeigen
            <span>{showPastMore ? '▲' : '▼'}</span>
          </button>
          {showPastMore && (
            <ul className="mt-3 space-y-2">
              {pastRest.map((g) => (
                <PastGameListItem key={g.id} game={g} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );

  // Sortierung kommt schon aus der Query (order('rang')) — hier nur noch
  // anzeigen. Leer, solange flags.standings aus ist oder der tägliche
  // Sync (api/sync-league-standings.ts) noch nie erfolgreich lief.
  const leagueStandingsSection = flags.standings && state.leagueStandings.length > 0 && (
    <section className="card">
      <p className="text-sm font-bold text-to-text">Tabelle</p>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="text-to-text3">
              <th className="py-1 pr-2 font-semibold">#</th>
              <th className="sticky left-0 z-10 whitespace-nowrap border-r border-to-divider bg-to-surface py-1 pr-2 font-semibold">
                Team
              </th>
              <th className="px-1 py-1 text-right font-semibold">Sp</th>
              <th className="whitespace-nowrap px-1 py-1 text-right font-semibold">S-N</th>
              <th className="px-1 py-1 text-right font-semibold">Pkt</th>
              <th className="px-1 py-1 text-right font-semibold">Körbe</th>
              <th className="pl-1 py-1 text-right font-semibold">Diff.</th>
            </tr>
          </thead>
          <tbody>
            {state.leagueStandings.map((row) => (
              <tr key={row.id} className={`border-t border-to-divider ${row.is_own_team ? 'bg-to-accentSoft' : ''}`}>
                <td className={`py-1.5 pr-2 ${row.is_own_team ? 'font-bold text-to-accent' : 'text-to-text2'}`}>
                  {row.rang}
                </td>
                <td
                  className={`sticky left-0 z-10 whitespace-nowrap border-r border-to-divider py-1.5 pr-2 font-semibold ${
                    row.is_own_team ? 'bg-to-accentSoft text-to-accent' : 'bg-to-surface text-to-text'
                  }`}
                >
                  {row.team_name}
                </td>
                <td className="px-1 py-1.5 text-right text-to-text2">{row.spiele}</td>
                <td className="whitespace-nowrap px-1 py-1.5 text-right text-to-text2">
                  {row.siege}-{row.niederlagen}
                </td>
                <td
                  className={`px-1 py-1.5 text-right font-bold ${
                    row.is_own_team ? 'text-to-accent' : 'text-to-text'
                  }`}
                >
                  {row.punkte}
                </td>
                <td className="whitespace-nowrap px-1 py-1.5 text-right text-to-text2">
                  {row.koerbe_erzielt}:{row.koerbe_erhalten}
                </td>
                <td className="py-1.5 pl-1 text-right text-to-text2">
                  {row.diff > 0 ? `+${row.diff}` : row.diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-to-text3">
        Quelle: basketball-bund.net · Stand {fmtDateTimeShort(state.leagueStandings[0].updated_at)}
      </p>
    </section>
  );

  const tabsBar = (
    <div className="flex gap-2">
      <button
        className={`flex-1 rounded-xl py-2 text-sm font-bold ${
          activeTab === 'spielplan' ? 'bg-to-accent text-to-onAccent' : 'bg-to-bg text-to-text2'
        }`}
        onClick={() => setActiveTab('spielplan')}
      >
        Spielplan
      </button>
      <button
        className={`flex-1 rounded-xl py-2 text-sm font-bold ${
          activeTab === 'tabelle' ? 'bg-to-accent text-to-onAccent' : 'bg-to-bg text-to-text2'
        }`}
        onClick={() => setActiveTab('tabelle')}
      >
        Tabelle
      </button>
    </div>
  );

  const tabelleTab = leagueStandingsSection || (
    <p className="card text-sm text-to-text3">Tabelle ist aktuell nicht verfügbar.</p>
  );

  if (!state.nextGame) {
    return (
      <div className="space-y-4">
        <p className="card text-sm text-to-text3">Kein anstehendes Spiel geplant.</p>
        {tabsBar}
        {activeTab === 'spielplan' ? pastGamesSection : tabelleTab}
      </div>
    );
  }

  const next3 = state.upcomingGames.slice(0, UPCOMING_PREVIEW_COUNT);
  const rest = state.upcomingGames.slice(UPCOMING_PREVIEW_COUNT);

  return (
    <div className="space-y-4">
      <NextGameSquadCard game={state.nextGame} />

      {tabsBar}

      {activeTab === 'spielplan' ? (
        <>
          {next3.length > 0 && (
            <section className="card">
              <p className="text-sm font-bold text-to-text">Nächste Spiele</p>
              <ul className="mt-2 space-y-2">
                {next3.map((g) => (
                  <GameListItem key={g.id} game={g} />
                ))}
              </ul>
            </section>
          )}

          {rest.length > 0 && (
            <section className="card">
              <button
                className="flex w-full items-center justify-between text-sm font-bold text-to-text"
                onClick={() => setShowMore((v) => !v)}
              >
                Weitere Spieltage anzeigen
                <span>{showMore ? '▲' : '▼'}</span>
              </button>
              {showMore && (
                <ul className="mt-3 space-y-2">
                  {rest.map((g) => (
                    <GameListItem key={g.id} game={g} />
                  ))}
                </ul>
              )}
            </section>
          )}

          {pastGamesSection}
        </>
      ) : (
        tabelleTab
      )}
    </div>
  );
}
