import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { fmtDate, fmtTime } from '../lib/format';
import { weekdayIndex } from '../lib/weekdays';
import {
  OFFICIATING_TASK_LABELS,
  benoetigterSatz,
  type Game,
  type OfficiatingGame,
  type OfficiatingTask,
  type Player,
  type Training,
  type TrikotSet
} from '../types/database';

interface DashboardData {
  nextGame: Game | null;
  playerNextTask: (OfficiatingTask & { officiating_games: OfficiatingGame }) | null;
  trainerNextOfficiatingGame: (OfficiatingGame & { tasks: OfficiatingTask[] }) | null;
  trikotSets: TrikotSet[];
  trainings: Training[];
  players: Record<string, Player>;
}

export function Dashboard() {
  const { role, player } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      const today = new Date().toISOString().slice(0, 10);

      const [gameRes, trikotRes, trainingRes, playersRes] = await Promise.all([
        supabase.from('games').select('*').gte('game_date', today).order('game_date').order('game_time').limit(1).maybeSingle(),
        supabase.from('trikot_sets').select('*').order('id'),
        supabase.from('trainings').select('*'),
        supabase.from('players').select('*').eq('is_active', true)
      ]);

      let playerNextTask: DashboardData['playerNextTask'] = null;
      let trainerNextOfficiatingGame: DashboardData['trainerNextOfficiatingGame'] = null;

      if (role === 'player' && player) {
        const { data: taskRows } = await supabase
          .from('officiating_tasks')
          .select('*, officiating_games!inner(*)')
          .eq('assigned_player_id', player.id)
          .gte('officiating_games.game_date', today)
          .order('game_date', { foreignTable: 'officiating_games', ascending: true })
          .limit(1);
        playerNextTask = (taskRows?.[0] as typeof playerNextTask) ?? null;
      }

      if (role === 'trainer') {
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

      const playersById: Record<string, Player> = {};
      (playersRes.data as Player[] | null)?.forEach((p) => (playersById[p.id] = p));

      if (gameRes.error || trikotRes.error || trainingRes.error) {
        setError('Fehler beim Laden der Startseite.');
        return;
      }

      setData({
        nextGame: (gameRes.data as Game) ?? null,
        playerNextTask,
        trainerNextOfficiatingGame,
        trikotSets: (trikotRes.data as TrikotSet[]) ?? [],
        trainings: [...((trainingRes.data as Training[]) ?? [])].sort(
          (a, b) => weekdayIndex(a.weekday) - weekdayIndex(b.weekday) || a.start_time.localeCompare(b.start_time)
        ),
        players: playersById
      });
    }

    load().catch(() => !cancelled && setError('Fehler beim Laden der Startseite.'));
    return () => {
      cancelled = true;
    };
  }, [role, player]);

  if (error) return <div className="card text-sm text-tbw-red">{error}</div>;
  if (!data) return <LoadingSpinner />;

  const firstName = (player?.name ?? '').split(' ')[0];
  const ownSetId = player
    ? data.trikotSets.find((s) => s.current_holder_id === player.id)?.id ?? null
    : null;

  return (
    <div className="space-y-4">
      {player && <p className="text-xl font-bold text-tbw-navyDark">Hi {firstName}!</p>}

      <section className="card">
        <SectionTitle icon="🏀" title="Nächstes Spiel" />
        {data.nextGame ? (
          <div className="mt-2 space-y-1">
            <p className="text-base font-semibold">
              vs. {data.nextGame.opponent}{' '}
              <span className="pill pill-open ml-1">{data.nextGame.is_home ? 'Heim' : 'Auswärts'}</span>
            </p>
            <p className="text-sm text-tbw-ink/70">
              {fmtDate(data.nextGame.game_date)} · {fmtTime(data.nextGame.game_time)} Uhr
            </p>
            <p className="text-sm text-tbw-ink/70">{data.nextGame.location}</p>
            <p className="text-xs text-tbw-ink/50">
              Trikot: {benoetigterSatz(data.nextGame) === 'weiss' ? 'Weiß' : 'Schwarz'}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-tbw-ink/50">Kein Spiel geplant.</p>
        )}
      </section>

      <section className="card">
        <SectionTitle icon="📋" title="Kampfgericht" />
        {role === 'player' &&
          (data.playerNextTask ? (
            <div className="mt-2 rounded-xl bg-tbw-gold/10 p-3">
              <p className="text-sm font-semibold text-tbw-navyDark">
                {OFFICIATING_TASK_LABELS[data.playerNextTask.task_type]}
              </p>
              <p className="text-sm text-tbw-ink/70">
                {fmtDate(data.playerNextTask.officiating_games.game_date)}
                {data.playerNextTask.officiating_games.game_time
                  ? ` · ${fmtTime(data.playerNextTask.officiating_games.game_time)} Uhr`
                  : ''}{' '}
                · {data.playerNextTask.officiating_games.opponent_teams}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-tbw-ink/50">Aktuell kein Termin für dich eingeteilt.</p>
          ))}
        {role === 'trainer' &&
          (data.trainerNextOfficiatingGame ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm font-semibold">
                {fmtDate(data.trainerNextOfficiatingGame.game_date)}
                {data.trainerNextOfficiatingGame.game_time
                  ? ` · ${fmtTime(data.trainerNextOfficiatingGame.game_time)} Uhr`
                  : ''}{' '}
                · {data.trainerNextOfficiatingGame.opponent_teams}
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
          ))}
      </section>

      <section className="card">
        <SectionTitle icon="👕" title="Trikots" />
        <div className="mt-2 grid grid-cols-2 gap-3">
          {data.trikotSets.map((set) => (
            <div
              key={set.id}
              className={`rounded-xl p-3 ${
                set.id === ownSetId ? 'bg-tbw-gold/15 ring-2 ring-tbw-gold' : 'bg-tbw-bg'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/50">{set.label}</p>
              <p className="mt-1 text-sm font-semibold text-tbw-navyDark">
                {set.current_holder_id ? data.players[set.current_holder_id]?.name ?? '—' : 'Niemand'}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <SectionTitle icon="🕒" title="Training" />
        {data.trainings.length === 0 ? (
          <p className="mt-2 text-sm text-tbw-ink/50">Keine Trainingszeiten hinterlegt.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {data.trainings.map((t) => (
              <li key={t.id} className="flex items-center justify-between">
                <span className="font-medium text-tbw-navyDark">{t.weekday}</span>
                <span className="text-tbw-ink/70">
                  {fmtTime(t.start_time)}–{fmtTime(t.end_time)} · {t.location}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-bold text-tbw-navyDark">
      <span>{icon}</span>
      {title}
    </div>
  );
}
