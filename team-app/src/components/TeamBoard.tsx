import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fmtDateShort, fmtTime, shortPlayerName } from '../lib/format';
import { weekdayIndex } from '../lib/weekdays';
import type { OfficiatingGame, OfficiatingTask, OfficiatingTaskType, Player, PlayerAbsence, Training, TrikotSet } from '../types/database';

// Sehr kurze Rollen-Kürzel nur für die winzigen Sitzplatz-Pillen dieses
// Boards (Vorlage docs/design/tipoff-design/elements/07-teaminfos/PROMPT.md)
// — weder die vollen OFFICIATING_TASK_LABELS noch OfficiatingDutyCards
// eigene Kurzform ("24-Sek.-Uhr") passen in diese Pillenbreite.
const SEAT_LABEL: Record<OfficiatingTaskType, string> = {
  uhr: '24 SEK.',
  anschreiber: 'ANSCHR.',
  zeit: 'ZEIT'
};
const ALL_TASK_TYPES: OfficiatingTaskType[] = ['uhr', 'anschreiber', 'zeit'];

function localTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtRangeLabel(startIso: string, endIso: string): string {
  return `${fmtDateShort(startIso)} – ${fmtDateShort(endIso)}`;
}

interface DutyGame {
  game: OfficiatingGame;
  tasks: OfficiatingTask[];
}

interface State {
  trainings: Training[];
  duty: DutyGame | null;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function LockPill() {
  return (
    <span className="to-data inline-flex h-5 shrink-0 items-center gap-1 rounded-to-pill bg-to-surface2 px-2 text-[9px] font-semibold text-to-text3">
      <LockIcon />
      TRAINER &amp; CAPTAINS
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-to-textDisabled transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-textDisabled" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function TeamBoard({
  showLocked,
  showAbsences,
  absencesOverview,
  trikotSets,
  players
}: {
  showLocked: boolean;
  showAbsences: boolean;
  absencesOverview: PlayerAbsence[];
  trikotSets: TrikotSet[];
  players: Record<string, Player>;
}) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soonOpen, setSoonOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const today = localTodayIso();
    const trainingsPromise = supabase.from('trainings').select('*');
    // Nächster Kampfgericht-Termin, bei dem UNSER Team mindestens eine Rolle
    // stellt — anders als data.trainerNextOfficiatingGame (Dashboard.tsx),
    // das schlicht den chronologisch nächsten Vereins-Termin nimmt, auch
    // wenn der komplett einem anderen Team gehört (officiating_games ist
    // Verein-weit). Deshalb ein eigener, enger gefasster Fetch statt
    // Wiederverwendung jenes Felds.
    const dutyPromise = showLocked
      ? supabase.from('officiating_games').select('*').gte('game_date', today).order('game_date')
      : Promise.resolve({ data: [] as OfficiatingGame[], error: null });

    const [trainingsRes, gamesRes] = await Promise.all([trainingsPromise, dutyPromise]);
    if (trainingsRes.error || gamesRes.error) {
      setError('Fehler beim Laden der Teaminformationen.');
      return;
    }

    let duty: DutyGame | null = null;
    const games = (gamesRes.data as OfficiatingGame[]) ?? [];
    if (games.length > 0) {
      const { data: taskRows, error: taskErr } = await supabase
        .from('officiating_tasks')
        .select('*')
        .in('officiating_game_id', games.map((g) => g.id));
      if (taskErr) {
        setError('Fehler beim Laden der Teaminformationen.');
        return;
      }
      const tasksByGame: Record<string, OfficiatingTask[]> = {};
      ((taskRows as OfficiatingTask[]) ?? []).forEach((t) => {
        (tasksByGame[t.officiating_game_id] ??= []).push(t);
      });
      const soonest = games.find((g) => (tasksByGame[g.id]?.length ?? 0) > 0);
      if (soonest) {
        duty = {
          game: soonest,
          tasks: tasksByGame[soonest.id].sort((a, b) => ALL_TASK_TYPES.indexOf(a.task_type) - ALL_TASK_TYPES.indexOf(b.task_type))
        };
      }
    }

    setState({
      trainings: [...((trainingsRes.data as Training[]) ?? [])]
        .filter((t) => t.weekday !== null)
        .sort((a, b) => weekdayIndex(a.weekday!) - weekdayIndex(b.weekday!) || a.start_time.localeCompare(b.start_time)),
      duty
    });
  }, [showLocked]);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Teaminformationen.'));
  }, [load]);

  const today = localTodayIso();
  const absentNow = [...absencesOverview].filter((a) => a.start_date <= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const absentSoon = [...absencesOverview].filter((a) => a.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3 pt-1.5">
        <span className="to-display-sm text-to-text">Team</span>
        <span className="h-px flex-1 bg-to-divider" />
        <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">TB WÜLFRATH HERREN</span>
      </div>

      <section className="card overflow-hidden !p-0">
        {showLocked && (
          <div className="flex flex-col gap-2.5 border-t-0 px-5 py-[18px]">
            <div className="flex items-center justify-between gap-2.5">
              <span className="to-label">KAMPFGERICHT</span>
              <LockPill />
            </div>
            {error && <ErrorInline message={error} />}
            {!error && !state && <span className="text-sm text-to-text3">Lädt…</span>}
            {!error && state && !state.duty && <span className="text-sm text-to-text3">Kein Einsatz für das Team geplant.</span>}
            {!error && state?.duty && (
              <>
                <div>
                  <p className="text-[16px] font-semibold -tracking-[0.01em] text-to-text">
                    {fmtDateShort(state.duty.game.game_date)} · {state.duty.game.game_time ? `${fmtTime(state.duty.game.game_time)} Uhr` : ''}
                  </p>
                  <p className="text-[13px] text-to-text3">
                    {state.duty.game.opponent_teams}
                    {state.duty.game.opponent ? ` vs. ${state.duty.game.opponent}` : ''} · {state.duty.game.location}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {state.duty.tasks.map((t) => (
                    <span
                      key={t.id}
                      className={`inline-flex h-[30px] items-center gap-1.5 rounded-to-pill px-2.5 ${
                        t.assigned_player_id ? 'bg-to-surface2' : 'border border-to-lineMuted bg-transparent'
                      }`}
                    >
                      <span className="to-data text-[9px] tracking-[0.08em] text-to-text3">{SEAT_LABEL[t.task_type]}</span>
                      <span className={`text-[13px] font-semibold ${t.assigned_player_id ? 'text-to-text' : 'font-medium text-to-text3'}`}>
                        {t.assigned_player_id ? shortPlayerName(players[t.assigned_player_id]?.name ?? '?') : 'Offen'}
                      </span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {showLocked && showAbsences && (
          <div className="flex flex-col gap-2.5 border-t border-to-divider px-5 py-[18px]">
            <div className="flex items-center justify-between gap-2.5">
              <span className="to-label">ABWESEND</span>
              <LockPill />
            </div>
            {absentNow.length === 0 ? (
              <span className="text-sm text-to-text3">Aktuell ist niemand abwesend.</span>
            ) : (
              <div className="flex flex-col">
                {absentNow.map((a) => (
                  <div key={a.id} className="flex min-h-9 items-center gap-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-[3px] bg-to-vacation" />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-to-text">{players[a.player_id]?.name ?? '?'}</span>
                    <span className="to-data shrink-0 text-[12px] text-to-text3">{fmtRangeLabel(a.start_date, a.end_date)}</span>
                  </div>
                ))}
              </div>
            )}
            {absentSoon.length > 0 && (
              <>
                <button
                  type="button"
                  aria-expanded={soonOpen}
                  aria-controls="team-absent-soon"
                  onClick={() => setSoonOpen((v) => !v)}
                  className="flex min-h-9 w-full items-center gap-2 text-left text-[13px] text-to-text3"
                >
                  <span className="flex-1">{soonOpen ? 'Kommende ausblenden' : `${absentSoon.length} kommende anzeigen`}</span>
                  <ChevronIcon open={soonOpen} />
                </button>
                {soonOpen && (
                  <div id="team-absent-soon" className="flex flex-col gap-1">
                    <span className="to-data pt-1 text-[10px] tracking-[0.12em] text-to-textDisabled">KOMMEND</span>
                    <div className="flex flex-col">
                      {absentSoon.map((a) => (
                        <div key={a.id} className="flex min-h-9 items-center gap-2.5">
                          <span className="h-2 w-2 shrink-0 rounded-[3px] bg-to-lineMuted" />
                          <span className="min-w-0 flex-1 truncate text-[15px] text-to-text2">{players[a.player_id]?.name ?? '?'}</span>
                          <span className="to-data shrink-0 text-[12px] text-to-text3">{fmtRangeLabel(a.start_date, a.end_date)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className={`flex flex-col gap-2.5 px-5 py-[18px] ${showLocked ? 'border-t border-to-divider' : ''}`}>
          <span className="to-label">TRIKOTSÄTZE</span>
          <div className="flex flex-col">
            {trikotSets.map((set) => {
              const holderName = set.current_holder_id ? players[set.current_holder_id]?.name : null;
              const place = set.label.split(' · ')[1]?.toUpperCase() ?? set.label.toUpperCase();
              return (
                <div key={set.id} className="flex min-h-[42px] items-center gap-3">
                  <span
                    className={`h-[22px] w-[22px] shrink-0 rounded-[7px] border ${
                      set.id === 'weiss' ? 'border-to-text bg-to-text' : 'border-to-lineMuted bg-to-bg'
                    }`}
                  />
                  <span className="to-data w-[92px] shrink-0 text-[11px] tracking-[0.08em] text-to-text3">{place}</span>
                  <span className={`min-w-0 flex-1 truncate text-right text-[15px] ${holderName ? 'text-to-text' : 'text-to-text3'}`}>
                    {holderName ?? 'Nicht zugeordnet'}
                  </span>
                </div>
              );
            })}
          </div>
          <Link to="/trikots" className="flex min-h-9 items-center gap-2 text-[13px] text-to-text3">
            <span className="flex-1">Trikots verwalten</span>
            <ChevronRightIcon />
          </Link>
        </div>

        <div id="trainingszeiten" className="flex scroll-mt-20 flex-col gap-2.5 border-t border-to-divider px-5 py-[18px]">
          <span className="to-label">TRAININGSZEITEN</span>
          {!state && !error && <span className="text-sm text-to-text3">Lädt…</span>}
          {state && state.trainings.length === 0 && <span className="text-sm text-to-text3">Noch keine Zeiten hinterlegt.</span>}
          {state && state.trainings.length > 0 && (
            <div className="flex flex-col">
              {state.trainings.map((t) => (
                <div key={t.id} className="flex min-h-[38px] items-baseline gap-2.5">
                  <span className="w-[70px] shrink-0 text-[15px] font-semibold text-to-text">{t.weekday}</span>
                  <span className="to-data flex-1 text-[13px] text-to-text2">
                    {fmtTime(t.start_time)}–{fmtTime(t.end_time)}
                  </span>
                  <span className="shrink-0 text-[13px] text-to-text3">{t.location}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ErrorInline({ message }: { message: string }) {
  return <span className="text-sm text-to-dangerText">{message}</span>;
}
