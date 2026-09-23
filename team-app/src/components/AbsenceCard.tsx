import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorNote } from './ErrorNote';
import { fmtDateShort } from '../lib/format';
import { trainingsInDateRange } from '../lib/trainingSchedule';
import type { PlayerAbsence, Training, TrainingOverride } from '../types/database';

interface State {
  absences: PlayerAbsence[];
  trainings: Training[];
  overrides: TrainingOverride[];
}

function localTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "Diese Woche" endet den kommenden Sonntag (inkl. heute, falls heute schon
// Sonntag ist) — Montag-Sonntag-Woche, dieselbe Konvention wie die deutschen
// Wochentagsnamen in trainingSchedule.ts.
function endOfWeekIso(fromIso: string): string {
  const day = new Date(fromIso + 'T00:00:00').getDay(); // 0=So..6=Sa
  return addDaysIso(fromIso, day === 0 ? 0 : 7 - day);
}

function daysInclusive(startIso: string, endIso: string): number {
  const start = new Date(startIso + 'T00:00:00');
  const end = new Date(endIso + 'T00:00:00');
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function fmtDateDisplay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtRangeLabel(startIso: string, endIso: string): string {
  return startIso === endIso ? fmtDateShort(startIso) : `${fmtDateShort(startIso)} – ${fmtDateShort(endIso)}`;
}

function trainingsLabel(count: number): string {
  if (count === 0) return '0 TRAININGS';
  return count === 1 ? '1 TRAINING' : `${count} TRAININGS`;
}

interface Draft {
  start: string;
  end: string;
}

const CHIPS: { key: string; label: string; range: (today: string) => Draft }[] = [
  { key: 'today', label: 'Nur heute', range: (today) => ({ start: today, end: today }) },
  { key: 'week', label: 'Diese Woche', range: (today) => ({ start: today, end: endOfWeekIso(today) }) },
  { key: 'oneweek', label: 'Eine Woche', range: (today) => ({ start: today, end: addDaysIso(today, 6) }) },
  { key: 'twoweeks', label: 'Zwei Wochen', range: (today) => ({ start: today, end: addDaysIso(today, 13) }) }
];

function SuitcaseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-to-text3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 7h14" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 13h8l1-13" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 6v12" />
      <path d="M6 12h12" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01" />
      <path d="M11 12h1v4h1" />
    </svg>
  );
}

export function AbsenceCard({ onChange }: { onChange?: () => void } = {}) {
  const { player } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<PlayerAbsence | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!player) return;
    setError(null);
    const today = localTodayIso();
    const [absencesRes, trainingsRes, overridesRes] = await Promise.all([
      supabase.from('player_absences').select('*').eq('player_id', player.id).gte('end_date', today).order('start_date'),
      supabase.from('trainings').select('*'),
      supabase.from('training_overrides').select('*').gte('end_date', today)
    ]);
    if (absencesRes.error || trainingsRes.error || overridesRes.error) {
      setError('Fehler beim Laden deiner Abwesenheiten.');
      return;
    }
    setState({
      absences: (absencesRes.data as PlayerAbsence[]) ?? [],
      trainings: (trainingsRes.data as Training[]) ?? [],
      overrides: (overridesRes.data as TrainingOverride[]) ?? []
    });
  }, [player]);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden deiner Abwesenheiten.'));
  }, [load]);

  if (!player) return null;
  if (error) return <ErrorNote message={error} />;
  if (!state) return <LoadingSpinner />;

  const today = localTodayIso();
  // Überlappungen sind ausgeschlossen (siehe save()), daher reicht reines
  // Sortieren nach Startdatum — der laufende Zeitraum (falls vorhanden)
  // fängt zwangsläufig als einziger vor/am heutigen Tag an und landet damit
  // automatisch an erster Stelle, ohne eigene Sonderbehandlung.
  const sorted = [...state.absences].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const active = sorted.find((a) => a.start_date <= today && a.end_date >= today) ?? null;

  async function save(draft: Draft, excludeId?: string) {
    if (!player || !state) return;
    if (draft.end < draft.start) {
      return 'Bis darf nicht vor Von liegen.';
    }
    const overlap = state.absences.some(
      (a) => a.id !== excludeId && draft.start <= a.end_date && draft.end >= a.start_date
    );
    if (overlap) {
      return 'Dieser Zeitraum überschneidet sich mit einem bereits eingetragenen Zeitraum.';
    }
    setBusy(true);
    try {
      if (excludeId) {
        const { error: updateError } = await supabase
          .from('player_absences')
          .update({ start_date: draft.start, end_date: draft.end })
          .eq('id', excludeId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('player_absences')
          .insert({ player_id: player.id, start_date: draft.start, end_date: draft.end });
        if (insertError) throw insertError;
      }
      setSheetMode(null);
      setEditing(null);
      await load();
      onChange?.();
      return null;
    } catch {
      return 'Zeitraum konnte nicht gespeichert werden.';
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Zeitraum wirklich löschen?')) return;
    setBusy(true);
    try {
      const { error: delError } = await supabase.from('player_absences').delete().eq('id', id);
      if (delError) throw delError;
      setSheetMode(null);
      setEditing(null);
      await load();
      onChange?.();
    } catch {
      setError('Zeitraum konnte nicht gelöscht werden.');
    } finally {
      setBusy(false);
    }
  }

  const tile = (
    <span className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-to-md ${active ? 'bg-to-vacation' : 'bg-to-surface2'}`}>
      <SuitcaseIcon className={active ? 'text-to-onAccent' : sorted.length === 0 ? 'text-to-textDisabled' : 'text-to-vacation'} />
    </span>
  );

  let title: string;
  let sub: string;
  let subMono = true;
  if (active) {
    title = 'Du bist abwesend';
    sub = `NOCH BIS ${fmtDateShort(active.end_date)}`;
  } else if (sorted.length === 0) {
    title = 'Kein Zeitraum eingetragen';
    sub = 'Antippen zum Eintragen';
    subMono = false;
  } else if (sorted.length === 1) {
    title = '1 Zeitraum eingetragen';
    sub = `NÄCHSTER: ${fmtRangeLabel(sorted[0].start_date, sorted[0].end_date)}`;
  } else {
    title = `${sorted.length} Zeiträume eingetragen`;
    sub = `NÄCHSTER: ${fmtRangeLabel(sorted[0].start_date, sorted[0].end_date)}`;
  }

  return (
    <section id="absences" className={`card scroll-mt-20 overflow-hidden !p-0 ${active ? '!border-to-vacationFrame' : ''}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="absence-body"
        onClick={() => {
          if (sorted.length === 0) {
            setEditing(null);
            setSheetMode('create');
            return;
          }
          setOpen((v) => !v);
        }}
        className={`flex w-full items-center gap-3.5 px-[18px] py-4 text-left ${open ? 'bg-to-surface2' : ''}`}
      >
        {tile}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="to-label">ABWESENHEIT</span>
          <span className={`truncate text-[16px] font-semibold -tracking-[0.01em] ${sorted.length === 0 ? 'text-to-text2' : 'text-to-text'}`}>{title}</span>
          <span className={subMono ? 'to-data text-[13px] text-to-text2' : 'text-[13px] text-to-text3'}>{sub}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-2">
          {active && (
            <span className="to-data inline-flex h-[22px] items-center rounded-to-pill bg-to-vacationSoft px-2.5 text-[10px] font-semibold text-to-vacation">
              {daysInclusive(today, active.end_date)} {daysInclusive(today, active.end_date) === 1 ? 'TAG' : 'TAGE'}
            </span>
          )}
          {sorted.length > 0 && <ChevronDownIcon open={open} />}
        </span>
      </button>

      {open && sorted.length > 0 && (
        <div id="absence-body" className="flex flex-col gap-3 px-[18px] pb-[18px] pt-1">
          <span className="text-[13px] leading-[1.45] text-to-text3">
            Trainings in diesen Zeiträumen werden automatisch abgesagt. Beim Kader sieht der Trainer, dass du nicht da bist.
          </span>
          <div className="flex flex-col gap-2">
            {sorted.map((a) => {
              const running = a.start_date <= today && a.end_date >= today;
              const count = trainingsInDateRange(state.trainings, state.overrides, a.start_date, a.end_date);
              return (
                <div key={a.id} className={`flex items-center gap-3 rounded-to-lg p-3.5 ${running ? 'bg-to-vacationSoft' : 'bg-to-surface2'}`}>
                  <span className="h-[38px] w-1 shrink-0 rounded-sm bg-to-vacation" />
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(a);
                      setSheetMode('edit');
                    }}
                    className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                  >
                    <span className="truncate text-[16px] font-semibold -tracking-[0.01em] text-to-text">{fmtRangeLabel(a.start_date, a.end_date)}</span>
                    <span className="to-data text-[11px] tracking-[0.06em] text-to-text3">
                      {running ? `LÄUFT · NOCH ${daysInclusive(today, a.end_date)} TAGE` : `${daysInclusive(a.start_date, a.end_date)} TAGE · ${trainingsLabel(count)}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Zeitraum löschen"
                    disabled={busy}
                    onClick={() => remove(a.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-to-md border border-to-line text-to-dangerText"
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setSheetMode('create');
            }}
            className="btn-primary !h-[52px] gap-2 text-[15px]"
          >
            <PlusIcon />
            Zeitraum eintragen
          </button>
        </div>
      )}

      {sheetMode && (
        <PeriodSheet
          mode={sheetMode}
          initial={editing ? { start: editing.start_date, end: editing.end_date } : { start: today, end: today }}
          trainings={state.trainings}
          overrides={state.overrides}
          busy={busy}
          onSave={(draft) => save(draft, editing?.id)}
          onDelete={editing ? () => remove(editing.id) : undefined}
          onCancel={() => {
            setSheetMode(null);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function PeriodSheet({
  mode,
  initial,
  trainings,
  overrides,
  busy,
  onSave,
  onDelete,
  onCancel
}: {
  mode: 'create' | 'edit';
  initial: Draft;
  trainings: Training[];
  overrides: TrainingOverride[];
  busy: boolean;
  onSave: (draft: Draft) => Promise<string | null | undefined>;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [focused, setFocused] = useState<'start' | 'end'>('start');
  const [error, setError] = useState<string | null>(null);

  const today = localTodayIso();
  const count = end >= start ? trainingsInDateRange(trainings, overrides, start, end) : 0;
  const activeChip = CHIPS.find((c) => {
    const r = c.range(today);
    return r.start === start && r.end === end;
  })?.key;

  async function handleSave() {
    setError(null);
    const result = await onSave({ start, end });
    if (result) setError(result);
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-t-[24px] border border-to-line bg-to-surface p-5 sm:rounded-b-[18px]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto block h-1 w-[38px] rounded-full bg-to-line" />
        <div className="mt-4 flex flex-col gap-1">
          <h2 className="text-[22px] font-semibold italic -tracking-[0.035em] text-to-text">
            {mode === 'edit' ? 'Zeitraum ändern' : 'Abwesenheit eintragen'}
          </h2>
          <p className="text-[13px] text-to-text3">Trainings in diesem Zeitraum werden automatisch abgesagt.</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <label
            className={`relative flex flex-col gap-1.5 rounded-to-lg border bg-to-surface2 px-3.5 py-3 ${
              focused === 'start' ? 'border-to-vacation' : 'border-to-line'
            }`}
          >
            <span className="to-label">VON</span>
            <span className="to-data text-[17px] font-semibold text-to-text">{fmtDateDisplay(start)}</span>
            <input
              type="date"
              value={start}
              max={end}
              onFocus={() => setFocused('start')}
              onChange={(e) => setStart(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <label
            className={`relative flex flex-col gap-1.5 rounded-to-lg border bg-to-surface2 px-3.5 py-3 ${
              focused === 'end' ? 'border-to-vacation' : 'border-to-line'
            }`}
          >
            <span className="to-label">BIS</span>
            <span className="to-data text-[17px] font-semibold text-to-text">{fmtDateDisplay(end)}</span>
            <input
              type="date"
              value={end}
              min={start}
              onFocus={() => setFocused('end')}
              onChange={(e) => setEnd(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={activeChip === c.key}
              onClick={() => {
                const r = c.range(today);
                setStart(r.start);
                setEnd(r.end);
              }}
              className={`flex h-[34px] items-center rounded-to-pill border px-3.5 text-[13px] ${
                activeChip === c.key ? 'border-to-vacation bg-to-vacationSoft text-to-vacation' : 'border-to-line text-to-text2'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2.5 rounded-to-lg bg-to-vacationSoft px-3.5 py-3 text-to-vacation">
          <InfoIcon />
          <span className="text-[13px]">
            {count === 0
              ? 'In diesem Zeitraum liegt kein Training.'
              : count === 1
                ? '1 Training wird für dich abgesagt.'
                : `${count} Trainings werden für dich abgesagt.`}
          </span>
        </div>

        {error && <p className="mt-3 text-xs text-to-dangerText">{error}</p>}

        <div className="mt-4 flex flex-col gap-2">
          <button type="button" disabled={busy} className="btn-primary !h-[52px] text-[15px]" onClick={handleSave}>
            {busy ? 'Speichert…' : mode === 'edit' ? 'Speichern' : 'Eintragen'}
          </button>
          {onDelete && (
            <button type="button" disabled={busy} className="h-11 text-[14px] font-semibold text-to-dangerText" onClick={onDelete}>
              Zeitraum löschen
            </button>
          )}
          <button type="button" disabled={busy} className="h-11 text-[14px] font-medium text-to-text2" onClick={onCancel}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
