import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorNote } from './ErrorNote';
import { fmtDate, fmtTime } from '../lib/format';
import { nextTrainingOccurrences, type TrainingOccurrence } from '../lib/trainingSchedule';
import {
  playerAbsenceOn,
  type Player,
  type PlayerAbsence,
  type Training,
  type TrainingOverride,
  type TrainingRsvpRow
} from '../types/database';

const UPCOMING_COUNT = 2;

interface State {
  occurrences: TrainingOccurrence[];
  rsvps: TrainingRsvpRow[];
  players: Player[];
  absences: PlayerAbsence[];
}

export function UpcomingTrainings({
  refreshKey,
  onChange
}: { refreshKey?: number; onChange?: () => void } = {}) {
  const { role, player } = useAuth();
  const { flags } = useFeatureFlags();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [votingKey, setVotingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const [trainingsRes, overridesRes, playersRes, absencesRes] = await Promise.all([
      supabase.from('trainings').select('*'),
      supabase.from('training_overrides').select('*').gte('end_date', today),
      supabase.from('players').select('*').eq('is_active', true),
      flags.absences
        ? supabase.from('player_absences').select('*').gte('end_date', today)
        : Promise.resolve({ data: [] as PlayerAbsence[], error: null })
    ]);
    if (trainingsRes.error || overridesRes.error || playersRes.error) {
      setError('Fehler beim Laden der Trainingszeiten.');
      return;
    }

    const trainings = (trainingsRes.data as Training[]) ?? [];
    const overrides = (overridesRes.data as TrainingOverride[]) ?? [];
    const occurrences = nextTrainingOccurrences(trainings, UPCOMING_COUNT, new Date(), overrides);
    const trainingIds = [...new Set(occurrences.map((o) => o.training.id))];

    let rsvps: TrainingRsvpRow[] = [];
    if (trainingIds.length > 0) {
      const { data: rsvpRows, error: rsvpError } = await supabase
        .from('training_rsvps')
        .select('*')
        .in('training_id', trainingIds);
      if (rsvpError) {
        setError('Fehler beim Laden der Trainingszeiten.');
        return;
      }
      const dateByTraining = new Map(occurrences.map((o) => [o.training.id, o.date]));
      rsvps = ((rsvpRows as TrainingRsvpRow[]) ?? []).filter(
        (r) => dateByTraining.get(r.training_id) === r.session_date
      );
    }

    setState({
      occurrences,
      rsvps,
      players: (playersRes.data as Player[]) ?? [],
      absences: (absencesRes.data as PlayerAbsence[]) ?? []
    });
    // refreshKey isn't read inside load() — it's only here to force a
    // refetch when AbsenceSection (a sibling on the dashboard) changes an
    // absence, since that's stored in this component's own state.
  }, [flags.absences, refreshKey]);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Trainingszeiten.'));
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!state) return <LoadingSpinner />;
  if (state.occurrences.length === 0) {
    return <p className="text-sm text-tbw-ink/50">Keine Trainingszeiten hinterlegt.</p>;
  }

  async function vote(occ: TrainingOccurrence, isAttending: boolean) {
    if (!player) return;
    const key = occ.training.id + occ.date;
    setVotingKey(key);
    setError(null);
    try {
      const { error: upsertError } = await supabase.from('training_rsvps').upsert(
        {
          training_id: occ.training.id,
          session_date: occ.date,
          player_id: player.id,
          is_attending: isAttending
        },
        { onConflict: 'training_id,session_date,player_id' }
      );
      if (upsertError) throw upsertError;
      await load();
      // Die Startseite zeigt ggf. eine Erinnerung "Training noch nicht
      // beantwortet" — die muss nach einer Zu-/Absage hier sofort
      // verschwinden, nicht erst nach einem Reload.
      onChange?.();
    } catch {
      setError('Zu-/Absage konnte nicht gespeichert werden.');
    } finally {
      setVotingKey(null);
    }
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {state.occurrences.map((occ) => {
        const key = occ.training.id + occ.date;
        const rsvpsForOcc = state.rsvps.filter(
          (r) => r.training_id === occ.training.id && r.session_date === occ.date
        );
        const isAbsent = (p: Player) => flags.absences && playerAbsenceOn(state.absences, p.id, occ.date);
        const urlaub = state.players.filter(isAbsent);
        const zusagen = state.players.filter(
          (p) => !isAbsent(p) && rsvpsForOcc.some((r) => r.player_id === p.id && r.is_attending)
        );
        const absagen = state.players.filter(
          (p) => !isAbsent(p) && rsvpsForOcc.some((r) => r.player_id === p.id && !r.is_attending)
        );
        const offen = state.players.filter((p) => !isAbsent(p) && !rsvpsForOcc.some((r) => r.player_id === p.id));
        const myVote = player ? rsvpsForOcc.find((r) => r.player_id === player.id)?.is_attending ?? null : null;
        const myAbsence = player && flags.absences ? playerAbsenceOn(state.absences, player.id, occ.date) : false;
        const isExpanded = expanded.has(key);

        return (
          <div key={key} className="rounded-2xl bg-tbw-bg p-3">
            <button className="w-full text-left" onClick={() => toggleExpanded(key)}>
              <p className="text-sm font-bold text-tbw-navyDark">{fmtDate(occ.date)}</p>
              <p className="text-sm text-tbw-ink/70">
                {fmtTime(occ.training.start_time)}–{fmtTime(occ.training.end_time)} · {occ.training.location}
              </p>
              {occ.note && <p className="mt-0.5 text-xs font-semibold text-tbw-gold">🏖️ {occ.note}</p>}
              <p className="mt-1 text-xs text-tbw-ink/50">
                ✓ {zusagen.length} · ✗ {absagen.length}
                {urlaub.length > 0 && ` · 🌴 ${urlaub.length}`} · {offen.length} offen {isExpanded ? '▲' : '▼'}
              </p>
            </button>

            {role === 'player' && myAbsence && (
              <p className="mt-2 text-sm text-tbw-ink/50">
                🌴 Du bist in diesem Zeitraum als abwesend eingetragen — Training gilt als abgesagt.
              </p>
            )}

            {role === 'player' && !myAbsence && (
              <div className="mt-2 flex items-center gap-4">
                <button
                  onClick={() => vote(occ, true)}
                  disabled={votingKey === key}
                  className="flex flex-col items-center gap-0.5 disabled:opacity-50"
                >
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-xl font-bold transition active:scale-95 ${
                      myVote === true ? 'bg-status-ok text-white' : 'bg-status-ok/10 text-status-ok'
                    }`}
                  >
                    ✓
                  </span>
                  <span className="text-[10px] font-semibold text-tbw-ink/50">Bin dabei</span>
                </button>
                <button
                  onClick={() => vote(occ, false)}
                  disabled={votingKey === key}
                  className="flex flex-col items-center gap-0.5 disabled:opacity-50"
                >
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-xl font-bold transition active:scale-95 ${
                      myVote === false ? 'bg-tbw-red text-white' : 'bg-tbw-red/10 text-tbw-red'
                    }`}
                  >
                    ✗
                  </span>
                  <span className="text-[10px] font-semibold text-tbw-ink/50">Kann nicht</span>
                </button>
              </div>
            )}

            {isExpanded && (
              <div className="mt-3 space-y-2 border-t border-black/5 pt-3 text-sm">
                <AttendeeGroup label="Zusagen" pillClass="pill-ok" players={zusagen} />
                <AttendeeGroup label="Absagen" pillClass="pill-open" players={absagen} />
                {urlaub.length > 0 && <AttendeeGroup label="Urlaub" pillClass="pill-warn" players={urlaub} />}
                <AttendeeGroup label="Noch offen" pillClass="pill-open" players={offen} muted />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AttendeeGroup({
  label,
  players,
  pillClass,
  muted
}: {
  label: string;
  players: Player[];
  pillClass: string;
  muted?: boolean;
}) {
  return (
    <div>
      <p className={`text-xs font-bold uppercase tracking-wide ${muted ? 'text-tbw-ink/40' : 'text-tbw-navy/70'}`}>
        {label} ({players.length})
      </p>
      {players.length === 0 ? (
        <p className="text-xs text-tbw-ink/40">—</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {players.map((p) => (
            <span key={p.id} className={`pill ${pillClass}`}>
              {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
