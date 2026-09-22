import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { MeetingPointFields, EMPTY_MEETING_POINT, type MeetingPointFormValue } from '../components/MeetingPointFields';
import { CarpoolSection } from '../components/CarpoolSection';
import { fmtDate, fmtDateTimeShort, fmtTime } from '../lib/format';
import {
  gameResult,
  meetingPoints,
  playerAbsenceOn,
  type Game,
  type GameSquadRow,
  type LeagueStandingRow,
  type Player,
  type PlayerAbsence
} from '../types/database';

const MAX_SQUAD_SIZE = 12;
const UPCOMING_PREVIEW_COUNT = 3;
const PAST_PREVIEW_COUNT = 3;

const RESULT_LABELS = { sieg: 'Sieg', niederlage: 'Niederlage', unentschieden: 'Unentschieden' } as const;

interface State {
  nextGame: Game | null;
  upcomingGames: Game[];
  pastGames: Game[];
  squad: GameSquadRow[];
  players: Player[];
  absences: PlayerAbsence[];
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
  const { role, isAdmin, player } = useAuth();
  const { flags } = useFeatureFlags();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [squadOpen, setSquadOpen] = useState(false);
  const [squadEditorOpen, setSquadEditorOpen] = useState(false);
  const [meetingEditorOpen, setMeetingEditorOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showPastMore, setShowPastMore] = useState(false);
  // Auf Nutzeranfrage: Tabelle ist prominenter untergebracht (eigener Tab
  // statt ganz unten auf der Seite) und standardmäßig vorausgewählt.
  const [activeTab, setActiveTab] = useState<'spielplan' | 'tabelle'>('tabelle');
  const [publishing, setPublishing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [meetingForm, setMeetingForm] = useState<MeetingPointFormValue>(EMPTY_MEETING_POINT);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [responding, setResponding] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const [gamesRes, playersRes, pastGamesRes, standingsRes] = await Promise.all([
      supabase
        .from('games')
        .select('*')
        .gte('game_date', today)
        .is('stats_finalized_at', null)
        .order('game_date')
        .order('game_time')
        .limit(15),
      supabase.from('players').select('*').eq('is_active', true),
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
    if (gamesRes.error || playersRes.error || pastGamesRes.error || standingsRes.error) {
      setError('Fehler beim Laden der Spiele.');
      return;
    }
    const games = (gamesRes.data as Game[]) ?? [];
    const nextGame = games[0] ?? null;
    let squad: GameSquadRow[] = [];
    let absences: PlayerAbsence[] = [];
    if (nextGame) {
      const { data: squadRows } = await supabase.from('game_squad').select('*').eq('game_id', nextGame.id);
      squad = (squadRows as GameSquadRow[]) ?? [];
      if (flags.absences) {
        const { data: absenceRows } = await supabase
          .from('player_absences')
          .select('*')
          .lte('start_date', nextGame.game_date)
          .gte('end_date', nextGame.game_date);
        absences = (absenceRows as PlayerAbsence[]) ?? [];
      }
    }
    setState({
      nextGame,
      upcomingGames: games.slice(1),
      pastGames: (pastGamesRes.data as Game[]) ?? [],
      squad,
      absences,
      players: ((playersRes.data as Player[]) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'de')),
      leagueStandings: (standingsRes.data as LeagueStandingRow[]) ?? []
    });
  }, [flags.absences, flags.stats, flags.standings]);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Spiele.'));
  }, [load]);

  useEffect(() => {
    if (searchParams.get('kader') !== '1') return;
    if (isAdmin) setSquadEditorOpen(true);
    else setSquadOpen(true);
  }, [searchParams, isAdmin]);

  // Öffnet der Trainer die Kader-Bearbeitung, gilt eine offene
  // Absage-Meldung als gesehen — unabhängig davon, ob er anschließend den
  // betroffenen Spieler tatsächlich anfasst.
  useEffect(() => {
    if (!squadEditorOpen || !state?.nextGame?.squad_decline_pending) return;
    const gameId = state.nextGame.id;
    supabase
      .from('games')
      .update({ squad_decline_pending: false })
      .eq('id', gameId)
      .then(() => {
        setState((prev) =>
          prev && prev.nextGame && prev.nextGame.id === gameId
            ? { ...prev, nextGame: { ...prev.nextGame, squad_decline_pending: false } }
            : prev
        );
      });
  }, [squadEditorOpen, state?.nextGame?.id, state?.nextGame?.squad_decline_pending]);

  useEffect(() => {
    const g = state?.nextGame;
    setMeetingForm({
      meeting_time_hall: g?.meeting_time_hall?.slice(0, 5) ?? '',
      meeting_time_carpool: g?.meeting_time_carpool?.slice(0, 5) ?? '',
      meeting_point_carpool: g?.meeting_point_carpool ?? ''
    });
  }, [state?.nextGame?.id, state?.nextGame?.meeting_time_hall, state?.nextGame?.meeting_time_carpool, state?.nextGame?.meeting_point_carpool]);

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

  const selectedByPlayer: Record<string, boolean> = {};
  const confirmationByPlayer: Record<string, GameSquadRow['confirmation']> = {};
  state.squad.forEach((row) => {
    selectedByPlayer[row.player_id] = row.is_selected;
    confirmationByPlayer[row.player_id] = row.confirmation;
  });

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
        // confirmation immer zurück auf 'pending': ein manueller Eingriff
        // des Trainers (egal ob rein oder raus) ist keine eigene Zu-/Absage
        // des Spielers mehr und soll bei erneuter Aufnahme frisch abgefragt
        // werden.
        .upsert(
          { game_id: state!.nextGame!.id, player_id: playerId, is_selected: willSelect, confirmation: 'pending' },
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

  async function respond(confirmed: boolean) {
    setResponding(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('respond_to_squad', {
        p_game_id: state!.nextGame!.id,
        p_confirmed: confirmed
      });
      if (rpcError) throw rpcError;
      await load();
    } catch {
      setError('Rückmeldung konnte nicht gespeichert werden.');
    } finally {
      setResponding(false);
    }
  }

  async function saveMeetingPoint() {
    setSavingMeeting(true);
    setError(null);
    const isHome = state!.nextGame!.is_home;
    try {
      const { error: updError } = await supabase
        .from('games')
        .update({
          meeting_time_hall: meetingForm.meeting_time_hall || null,
          meeting_time_carpool: isHome ? null : meetingForm.meeting_time_carpool || null,
          meeting_point_carpool: isHome ? null : meetingForm.meeting_point_carpool.trim() || null
        })
        .eq('id', state!.nextGame!.id);
      if (updError) throw updError;
      setMeetingEditorOpen(false);
      await load();
    } catch {
      setError('Treffpunkt konnte nicht gespeichert werden.');
    } finally {
      setSavingMeeting(false);
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
      setSquadEditorOpen(false);
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
  const next3 = state.upcomingGames.slice(0, UPCOMING_PREVIEW_COUNT);
  const rest = state.upcomingGames.slice(UPCOMING_PREVIEW_COUNT);

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-to-text3">Nächster Spieltag</p>
            <p className="text-base font-bold text-to-text">vs. {state.nextGame.opponent}</p>
            <p className="text-sm font-bold text-to-text">
              {fmtDate(state.nextGame.game_date)} · {fmtTime(state.nextGame.game_time)} Uhr ·{' '}
              {state.nextGame.is_home ? 'Heim' : 'Auswärts'}
            </p>
            <p className="text-sm text-to-text2">{state.nextGame.location}</p>
            {!isAdmin && meetingPoints(state.nextGame).length > 0 && (
              <div className="mt-2 rounded-xl bg-to-bg px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-to-text3">Treffpunkt</p>
                {meetingPoints(state.nextGame).map((m) => (
                  <p key={m.label} className="text-xs text-to-text2">
                    {m.time && <span className="font-semibold text-to-text2">{fmtTime(m.time)} Uhr</span>}
                    {m.time && ' · '}
                    {m.label}
                    {m.place ? `, ${m.place}` : ''}
                  </p>
                ))}
              </div>
            )}
          </div>
          <span
            className={`pill shrink-0 whitespace-nowrap !text-[10px] ${
              state.nextGame.squad_published ? 'pill-ok' : 'pill-open'
            }`}
          >
            {state.nextGame.squad_published ? 'Kader veröffentlicht' : 'Kader ausstehend'}
          </span>
        </div>

        {isAdmin && (
          <>
            <div className="mt-3 flex gap-2 border-t border-to-divider pt-3">
              <button
                type="button"
                onClick={() => setSquadEditorOpen((v) => !v)}
                className="btn-secondary flex-1 !py-2 text-xs"
              >
                👥{' '}
                {squadEditorOpen
                  ? 'Kader schließen'
                  : state.nextGame.squad_published
                  ? 'Kader ansehen'
                  : 'Kader festlegen'}
              </button>
              <button
                type="button"
                onClick={() => setMeetingEditorOpen((v) => !v)}
                className="btn-secondary flex-1 !py-2 text-xs"
              >
                📍{' '}
                {meetingEditorOpen
                  ? 'Treffpunkt schließen'
                  : meetingPoints(state.nextGame).length > 0
                  ? 'Treffpunkt bearbeiten'
                  : 'Treffpunkt hinterlegen'}
              </button>
            </div>

            {meetingEditorOpen && (
              <div className="mt-3 border-t border-to-divider pt-3">
                <p className="text-sm font-bold text-to-text">Treffpunkt</p>
                <div className="mt-2">
                  <MeetingPointFields
                    isHome={state.nextGame.is_home}
                    value={meetingForm}
                    onChange={setMeetingForm}
                  />
                </div>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={saveMeetingPoint}
                    disabled={savingMeeting}
                    className="btn-secondary !px-3 !py-1.5 text-xs"
                  >
                    {savingMeeting ? 'Speichere…' : 'Treffpunkt speichern'}
                  </button>
                </div>
              </div>
            )}

            {squadEditorOpen && (
              <div className="mt-3 border-t border-to-divider pt-3">
                <ul className="divide-y divide-to-divider">
                  {sortedForTrainer.map((p) => {
                    const declined = !selectedByPlayer[p.id] && confirmationByPlayer[p.id] === 'declined';
                    const confirmed = selectedByPlayer[p.id] && confirmationByPlayer[p.id] === 'confirmed';
                    const awaitingResponse = selectedByPlayer[p.id] && confirmationByPlayer[p.id] === 'pending';
                    const isMe = player?.id === p.id;
                    return (
                      <li key={p.id} className="py-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-to-text">
                            {p.name}
                            {isMe && ' (Du)'}
                            {confirmed && (
                              <span className="font-bold text-to-accent" title="Hat zugesagt">
                                ✓
                              </span>
                            )}
                            {awaitingResponse && (
                              <span className="text-to-text3" title="Hat noch nicht geantwortet">
                                🕐
                              </span>
                            )}
                            {flags.absences && playerAbsenceOn(state.absences, p.id, state.nextGame!.game_date) && (
                              <span className="pill pill-warn" title="Im Urlaub eingetragen">
                                🌴
                              </span>
                            )}
                          </span>
                          <button
                            disabled={togglingId === p.id || (atCap && !selectedByPlayer[p.id])}
                            onClick={() => toggle(p.id)}
                            className={`pill ${
                              selectedByPlayer[p.id] ? 'pill-ok' : declined ? 'pill-warn' : 'pill-open'
                            } disabled:opacity-40`}
                          >
                            {selectedByPlayer[p.id] ? 'im Kader' : declined ? 'abgesagt' : 'nicht im Kader'}
                          </button>
                        </div>
                        {isMe && selectedByPlayer[p.id] && (
                          <div className="mt-1.5 flex items-center gap-2">
                            {confirmed ? (
                              <>
                                <span className="pill pill-ok">✓ Du hast zugesagt</span>
                                <button
                                  type="button"
                                  disabled={responding}
                                  onClick={() => respond(false)}
                                  className="text-xs font-semibold text-to-text3 underline disabled:opacity-40"
                                >
                                  Doch nicht?
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-to-text3">Kannst du selbst?</span>
                                <button
                                  type="button"
                                  disabled={responding}
                                  onClick={() => respond(true)}
                                  className="pill pill-ok disabled:opacity-40"
                                >
                                  ✓ Kann
                                </button>
                                <button
                                  type="button"
                                  disabled={responding}
                                  onClick={() => respond(false)}
                                  className="pill pill-open disabled:opacity-40"
                                >
                                  ✗ Kann nicht
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-to-text3">
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
              </div>
            )}
          </>
        )}

        {role === 'player' &&
          !isAdmin &&
          (state.nextGame.squad_published ? (
            <div className="mt-3 border-t border-to-divider pt-3">
              <button
                type="button"
                className="flex w-full items-center justify-between text-sm font-bold text-to-text"
                onClick={() => setSquadOpen((v) => !v)}
              >
                👥 Kader {squadOpen ? 'ausblenden' : 'anzeigen'}
                <span>{squadOpen ? '▲' : '▼'}</span>
              </button>
              {squadOpen &&
                (state.players.filter((p) => selectedByPlayer[p.id]).length === 0 ? (
                  <p className="mt-3 text-sm text-to-text3">Niemand im Kader.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-to-divider">
                    {state.players
                      .filter((p) => selectedByPlayer[p.id])
                      .map((p) => {
                        const isMe = player?.id === p.id;
                        const confirmed = isMe && confirmationByPlayer[p.id] === 'confirmed';
                        return (
                          <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                            <span className={isMe ? 'font-bold text-to-text' : 'font-medium text-to-text'}>
                              {p.name}
                              {isMe && ' (Du)'}
                            </span>
                            {isMe &&
                              (confirmed ? (
                                <div className="flex items-center gap-2">
                                  <span className="pill pill-ok">✓ Zugesagt</span>
                                  <button
                                    type="button"
                                    disabled={responding}
                                    onClick={() => respond(false)}
                                    className="text-xs font-semibold text-to-text3 underline disabled:opacity-40"
                                  >
                                    Doch nicht?
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={responding}
                                    onClick={() => respond(true)}
                                    className="pill pill-ok disabled:opacity-40"
                                  >
                                    ✓ Kann
                                  </button>
                                  <button
                                    type="button"
                                    disabled={responding}
                                    onClick={() => respond(false)}
                                    className="pill pill-open disabled:opacity-40"
                                  >
                                    ✗ Kann nicht
                                  </button>
                                </div>
                              ))}
                          </li>
                        );
                      })}
                  </ul>
                ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-to-text3">Kader für dieses Spiel noch nicht veröffentlicht.</p>
          ))}

        {flags.carpool && role !== 'viewer' && !state.nextGame.is_home && (
          <CarpoolSection gameId={state.nextGame.id} players={state.players} embedded />
        )}
      </section>

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
