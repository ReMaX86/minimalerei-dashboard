import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { UpcomingTrainings } from '../components/UpcomingTrainings';
import { AbsenceSection } from '../components/AbsenceSection';
import { fmtDate, fmtDateShort, fmtTime } from '../lib/format';
import { nextTrainingOccurrences } from '../lib/trainingSchedule';
import { computeReminders, type ReminderItem } from '../lib/reminders';
import { pendingWasherFor } from '../lib/trikots';
import {
  OFFICIATING_TASK_LABELS,
  STAT_POINT_VALUES,
  benoetigterSatz,
  gameResult,
  meetingPoints,
  officiatingGameLabel,
  type Announcement,
  type CarpoolClaim,
  type CarpoolOffer,
  type Game,
  type GameSquadRow,
  type OfficiatingGame,
  type OfficiatingTask,
  type Player,
  type PlayerAbsence,
  type ReminderSettings,
  type SquadConfirmation,
  type StatType,
  type Training,
  type TrikotSet,
  type TrikotWashLogRow
} from '../types/database';

const RESULT_LABELS = { sieg: 'Sieg', niederlage: 'Niederlage', unentschieden: 'Unentschieden' } as const;

interface DashboardData {
  nextGame: Game | null;
  playerInSquad: boolean | null;
  myConfirmation: SquadConfirmation | null;
  playerNextTask: (OfficiatingTask & { officiating_games: OfficiatingGame }) | null;
  trainerNextOfficiatingGame: (OfficiatingGame & { tasks: OfficiatingTask[] }) | null;
  trikotSets: TrikotSet[];
  players: Record<string, Player>;
  announcements: Announcement[];
  carpoolOffers: CarpoolOffer[];
  carpoolClaims: CarpoolClaim[];
  absencesOverview: PlayerAbsence[];
  lastResult: Game | null;
  myTotalPoints: number | null;
  declinedNames: string[];
  reminders: ReminderItem[];
}

export function Dashboard() {
  const { role, player, isAdmin } = useAuth();
  const { flags } = useFeatureFlags();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [absenceVersion, setAbsenceVersion] = useState(0);
  const [trainingVersion, setTrainingVersion] = useState(0);
  const [showUpcomingAbsences, setShowUpcomingAbsences] = useState(false);
  // Trainers/admin-players get the full Kampfgericht overview so they can
  // plan; a read-only Betrachter (e.g. Abteilungsleiter) gets to see the
  // same overview, just with no way to assign/edit anything. Captains/
  // Co-Captains get it too so they can remind teammates who's up next.
  const showOfficiatingOverview = isAdmin || role === 'viewer' || !!player?.is_captain || !!player?.is_co_captain;
  // Same audience as the Kampfgericht overview minus Betrachter — knowing
  // who's away is squad-planning info, which is outside a Betrachter's
  // original spielplan/Kampfgericht-only scope.
  const showAbsencesOverview = (isAdmin || !!player?.is_captain || !!player?.is_co_captain) && flags.absences;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      const today = new Date().toISOString().slice(0, 10);

      const [gameRes, trikotRes, playersRes, announcementsRes] = await Promise.all([
        supabase.from('games').select('*').gte('game_date', today).order('game_date').order('game_time').limit(1).maybeSingle(),
        supabase.from('trikot_sets').select('*').order('id'),
        supabase.from('players').select('*').eq('is_active', true),
        flags.announcements
          ? supabase
              .from('announcements')
              .select('*')
              .order('pinned', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] as Announcement[], error: null })
      ]);

      let playerNextTask: DashboardData['playerNextTask'] = null;
      let trainerNextOfficiatingGame: DashboardData['trainerNextOfficiatingGame'] = null;
      let playerInSquad: DashboardData['playerInSquad'] = null;
      let myConfirmation: DashboardData['myConfirmation'] = null;
      let carpoolOffers: CarpoolOffer[] = [];
      let carpoolClaims: CarpoolClaim[] = [];
      let declinedNames: string[] = [];

      const nextGame = gameRes.data as Game | null;
      const playersById: Record<string, Player> = {};
      (playersRes.data as Player[] | null)?.forEach((p) => (playersById[p.id] = p));

      if (isAdmin && nextGame?.squad_decline_pending) {
        const { data: declinedRows } = await supabase
          .from('game_squad')
          .select('player_id')
          .eq('game_id', nextGame.id)
          .eq('confirmation', 'declined');
        declinedNames = ((declinedRows as { player_id: string }[] | null) ?? [])
          .map((r) => playersById[r.player_id]?.name)
          .filter((n): n is string => !!n);
      }

      if (flags.carpool && nextGame && !nextGame.is_home) {
        const [offersRes, claimsRes] = await Promise.all([
          supabase.from('carpool_offers').select('*').eq('game_id', nextGame.id),
          supabase.from('carpool_claims').select('*').eq('game_id', nextGame.id)
        ]);
        carpoolOffers = (offersRes.data as CarpoolOffer[]) ?? [];
        carpoolClaims = (claimsRes.data as CarpoolClaim[]) ?? [];
      }

      if (role === 'player' && player && nextGame?.squad_published) {
        const { data: squadRow } = await supabase
          .from('game_squad')
          .select('is_selected, confirmation')
          .eq('game_id', nextGame.id)
          .eq('player_id', player.id)
          .maybeSingle();
        playerInSquad = squadRow?.is_selected ?? false;
        myConfirmation = playerInSquad ? (squadRow?.confirmation as SquadConfirmation) ?? 'pending' : null;
      }

      let myOfficiatingCount = 0;
      if (role === 'player' && player) {
        const { data: taskRows, error: taskErr } = await supabase
          .from('officiating_tasks')
          .select('*')
          .eq('assigned_player_id', player.id);
        if (taskErr) {
          console.error('officiating_tasks fetch failed', taskErr);
        } else {
          myOfficiatingCount = (taskRows as OfficiatingTask[] | null)?.length ?? 0;
          if (taskRows && taskRows.length > 0) {
            const gameIds = [...new Set((taskRows as OfficiatingTask[]).map((t) => t.officiating_game_id))];
            const { data: gameRows, error: gamesErr } = await supabase
              .from('officiating_games')
              .select('*')
              .in('id', gameIds)
              .gte('game_date', today)
              .order('game_date');
            if (gamesErr) {
              console.error('officiating_games fetch failed', gamesErr);
            } else if (gameRows && gameRows.length > 0) {
              const soonestGame = gameRows[0] as OfficiatingGame;
              const task = (taskRows as OfficiatingTask[]).find((t) => t.officiating_game_id === soonestGame.id);
              if (task) playerNextTask = { ...task, officiating_games: soonestGame };
            }
          }
        }
      }

      // "Für dich zu erledigen": bündelt Kader-Zusage, Training-Zusage und
      // Kampfgericht-Mindesteinsätze in einer Erinnerung auf der Startseite
      // (Admin -> Funktionen -> Erinnerungen legt die Fristen fest). Reine
      // Spieler-Sicht — für Trainer/Betrachter irrelevant.
      let reminders: ReminderItem[] = [];
      if (role === 'player' && player) {
        const { data: settingsRow } = await supabase.from('reminder_settings').select('*').limit(1).maybeSingle();
        const settings = settingsRow as ReminderSettings | null;

        if (settings?.enabled) {
          let hasOpenFutureOfficiatingSlot = false;
          if (!player.officiating_exempt && myOfficiatingCount < settings.officiating_season_min) {
            const { data: futureGames } = await supabase.from('officiating_games').select('id').gte('game_date', today);
            const futureGameIds = ((futureGames as { id: string }[] | null) ?? []).map((g) => g.id);
            if (futureGameIds.length > 0) {
              const { data: openTasks } = await supabase
                .from('officiating_tasks')
                .select('id')
                .in('officiating_game_id', futureGameIds)
                .is('assigned_player_id', null)
                .limit(1);
              hasOpenFutureOfficiatingSlot = ((openTasks as { id: string }[] | null) ?? []).length > 0;
            }
          }

          let trainingReminder: Parameters<typeof computeReminders>[3] = null;
          const { data: trainingRows } = await supabase.from('trainings').select('*');
          const nextOcc = nextTrainingOccurrences((trainingRows as Training[]) ?? [], 1)[0];
          if (nextOcc) {
            // training_rsvps hat keine `id`-Spalte (zusammengesetzter Primary
            // Key aus training_id/session_date/player_id) — .select('id')
            // schlägt serverseitig fehl und rsvpRow bleibt sonst stumm immer
            // null, egal ob schon geantwortet wurde.
            const { data: rsvpRow, error: rsvpErr } = await supabase
              .from('training_rsvps')
              .select('is_attending')
              .eq('training_id', nextOcc.training.id)
              .eq('session_date', nextOcc.date)
              .eq('player_id', player.id)
              .maybeSingle();
            if (rsvpErr) console.error('training_rsvps fetch failed', rsvpErr);
            let onAbsence = false;
            if (flags.absences) {
              const { data: absenceRow } = await supabase
                .from('player_absences')
                .select('id')
                .eq('player_id', player.id)
                .lte('start_date', nextOcc.date)
                .gte('end_date', nextOcc.date)
                .maybeSingle();
              onAbsence = !!absenceRow;
            }
            trainingReminder = { date: nextOcc.date, hasResponded: !!rsvpRow, onAbsence };
          }

          // Trikot-Übergabe: erst ab dem Spieltag relevant (vorher zeigt die
          // Trikots-Seite den Vorschlag nur informativ ohne Bestätigen-
          // Button an) — danach so lange, bis sie bestätigt wurde, auch
          // rückwirkend fürs zuletzt gespielte Spiel.
          let trikotReminder: Parameters<typeof computeReminders>[5] = null;
          {
            const { data: washRows } = await supabase.from('trikot_wash_log').select('*');
            const washLog = (washRows as TrikotWashLogRow[] | null) ?? [];
            const allPlayers = Object.values(playersById);

            if (nextGame && nextGame.game_date === today) {
              const { data: squadRows } = await supabase.from('game_squad').select('*').eq('game_id', nextGame.id);
              const pending = pendingWasherFor(nextGame, (squadRows as GameSquadRow[]) ?? [], allPlayers, washLog);
              if (pending?.player.id === player.id) {
                trikotReminder = { pending: true, opponent: nextGame.opponent };
              }
            }

            if (!trikotReminder) {
              const { data: pastGameRow } = await supabase
                .from('games')
                .select('*')
                .lt('game_date', today)
                .order('game_date', { ascending: false })
                .limit(1)
                .maybeSingle();
              const pastGame = pastGameRow as Game | null;
              if (pastGame) {
                const { data: pastSquadRows } = await supabase.from('game_squad').select('*').eq('game_id', pastGame.id);
                const pending = pendingWasherFor(pastGame, (pastSquadRows as GameSquadRow[]) ?? [], allPlayers, washLog);
                if (pending?.player.id === player.id) {
                  trikotReminder = { pending: true, opponent: pastGame.opponent };
                }
              }
            }
          }

          reminders = computeReminders(
            new Date(),
            settings,
            nextGame
              ? {
                  published: nextGame.squad_published,
                  inSquad: !!playerInSquad,
                  confirmation: myConfirmation,
                  gameDate: nextGame.game_date,
                  opponent: nextGame.opponent
                }
              : null,
            trainingReminder,
            { exempt: player.officiating_exempt, count: myOfficiatingCount, hasOpenFutureSlot: hasOpenFutureOfficiatingSlot },
            trikotReminder
          );
        }
      }

      let absencesOverview: PlayerAbsence[] = [];
      if (showAbsencesOverview) {
        const { data: absenceRows } = await supabase
          .from('player_absences')
          .select('*')
          .gte('end_date', today)
          .order('start_date')
          .limit(10);
        absencesOverview = (absenceRows as PlayerAbsence[]) ?? [];
      }

      let lastResult: Game | null = null;
      let myTotalPoints: number | null = null;
      if (flags.stats) {
        const { data: lastGameRow } = await supabase
          .from('games')
          .select('*')
          .not('stats_finalized_at', 'is', null)
          .order('game_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        lastResult = lastGameRow as Game | null;

        if (role === 'player' && player) {
          const { data: statRows } = await supabase
            .from('game_stat_events')
            .select('stat_type')
            .eq('team', 'us')
            .eq('player_id', player.id)
            .in('stat_type', ['fg2_made', 'fg3_made', 'ft_made']);
          myTotalPoints = ((statRows as { stat_type: StatType }[] | null) ?? []).reduce(
            (sum, r) => sum + (STAT_POINT_VALUES[r.stat_type] ?? 0),
            0
          );
        }
      }

      if (showOfficiatingOverview) {
        const { data: nextOg } = await supabase
          .from('officiating_games')
          .select('*')
          .gte('game_date', today)
          .order('game_date')
          .limit(1)
          .maybeSingle();
        if (nextOg) {
          const { data: tasks } = await supabase
            .from('officiating_tasks')
            .select('*')
            .eq('officiating_game_id', nextOg.id);
          trainerNextOfficiatingGame = { ...(nextOg as OfficiatingGame), tasks: (tasks as OfficiatingTask[]) ?? [] };
        }
      }

      if (cancelled) return;

      if (gameRes.error || trikotRes.error) {
        setError('Fehler beim Laden der Startseite.');
        return;
      }

      setData({
        nextGame: nextGame ?? null,
        playerInSquad,
        myConfirmation,
        playerNextTask,
        trainerNextOfficiatingGame,
        trikotSets: (trikotRes.data as TrikotSet[]) ?? [],
        players: playersById,
        announcements: (announcementsRes.data as Announcement[]) ?? [],
        carpoolOffers,
        carpoolClaims,
        absencesOverview,
        lastResult,
        myTotalPoints,
        reminders,
        declinedNames
      });
    }

    load().catch(() => !cancelled && setError('Fehler beim Laden der Startseite.'));
    return () => {
      cancelled = true;
    };
  }, [
    role,
    player,
    isAdmin,
    flags.announcements,
    flags.carpool,
    flags.absences,
    flags.stats,
    absenceVersion,
    trainingVersion
  ]);

  if (error) return <div className="card text-sm text-tbw-red">{error}</div>;
  if (!data) return <LoadingSpinner />;

  const firstName = (player?.name ?? '').split(' ')[0];
  const ownSetId = player
    ? data.trikotSets.find((s) => s.current_holder_id === player.id)?.id ?? null
    : null;

  return (
    <div className="space-y-4">
      {player && <p className="headline text-3xl text-tbw-navyDark">Hi {firstName}!</p>}

      {role === 'player' && data.reminders.length > 0 && (
        <section className="card !bg-tbw-red/10 !ring-tbw-red/30">
          <SectionTitle icon="⚠️" title="Für dich zu erledigen" />
          <ul className="mt-2 space-y-2">
            {data.reminders.map((r) =>
              r.to.startsWith('#') ? (
                <li key={r.key}>
                  <a
                    href={r.to}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/70 p-3 text-sm font-semibold text-tbw-navyDark"
                  >
                    <span className="flex items-center gap-2">
                      <span>{r.icon}</span>
                      {r.text}
                    </span>
                    <span className="text-tbw-red">→</span>
                  </a>
                </li>
              ) : (
                <li key={r.key}>
                  <Link
                    to={r.to}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/70 p-3 text-sm font-semibold text-tbw-navyDark"
                  >
                    <span className="flex items-center gap-2">
                      <span>{r.icon}</span>
                      {r.text}
                    </span>
                    <span className="text-tbw-red">→</span>
                  </Link>
                </li>
              )
            )}
          </ul>
        </section>
      )}

      {flags.announcements && data.announcements.length > 0 && (
        <section className="card !bg-tbw-gold/10 !ring-tbw-gold/30">
          <SectionTitle icon="📣" title="Meldungen" />
          <ul className="mt-2 space-y-2">
            {data.announcements.map((a) => (
              <li key={a.id} className="rounded-xl bg-white p-3">
                {a.pinned && (
                  <p className="text-[10px] font-bold uppercase tracking-wide text-tbw-gold">Angeheftet</p>
                )}
                <p className="text-sm text-tbw-navyDark">{a.message}</p>
                <p className="mt-1 text-xs text-tbw-ink/40">
                  {a.author_name} · {fmtDate(a.created_at.slice(0, 10))}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && data.nextGame?.squad_decline_pending && data.declinedNames.length > 0 && (
        <section className="card !bg-status-warn/10 !ring-status-warn/30">
          <SectionTitle icon="⚠️" title="Kader-Absage" />
          <p className="mt-2 text-sm text-tbw-navyDark">
            {declinedNamesText(data.declinedNames)} leider am Spiel vs. {data.nextGame.opponent} nicht teilnehmen.
          </p>
          <Link to="/spiele?kader=1" className="btn-secondary mt-3 block w-full text-center !py-2 text-sm">
            Kader bearbeiten
          </Link>
        </section>
      )}

      <section className="card">
        <SectionTitle icon="🏀" title="Nächstes Spiel" />
        {data.nextGame ? (
          <div className="mt-2 space-y-1">
            <p className="text-base font-semibold">
              vs. {data.nextGame.opponent}{' '}
              <span className="pill pill-open ml-1">{data.nextGame.is_home ? 'Heim' : 'Auswärts'}</span>
            </p>
            <p className="text-base font-bold text-tbw-navyDark">
              {fmtDate(data.nextGame.game_date)} · {fmtTime(data.nextGame.game_time)} Uhr
            </p>
            <p className="text-sm text-tbw-ink/70">{data.nextGame.location}</p>

            {meetingPoints(data.nextGame).length > 0 && (
              <div className="mt-2 rounded-xl bg-tbw-bg px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-tbw-ink/40">Treffpunkt</p>
                {meetingPoints(data.nextGame).map((m) => (
                  <p key={m.label} className="text-xs text-tbw-ink/60">
                    {m.time && <span className="font-semibold text-tbw-ink/80">{fmtTime(m.time)} Uhr</span>}
                    {m.time && ' · '}
                    {m.label}
                    {m.place ? `, ${m.place}` : ''}
                  </p>
                ))}
              </div>
            )}

            {flags.carpool && data.carpoolOffers.length > 0 && (
              <div className="mt-2 rounded-xl bg-tbw-bg px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-tbw-ink/40">
                    Mitfahrgelegenheit
                  </p>
                  <Link to="/spiele" className="text-[10px] font-bold text-tbw-navy">
                    Verwalten →
                  </Link>
                </div>
                {data.carpoolOffers.map((o) => {
                  const free = o.seats - data.carpoolClaims.filter((c) => c.offer_id === o.id).length;
                  return (
                    <p key={o.id} className="text-xs text-tbw-ink/60">
                      <span className="font-semibold text-tbw-ink/80">
                        {data.players[o.driver_player_id]?.name ?? '?'}
                      </span>{' '}
                      · {free > 0 ? `${free} von ${o.seats} Plätzen frei` : 'voll'}
                    </p>
                  );
                })}
              </div>
            )}

            <p className="mt-2 text-xs text-tbw-ink/50">
              Trikot: {benoetigterSatz(data.nextGame) === 'weiss' ? 'Weiß' : 'Schwarz'}
            </p>
            {flags.stats &&
              (role === 'player' || role === 'trainer') &&
              data.nextGame.game_date <= new Date().toISOString().slice(0, 10) &&
              !data.nextGame.stats_finalized_at && (
                <Link
                  to={`/stats/${data.nextGame.id}`}
                  className="btn-accent mt-2 block w-full text-center !py-2 text-sm"
                >
                  📊 Spiel-Stats tracken
                </Link>
              )}
            {role === 'player' && (
              <div className="mt-3 border-t border-black/5 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  {!data.nextGame.squad_published ? (
                    <span className="text-sm text-tbw-ink/50">Kader noch nicht veröffentlicht</span>
                  ) : data.playerInSquad ? (
                    <span className="text-sm font-bold text-status-ok">
                      Du bist dabei!{data.myConfirmation === 'confirmed' && ' (zugesagt)'}
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-tbw-ink/50">Nicht im Kader</span>
                  )}
                  {data.nextGame.squad_published && (
                    <Link to="/spiele?kader=1" className="shrink-0 text-xs font-bold text-tbw-navy">
                      Kader ansehen →
                    </Link>
                  )}
                </div>
                {data.playerInSquad && data.myConfirmation === 'pending' && (
                  <Link to="/spiele?kader=1" className="mt-2 block text-sm font-bold text-tbw-red">
                    ⚠️ Bitte Teilnahme bestätigen
                  </Link>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-tbw-ink/50">Kein Spiel geplant.</p>
        )}
      </section>

      {flags.stats && data.lastResult && (
        <section className="card">
          <SectionTitle icon="🏆" title="Letztes Ergebnis" />
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-tbw-navyDark">vs. {data.lastResult.opponent}</p>
              <p className="text-xs text-tbw-ink/50">{fmtDate(data.lastResult.game_date)}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-extrabold text-tbw-navyDark">
                {data.lastResult.final_score_us}:{data.lastResult.final_score_opponent}
              </p>
              {gameResult(data.lastResult) && (
                <span
                  className={`pill ${
                    gameResult(data.lastResult) === 'sieg'
                      ? 'pill-ok'
                      : gameResult(data.lastResult) === 'niederlage'
                        ? 'pill-open'
                        : ''
                  }`}
                >
                  {RESULT_LABELS[gameResult(data.lastResult)!]}
                </span>
              )}
            </div>
          </div>
          {role === 'player' && data.myTotalPoints !== null && (
            <p className="mt-2 border-t border-black/5 pt-2 text-xs text-tbw-ink/50">
              Deine Punkte diese Saison: <span className="font-bold text-tbw-navyDark">{data.myTotalPoints}</span>
            </p>
          )}
          {(role === 'player' || role === 'trainer') && (
            <Link
              to={`/stats/${data.lastResult.id}`}
              className="mt-2 block border-t border-black/5 pt-2 text-xs font-bold text-tbw-navy"
            >
              Box-Score ansehen →
            </Link>
          )}
        </section>
      )}

      {role === 'player' && (
        <section className="card">
          <SectionTitle icon="📋" title="Dein nächster Kampfgericht Termin" />
          {data.playerNextTask ? (
            <div className="mt-2 rounded-xl bg-tbw-gold/10 p-3">
              <p className="text-sm font-semibold text-tbw-navyDark">
                {OFFICIATING_TASK_LABELS[data.playerNextTask.task_type]}
              </p>
              <p className="text-sm text-tbw-ink/70">
                {fmtDate(data.playerNextTask.officiating_games.game_date)}
                {data.playerNextTask.officiating_games.game_time
                  ? ` · ${fmtTime(data.playerNextTask.officiating_games.game_time)} Uhr`
                  : ''}{' '}
                · {officiatingGameLabel(data.playerNextTask.officiating_games)}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-tbw-ink/50">Aktuell kein Termin für dich eingeteilt.</p>
          )}
        </section>
      )}

      {flags.absences && role === 'player' && (
        <AbsenceSection onChange={() => setAbsenceVersion((v) => v + 1)} />
      )}

      <p className="pt-1 text-xs font-bold uppercase tracking-wide text-tbw-ink/40">Teaminformationen</p>

      {showOfficiatingOverview && (
        <section className="card">
          <SectionTitle icon="📋" title="Nächster Kampfgericht Termin" />
          {data.trainerNextOfficiatingGame ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm font-semibold">
                {fmtDate(data.trainerNextOfficiatingGame.game_date)}
                {data.trainerNextOfficiatingGame.game_time
                  ? ` · ${fmtTime(data.trainerNextOfficiatingGame.game_time)} Uhr`
                  : ''}{' '}
                · {officiatingGameLabel(data.trainerNextOfficiatingGame)}
              </p>
              <ul className="space-y-1 text-sm">
                {data.trainerNextOfficiatingGame.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between">
                    <span className="text-tbw-ink/70">{OFFICIATING_TASK_LABELS[t.task_type]}</span>
                    <span className={t.assigned_player_id ? 'pill pill-ok' : 'pill pill-open'}>
                      {t.assigned_player_id ? data.players[t.assigned_player_id]?.name ?? '?' : 'offen'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-sm text-tbw-ink/50">Kein Kampfgericht-Termin geplant.</p>
          )}
        </section>
      )}

      {showAbsencesOverview && data.absencesOverview.length > 0 && (() => {
        const today = new Date().toISOString().slice(0, 10);
        const currentAbsences = data.absencesOverview.filter((a) => a.start_date <= today);
        const upcomingAbsences = data.absencesOverview.filter((a) => a.start_date > today);
        return (
          <section className="card">
            <SectionTitle icon="🌴" title="Aktuell abwesend" />
            {currentAbsences.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {currentAbsences.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-tbw-navyDark">{data.players[a.player_id]?.name ?? '?'}</span>
                    <span className="text-tbw-ink/50">
                      {fmtDateShort(a.start_date)} – {fmtDateShort(a.end_date)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-tbw-ink/50">Aktuell ist niemand abwesend.</p>
            )}

            {upcomingAbsences.length > 0 && (
              <div className="mt-3 border-t border-black/5 pt-2">
                <button
                  className="text-xs font-semibold text-tbw-ink/50"
                  onClick={() => setShowUpcomingAbsences((v) => !v)}
                >
                  {showUpcomingAbsences
                    ? '▲ Kommende Abwesenheiten ausblenden'
                    : `▼ ${upcomingAbsences.length} kommende Abwesenheit${upcomingAbsences.length > 1 ? 'en' : ''} anzeigen`}
                </button>
                {showUpcomingAbsences && (
                  <ul className="mt-2 space-y-1">
                    {upcomingAbsences.map((a) => (
                      <li key={a.id} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-tbw-navyDark">
                          {data.players[a.player_id]?.name ?? '?'}
                        </span>
                        <span className="text-tbw-ink/50">
                          {fmtDateShort(a.start_date)} – {fmtDateShort(a.end_date)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })()}

      <section className="card">
        <SectionTitle icon="👕" title="Wer hat die Trikots?" />
        <div className="mt-2 grid grid-cols-2 gap-3">
          {data.trikotSets.map((set) => (
            <div
              key={set.id}
              className={`rounded-xl p-3 ${
                set.id === ownSetId ? 'bg-tbw-gold/15 ring-2 ring-tbw-gold' : 'bg-tbw-bg'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/50">
                {set.label.split(' · ').map((part, i) => (
                  <span key={i} className="block">
                    {part}
                  </span>
                ))}
              </p>
              <p className="mt-1 text-sm font-semibold text-tbw-navyDark">
                {set.current_holder_id ? data.players[set.current_holder_id]?.name ?? '—' : 'Niemand'}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="training" className="card scroll-mt-20">
        <SectionTitle icon="🕒" title="Nächste Trainingseinheit" />
        <div className="mt-2">
          <UpcomingTrainings refreshKey={absenceVersion} onChange={() => setTrainingVersion((v) => v + 1)} />
        </div>
      </section>
    </div>
  );
}

function declinedNamesText(names: string[]): string {
  if (names.length === 1) return `${names[0]} kann`;
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]} können`;
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-bold text-tbw-navyDark">
      <span>{icon}</span>
      {title}
    </div>
  );
}
