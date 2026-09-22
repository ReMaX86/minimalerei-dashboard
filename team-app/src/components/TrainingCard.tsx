import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorNote } from './ErrorNote';
import { daysUntil, fmtDateBadge, fmtTime, shortPlayerName } from '../lib/format';
import { cancelledOccurrencesUntil, nextTrainingOccurrences, type TrainingOccurrence } from '../lib/trainingSchedule';
import {
  TRAINING_DECLINE_REASON_LABELS,
  playerAbsenceOn,
  type Player,
  type PlayerAbsence,
  type Training,
  type TrainingDeclineReason,
  type TrainingOverride,
  type TrainingRsvpRow
} from '../types/database';

const UPCOMING_COUNT = 2;
const LOCK_BEFORE_MS = 60 * 60_000; // Frist: bis 1 Stunde vor Beginn

interface State {
  occurrences: TrainingOccurrence[];
  rsvps: TrainingRsvpRow[];
  players: Player[];
  absences: PlayerAbsence[];
}

function occKey(occ: TrainingOccurrence): string {
  return `${occ.training.id}|${occ.date}`;
}

// "IN 2 TAGEN" / "MORGEN" / "HEUTE" / "IN 40 MIN" — rein zeitbasiert, siehe
// PROMPT.md "Aufbau". Unter einer Stunde geht die Minuten-Form immer vor,
// auch am selben Kalendertag.
function countdownLabel(dateIso: string, startTime: string, now: Date): string {
  const target = new Date(`${dateIso}T${startTime}`);
  const totalMinutes = Math.ceil((target.getTime() - now.getTime()) / 60_000);
  if (totalMinutes < 60) return `IN ${Math.max(0, totalMinutes)} MIN`;
  const days = daysUntil(dateIso, now);
  if (days <= 0) return 'HEUTE';
  if (days === 1) return 'MORGEN';
  return `IN ${days} TAGEN`;
}

function isLocked(occ: TrainingOccurrence, now: Date): boolean {
  const start = new Date(`${occ.date}T${occ.training.start_time}`);
  return now.getTime() >= start.getTime() - LOCK_BEFORE_MS;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}

export function TrainingCard({ refreshKey, onChange }: { refreshKey?: number; onChange?: () => void } = {}) {
  const { role, player, isAdmin } = useAuth();
  const { flags } = useFeatureFlags();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondOpen, setSecondOpen] = useState(false);
  const [namesOpen, setNamesOpen] = useState<Set<string>>(new Set());
  const [showAllOpen, setShowAllOpen] = useState<Set<string>>(new Set());
  const [votingKey, setVotingKey] = useState<string | null>(null);
  const [declineSheetOcc, setDeclineSheetOcc] = useState<TrainingOccurrence | null>(null);
  const [cancelSheetOcc, setCancelSheetOcc] = useState<TrainingOccurrence | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

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
    const realOccurrences = nextTrainingOccurrences(trainings, UPCOMING_COUNT, new Date(), overrides);
    const cancelled = cancelledOccurrencesUntil(
      trainings,
      new Date(),
      realOccurrences[realOccurrences.length - 1]?.date,
      overrides
    );
    const occurrences = [...realOccurrences, ...cancelled].sort((a, b) => a.date.localeCompare(b.date));
    const trainingIds = [...new Set(realOccurrences.map((o) => o.training.id))];

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
      const allowedKeys = new Set(realOccurrences.map((o) => `${o.training.id}|${o.date}`));
      rsvps = ((rsvpRows as TrainingRsvpRow[]) ?? []).filter((r) => allowedKeys.has(`${r.training_id}|${r.session_date}`));
    }

    setState({
      occurrences,
      rsvps,
      players: (playersRes.data as Player[]) ?? [],
      absences: (absencesRes.data as PlayerAbsence[]) ?? []
    });
    // refreshKey wird hier nicht gelesen — löst nur ein Neuladen aus, wenn
    // AbsenceCard (Geschwister-Komponente auf dem Dashboard) eine
    // Abwesenheit ändert, die hier den Urlaub-Zustand mitbestimmt.
  }, [flags.absences, refreshKey]);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Trainingszeiten.'));
  }, [load]);

  async function respond(occ: TrainingOccurrence, attending: boolean, reason?: TrainingDeclineReason | null, note?: string) {
    if (!player) return;
    const key = occKey(occ);
    setVotingKey(key);
    setActionError(null);
    try {
      const { error: upsertError } = await supabase.from('training_rsvps').upsert(
        {
          training_id: occ.training.id,
          session_date: occ.date,
          player_id: player.id,
          is_attending: attending,
          decline_reason: attending ? null : (reason ?? null),
          decline_note: attending ? null : note?.trim() || null
        },
        { onConflict: 'training_id,session_date,player_id' }
      );
      if (upsertError) throw upsertError;
      setDeclineSheetOcc(null);
      await load();
      onChange?.();
    } catch {
      setActionError('Zu-/Absage konnte nicht gespeichert werden.');
    } finally {
      setVotingKey(null);
    }
  }

  // "Nochmal auf den gedrückten Knopf tippen nimmt sie zurück" — die Zeile
  // verschwindet dann wieder, der Termin steht auf "offen".
  async function withdraw(occ: TrainingOccurrence) {
    if (!player) return;
    const key = occKey(occ);
    setVotingKey(key);
    setActionError(null);
    try {
      const { error: delError } = await supabase
        .from('training_rsvps')
        .delete()
        .eq('training_id', occ.training.id)
        .eq('session_date', occ.date)
        .eq('player_id', player.id);
      if (delError) throw delError;
      await load();
      onChange?.();
    } catch {
      setActionError('Rückmeldung konnte nicht zurückgenommen werden.');
    } finally {
      setVotingKey(null);
    }
  }

  async function cancelTraining(occ: TrainingOccurrence, note: string) {
    setActionBusy(true);
    setActionError(null);
    try {
      const { error: insertError } = await supabase.from('training_overrides').insert({
        start_date: occ.date,
        end_date: occ.date,
        mode: 'cancelled',
        note: note.trim() || null
      });
      if (insertError) throw insertError;
      setCancelSheetOcc(null);
      await load();
      onChange?.();
    } catch {
      setActionError('Training konnte nicht abgesagt werden.');
    } finally {
      setActionBusy(false);
    }
  }

  if (error) return <ErrorNote message={error} />;
  if (!state) return <LoadingSpinner />;

  const shown = state.occurrences; // inkl. abgesagter Termine, siehe cancelledOccurrencesUntil()
  const realShown = shown.filter((o) => !o.cancelled);

  return (
    <section id="training" className="card scroll-mt-20 overflow-hidden !p-0">
      <div className="flex items-center justify-between px-5 pb-1 pt-[18px]">
        <span className="to-label">TRAINING</span>
        <a href="#trainingszeiten" className="text-[13px] font-semibold text-to-accent">
          Alle Termine
        </a>
      </div>

      {shown.length === 0 && (
        <div className="flex flex-col gap-1.5 border-t border-to-border px-5 py-[22px]">
          <span className="flex items-center gap-2.5 text-[15px] text-to-text2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-to-text3" />
            Keine Trainings geplant
          </span>
          <span className="pl-[18px] text-[13px] text-to-text3">Sobald der Trainer Termine einträgt, stehen sie hier.</span>
        </div>
      )}

      {shown.map((occ) => {
        const key = occKey(occ);

        if (occ.cancelled) {
          // Der abgesagte Termin, der chronologisch als Erstes drankäme, ist
          // "Termin 1" im Sinne der Vorlage (9-vom-trainer-abgesagt.png) und
          // bekommt die volle Kachel mit durchgestrichenem Datum/Zeit + roter
          // "ABGESAGT"-Pille + Hinweisfläche. Ein abgesagter Termin weiter
          // hinten in der Liste (z. B. eine ganze Ferienwoche) ist in der
          // Vorlage nicht vorgesehen — bekommt hier ersatzweise die knappe
          // Zeile, siehe Abweichungen in der Chat-Antwort.
          if (shown[0] === occ) {
            return (
              <div key={key} className="flex flex-col gap-3.5 border-t border-to-border px-5 py-[18px]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="to-display-lg text-to-text3 line-through">{fmtDateBadge(occ.date)}</span>
                    <span className="to-data text-sm text-to-text3 line-through">
                      {fmtTime(occ.training.start_time)}–{fmtTime(occ.training.end_time)} Uhr
                    </span>
                    <span className="text-[13px] text-to-text3">{occ.training.location}</span>
                  </div>
                  <span className="to-data inline-flex h-6 shrink-0 items-center rounded-to-pill bg-to-dangerSoft px-2.5 text-[11px] font-semibold text-to-dangerText">
                    ABGESAGT
                  </span>
                </div>
                <div className="flex min-h-12 items-center gap-2.5 rounded-to-lg bg-to-dangerSoft px-4 text-sm font-semibold text-to-dangerText">
                  <XIcon />
                  Training abgesagt{occ.cancelledBy?.note ? ` · ${occ.cancelledBy.note}` : ''}
                </div>
              </div>
            );
          }
          return (
            <div key={key} className="flex gap-3 border-t border-to-border px-5 py-[18px]">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-to-danger" />
              <div>
                <p className="text-sm font-semibold text-to-dangerText">{fmtDateBadge(occ.date)} · Training fällt aus</p>
                {occ.cancelledBy?.note && <p className="mt-0.5 text-xs text-to-text2">{occ.cancelledBy.note}</p>}
              </div>
            </div>
          );
        }

        const isFirst = realShown.indexOf(occ) === 0;
        if (isFirst) {
          return (
            <SessionBody
              key={key}
              occ={occ}
              role={role}
              player={player}
              isAdmin={isAdmin}
              state={state}
              namesOpen={namesOpen.has(key)}
              onToggleNames={() =>
                setNamesOpen((prev) => {
                  const next = new Set(prev);
                  next.has(key) ? next.delete(key) : next.add(key);
                  return next;
                })
              }
              showAllOpen={showAllOpen.has(key)}
              onShowAllOpen={() => setShowAllOpen((prev) => new Set(prev).add(key))}
              voting={votingKey === key}
              onRespond={(attending) => (attending ? respond(occ, true) : setDeclineSheetOcc(occ))}
              onWithdraw={() => withdraw(occ)}
              onCancelTraining={() => setCancelSheetOcc(occ)}
              nested={false}
            />
          );
        }

        // Termin 2: zusammengeklappte Zeile, klappt beim Antippen dieselbe
        // Darstellung wie Termin 1 auf (ohne eigenen großen Datumsblock).
        const myRow = state.rsvps.find((r) => r.training_id === occ.training.id && r.session_date === occ.date && r.player_id === player?.id);
        const myAbsence = player && flags.absences ? playerAbsenceOn(state.absences, player.id, occ.date) : false;
        const sub = !secondOpen
          ? 'Antippen zum Zu- oder Absagen'
          : myAbsence
            ? 'Du bist im Urlaub'
            : myRow?.is_attending === true
              ? 'Du bist dabei'
              : myRow?.is_attending === false
                ? 'Du hast abgesagt'
                : 'Noch keine Rückmeldung von dir';

        return (
          <div key={key}>
            <button
              type="button"
              aria-expanded={secondOpen}
              aria-controls={`session-${key}`}
              onClick={() => setSecondOpen((v) => !v)}
              className={`flex min-h-[60px] w-full items-center gap-3 border-t border-to-border px-5 text-left ${secondOpen ? 'bg-to-surface2' : ''}`}
            >
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-to-text">
                  {fmtDateBadge(occ.date)} · {fmtTime(occ.training.start_time)}–{fmtTime(occ.training.end_time)} Uhr
                </span>
                <span className="block text-[13px] text-to-text3">{sub}</span>
              </span>
              <ChevronIcon open={secondOpen} className="shrink-0 text-to-text3" />
            </button>
            {secondOpen && (
              <div id={`session-${key}`}>
                <SessionBody
                  occ={occ}
                  role={role}
                  player={player}
                  isAdmin={isAdmin}
                  state={state}
                  namesOpen={namesOpen.has(key)}
                  onToggleNames={() =>
                    setNamesOpen((prev) => {
                      const next = new Set(prev);
                      next.has(key) ? next.delete(key) : next.add(key);
                      return next;
                    })
                  }
                  showAllOpen={showAllOpen.has(key)}
                  onShowAllOpen={() => setShowAllOpen((prev) => new Set(prev).add(key))}
                  voting={votingKey === key}
                  onRespond={(attending) => (attending ? respond(occ, true) : setDeclineSheetOcc(occ))}
                  onWithdraw={() => withdraw(occ)}
                  onCancelTraining={() => setCancelSheetOcc(occ)}
                  nested
                  hideDate
                />
              </div>
            )}
          </div>
        );
      })}

      {declineSheetOcc && (
        <ReasonSheet
          title="Für dieses Training absagen?"
          hint="Ein Grund hilft dem Trainer beim Planen, ist aber freiwillig."
          sendLabel="Absage senden"
          busy={actionBusy || votingKey === occKey(declineSheetOcc)}
          error={actionError}
          onCancel={() => {
            setDeclineSheetOcc(null);
            setActionError(null);
          }}
          onSend={(reason, note) => respond(declineSheetOcc, false, reason, note)}
        />
      )}

      {cancelSheetOcc && (
        <ReasonSheet
          title="Training wirklich absagen?"
          hint="Das Team wird informiert. Ein Grund ist freiwillig."
          sendLabel="Training absagen"
          busy={actionBusy}
          error={actionError}
          onCancel={() => {
            setCancelSheetOcc(null);
            setActionError(null);
          }}
          onSend={(_reason, note) => cancelTraining(cancelSheetOcc, note)}
        />
      )}
    </section>
  );
}

function SessionBody({
  occ,
  role,
  player,
  isAdmin,
  state,
  namesOpen,
  onToggleNames,
  showAllOpen,
  onShowAllOpen,
  voting,
  onRespond,
  onWithdraw,
  onCancelTraining,
  nested,
  hideDate
}: {
  occ: TrainingOccurrence;
  role: string;
  player: Player | null;
  isAdmin: boolean;
  state: State;
  namesOpen: boolean;
  onToggleNames: () => void;
  showAllOpen: boolean;
  onShowAllOpen: () => void;
  voting: boolean;
  onRespond: (attending: boolean) => void;
  onWithdraw: () => void;
  onCancelTraining: () => void;
  nested: boolean;
  hideDate?: boolean;
}) {
  const { flags } = useFeatureFlags();
  const [now] = useState(() => new Date());

  const rsvpsForOcc = state.rsvps.filter((r) => r.training_id === occ.training.id && r.session_date === occ.date);
  const isAbsent = (p: Player) => flags.absences && playerAbsenceOn(state.absences, p.id, occ.date);
  const urlaub = state.players.filter(isAbsent);
  const zusagen = state.players.filter((p) => !isAbsent(p) && rsvpsForOcc.some((r) => r.player_id === p.id && r.is_attending));
  const absagen = state.players.filter((p) => !isAbsent(p) && rsvpsForOcc.some((r) => r.player_id === p.id && !r.is_attending));
  const offen = state.players.filter((p) => !isAbsent(p) && !rsvpsForOcc.some((r) => r.player_id === p.id));

  const myRow = player ? rsvpsForOcc.find((r) => r.player_id === player.id) : undefined;
  const myVote = myRow?.is_attending ?? null;
  const myAbsence = player && flags.absences ? playerAbsenceOn(state.absences, player.id, occ.date) : false;
  const locked = isLocked(occ, now);
  const total = zusagen.length + absagen.length + urlaub.length + offen.length;

  return (
    <div className={`flex flex-col gap-3.5 px-5 py-[18px] ${nested ? 'border-t-0 pt-1' : 'border-t border-to-border'}`}>
      {!hideDate && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="to-display-lg text-to-text">{fmtDateBadge(occ.date)}</span>
            <span className="to-data text-sm text-to-text2">
              {fmtTime(occ.training.start_time)}–{fmtTime(occ.training.end_time)} Uhr
            </span>
            <span className="text-[13px] text-to-text3">{occ.training.location}</span>
          </div>
          <span className="to-data inline-flex h-6 shrink-0 items-center rounded-to-pill bg-to-surface2 px-2.5 text-[11px] font-semibold text-to-text2">
            {countdownLabel(occ.date, occ.training.start_time, now)}
          </span>
        </div>
      )}

      {total > 0 && (
        <div className="flex gap-1.5" aria-hidden="true">
          {zusagen.length > 0 && <span className="h-2 rounded-to-sm bg-to-accent" style={{ flexGrow: zusagen.length }} />}
          {absagen.length > 0 && <span className="h-2 rounded-to-sm bg-to-danger" style={{ flexGrow: absagen.length }} />}
          {urlaub.length > 0 && <span className="h-2 rounded-to-sm bg-to-vacation" style={{ flexGrow: urlaub.length }} />}
          {offen.length > 0 && <span className="h-2 rounded-to-sm bg-to-border" style={{ flexGrow: offen.length }} />}
        </div>
      )}

      <button
        type="button"
        aria-expanded={namesOpen}
        onClick={onToggleNames}
        className="flex min-h-10 w-full items-center gap-2 text-left text-[13px] text-to-text2"
      >
        <span className="font-semibold text-to-accent">{zusagen.length} dabei</span>
        <span>·</span>
        <span>{absagen.length} abgesagt</span>
        <span>·</span>
        <span>{urlaub.length} Urlaub</span>
        <span>·</span>
        <span className="flex-1">{offen.length} offen</span>
        <ChevronIcon open={namesOpen} className="shrink-0 text-to-text3" />
      </button>

      {namesOpen && (
        <div className="flex flex-col gap-3 rounded-to-lg bg-to-bg p-3.5">
          <PeopleGroup label="ZUSAGEN" count={zusagen.length} tone="yes">
            {zusagen.map((p) => (
              <NameChip key={p.id} tone="yes">
                {shortPlayerName(p.name)}
              </NameChip>
            ))}
          </PeopleGroup>
          <PeopleGroup label="ABSAGEN" count={absagen.length} tone="no">
            {absagen.map((p) => {
              const row = rsvpsForOcc.find((r) => r.player_id === p.id);
              const mine = player?.id === p.id;
              const reasonSuffix = mine && row?.decline_reason ? ` · ${TRAINING_DECLINE_REASON_LABELS[row.decline_reason]}` : '';
              return (
                <NameChip key={p.id} tone="no">
                  {shortPlayerName(p.name)}
                  {reasonSuffix}
                </NameChip>
              );
            })}
          </PeopleGroup>
          {urlaub.length > 0 && (
            <PeopleGroup label="URLAUB" count={urlaub.length} tone="vac">
              {urlaub.map((p) => (
                <NameChip key={p.id} tone="vac">
                  {shortPlayerName(p.name)}
                </NameChip>
              ))}
            </PeopleGroup>
          )}
          {offen.length > 0 && (
            <PeopleGroup label="NOCH OFFEN" count={offen.length} tone="open">
              {(showAllOpen ? offen : offen.slice(0, 6)).map((p) => (
                <NameChip key={p.id} tone="open">
                  {shortPlayerName(p.name)}
                </NameChip>
              ))}
              {!showAllOpen && offen.length > 6 && (
                <button type="button" onClick={onShowAllOpen} className="self-start text-[13px] font-semibold text-to-accent">
                  Alle {offen.length} anzeigen
                </button>
              )}
            </PeopleGroup>
          )}
        </div>
      )}

      {role === 'player' && myAbsence && (
        <div className="flex min-h-[52px] items-center justify-between gap-3 rounded-to-lg bg-to-vacationSoft px-4 text-[15px] font-semibold text-to-vacation">
          <span>Du bist im Urlaub</span>
          <a href="#absences" className="text-[14px] font-semibold text-to-text2 underline">
            Zeitraum ändern
          </a>
        </div>
      )}

      {role === 'player' && !myAbsence && !locked && (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={voting}
            aria-pressed={myVote === true}
            onClick={() => (myVote === true ? onWithdraw() : onRespond(true))}
            className={`flex h-[52px] items-center justify-center gap-2 rounded-to-lg border text-[15px] font-semibold transition ${
              myVote === true ? 'border-to-accent bg-to-accent text-to-onAccent' : 'border-to-line text-to-text'
            }`}
          >
            <CheckIcon />
            {myVote === true ? 'Dabei' : 'Bin dabei'}
          </button>
          <button
            type="button"
            disabled={voting}
            aria-pressed={myVote === false}
            onClick={() => (myVote === false ? onWithdraw() : onRespond(false))}
            className={`flex h-[52px] items-center justify-center gap-2 rounded-to-lg border text-[15px] font-semibold transition ${
              myVote === false ? 'border-to-danger bg-to-dangerSoft text-to-dangerText' : 'border-to-line text-to-text'
            }`}
          >
            <XIcon />
            Kann nicht
          </button>
        </div>
      )}

      {role === 'player' && !myAbsence && locked && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <span
              aria-disabled="true"
              className={`flex h-[52px] items-center justify-center gap-2 rounded-to-lg border text-[15px] font-semibold opacity-45 ${
                myVote === true ? 'border-to-accent bg-to-accent text-to-onAccent' : 'border-to-line text-to-text'
              }`}
            >
              <CheckIcon />
              {myVote === true ? 'Dabei' : 'Bin dabei'}
            </span>
            <span
              aria-disabled="true"
              className={`flex h-[52px] items-center justify-center gap-2 rounded-to-lg border text-[15px] font-semibold opacity-45 ${
                myVote === false ? 'border-to-danger bg-to-dangerSoft text-to-dangerText' : 'border-to-line text-to-text'
              }`}
            >
              <XIcon />
              Kann nicht
            </span>
          </div>
          <p className="text-center text-xs text-to-text3">Rückmeldung war bis 1 Stunde vorher möglich</p>
        </>
      )}

      {isAdmin && (
        <div className="flex items-center justify-between gap-3 border-t border-to-border pt-3">
          <span className="to-label">TRAINER</span>
          <button type="button" onClick={onCancelTraining} className="py-1 text-[14px] font-semibold text-to-dangerText">
            Training absagen
          </button>
        </div>
      )}
    </div>
  );
}

function PeopleGroup({
  label,
  count,
  tone,
  children
}: {
  label: string;
  count: number;
  tone: 'yes' | 'no' | 'vac' | 'open';
  children: React.ReactNode;
}) {
  const toneClass = { yes: 'text-to-accent', no: 'text-to-dangerText', vac: 'text-to-vacation', open: 'text-to-text3' }[tone];
  return (
    <div className="flex flex-col gap-2">
      <span className={`to-label !text-inherit ${toneClass}`}>
        {label} ({count})
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function NameChip({ tone, children }: { tone: 'yes' | 'no' | 'vac' | 'open'; children: React.ReactNode }) {
  const toneClass = {
    yes: 'bg-to-accentSoft text-to-accent',
    no: 'bg-to-dangerSoft text-to-dangerText',
    vac: 'bg-to-vacationSoft text-to-vacation',
    open: 'bg-to-surface2 text-to-text2'
  }[tone];
  return <span className={`inline-flex h-7 items-center rounded-to-pill px-2.5 text-[13px] ${toneClass}`}>{children}</span>;
}

const REASONS: TrainingDeclineReason[] = ['krank', 'arbeit_schule', 'termin', 'anderer_grund'];

function ReasonSheet({
  title,
  hint,
  sendLabel,
  busy,
  error,
  onCancel,
  onSend
}: {
  title: string;
  hint: string;
  sendLabel: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSend: (reason: TrainingDeclineReason | null, note: string) => void;
}) {
  const [reason, setReason] = useState<TrainingDeclineReason | null>(null);
  const [note, setNote] = useState('');

  return createPortal(
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-t-[24px] border border-to-line bg-to-surface2 p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[19px] font-semibold -tracking-[0.01em] text-to-text">{title}</h2>
        <p className="mt-1 text-sm text-to-text2">{hint}</p>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Grund (optional)">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason((prev) => (prev === r ? null : r))}
              className={`h-[38px] rounded-to-pill border px-3.5 text-sm ${
                reason === r ? 'border-to-accent bg-to-accent font-semibold text-to-onAccent' : 'border-to-line text-to-text'
              }`}
            >
              {TRAINING_DECLINE_REASON_LABELS[r]}
            </button>
          ))}
        </div>

        <textarea
          className="mt-4 min-h-16 w-full resize-none rounded-to-lg border border-to-line bg-to-bg p-3.5 text-[15px] text-to-text placeholder:text-to-text3"
          placeholder="Notiz für den Trainer (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {error && <p className="mt-3 text-xs text-to-dangerText">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button type="button" disabled={busy} className="btn-primary !h-[50px] !px-2 text-[15px]" onClick={() => onSend(reason, note)}>
            {busy ? 'Sende…' : sendLabel}
          </button>
          <button type="button" disabled={busy} className="btn-secondary !h-[50px] !px-2 text-[15px]" onClick={onCancel}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
