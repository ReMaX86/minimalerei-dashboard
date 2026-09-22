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
import { IconChevronRight, IconClipboard, IconJersey } from '../components/NavIcons';
import { StartHeader } from '../components/StartHeader';
import { NextGameCard } from '../components/NextGameCard';
import { LastResultCard } from '../components/LastResultCard';
import { usePushStatus } from '../hooks/usePushStatus';
import { fmtDate, fmtDateShort, fmtTime, hasKickedOff } from '../lib/format';
import { nextTrainingOccurrences } from '../lib/trainingSchedule';
import { computeReminders, type ReminderItem } from '../lib/reminders';
import { latestTransferFrom, pendingWasherFor } from '../lib/trikots';
import { computeBoxScore } from '../lib/gameStats';
import {
  OFFICIATING_TASK_LABELS,
  STAT_POINT_VALUES,
  benoetigterSatz,
  officiatingGameLabel,
  type Announcement,
  type CarpoolClaim,
  type CarpoolOffer,
  type DeclineReason,
  type Game,
  type GameSquadRow,
  type GameStatEvent,
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

// Spielberichtsbogen-Grenze — dieselbe Zahl wie MAX_SQUAD_SIZE in
// Spiele.tsx; wird bei der Kader/Trainer-Modus-Umstellung (nächster
// Schritt) in eine gemeinsame Stelle gezogen statt an zwei Stellen gepflegt.
const MAX_SQUAD_SIZE = 12;

// Lokales Datum, NICHT new Date().toISOString().slice(0,10) (das ist UTC —
// würde in den ersten ein bis zwei Stunden nach Mitternacht fälschlich noch
// den Vortag liefern, z. B. den heutigen Spieltag verfehlen).
function localTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DashboardData {
  nextGame: Game | null;
  upcomingGames: Game[];
  playerInSquad: boolean | null;
  myConfirmation: SquadConfirmation | null;
  myDeclineReason: DeclineReason | null;
  myDeclineNote: string | null;
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
  lastResultInSquad: boolean | null;
  lastResultTracked: boolean;
  lastResultMyBoxScore: { points: number; rebounds: number; assists: number } | null;
  recentResults: Game[];
  squadCount: number | null;
  declinedNames: string[];
  reminders: ReminderItem[];
  activeStatsHolder: string | null;
  lastScoreEvent: { team: 'us' | 'opponent'; playerId: string | null; points: number } | null;
  liveScore: { us: number; opponent: number } | null;
  liveQuarter: number | null;
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
  const [squadResponseVersion, setSquadResponseVersion] = useState(0);
  const [resultVersion, setResultVersion] = useState(0);
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
      const today = localTodayIso();

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

      // Kader-Status-Kachel ("Nominiert X/12") — dieselbe game_squad-Tabelle,
      // die die Kader-Übersicht auf der Spiele-Seite schon breiter (nicht
      // nur die eigene Zeile) liest; hier nur gezählt statt einzeln gelistet.
      let squadCount: number | null = null;
      if (nextGame?.squad_published) {
        const { data: squadRows } = await supabase
          .from('game_squad')
          .select('is_selected')
          .eq('game_id', nextGame.id);
        squadCount = ((squadRows as { is_selected: boolean }[] | null) ?? []).filter((r) => r.is_selected).length;
      }

      let myDeclineReason: DashboardData['myDeclineReason'] = null;
      let myDeclineNote: DashboardData['myDeclineNote'] = null;
      if (role === 'player' && player && nextGame?.squad_published) {
        const { data: squadRow } = await supabase
          .from('game_squad')
          .select('is_selected, confirmation, decline_reason, decline_note')
          .eq('game_id', nextGame.id)
          .eq('player_id', player.id)
          .maybeSingle();
        // Wichtig: myConfirmation NICHT hinter is_selected verstecken — eine
        // Absage setzt is_selected bewusst auf false (respond_to_squad()),
        // sonst wäre "abgesagt" von der Karte aus nicht mehr von "nie
        // nominiert" zu unterscheiden (beides würde sonst als null/"nicht im
        // Kader" ankommen, siehe NextGameCard.tsx).
        const row = squadRow as { is_selected: boolean; confirmation: SquadConfirmation; decline_reason: DeclineReason | null; decline_note: string | null } | null;
        playerInSquad = row?.is_selected ?? false;
        myConfirmation = row?.confirmation ?? null;
        myDeclineReason = row?.decline_reason ?? null;
        myDeclineNote = row?.decline_note ?? null;
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

          // Trikot-Übergabe: erst ab Anpfiff relevant (vorher zeigt die
          // Trikots-Seite den Vorschlag nur informativ ohne Bestätigen-
          // Button an — die Übergabe passiert real erst nach dem Spiel in
          // der Kabine) — danach so lange, bis sie bestätigt wurde, auch
          // rückwirkend fürs zuletzt gespielte Spiel.
          let trikotReminder: Parameters<typeof computeReminders>[5] = null;
          {
            const washLog = trikotWashLog;
            const allPlayers = Object.values(playersById);

            if (nextGame && hasKickedOff(nextGame.game_date, nextGame.game_time)) {
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
              // Ohne diese Prüfung würde ein heute noch nicht begonnenes
              // Spiel (nextGame oben deshalb bewusst übersprungen) über die
              // <=today-Abfrage hier trotzdem wieder mit reinrutschen — der
              // Anpfiff-Check muss also auch hier gelten, nicht nur oben.
              if (pastGame && hasKickedOff(pastGame.game_date, pastGame.game_time)) {
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
      let liveScore: DashboardData['liveScore'] = null;
      let liveQuarter: number | null = null;
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
          .select('team, player_id, stat_type, quarter')
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
          liveQuarter = lastScoreRow.quarter;
        }

        // Live-Anzeigetafel (Karte "Nächstes Spiel"): games.final_score_us/
        // -opponent werden erst bei Spielende gesetzt (siehe
        // GameStatsTracker.tsx), während der Übertragung selbst gibt es nur
        // die einzelnen game_stat_events — deshalb hier genau wie
        // myTotalPoints oben direkt aus den wurfrelevanten Events aufsummiert.
        // Nur abgefragt, wenn gerade wirklich getrackt wird (siehe
        // NextGameCard.tsx: ohne aktiven Tracker zeigt die Karte bewusst
        // "– : –" statt eines möglicherweise veralteten Zwischenstands).
        if (activeStatsHolder) {
          const { data: scoreRows } = await supabase
            .from('game_stat_events')
            .select('team, stat_type')
            .eq('game_id', nextGame.id)
            .in('stat_type', ['fg2_made', 'fg3_made', 'ft_made']);
          const totals = { us: 0, opponent: 0 };
          ((scoreRows as { team: 'us' | 'opponent'; stat_type: StatType }[] | null) ?? []).forEach((r) => {
            totals[r.team] += STAT_POINT_VALUES[r.stat_type] ?? 0;
          });
          liveScore = totals;
        }
      }

      // Karte "Letztes Ergebnis": IMMER das zuletzt angepfiffene Spiel, auch
      // ohne Endstand (siehe elements/03-letztes-ergebnis/PROMPT.md) — anders
      // als vorher (das nur das letzte FINALISIERTE Spiel fand, siehe unten
      // bei recentResults) — deshalb ein paar Kandidaten laden (falls das
      // jüngste Spiel per Datum von heute noch gar nicht angepfiffen ist) und
      // client-seitig den ersten mit erreichtem Anpfiff nehmen.
      let lastResult: Game | null = null;
      let lastResultInSquad: DashboardData['lastResultInSquad'] = null;
      let lastResultTracked = false;
      let lastResultMyBoxScore: DashboardData['lastResultMyBoxScore'] = null;
      let recentResults: Game[] = [];
      if (flags.stats) {
        const { data: candidateRows } = await supabase
          .from('games')
          .select('*')
          .lte('game_date', today)
          .order('game_date', { ascending: false })
          .order('game_time', { ascending: false })
          .limit(3);
        // Ein bereits finalisiertes Spiel zählt IMMER als "gespielt", auch
        // wenn die geplante Anpfiffzeit (nur ein Richtwert) noch nicht
        // erreicht ist — sonst verschwindet ein Ergebnis, das früher als
        // geplant getrackt und beendet wurde, hinter einem älteren Spiel
        // (derselbe Fehler wie vorher bei der Live-Anzeige in
        // NextGameCard.tsx: die geplante Uhrzeit ist kein verlässliches
        // "das Spiel läuft/ist vorbei"-Signal).
        lastResult =
          ((candidateRows as Game[] | null) ?? []).find(
            (g) => g.stats_finalized_at || hasKickedOff(g.game_date, g.game_time)
          ) ?? null;

        // Für "Letzte 5"/Serie: die letzten fünf Spiele mit EINGETRAGENEM
        // Endstand — unabhängig vom obigen lastResult (das auch ohne
        // Endstand gesetzt sein kann, siehe "noresult"-Zustand; ein Spiel
        // ohne Endstand zählt für die Serie laut Vorgabe nicht mit).
        const { data: recentRows } = await supabase
          .from('games')
          .select('*')
          .not('stats_finalized_at', 'is', null)
          .order('game_date', { ascending: false })
          .limit(5);
        recentResults = (recentRows as Game[]) ?? [];

        if (lastResult) {
          // Nur die drei Felder, die computeBoxScore() tatsächlich liest
          // (siehe gameStats.ts) — quarter/id/etc. sind für die Aggregation
          // irrelevant, der Cast spiegelt genau das.
          const { data: eventRows } = await supabase
            .from('game_stat_events')
            .select('team, player_id, stat_type')
            .eq('game_id', lastResult.id);
          const events = (eventRows ?? []) as unknown as GameStatEvent[];
          lastResultTracked = events.length > 0;

          if (role === 'player' && player) {
            const { data: squadRow } = await supabase
              .from('game_squad')
              .select('is_selected')
              .eq('game_id', lastResult.id)
              .eq('player_id', player.id)
              .maybeSingle();
            lastResultInSquad = squadRow?.is_selected ?? false;

            if (lastResultTracked) {
              const myRow = computeBoxScore(events).find((b) => b.playerId === player.id);
              lastResultMyBoxScore = myRow
                ? { points: myRow.points, rebounds: myRow.rebounds, assists: myRow.assists }
                : null;
            }
          }
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
        myDeclineReason,
        myDeclineNote,
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
        lastResultInSquad,
        lastResultTracked,
        lastResultMyBoxScore,
        recentResults,
        squadCount,
        reminders,
        declinedNames,
        activeStatsHolder,
        lastScoreEvent,
        liveScore,
        liveQuarter
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
    trikotVersion,
    squadResponseVersion,
    resultVersion
  ]);

  // Live-Anzeigetafel fürs laufende Spiel: der große Initial-Load oben läuft
  // nur einmal beim Öffnen der Seite, ein bereits geöffnetes Dashboard würde
  // also nie mitbekommen, wenn währenddessen wer anders zu tracken anfängt
  // (live so aufgefallen — "erst nach mehrmaligem Neuladen sichtbar"). Fragt
  // deshalb bewusst nur die zwei kleinen, dafür relevanten Felder erneut ab
  // (nicht den kompletten load() mit seinen ~10 Abfragen) — automatisch alle
  // 15s (wie der Herzschlag im Tracker selbst) und sofort, sobald die Seite
  // wieder sichtbar wird, plus ein manueller Button für "jetzt sofort".
  const today = localTodayIso();
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
        .select('team, player_id, stat_type, quarter')
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
    const liveQuarter = lastScoreRes.data?.quarter ?? null;
    // Live-Score wie im initialen Load (siehe dort) nur nachladen, wenn
    // gerade wirklich getrackt wird — ansonsten zeigt die Karte bewusst
    // "– : –" statt eines möglicherweise veralteten Zwischenstands.
    let liveScore: DashboardData['liveScore'] = null;
    if (holder) {
      const { data: scoreRows } = await supabase
        .from('game_stat_events')
        .select('team, stat_type')
        .eq('game_id', gameId)
        .in('stat_type', ['fg2_made', 'fg3_made', 'ft_made']);
      const totals = { us: 0, opponent: 0 };
      ((scoreRows as { team: 'us' | 'opponent'; stat_type: StatType }[] | null) ?? []).forEach((r) => {
        totals[r.team] += STAT_POINT_VALUES[r.stat_type] ?? 0;
      });
      liveScore = totals;
    }
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
            lastScoreEvent,
            liveScore,
            liveQuarter
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

  if (error) return <div className="card text-sm text-to-dangerText">{error}</div>;
  if (!data) return <LoadingSpinner />;

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
      <StartHeader nextGameDate={data.nextGame?.game_date ?? null} pushStatus={pushStatus} onPushChange={refreshPushStatus} />

      {/* Nächstes Spiel — Vorlage: docs/design/tipoff-design/elements/
          02-naechstes-spiel/ (pixelgenau, siehe PROMPT.md dort). */}
      {data.nextGame ? (
        <NextGameCard
          game={data.nextGame}
          // Dashboard rendert nur für diese drei Rollen (siehe App.tsx) —
          // 'loading'/'guest' sind an dieser Stelle bereits ausgeschlossen.
          role={role as 'trainer' | 'player' | 'viewer'}
          playerInSquad={data.playerInSquad}
          myConfirmation={data.myConfirmation}
          myDeclineReason={data.myDeclineReason}
          myDeclineNote={data.myDeclineNote}
          squadCount={data.squadCount}
          showTracking={flags.stats && !data.nextGame.stats_finalized_at}
          activeStatsHolder={data.activeStatsHolder}
          liveScore={data.liveScore}
          liveQuarter={data.liveQuarter}
          refreshingLive={refreshingLive}
          onRefreshLive={refreshLiveScore}
          onResponded={() => setSquadResponseVersion((v) => v + 1)}
        />
      ) : (
        <section className="card">
          <p className="text-sm text-to-text2">Kein Spiel geplant.</p>
        </section>
      )}

      {/* Mitfahrgelegenheit — kein Bestandteil der neuen Kartenvorlage
          (Auswärtsspiel-Feature, siehe §7), bleibt deshalb als eigener,
          unveränderter Block direkt darunter erhalten. */}
      {flags.carpool && data.nextGame && !data.nextGame.is_home && data.carpoolOffers.length > 0 && (
        <section className="card">
          <div className="flex items-center justify-between">
            <p className="to-label">Mitfahrgelegenheit</p>
            <Link to="/spiele" className="text-xs font-semibold text-to-accent">
              Verwalten →
            </Link>
          </div>
          {data.carpoolOffers.map((o) => {
            const free = o.seats - data.carpoolClaims.filter((c) => c.offer_id === o.id).length;
            return (
              <p key={o.id} className="mt-0.5 text-sm text-to-text2">
                <span className="font-semibold text-to-text">{data.players[o.driver_player_id]?.name ?? '?'}</span>{' '}
                · {free > 0 ? `${free} von ${o.seats} Plätzen frei` : 'voll'}
              </p>
            );
          })}
        </section>
      )}

      {/* Letztes Ergebnis — Vorlage: docs/design/tipoff-design/elements/
          03-letztes-ergebnis/ (pixelgenau, siehe PROMPT.md dort). */}
      {flags.stats && data.lastResult && (
        <LastResultCard
          game={data.lastResult}
          role={role as 'trainer' | 'player' | 'viewer'}
          inSquad={data.lastResultInSquad}
          wasTracked={data.lastResultTracked}
          myBoxScore={data.lastResultMyBoxScore}
          recentResults={data.recentResults}
          onScoreReported={() => setResultVersion((v) => v + 1)}
        />
      )}

      {/* Status-Kacheln — DESIGN.md: Kader-Stand + eigener nächster
          Kampfgericht-Einsatz (statt einer Trikotnummer, die es in dieser
          App gar nicht gibt — siehe DESIGN.md §7). */}
      {(data.squadCount !== null || (role === 'player' && data.playerNextTask)) && (
        <div className="grid grid-cols-2 gap-3">
          {data.squadCount !== null && (
            <div className="card flex flex-col gap-3.5 !p-4">
              <div className="flex items-center justify-between">
                <span className="to-label">Kader</span>
                <span className="h-2 w-2 rounded-full bg-to-accent" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-lg font-semibold text-to-text">{data.squadCount} nominiert</span>
                <span className="text-[13px] text-to-text2">von {MAX_SQUAD_SIZE} Plätzen</span>
              </div>
            </div>
          )}
          {role === 'player' && (
            <div className="card flex flex-col gap-3.5 !p-4">
              <div className="flex items-center justify-between">
                <span className="to-label">Kampfgericht</span>
                <IconClipboard className="h-4 w-4 text-to-accent" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-lg font-semibold text-to-text">
                  {data.playerNextTask ? 'Eingeteilt' : 'Frei'}
                </span>
                <span className="truncate text-[13px] text-to-text2">
                  {data.playerNextTask ? fmtDate(data.playerNextTask.officiating_games.game_date) : 'Kein Termin'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {flags.push_notifications && (pushStatus === 'unsubscribed' || pushStatus === 'denied') && (
        <PushNotificationCard status={pushStatus} onChange={refreshPushStatus} />
      )}

      {((role === 'player' && data.reminders.length > 0) ||
        (flags.announcements && data.announcements.length > 0) ||
        (isAdmin && data.nextGame?.squad_decline_pending && data.declinedNames.length > 0)) && (
        <section className="sheet">
          <div className="sheet-header">Für dich</div>

          {role === 'player' &&
            data.reminders.map((r) =>
              r.to.startsWith('#') ? (
                <a key={r.key} href={r.to} className="sheet-row-link">
                  <span className="led-dot bg-to-accent" />
                  <span className="flex-1 text-sm font-medium text-to-text">{r.text}</span>
                  <IconChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-to-text3" />
                </a>
              ) : (
                <Link key={r.key} to={r.to} className="sheet-row-link">
                  <span className="led-dot bg-to-accent" />
                  <span className="flex-1 text-sm font-medium text-to-text">{r.text}</span>
                  <IconChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-to-text3" />
                </Link>
              )
            )}

          {isAdmin && data.nextGame?.squad_decline_pending && data.declinedNames.length > 0 && (
            <Link to="/spiele?kader=1" className="sheet-row-link">
              <span className="led-dot bg-to-danger" />
              <span className="flex-1 text-sm text-to-text">
                <span className="font-semibold">Kader-Absage:</span>{' '}
                {declinedNamesText(data.declinedNames)} leider am Spiel vs. {data.nextGame.opponent} nicht
                teilnehmen.
              </span>
              <IconChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-to-text3" />
            </Link>
          )}

          {flags.announcements &&
            data.announcements.map((a) => (
              <div key={a.id} className="sheet-row">
                <span className={`led-dot ${a.pinned ? 'bg-to-accent' : 'bg-to-text3'}`} />
                <div>
                  {a.pinned && <p className="text-[10px] font-semibold uppercase tracking-wide text-to-accent">Angeheftet</p>}
                  <p className="text-sm text-to-text">{a.message}</p>
                  <p className="mt-1 text-xs text-to-text3">
                    {a.author_name} · {fmtDate(a.created_at.slice(0, 10))}
                  </p>
                </div>
              </div>
            ))}
        </section>
      )}

      {/* Kampfgericht — DESIGN.md Dashboard.dc.html: eine Karte mit den
          Aufgaben des nächsten Kampfgericht-Termins (auch für andere Teams
          im Verein, siehe §7) plus dem eigenen nächsten Einsatz darunter. */}
      {showOfficiatingOverview && (
        <section className="card flex flex-col gap-1 !p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <IconClipboard className="h-[22px] w-[22px] text-to-text" />
              <h2 className="text-lg font-semibold text-to-text">Kampfgericht</h2>
            </div>
            {data.trainerNextOfficiatingGame && (
              <span className="pill pill-open">
                {data.trainerNextOfficiatingGame.tasks.filter((t) => !t.assigned_player_id).length} offen
              </span>
            )}
          </div>
          {data.trainerNextOfficiatingGame ? (
            <>
              <p className="mb-1 text-[13px] text-to-text3">
                {fmtDate(data.trainerNextOfficiatingGame.game_date)}
                {data.trainerNextOfficiatingGame.game_time
                  ? ` · ${fmtTime(data.trainerNextOfficiatingGame.game_time)} Uhr`
                  : ''}{' '}
                · {officiatingGameLabel(data.trainerNextOfficiatingGame)}
              </p>
              <div className="divide-y divide-to-divider">
                {data.trainerNextOfficiatingGame.tasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="text-sm font-medium text-to-text">{OFFICIATING_TASK_LABELS[t.task_type]}</span>
                    <span className={t.assigned_player_id ? 'pill pill-ok' : 'pill pill-open'}>
                      {t.assigned_player_id ? data.players[t.assigned_player_id]?.name ?? '?' : 'offen'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-to-text2">Kein Kampfgericht-Termin geplant.</p>
          )}
          {role === 'player' && data.playerNextTask && (
            <div className="mt-2 flex items-center gap-3.5 rounded-to-md bg-to-bg p-3.5">
              <span className="to-data shrink-0 rounded-to-sm border border-to-accent px-2 py-1.5 text-xs font-semibold text-to-accent">
                {fmtDateShort(data.playerNextTask.officiating_games.game_date)}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="to-label">Dein nächster Einsatz</span>
                <span className="truncate text-sm font-semibold text-to-text">
                  {OFFICIATING_TASK_LABELS[data.playerNextTask.task_type]} ·{' '}
                  {officiatingGameLabel(data.playerNextTask.officiating_games)}
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Trikots — DESIGN.md §7: echte Satz-/Wasch-Logik statt des
          Nummern-Rasters aus dem Mockup. */}
      <section className="card flex flex-col gap-4 !p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <IconJersey className="h-[22px] w-[22px] text-to-text" />
            <h2 className="text-lg font-semibold text-to-text">Trikots</h2>
          </div>
          {data.nextGame && (
            <span className="to-data text-sm text-to-text2">
              Für nächstes Spiel: <span className="text-to-accent">{benoetigterSatz(data.nextGame) === 'weiss' ? 'Weiß' : 'Schwarz'}</span>
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 divide-x divide-to-divider overflow-hidden rounded-to-md border border-to-divider">
          {data.trikotSets.map((set) => {
            const transferredFrom = latestTransferFrom(set.id, data.trikotWashLog, data.trikotTransferLog);
            return (
              <div key={set.id} className={`p-3.5 ${set.id === ownSetId ? 'bg-to-accentSoft' : ''}`}>
                <p className="to-label">
                  {set.label.split(' · ').map((part, i) => (
                    <span key={i} className="block">
                      {part}
                    </span>
                  ))}
                </p>
                <p className="mt-1.5 text-sm font-semibold text-to-text">
                  {set.current_holder_id ? data.players[set.current_holder_id]?.name ?? '—' : 'Niemand'}
                </p>
                {transferredFrom && (
                  <p className="mt-0.5 text-[11px] text-to-text3">Übergeben von {data.players[transferredFrom]?.name ?? '?'}</p>
                )}
              </div>
            );
          })}
        </div>

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
                <div key={set.id} className="rounded-to-md bg-to-bg p-3.5">
                  <p className="text-sm font-semibold text-to-text">
                    Du hast aktuell den {set.id === 'weiss' ? 'weißen' : 'schwarzen'} Trikotsatz.
                  </p>
                  <p className="mt-0.5 text-xs text-to-text2">
                    {neededGame
                      ? `Bitte zum nächsten Einsatz am ${fmtDate(neededGame.game_date)} gegen ${neededGame.opponent} mitbringen.`
                      : 'Bitte zum nächsten Einsatz mit diesem Set mitbringen.'}
                  </p>

                  {!isPicking ? (
                    <button
                      className="mt-2 text-xs font-semibold text-to-accent"
                      onClick={() => {
                        setTransferringSetId(set.id);
                        setTransferTargetId('');
                        setTransferError(null);
                      }}
                    >
                      Set übergeben?
                    </button>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-to-text2">An wen?</p>
                      <select className="input" value={transferTargetId} onChange={(e) => setTransferTargetId(e.target.value)}>
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
                          className="btn-primary !h-11 flex-1 text-sm"
                          disabled={!transferTargetId || transferring}
                          onClick={() => transferSet(set.id, transferTargetId)}
                        >
                          {transferring ? 'Speichere…' : 'Bestätigen'}
                        </button>
                        <button
                          className="btn-secondary flex-1 text-sm"
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
                </div>
              );
            })}
      </section>

      {/* Spielplan-Vorschau — DESIGN.md Dashboard.dc.html. */}
      {data.upcomingGames.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-semibold text-to-text">Spielplan</h2>
            <Link to="/spiele" className="text-sm font-medium text-to-accent">
              Alle Spiele
            </Link>
          </div>
          {data.upcomingGames.slice(0, 3).map((g) => (
            <div key={g.id} className="card flex items-center gap-3.5 !p-3.5">
              <div className="to-data flex w-[58px] shrink-0 flex-col gap-0.5">
                <span className="text-[11px] tracking-wide text-to-text3">{fmtDateShort(g.game_date).slice(0, 2).toUpperCase()}</span>
                <span className="text-sm font-semibold text-to-text">{fmtDateShort(g.game_date)}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-to-text">{g.opponent}</span>
                <span className="text-xs text-to-text2">{fmtTime(g.game_time)} Uhr</span>
              </div>
              <span className={g.is_home ? 'badge-home' : 'badge-away'}>{g.is_home ? 'Heim' : 'Ausw.'}</span>
            </div>
          ))}
        </section>
      )}

      <section className="sheet">
        <div id="training" className="sheet-row scroll-mt-20">
          <span className="led-dot bg-to-text3" />
          <div className="flex-1">
            <p className="to-label">Nächste Trainingseinheit</p>
            <div className="mt-1.5">
              <UpcomingTrainings refreshKey={absenceVersion} onChange={() => setTrainingVersion((v) => v + 1)} />
            </div>
          </div>
        </div>
      </section>

      {flags.absences && role === 'player' && (
        <AbsenceSection onChange={() => setAbsenceVersion((v) => v + 1)} />
      )}

      <p className="to-label pt-1">Teaminformationen</p>

      <section className="sheet">
        {showAbsencesOverview && data.absencesOverview.length > 0 && (() => {
          const today = localTodayIso();
          const currentAbsences = data.absencesOverview.filter((a) => a.start_date <= today);
          const upcomingAbsences = data.absencesOverview.filter((a) => a.start_date > today);
          return (
            <div className="sheet-row">
              <span className="led-dot bg-to-text3" />
              <div className="flex-1">
                <p className="to-label">Aktuell abwesend</p>
                {currentAbsences.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {currentAbsences.map((a) => (
                      <li key={a.id} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-to-text">{data.players[a.player_id]?.name ?? '?'}</span>
                        <span className="text-to-text3">
                          {fmtDateShort(a.start_date)} – {fmtDateShort(a.end_date)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-sm text-to-text2">Aktuell ist niemand abwesend.</p>
                )}

                {upcomingAbsences.length > 0 && (
                  <div className="mt-3 border-t border-to-divider pt-2">
                    <button
                      className="text-xs font-semibold text-to-text2"
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
                            <span className="font-medium text-to-text">{data.players[a.player_id]?.name ?? '?'}</span>
                            <span className="text-to-text3">
                              {fmtDateShort(a.start_date)} – {fmtDateShort(a.end_date)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        <div className="sheet-row">
          <span className="led-dot bg-to-text3" />
          <div className="flex-1">
            <p className="to-label">Trainingszeiten</p>
            <div className="mt-1.5">
              <WeeklyTrainingTimes />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function declinedNamesText(names: string[]): string {
  if (names.length === 1) return `${names[0]} kann`;
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]} können`;
}
