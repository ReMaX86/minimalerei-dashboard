import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { MeetingPointFields, EMPTY_MEETING_POINT, type MeetingPointFormValue } from '../components/MeetingPointFields';
import { CarpoolSection } from '../components/CarpoolSection';
import { fmtDate, fmtTime } from '../lib/format';
import { meetingPoints, playerAbsenceOn, type Game, type GameSquadRow, type Player, type PlayerAbsence } from '../types/database';

const MAX_SQUAD_SIZE = 12;
const UPCOMING_PREVIEW_COUNT = 3;

interface State {
  nextGame: Game | null;
  upcomingGames: Game[];
  squad: GameSquadRow[];
  players: Player[];
  absences: PlayerAbsence[];
}

function GameListItem({ game }: { game: Game }) {
  return (
    <li className="rounded-xl bg-tbw-bg p-3 text-sm">
      <p className="font-semibold text-tbw-navyDark">
        vs. {game.opponent} <span className="pill pill-open ml-1">{game.is_home ? 'Heim' : 'Auswärts'}</span>
      </p>
      <p className="text-tbw-ink/60">
        {fmtDate(game.game_date)} · {fmtTime(game.game_time)} Uhr · {game.location}
      </p>
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
  const [publishing, setPublishing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [meetingForm, setMeetingForm] = useState<MeetingPointFormValue>(EMPTY_MEETING_POINT);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [responding, setResponding] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const [gamesRes, playersRes] = await Promise.all([
      supabase.from('games').select('*').gte('game_date', today).order('game_date').order('game_time').limit(15),
      supabase.from('players').select('*').eq('is_active', true)
    ]);
    if (gamesRes.error || playersRes.error) {
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
      squad,
      absences,
      players: ((playersRes.data as Player[]) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'de'))
    });
  }, [flags.absences]);

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

  if (!state.nextGame) {
    return <p className="card text-sm text-tbw-ink/50">Kein anstehendes Spiel geplant.</p>;
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
            <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/50">Nächster Spieltag</p>
            <p className="text-base font-bold text-tbw-navyDark">vs. {state.nextGame.opponent}</p>
            <p className="text-sm font-bold text-tbw-navyDark">
              {fmtDate(state.nextGame.game_date)} · {fmtTime(state.nextGame.game_time)} Uhr ·{' '}
              {state.nextGame.is_home ? 'Heim' : 'Auswärts'}
            </p>
            <p className="text-sm text-tbw-ink/60">{state.nextGame.location}</p>
            {!isAdmin && meetingPoints(state.nextGame).length > 0 && (
              <div className="mt-2 rounded-xl bg-tbw-bg px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-tbw-ink/40">Treffpunkt</p>
                {meetingPoints(state.nextGame).map((m) => (
                  <p key={m.label} className="text-xs text-tbw-ink/60">
                    {m.time && <span className="font-semibold text-tbw-ink/80">{fmtTime(m.time)} Uhr</span>}
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
            <div className="mt-3 flex gap-2 border-t border-black/5 pt-3">
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
              <div className="mt-3 border-t border-black/5 pt-3">
                <p className="text-sm font-bold text-tbw-navyDark">Treffpunkt</p>
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
              <div className="mt-3 border-t border-black/5 pt-3">
                <ul className="divide-y divide-black/5">
                  {sortedForTrainer.map((p) => {
                    const declined = !selectedByPlayer[p.id] && confirmationByPlayer[p.id] === 'declined';
                    const confirmed = selectedByPlayer[p.id] && confirmationByPlayer[p.id] === 'confirmed';
                    const awaitingResponse = selectedByPlayer[p.id] && confirmationByPlayer[p.id] === 'pending';
                    return (
                      <li key={p.id} className="flex items-center justify-between py-2">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-tbw-navyDark">
                          {p.name}
                          {confirmed && (
                            <span className="font-bold text-status-ok" title="Hat zugesagt">
                              ✓
                            </span>
                          )}
                          {awaitingResponse && (
                            <span className="text-tbw-ink/40" title="Hat noch nicht geantwortet">
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
                      </li>
                    );
                  })}
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
              </div>
            )}
          </>
        )}

        {role === 'player' &&
          !isAdmin &&
          (state.nextGame.squad_published ? (
            <div className="mt-3 border-t border-black/5 pt-3">
              <button
                type="button"
                className="flex w-full items-center justify-between text-sm font-bold text-tbw-navyDark"
                onClick={() => setSquadOpen((v) => !v)}
              >
                👥 Kader {squadOpen ? 'ausblenden' : 'anzeigen'}
                <span>{squadOpen ? '▲' : '▼'}</span>
              </button>
              {squadOpen &&
                (state.players.filter((p) => selectedByPlayer[p.id]).length === 0 ? (
                  <p className="mt-3 text-sm text-tbw-ink/50">Niemand im Kader.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-black/5">
                    {state.players
                      .filter((p) => selectedByPlayer[p.id])
                      .map((p) => {
                        const isMe = player?.id === p.id;
                        const confirmed = isMe && confirmationByPlayer[p.id] === 'confirmed';
                        return (
                          <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                            <span className={isMe ? 'font-bold text-tbw-navyDark' : 'font-medium text-tbw-navyDark'}>
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
                                    className="text-xs font-semibold text-tbw-ink/40 underline disabled:opacity-40"
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
            <p className="mt-3 text-sm text-tbw-ink/50">Kader für dieses Spiel noch nicht veröffentlicht.</p>
          ))}
      </section>

      {flags.carpool && role !== 'viewer' && !state.nextGame.is_home && (
        <CarpoolSection gameId={state.nextGame.id} players={state.players} />
      )}

      {next3.length > 0 && (
        <section className="card">
          <p className="text-sm font-bold text-tbw-navyDark">Nächste Spiele</p>
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
            className="flex w-full items-center justify-between text-sm font-bold text-tbw-navyDark"
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
    </div>
  );
}
