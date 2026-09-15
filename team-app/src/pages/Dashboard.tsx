import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { UpcomingTrainings } from '../components/UpcomingTrainings';
import { WeeklyTrainingTimes } from '../components/WeeklyTrainingTimes';
import { AbsenceSection } from '../components/AbsenceSection';
import { PushNotificationCard } from '../components/PushNotificationCard';
import { usePushStatus } from '../hooks/usePushStatus';
import { fmtDate, fmtDateShort, fmtTime } from '../lib/format';
import { nextTrainingOccurrences } from '../lib/trainingSchedule';
import { computeReminders, type ReminderItem } from '../lib/reminders';
import { latestTransferFrom, pendingWasherFor } from '../lib/trikots';
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
  type TrainingOverride,
  type TrikotSet,
  type TrikotSetId,
  type TrikotTransferLogRow,
  type TrikotWashLogRow
} from '../types/database';

const RESULT_LABELS = { sieg: 'Sieg', niederlage: 'Niederlage', unentschieden: 'Unentschieden' } as const;

interface DashboardData {
  nextGame: Game | null;
  upcomingGames: Game[];
  playerInSquad: boolean | null;
  myConfirmation: SquadConfirmation | null;
  playerNextTask: (OfficiatingTask & { officiating_games: OfficiatingGame }) | null;
  trainerNextOfficiatingGame: (OfficiatingGame & { tasks: OfficiatingTask[] }) | null;
  trikotSets: TrikotSet[];
  trikotWashLog: TrikotWashLogRow[];
  trikotTransferLog: TrikotTransferLogRow[];
  players: Record<string, Player>;
  announcements: Announcement[];
  carpoolOffers: CarpoolOffer[];
  carpoolClaims: CarpoolClaim[];
  absencesOverview: PlayerAbsence[];
  lastResult: Game | null;
  myTotalPoints: number | null;
  declinedNames: string[];
  reminders: ReminderItem[];
  activeStatsHolder: string | null;
  lastScoreEvent: { team: 'us' | 'opponent'; playerId: string | null; points: number } | null;
}

export function Dashboard() {
  const { role, player, isAdmin } = useAuth();
  const { flags } = useFeatureFlags();
  const { status: pushStatus, refresh: refreshPushStatus } = usePushStatus();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [absenceVersion, setAbsenceVersion] = useState(0);
  const [trainingVersion, setTrainingVersion] = useState(0);
  const [trikotVersion, setTrikotVersion] = useState(0);
  const [showUpcomingAbsences, setShowUpcomingAbsences] = useState(false);
  // Direkte Trikot-Übergabe (siehe Migration 0048): eigener State statt
  // pro-Set, da realistisch immer nur ein Set gleichzeitig übergeben wird —
  // die setId im State legt fest, für welches Set gerade der
  // Auswahl-Dialog offen ist.
  const [transferringSetId, setTransferringSetId] = useState<TrikotSetId | null>(null);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferring, setTransferring] = useState(false);
  // Eigener Fehler-State statt des Seiten-weiten `error` oben — der würde
  // bei einem Fehlschlag das komplette Dashboard durch die Fehlermeldung
  // ersetzen (siehe `if (error) return ...` weiter unten), für einen
  // fehlgeschlagenen Trikot-Übergabe-Versuch viel zu einschneidend.
  const [transferError, setTransferError] = useState<string | null>(null);
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

      const [gameRes, upcomingGamesRes, trikotRes, trikotWashRes, trikotTransferRes, playersRes, announcementsRes] =
        await Promise.all([
          supabase
            .from('games')
            .select('*')
            .gte('game_date', today)
            .is('stats_finalized_at', null)
            .order('game_date')
            .order('game_time')
            .limit(1)
            .maybeSingle(),
          // Für die "Deine Trikots"-Karte: das EINE `nextGame` oben ist das
          // nächste Spiel überhaupt, das aber nicht zwangsläufig das eigene
          // Set braucht (z. B. hält man "Schwarz", aber das nächste Spiel ist
          // ein Heimspiel, das "Weiß" braucht) — dafür eine breitere Liste,
          // um darin das nächste Spiel mit dem passenden Satz zu finden.
          supabase
            .from('games')
            .select('*')
            .gte('game_date', today)
            .is('stats_finalized_at', null)
            .order('game_date')
            .order('game_time')
            .limit(20),
          supabase.from('trikot_sets').select('*').order('id'),
          supabase.from('trikot_wash_log').select('*'),
          supabase.from('trikot_transfer_log').select('*'),
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
      const trikotWashLog = (trikotWashRes.data as TrikotWashLogRow[]) ?? [];
      const trikotTransferLog = (trikotTransferRes.data as TrikotTransferLogRow[]) ?? [];

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
          const [{ data: trainingRows }, { data: overrideRows }] = await Promise.all([
            supabase.from('trainings').select('*'),
            supabase.from('training_overrides').select('*').gte('end_date', today)
          ]);
          const nextOcc = nextTrainingOccurrences(
            (trainingRows as Training[]) ?? [],
            1,
            new Date(),
            (overrideRows as TrainingOverride[]) ?? []
          )[0];
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
            const washLog = trikotWashLog;
            const allPlayers = Object.values(playersById);

            if (nextGame && nextGame.game_date === today) {
              const { data: squadRows } = await supabase.from('game_squad').select('*').eq('game_id', nextGame.id);
              const pending = pendingWasherFor(nextGame, (squadRows as GameSquadRow[]) ?? [], allPlayers, washLog);
              if (pending?.player.id === player.id) {
                trikotReminder = { pending: true, opponent: nextGame.opponent };
              }
            }

            if (!trikotReminder) {
              // <= statt < today: seit die "Nächstes Spiel"-Abfrage bereits
              // abgeschlossene Spiele ausschließt (siehe gameRes oben), fällt
              // ein heute abgeschlossenes Spiel sonst durchs Raster und die
              // Trikot-Erinnerung würde erst ab morgen greifen.
              const { data: pastGameRow } = await supabase
                .from('games')
                .select('*')
                .lte('game_date', today)
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

      // "Wer trackt gerade" fürs nächste Spiel: nur relevant, wenn es überhaupt
      // trackbar ist (Datum erreicht, noch nicht abgeschlossen) — Alter des
      // Herzschlags wie im weichen Lock selbst behandelt (siehe
      // claim_stat_session in Migration 0028): über 30s Funkstille zählt als
      // "trackt gerade niemand mehr", sonst würde ein verlassener Tracker
      // (Browser einfach zugemacht statt sauber verlassen) die Übernahme-
      // Kachel dauerhaft an Stelle des großen Start-Buttons anzeigen.
      let activeStatsHolder: string | null = null;
      let lastScoreEvent: DashboardData['lastScoreEvent'] = null;
      if (flags.stats && nextGame && !nextGame.stats_finalized_at && nextGame.game_date <= today) {
        const { data: sessionRow } = await supabase
          .from('game_stat_sessions')
          .select('holder_name, last_heartbeat')
          .eq('game_id', nextGame.id)
          .maybeSingle();
        if (sessionRow && Date.now() - new Date(sessionRow.last_heartbeat).getTime() < 30_000) {
          activeStatsHolder = sessionRow.holder_name;
        }

        // Letzte Punktaktion fürs Live-Score-Board: nur wurfrelevante Events
        // (Rebounds, Fouls etc. sollen den "wer hat zuletzt getroffen"-Stand
        // nicht überschreiben), jüngstes zuerst.
        const { data: lastScoreRow } = await supabase
          .from('game_stat_events')
          .select('team, player_id, stat_type')
          .eq('game_id', nextGame.id)
          .in('stat_type', ['fg2_made', 'fg3_made', 'ft_made'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastScoreRow) {
          lastScoreEvent = {
            team: lastScoreRow.team as 'us' | 'opponent',
            playerId: lastScoreRow.player_id,
            points: STAT_POINT_VALUES[lastScoreRow.stat_type as StatType] ?? 0
          };
        }
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

      if (gameRes.error || upcomingGamesRes.error || trikotRes.error || trikotWashRes.error || trikotTransferRes.error) {
        setError('Fehler beim Laden der Startseite.');
        return;
      }

      setData({
        nextGame: nextGame ?? null,
        upcomingGames: (upcomingGamesRes.data as Game[]) ?? [],
        playerInSquad,
        myConfirmation,
        playerNextTask,
        trainerNextOfficiatingGame,
        trikotSets: (trikotRes.data as TrikotSet[]) ?? [],
        trikotWashLog,
        trikotTransferLog,
        players: playersById,
        announcements: (announcementsRes.data as Announcement[]) ?? [],
        carpoolOffers,
        carpoolClaims,
        absencesOverview,
        lastResult,
        myTotalPoints,
        reminders,
        declinedNames,
        activeStatsHolder,
        lastScoreEvent
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
    trainingVersion,
    trikotVersion
  ]);

  // Live-Anzeigetafel fürs laufende Spiel: der große Initial-Load oben läuft
  // nur einmal beim Öffnen der Seite, ein bereits geöffnetes Dashboard würde
  // also nie mitbekommen, wenn währenddessen wer anders zu tracken anfängt
  // (live so aufgefallen — "erst nach mehrmaligem Neuladen sichtbar"). Fragt
  // deshalb bewusst nur die zwei kleinen, dafür relevanten Felder erneut ab
  // (nicht den kompletten load() mit seinen ~10 Abfragen) — automatisch alle
  // 15s (wie der Herzschlag im Tracker selbst) und sofort, sobald die Seite
  // wieder sichtbar wird, plus ein manueller Button für "jetzt sofort".
  const today = new Date().toISOString().slice(0, 10);
  const nextGameIsLive = !!(data?.nextGame && flags.stats && !data.nextGame.stats_finalized_at && data.nextGame.game_date <= today);
  const [refreshingLive, setRefreshingLive] = useState(false);

  const refreshLiveScore = useCallback(async () => {
    if (!nextGameIsLive || !data?.nextGame) return;
    const gameId = data.nextGame.id;
    setRefreshingLive(true);
    const [gameRes, sessionRes, lastScoreRes] = await Promise.all([
      supabase.from('games').select('final_score_us, final_score_opponent, stats_finalized_at').eq('id', gameId).maybeSingle(),
      supabase.from('game_stat_sessions').select('holder_name, last_heartbeat').eq('game_id', gameId).maybeSingle(),
      supabase
        .from('game_stat_events')
        .select('team, player_id, stat_type')
        .eq('game_id', gameId)
        .in('stat_type', ['fg2_made', 'fg3_made', 'ft_made'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);
    const holder =
      sessionRes.data && Date.now() - new Date(sessionRes.data.last_heartbeat).getTime() < 30_000
        ? sessionRes.data.holder_name
        : null;
    const lastScoreEvent: DashboardData['lastScoreEvent'] = lastScoreRes.data
      ? {
          team: lastScoreRes.data.team as 'us' | 'opponent',
          playerId: lastScoreRes.data.player_id,
          points: STAT_POINT_VALUES[lastScoreRes.data.stat_type as StatType] ?? 0
        }
      : null;
    setData((prev) =>
      prev && prev.nextGame && prev.nextGame.id === gameId
        ? {
            ...prev,
            nextGame: {
              ...prev.nextGame,
              final_score_us: gameRes.data?.final_score_us ?? prev.nextGame.final_score_us,
              final_score_opponent: gameRes.data?.final_score_opponent ?? prev.nextGame.final_score_opponent,
              stats_finalized_at: gameRes.data?.stats_finalized_at ?? prev.nextGame.stats_finalized_at
            },
            activeStatsHolder: holder,
            lastScoreEvent
          }
        : prev
    );
    setRefreshingLive(false);
  }, [nextGameIsLive, data?.nextGame]);

  useEffect(() => {
    if (!nextGameIsLive) return;
    const interval = setInterval(refreshLiveScore, 15_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshLiveScore();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [nextGameIsLive, refreshLiveScore]);

  if (error) return <div className="card text-sm text-tbw-red">{error}</div>;
  if (!data) return <LoadingSpinner />;

  const firstName = (player?.name ?? '').split(' ')[0];
  const ownSetId = player
    ? data.trikotSets.find((s) => s.current_holder_id === player.id)?.id ?? null
    : null;

  async function transferSet(setId: TrikotSetId, toPlayerId: string) {
    setTransferring(true);
    setTransferError(null);
    try {
      const { error: rpcError } = await supabase.rpc('transfer_trikot_set', {
        p_set_id: setId,
        p_to_player_id: toPlayerId
      });
      if (rpcError) throw rpcError;
      setTransferringSetId(null);
      setTransferTargetId('');
      setTrikotVersion((v) => v + 1);
    } catch {
      setTransferError('Übergabe konnte nicht gespeichert werden.');
    } finally {
      setTransferring(false);
    }
  }

  return (
    <div className="space-y-4">
      {player && <p className="headline text-3xl text-tbw-navyDark">Hi {firstName}!</p>}

      {flags.push_notifications && (pushStatus === 'unsubscribed' || pushStatus === 'denied') && (
        <PushNotificationCard status={pushStatus} onChange={refreshPushStatus} />
      )}

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
            {nextGameIsLive && (data.activeStatsHolder || data.nextGame.final_score_us !== null) && (
              <div className="mt-2 overflow-hidden rounded-2xl bg-gradient-to-b from-tbw-navy to-tbw-navyDark px-4 py-3 text-white shadow-[0_8px_30px_-6px_rgba(7,22,15,0.5)]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-tbw-red">
                    {data.activeStatsHolder && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tbw-red" />}
                    {data.activeStatsHolder ? 'Live' : 'Zwischenstand'}
                  </span>
                  <button
                    disabled={refreshingLive}
                    onClick={() => refreshLiveScore()}
                    className="text-[10px] font-bold uppercase tracking-wide text-white/50 disabled:opacity-40"
                  >
                    {refreshingLive ? 'Aktualisiert…' : '🔄 Aktualisieren'}
                  </button>
                </div>
                <p className="headline mt-1 text-center text-6xl tabular-nums">
                  {data.nextGame.final_score_us ?? 0}:{data.nextGame.final_score_opponent ?? 0}
                </p>
                {data.lastScoreEvent && (
                  <p className="mt-0.5 text-center text-xs text-white/50">
                    Zuletzt:{' '}
                    <span className="font-semibold text-white/80">
                      {data.lastScoreEvent.team === 'opponent'
                        ? data.nextGame.opponent
                        : (data.players[data.lastScoreEvent.playerId ?? '']?.name ?? '?')}
                    </span>{' '}
                    (+{data.lastScoreEvent.points})
                  </p>
                )}
                {data.activeStatsHolder && (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                    <p className="text-xs text-white/60">
                      <span className="font-semibold text-white">{data.activeStatsHolder}</span> trackt gerade
                    </p>
                    {(role === 'player' || role === 'trainer' || role === 'viewer') && (
                      <Link to={`/stats/${data.nextGame.id}`} className="shrink-0 text-xs font-bold text-tbw-gold">
                        Tracking übernehmen
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
            {nextGameIsLive &&
              (role === 'player' || role === 'trainer' || role === 'viewer') &&
              !data.activeStatsHolder && (
              <Link to={`/stats/${data.nextGame.id}`} className="btn-accent mt-2 block w-full text-center !py-2 text-sm">
                📊 Spiel-Stats tracking übernehmen
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
          {(role === 'player' || role === 'trainer' || role === 'viewer') && (
            <Link
              to={`/stats/${data.lastResult.id}`}
              className="mt-2 block border-t border-black/5 pt-2 text-xs font-bold text-tbw-navy"
            >
              Box-Score ansehen →
            </Link>
          )}
        </section>
      )}

      <section id="training" className="card scroll-mt-20">
        <SectionTitle icon="🕒" title="Nächste Trainingseinheit" />
        <div className="mt-2">
          <UpcomingTrainings refreshKey={absenceVersion} onChange={() => setTrainingVersion((v) => v + 1)} />
        </div>
      </section>

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

      {role === 'player' &&
        player &&
        data.trikotSets
          .filter((set) => set.current_holder_id === player.id)
          .map((set) => {
            // data.nextGame ist das nächste Spiel überhaupt, braucht aber
            // nicht zwangsläufig gerade dieses Set (z. B. hält man
            // "Schwarz", aber das nächste Spiel ist ein Heimspiel, das
            // "Weiß" braucht) — deshalb stattdessen das nächste Spiel MIT
            // dem passenden Satz aus der breiteren Liste heraussuchen.
            const neededGame = data.upcomingGames.find((g) => benoetigterSatz(g) === set.id) ?? null;
            const isPicking = transferringSetId === set.id;
            return (
              <section key={set.id} className="card">
                <SectionTitle icon="🧺" title="Deine Trikots" />
                <p className="mt-2 text-sm font-semibold text-tbw-navyDark">
                  Du hast aktuell den {set.id === 'weiss' ? 'weißen' : 'schwarzen'} Trikotsatz.
                </p>
                <p className="mt-0.5 text-xs text-tbw-ink/50">
                  {neededGame
                    ? `Bitte zum nächsten Einsatz am ${fmtDate(neededGame.game_date)} gegen ${neededGame.opponent} mitbringen.`
                    : 'Bitte zum nächsten Einsatz mit diesem Set mitbringen.'}
                </p>

                {!isPicking ? (
                  <button
                    className="mt-2 text-xs font-bold text-tbw-navy"
                    onClick={() => {
                      setTransferringSetId(set.id);
                      setTransferTargetId('');
                      setTransferError(null);
                    }}
                  >
                    Set übergeben?
                  </button>
                ) : (
                  <div className="mt-3 space-y-2 rounded-xl bg-tbw-bg p-3">
                    <p className="text-sm text-tbw-ink/70">An wen?</p>
                    <select
                      className="input"
                      value={transferTargetId}
                      onChange={(e) => setTransferTargetId(e.target.value)}
                    >
                      <option value="">Spieler wählen…</option>
                      {Object.values(data.players)
                        .filter((p) => p.id !== player.id)
                        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                    {transferError && <ErrorNote message={transferError} />}
                    <div className="flex gap-2">
                      <button
                        className="btn-primary flex-1 !py-2 text-sm"
                        disabled={!transferTargetId || transferring}
                        onClick={() => transferSet(set.id, transferTargetId)}
                      >
                        {transferring ? 'Speichere…' : 'Bestätigen'}
                      </button>
                      <button
                        className="btn-secondary flex-1 !py-2 text-sm"
                        disabled={transferring}
                        onClick={() => {
                          setTransferringSetId(null);
                          setTransferTargetId('');
                          setTransferError(null);
                        }}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}

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
          {data.trikotSets.map((set) => {
            const transferredFrom = latestTransferFrom(set.id, data.trikotWashLog, data.trikotTransferLog);
            return (
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
                {transferredFrom && (
                  <p className="mt-0.5 text-[10px] text-tbw-ink/40">
                    Übergeben von {data.players[transferredFrom]?.name ?? '?'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <SectionTitle icon="🕒" title="Trainingszeiten" />
        <div className="mt-2">
          <WeeklyTrainingTimes />
        </div>
      </section>

      {flags.push_notifications && pushStatus === 'subscribed' && (
        <PushNotificationCard status={pushStatus} onChange={refreshPushStatus} />
      )}
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
