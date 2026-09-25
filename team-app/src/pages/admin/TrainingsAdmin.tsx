import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { useTipoffLoader } from '../../hooks/useTipoffLoader';
import { DateField, TimeField } from '../../components/DateTimeField';
import { IconChevronRight } from '../../components/NavIcons';
import { dayOfMonth, fmtDate, fmtDateShort, fmtTime, monthShort, weekdayBadge } from '../../lib/format';
import { weekdayIndex, WEEKDAY_ORDER } from '../../lib/weekdays';
import { cancelledOccurrencesUntil, nextTrainingOccurrences, type TrainingOccurrence } from '../../lib/trainingSchedule';
import type { Training, TrainingOverride } from '../../types/database';

// Element 19 "Admin · Training": die anstehenden Termine zeigen jetzt, welche
// Regel auf sie wirkt (findet statt / fällt aus / Sonderzeit), statt überall
// derselbe rote "Absagen"-Knopf. Neu wie gefordert: Bearbeiten von
// Trainingszeiten UND Ferienregeln, Pflichtgrund beim Absagen, Zurücknehmen
// einer Absage. An Terminerzeugung/Ferienregel-Logik selbst nichts geändert.
const WEEKDAY_SHORT: Record<string, string> = {
  Montag: 'MO',
  Dienstag: 'DI',
  Mittwoch: 'MI',
  Donnerstag: 'DO',
  Freitag: 'FR',
  Samstag: 'SA',
  Sonntag: 'SO'
};

// "die nächsten 6 Termine" — vorher ein grober Vier-Termine-Richtwert
// ("deckt zwei Wochen ab"), jetzt eine feste Vorgabe aus der Vorlage.
const UPCOMING_COUNT = 6;

const CANCEL_REASONS = ['Spiel', 'Halle belegt', 'Feiertag', 'Trainer fehlt'];

const EMPTY_TIME_FORM = { weekday: WEEKDAY_ORDER[0], start_time: '', end_time: '', location: '' };
const EMPTY_RULE_FORM = { start_date: '', end_date: '', mode: 'regular' as TrainingOverride['mode'], note: '' };
const EMPTY_SESSION_FORM = { date: '', start_time: '', end_time: '', location: '' };

type TimeView = { mode: 'new' } | { mode: 'edit'; training: Training } | null;
type RuleView = { mode: 'new' } | { mode: 'edit'; override: TrainingOverride } | null;

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 7h14M10 7V5h4v2M8 7l1 13h6l1-13" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 5h17v15a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V5zM3.5 10h17M8 3v3M16 3v3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 7v5l3 2" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function DateBlock({ iso, dim }: { iso: string; dim?: boolean }) {
  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-px">
      <span className="to-data text-[9px] text-to-text3">{weekdayBadge(iso)}</span>
      <span className={`to-number text-[19px] leading-[1.05] ${dim ? 'text-to-text3' : 'text-to-text'}`}>{dayOfMonth(iso)}</span>
      <span className="to-data text-[8px] text-to-textDisabled">{monthShort(iso)}</span>
    </div>
  );
}

function ModeSegment({ value, onChange }: { value: TrainingOverride['mode']; onChange: (m: TrainingOverride['mode']) => void }) {
  const options: { mode: TrainingOverride['mode']; label: string }[] = [
    { mode: 'regular', label: 'Regulär' },
    { mode: 'cancelled', label: 'Fällt aus' },
    { mode: 'special', label: 'Sonderzeiten' }
  ];
  return (
    <div className="flex gap-1 rounded-to-lg border border-to-divider bg-to-surface2 p-1">
      {options.map((o) => {
        const on = value === o.mode;
        const activeClass =
          o.mode === 'cancelled' ? 'bg-to-danger text-[#120507]' : o.mode === 'special' ? 'bg-to-vacation text-[#1A1405]' : 'bg-to-accent text-to-onAccent';
        return (
          <button
            key={o.mode}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.mode)}
            className={`h-[38px] flex-1 rounded-to-sm text-[13px] transition ${on ? `font-semibold ${activeClass}` : 'font-medium text-to-text2'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ModeHint({ mode }: { mode: TrainingOverride['mode'] }) {
  return (
    <p className="text-[11px] leading-relaxed text-to-textDisabled">
      {mode === 'regular' && 'Reguläres Training findet wie gewohnt statt – der Eintrag ist nur eine Notiz.'}
      {mode === 'cancelled' && 'Alle Trainings in diesem Zeitraum fallen aus. Das Team sieht die Notiz als Grund.'}
      {mode === 'special' && 'Die regulären Termine entfallen; stattdessen gelten die Sondertermine unten.'}
    </p>
  );
}

function CancelSheet({
  occ,
  busy,
  error,
  onConfirm,
  onCancel
}: {
  occ: TrainingOccurrence;
  busy: boolean;
  error: string | null;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const [validation, setValidation] = useState<string | null>(null);

  function confirm() {
    if (!note.trim()) {
      setValidation('Bitte einen Grund angeben.');
      return;
    }
    onConfirm(note.trim());
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="flex w-full max-w-lg flex-col gap-3.5 rounded-t-[24px] border border-to-danger/30 bg-to-surface p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
        <div className="flex flex-col gap-1">
          <h2 className="to-display-sm text-to-dangerText">Training absagen?</h2>
          <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">
            {weekdayBadge(occ.date)} {dayOfMonth(occ.date)}.{monthShort(occ.date)} · {fmtTime(occ.training.start_time)}–
            {fmtTime(occ.training.end_time)} · {occ.training.location.toUpperCase()}
          </span>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-to-text3">Grund (wird allen angezeigt)</span>
          <input
            className="input"
            placeholder="z. B. Halle belegt"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setValidation(null);
            }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {CANCEL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={note === r}
              onClick={() => {
                setNote((prev) => (prev === r ? '' : r));
                setValidation(null);
              }}
              className={`flex h-8 items-center rounded-to-pill border px-3 text-[13px] ${
                note === r ? 'border-to-danger/30 bg-to-dangerSoft font-semibold text-to-dangerText' : 'border-to-line text-to-text2'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-to-textDisabled">
          Die Zu- und Absagen der Spieler bleiben gespeichert, falls du die Absage zurücknimmst.
        </p>
        {(validation || error) && <p className="text-xs text-to-dangerText">{validation ?? error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={confirm}
          className="flex h-12 items-center justify-center rounded-to-pill bg-to-danger text-[15px] font-semibold text-[#120507] disabled:opacity-60"
        >
          {busy ? 'Wird abgesagt…' : 'Absagen und Team informieren'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="h-6 text-[13px] text-to-text3">
          Abbrechen
        </button>
      </div>
    </div>,
    document.body
  );
}

export function TrainingsAdmin() {
  const [trainings, setTrainings] = useState<Training[] | null>(null);
  const [overrides, setOverrides] = useState<TrainingOverride[] | null>(null);
  const [sessions, setSessions] = useState<Training[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [timeView, setTimeView] = useState<TimeView>(null);
  const [timeForm, setTimeForm] = useState(EMPTY_TIME_FORM);
  const [timeBusy, setTimeBusy] = useState(false);

  const [ruleView, setRuleView] = useState<RuleView>(null);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [sessionForm, setSessionForm] = useState(EMPTY_SESSION_FORM);
  const [sessionFormOpen, setSessionFormOpen] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);

  const [cancelOcc, setCancelOcc] = useState<TrainingOccurrence | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase.from('trainings').select('*');
    if (loadError) {
      setError('Fehler beim Laden der Trainingszeiten.');
      return;
    }
    setTrainings(
      [...((data as Training[]) ?? [])]
        .filter((t) => t.weekday !== null)
        .sort((a, b) => weekdayIndex(a.weekday!) - weekdayIndex(b.weekday!) || a.start_time.localeCompare(b.start_time))
    );
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Trainingszeiten.'));
  }, [load]);

  const loadOverrides = useCallback(async () => {
    setActionError(null);
    const [overridesRes, sessionsRes] = await Promise.all([
      supabase.from('training_overrides').select('*'),
      supabase.from('trainings').select('*').not('override_id', 'is', null)
    ]);
    if (overridesRes.error || sessionsRes.error) {
      setActionError('Fehler beim Laden der Ferienzeiten.');
      return;
    }
    setOverrides([...((overridesRes.data as TrainingOverride[]) ?? [])].sort((a, b) => a.start_date.localeCompare(b.start_date)));
    setSessions((sessionsRes.data as Training[]) ?? []);
  }, []);

  useEffect(() => {
    loadOverrides().catch(() => setActionError('Fehler beim Laden der Ferienzeiten.'));
  }, [loadOverrides]);

  function openNewTime() {
    setActionError(null);
    setTimeForm(EMPTY_TIME_FORM);
    setTimeView({ mode: 'new' });
  }

  function openEditTime(t: Training) {
    setActionError(null);
    setTimeForm({ weekday: t.weekday!, start_time: t.start_time.slice(0, 5), end_time: t.end_time.slice(0, 5), location: t.location });
    setTimeView({ mode: 'edit', training: t });
  }

  async function saveTime(e: FormEvent) {
    e.preventDefault();
    setTimeBusy(true);
    setActionError(null);
    try {
      const payload = {
        weekday: timeForm.weekday,
        start_time: timeForm.start_time,
        end_time: timeForm.end_time,
        location: timeForm.location.trim()
      };
      const { error: saveError } =
        timeView?.mode === 'edit'
          ? await supabase.from('trainings').update(payload).eq('id', timeView.training.id)
          : await supabase.from('trainings').insert(payload);
      if (saveError) throw saveError;
      setTimeView(null);
      await load();
    } catch {
      setActionError('Trainingszeit konnte nicht gespeichert werden.');
    } finally {
      setTimeBusy(false);
    }
  }

  async function removeTime(id: string) {
    setActionError(null);
    try {
      const { error: delError } = await supabase.from('trainings').delete().eq('id', id);
      if (delError) throw delError;
      setTimeView(null);
      await load();
    } catch {
      setActionError('Trainingszeit konnte nicht gelöscht werden.');
    }
  }

  function openNewRule() {
    setActionError(null);
    setRuleForm(EMPTY_RULE_FORM);
    setSessionFormOpen(false);
    setRuleView({ mode: 'new' });
  }

  function openEditRule(o: TrainingOverride) {
    setActionError(null);
    setRuleForm({ start_date: o.start_date, end_date: o.end_date, mode: o.mode, note: o.note ?? '' });
    setSessionFormOpen(false);
    setSessionForm(EMPTY_SESSION_FORM);
    setRuleView({ mode: 'edit', override: o });
  }

  async function saveRule(e: FormEvent) {
    e.preventDefault();
    setRuleBusy(true);
    setActionError(null);
    try {
      const payload = {
        start_date: ruleForm.start_date,
        end_date: ruleForm.end_date,
        mode: ruleForm.mode,
        note: ruleForm.note.trim() || null
      };
      const { error: saveError } =
        ruleView?.mode === 'edit'
          ? await supabase.from('training_overrides').update(payload).eq('id', ruleView.override.id)
          : await supabase.from('training_overrides').insert(payload);
      if (saveError) throw saveError;
      setRuleView(null);
      await loadOverrides();
    } catch {
      setActionError('Ferienzeit konnte nicht gespeichert werden.');
    } finally {
      setRuleBusy(false);
    }
  }

  async function removeRule(id: string) {
    setActionError(null);
    try {
      const { error: delError } = await supabase.from('training_overrides').delete().eq('id', id);
      if (delError) throw delError;
      setRuleView(null);
      await loadOverrides();
    } catch {
      setActionError('Ferienzeit konnte nicht gelöscht werden.');
    }
  }

  async function addSession(e: FormEvent) {
    e.preventDefault();
    if (ruleView?.mode !== 'edit') return;
    const overrideId = ruleView.override.id;
    setSessionBusy(true);
    setActionError(null);
    try {
      const { error: insertError } = await supabase.from('trainings').insert({
        weekday: null,
        specific_date: sessionForm.date,
        start_time: sessionForm.start_time,
        end_time: sessionForm.end_time,
        location: sessionForm.location.trim(),
        override_id: overrideId
      });
      if (insertError) throw insertError;
      setSessionForm(EMPTY_SESSION_FORM);
      await loadOverrides();
    } catch {
      setActionError('Sondertermin konnte nicht angelegt werden.');
    } finally {
      setSessionBusy(false);
    }
  }

  async function removeSession(id: string) {
    setActionError(null);
    try {
      const { error: delError } = await supabase.from('trainings').delete().eq('id', id);
      if (delError) throw delError;
      await loadOverrides();
    } catch {
      setActionError('Sondertermin konnte nicht gelöscht werden.');
    }
  }

  async function confirmCancel(note: string) {
    if (!cancelOcc) return;
    setCancelBusy(true);
    setActionError(null);
    try {
      const { error: insertError } = await supabase.from('training_overrides').insert({
        start_date: cancelOcc.date,
        end_date: cancelOcc.date,
        mode: 'cancelled',
        note
      });
      if (insertError) throw insertError;
      setCancelOcc(null);
      await loadOverrides();
    } catch {
      setActionError('Absage konnte nicht gespeichert werden.');
    } finally {
      setCancelBusy(false);
    }
  }

  const showLoader = useTipoffLoader(!trainings);
  const showOverridesLoader = useTipoffLoader(overrides === null || sessions === null);

  if (error) return <ErrorNote message={error} />;
  if (showLoader) return <LoadingSpinner />;
  if (!trainings) return null;

  // ============ TRAININGSZEIT (Neu/Bearbeiten) ============
  if (timeView) {
    const isNew = timeView.mode === 'new';
    return (
      <form onSubmit={saveTime} className="flex flex-col gap-3.5">
        {actionError && <ErrorNote message={actionError} />}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTimeView(null)}
            aria-label="Zurück"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md border border-to-border bg-to-surface text-to-text2"
          >
            <BackIcon />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="to-display-sm text-to-text">{isNew ? 'Neue Trainingszeit' : 'Trainingszeit ändern'}</span>
            <span className="to-data truncate text-[10px] tracking-[0.1em] text-to-text3">
              {isNew ? 'JEDE WOCHE ZUR GLEICHEN ZEIT' : `${timeView.training.weekday!.toUpperCase()} · ${fmtTime(timeView.training.start_time)}–${fmtTime(timeView.training.end_time)}`}
            </span>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-to-text3">Wochentag</span>
          <select className="input" value={timeForm.weekday} onChange={(e) => setTimeForm((f) => ({ ...f, weekday: e.target.value }))}>
            {WEEKDAY_ORDER.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <TimeField label="Beginn" required value={timeForm.start_time} onChange={(v) => setTimeForm((f) => ({ ...f, start_time: v }))} />
          <TimeField label="Ende" required value={timeForm.end_time} onChange={(v) => setTimeForm((f) => ({ ...f, end_time: v }))} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-to-text3">Halle / Adresse</span>
          <input
            required
            placeholder="Halle / Adresse"
            className="input"
            value={timeForm.location}
            onChange={(e) => setTimeForm((f) => ({ ...f, location: e.target.value }))}
          />
        </label>
        <p className="text-[11px] leading-relaxed text-to-textDisabled">
          Aus dieser Zeit erzeugt die App die anstehenden Termine – die nächsten sechs stehen oben in der Liste.
        </p>

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={timeBusy} className="flex h-12 flex-1 items-center justify-center rounded-to-pill bg-to-accent text-[15px] font-semibold text-to-onAccent disabled:opacity-60">
            Speichern
          </button>
          <button type="button" onClick={() => setTimeView(null)} className="flex h-12 shrink-0 items-center justify-center rounded-to-pill border border-to-line px-6 text-[15px] text-to-text2">
            Abbrechen
          </button>
        </div>
        {!isNew && (
          <button
            type="button"
            onClick={() => removeTime(timeView.training.id)}
            className="flex h-12 items-center justify-center rounded-to-pill border border-to-danger/30 text-[15px] font-semibold text-to-dangerText"
          >
            Trainingszeit löschen
          </button>
        )}
      </form>
    );
  }

  // ============ FERIENZEIT (Neu/Bearbeiten) ============
  if (ruleView) {
    const isNew = ruleView.mode === 'new';
    const ownSessions = (sessions ?? [])
      .filter((s) => !isNew && s.override_id === ruleView.override.id)
      .sort((a, b) => (a.specific_date ?? '').localeCompare(b.specific_date ?? ''));
    return (
      <form onSubmit={saveRule} className="flex flex-col gap-3.5">
        {actionError && <ErrorNote message={actionError} />}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRuleView(null)}
            aria-label="Zurück"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md border border-to-border bg-to-surface text-to-text2"
          >
            <BackIcon />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="to-display-sm text-to-text">{isNew ? 'Neue Ferienzeit' : 'Ferienzeit ändern'}</span>
            <span className="to-data truncate text-[10px] tracking-[0.1em] text-to-text3">
              {isNew
                ? 'GILT FÜR ALLE TRAININGSTAGE IM ZEITRAUM'
                : `${(ruleView.override.note ?? '').toUpperCase()} · ${fmtDateShort(ruleView.override.start_date)}–${fmtDateShort(ruleView.override.end_date)}`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <DateField label="Von" required value={ruleForm.start_date} onChange={(v) => setRuleForm((f) => ({ ...f, start_date: v }))} />
          <DateField
            label="Bis"
            required
            min={ruleForm.start_date || undefined}
            value={ruleForm.end_date}
            onChange={(v) => setRuleForm((f) => ({ ...f, end_date: v }))}
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-to-text3">Notiz</span>
          <input
            placeholder="z. B. Herbstferien"
            className="input"
            value={ruleForm.note}
            onChange={(e) => setRuleForm((f) => ({ ...f, note: e.target.value }))}
          />
        </label>

        <div className="flex flex-col gap-2.5">
          <span className="to-data text-[9px] tracking-[0.12em] text-to-textDisabled">WAS PASSIERT IN DIESEM ZEITRAUM?</span>
          <ModeSegment value={ruleForm.mode} onChange={(mode) => setRuleForm((f) => ({ ...f, mode }))} />
          <ModeHint mode={ruleForm.mode} />
        </div>

        {ruleForm.mode === 'special' && !isNew && (
          <div className="flex flex-col gap-2.5">
            <span className="to-data text-[9px] tracking-[0.12em] text-to-textDisabled">SONDERTERMINE</span>
            <div className="rounded-to-lg border border-to-divider bg-to-surface">
              {ownSessions.length === 0 && <p className="px-4 py-3 text-sm text-to-textDisabled">Noch keine Sondertermine eingetragen.</p>}
              {ownSessions.map((s) => (
                <div key={s.id} className="flex min-h-[42px] items-center gap-2.5 border-t border-to-surface2 px-4 py-2 first:border-t-0">
                  <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-to-vacation" />
                  <span className="to-data flex-1 text-[10px] text-to-text2">
                    {weekdayBadge(s.specific_date!)} {dayOfMonth(s.specific_date!)}.{monthShort(s.specific_date!)} · {fmtTime(s.start_time)}–
                    {fmtTime(s.end_time)} · {s.location.toUpperCase()}
                  </span>
                  <button type="button" onClick={() => removeSession(s.id)} className="flex h-[30px] w-[30px] shrink-0 items-center justify-center text-to-text3">
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>

            {sessionFormOpen ? (
              <div className="flex flex-col gap-2.5 rounded-to-lg border border-to-divider bg-to-surface2 p-3.5">
                <span className="text-[13px] font-semibold text-to-text">Sondertermin hinzufügen</span>
                <DateField
                  label="Datum"
                  required
                  min={ruleView.override.start_date}
                  max={ruleView.override.end_date}
                  value={sessionForm.date}
                  onChange={(v) => setSessionForm((f) => ({ ...f, date: v }))}
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <TimeField label="Beginn" required value={sessionForm.start_time} onChange={(v) => setSessionForm((f) => ({ ...f, start_time: v }))} />
                  <TimeField label="Ende" required value={sessionForm.end_time} onChange={(v) => setSessionForm((f) => ({ ...f, end_time: v }))} />
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-to-text3">Halle / Adresse</span>
                  <input
                    required
                    placeholder="Halle / Adresse"
                    className="input"
                    value={sessionForm.location}
                    onChange={(e) => setSessionForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={sessionBusy}
                    onClick={addSession}
                    className="flex h-11 flex-1 items-center justify-center rounded-to-pill bg-to-accent text-sm font-semibold text-to-onAccent disabled:opacity-60"
                  >
                    Hinzufügen
                  </button>
                  <button
                    type="button"
                    onClick={() => setSessionFormOpen(false)}
                    className="flex h-11 shrink-0 items-center justify-center rounded-to-pill border border-to-line px-5 text-sm text-to-text2"
                  >
                    Fertig
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setSessionFormOpen(true)} className="text-left text-[13px] font-semibold text-to-accent">
                + Sondertermin hinzufügen
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={ruleBusy} className="flex h-12 flex-1 items-center justify-center rounded-to-pill bg-to-accent text-[15px] font-semibold text-to-onAccent disabled:opacity-60">
            Speichern
          </button>
          <button type="button" onClick={() => setRuleView(null)} className="flex h-12 shrink-0 items-center justify-center rounded-to-pill border border-to-line px-6 text-[15px] text-to-text2">
            Abbrechen
          </button>
        </div>
        {!isNew && (
          <button
            type="button"
            onClick={() => removeRule(ruleView.override.id)}
            className="flex h-12 items-center justify-center rounded-to-pill border border-to-danger/30 text-[15px] font-semibold text-to-dangerText"
          >
            Ferienzeit löschen
          </button>
        )}
      </form>
    );
  }

  // ============ HAUPTANSICHT ============
  const allTrainings = [...trainings, ...(sessions ?? [])];
  const upcomingOccurrences = overrides
    ? (() => {
        const real = nextTrainingOccurrences(allTrainings, UPCOMING_COUNT, new Date(), overrides);
        // 'special'-Ferienzeiten ersetzen die regulären Termine durch Sondertermine
        // (siehe oneOff-Logik in nextTrainingOccurrences) – die entfallenen Slots hier
        // zusätzlich als "FÄLLT AUS" zu zeigen, würde sie doppelt auflisten.
        const cancelled = cancelledOccurrencesUntil(allTrainings, new Date(), real[real.length - 1]?.date, overrides).filter(
          (c) => c.cancelledBy?.mode !== 'special'
        );
        return [...real, ...cancelled].sort(
          (a, b) => a.date.localeCompare(b.date) || a.training.id.localeCompare(b.training.id)
        );
      })()
    : [];

  const activeWeekdays = new Set(trainings.map((t) => t.weekday));

  return (
    <div className="flex flex-col gap-3.5">
      {actionError && <ErrorNote message={actionError} />}

      <div className="flex items-center gap-3">
        <span className="to-display-sm flex-1 text-to-text">Nächste Trainings</span>
        <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">{upcomingOccurrences.length} TERMINE</span>
      </div>

      <div className="rounded-to-xl border border-to-border bg-to-surface">
        {upcomingOccurrences.length === 0 && <p className="px-4 py-4 text-sm text-to-text3">Keine anstehenden Termine.</p>}
        {upcomingOccurrences.map((occ) => {
          const key = occ.training.id + occ.date;
          const isSingleDay = occ.cancelledBy?.start_date === occ.cancelledBy?.end_date;

          if (occ.cancelled) {
            return (
              <div key={key} className="flex min-h-[70px] items-center gap-3 border-t border-to-surface2 bg-to-danger/[0.04] px-4 py-2.5 first:border-t-0">
                <DateBlock iso={occ.date} dim />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold text-to-text3 line-through">
                    {fmtTime(occ.training.start_time)}–{fmtTime(occ.training.end_time)}
                  </span>
                  <span className="to-data truncate text-[10px] text-to-dangerText">
                    FÄLLT AUS · {(occ.cancelledBy?.note || 'OHNE GRUND').toUpperCase()}
                  </span>
                </div>
                {isSingleDay && occ.cancelledBy && (
                  <button
                    type="button"
                    onClick={() => removeRule(occ.cancelledBy!.id)}
                    className="flex h-[30px] shrink-0 items-center rounded-to-pill border border-to-line px-3 text-[12px] text-to-text2"
                  >
                    Zurücknehmen
                  </button>
                )}
              </div>
            );
          }

          const isSpecial = !!occ.note;
          return (
            <div key={key} className="flex min-h-[70px] items-center gap-3 border-t border-to-surface2 px-4 py-2.5 first:border-t-0">
              <DateBlock iso={occ.date} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={`text-sm font-semibold ${isSpecial ? 'text-to-vacation' : 'text-to-text'}`}>
                  {fmtTime(occ.training.start_time)}–{fmtTime(occ.training.end_time)}
                </span>
                <span className={`to-data truncate text-[10px] ${isSpecial ? 'text-to-vacation' : 'text-to-text3'}`}>
                  {isSpecial ? `SONDERZEIT · ${occ.note!.toUpperCase()}` : occ.training.location.toUpperCase()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCancelOcc(occ)}
                className="flex h-[30px] shrink-0 items-center rounded-to-pill border border-to-danger/30 px-3 text-[12px] text-to-dangerText"
              >
                Absagen
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <span className="to-display-sm flex-1 text-to-text">Wöchentliche Zeiten</span>
        <button
          type="button"
          onClick={openNewTime}
          className="flex h-[32px] shrink-0 items-center gap-1.5 rounded-to-pill bg-to-accent px-3 text-[13px] font-semibold text-to-onAccent"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Neu
        </button>
      </div>

      <div className="flex gap-1.5">
        {Object.entries(WEEKDAY_SHORT).map(([full, abbr]) => {
          const on = activeWeekdays.has(full);
          return (
            <div
              key={full}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-to-lg border py-2.5 ${
                on ? 'border-to-borderMatchday bg-to-accentSoft' : 'border-to-border bg-to-surface'
              }`}
            >
              <span className={`to-data text-[9px] tracking-[0.06em] ${on ? 'text-to-accent' : 'text-to-textDisabled'}`}>{abbr}</span>
              <span className={`h-[5px] w-[5px] rounded-full ${on ? 'bg-to-accent' : 'bg-to-border'}`} />
            </div>
          );
        })}
      </div>

      <div className="rounded-to-xl border border-to-border bg-to-surface">
        {trainings.length === 0 && <p className="px-4 py-4 text-sm text-to-text3">Noch keine Trainingszeiten eingetragen.</p>}
        {trainings.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => openEditTime(t)}
            className="flex min-h-[62px] items-center gap-3 border-t border-to-surface2 px-4 py-2.5 text-left first:border-t-0"
          >
            <span className="to-data flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md bg-to-surface2 text-[10px] font-semibold text-to-text2">
              {WEEKDAY_SHORT[t.weekday!]}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold text-to-text">{t.weekday}</span>
              <span className="to-data text-[10px] text-to-text3">
                {fmtTime(t.start_time)}–{fmtTime(t.end_time)} · {t.location.toUpperCase()}
              </span>
            </div>
            <IconChevronRight className="h-[15px] w-[15px] shrink-0 text-to-textDisabled" />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="to-display-sm flex-1 text-to-text">Ferien &amp; Sonderregeln</span>
        <button
          type="button"
          onClick={openNewRule}
          className="flex h-[32px] shrink-0 items-center gap-1.5 rounded-to-pill bg-to-accent px-3 text-[13px] font-semibold text-to-onAccent"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Neu
        </button>
      </div>

      {showOverridesLoader ? (
        <LoadingSpinner size="card" />
      ) : overrides === null || sessions === null ? null : overrides.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-to-xl border border-dashed border-to-line px-5 py-5.5 text-center">
          <span className="text-sm font-semibold text-to-text">Keine Ferienzeiten eingetragen</span>
          <span className="text-xs leading-relaxed text-to-textDisabled">
            Trag Ferien oder Feiertage ein – die App passt die anstehenden Termine dann automatisch an.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {overrides.map((o) => {
            const ownSessions = sessions.filter((s) => s.override_id === o.id).sort((a, b) => (a.specific_date ?? '').localeCompare(b.specific_date ?? ''));
            const borderClass = o.mode === 'cancelled' ? 'border-to-danger/30' : o.mode === 'special' ? 'border-to-vacationFrame' : 'border-to-border';
            const iconBg = o.mode === 'cancelled' ? 'bg-to-dangerSoft' : o.mode === 'special' ? 'bg-to-vacationSoft' : 'bg-to-surface2';
            const iconColor = o.mode === 'cancelled' ? 'text-to-dangerText' : o.mode === 'special' ? 'text-to-vacation' : 'text-to-text2';
            const modeLabel = o.mode === 'cancelled' ? 'FÄLLT AUS' : o.mode === 'special' ? 'SONDERZEITEN' : 'REGULÄR';
            const modeColor = o.mode === 'cancelled' ? 'text-to-dangerText' : o.mode === 'special' ? 'text-to-vacation' : 'text-to-text3';
            return (
              <div key={o.id} className={`flex flex-col overflow-hidden rounded-to-xl border ${borderClass} bg-to-surface`}>
                <button type="button" onClick={() => openEditRule(o)} className="flex min-h-[66px] items-center gap-3 px-4 py-2.5 text-left">
                  <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md ${iconBg} ${iconColor}`}>
                    {o.mode === 'special' ? <ClockIcon /> : <CalendarIcon />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-to-text">
                      {fmtDateShort(o.start_date)} – {fmtDateShort(o.end_date)}
                    </span>
                    <span className={`to-data truncate text-[10px] ${modeColor}`}>
                      {modeLabel}
                      {o.note ? ` · ${o.note.toUpperCase()}` : ''}
                    </span>
                  </div>
                  <IconChevronRight className="h-[15px] w-[15px] shrink-0 text-to-textDisabled" />
                </button>
                {o.mode === 'special' && ownSessions.length > 0 && (
                  <div className="flex flex-col border-t border-to-surface2 bg-to-surface2/60">
                    {ownSessions.map((s) => (
                      <div key={s.id} className="flex min-h-[42px] items-center gap-2.5 px-4">
                        <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-to-vacation" />
                        <span className="to-data text-[10px] text-to-text2">
                          {weekdayBadge(s.specific_date!)} {dayOfMonth(s.specific_date!)}.{monthShort(s.specific_date!)} · {fmtTime(s.start_time)}–
                          {fmtTime(s.end_time)} · {s.location.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cancelOcc && (
        <CancelSheet occ={cancelOcc} busy={cancelBusy} error={actionError} onConfirm={confirmCancel} onCancel={() => setCancelOcc(null)} />
      )}
    </div>
  );
}
