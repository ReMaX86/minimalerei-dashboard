import type { Training, TrainingOverride } from '../types/database';

const WEEKDAY_TO_JS_DAY: Record<string, number> = {
  Sonntag: 0,
  Montag: 1,
  Dienstag: 2,
  Mittwoch: 3,
  Donnerstag: 4,
  Freitag: 5,
  Samstag: 6
};

export interface TrainingOccurrence {
  training: Training;
  date: string; // YYYY-MM-DD
  // Gesetzt, wenn eine Ferien-/Sonderzeit-Ausnahme (training_overrides)
  // auf diesen Termin angewendet wurde — z. B. "Sonderzeit (Ferien)".
  note?: string;
}

type OverrideInput = Pick<
  TrainingOverride,
  'start_date' | 'end_date' | 'weekday' | 'status' | 'start_time' | 'end_time' | 'location' | 'note'
>;

/**
 * Wendet Ferien-/Sonderzeit-Ausnahmen auf einen berechneten Termin an:
 * `cancelled` lässt den Termin entfallen (null), `special` überschreibt
 * Zeit/Ort mit den hinterlegten Werten. Bei mehreren passenden Ausnahmen
 * gewinnt `cancelled` vor `special`.
 */
export function applyTrainingOverride(occ: TrainingOccurrence, overrides: OverrideInput[]): TrainingOccurrence | null {
  const matching = overrides.filter(
    (o) => occ.date >= o.start_date && occ.date <= o.end_date && (o.weekday === null || o.weekday === occ.training.weekday)
  );
  if (matching.some((o) => o.status === 'cancelled')) return null;

  const special = matching.find((o) => o.status === 'special');
  if (!special) return occ;

  return {
    training: {
      ...occ.training,
      start_time: special.start_time ?? occ.training.start_time,
      end_time: special.end_time ?? occ.training.end_time,
      location: special.location ?? occ.training.location
    },
    date: occ.date,
    note: special.note ?? 'Sonderzeit (Ferien)'
  };
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * First calendar date on/after `from` that falls on the training's weekday
 * and hasn't started yet (relative to `from`).
 */
function firstOccurrenceOnOrAfter(training: Training, from: Date): Date {
  const targetDay = WEEKDAY_TO_JS_DAY[training.weekday];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (targetDay === undefined) return d;

  const diff = (targetDay - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);

  if (diff === 0) {
    const [h, m] = training.start_time.split(':').map(Number);
    const startsAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
    if (startsAt <= from) d.setDate(d.getDate() + 7);
  }
  return d;
}

/**
 * The next `count` concrete training sessions across all weekly training
 * slots, in chronological order. With a single weekly training this yields
 * its next `count` weeks; with several weekly trainings the slots are
 * interleaved by date (e.g. Tuesday, then Thursday, then the Tuesday
 * after).
 */
export function nextTrainingOccurrences(
  trainings: Training[],
  count: number,
  from: Date = new Date(),
  overrides: OverrideInput[] = []
): TrainingOccurrence[] {
  if (trainings.length === 0 || count <= 0) return [];

  const cursors = trainings.map((training) => ({
    training,
    next: firstOccurrenceOnOrAfter(training, from)
  }));

  const result: TrainingOccurrence[] = [];
  // Eine "fällt aus"-Ausnahme kann Termine überspringen (z. B. eine ganze
  // Ferienwoche) — die Schleife muss dann über `count` Runden hinaus
  // weiterlaufen, bis wieder `count` tatsächlich stattfindende Termine
  // zusammenkommen. Sicherheitsgrenze gegen eine Endlosschleife, falls
  // irgendwann mal dauerhaft alles ausfällt.
  const maxRounds = Math.max(count * 10, 104);
  for (let round = 0; round < maxRounds && result.length < count; round++) {
    cursors.sort((a, b) => a.next.getTime() - b.next.getTime());
    const winner = cursors[0];
    const applied = applyTrainingOverride({ training: winner.training, date: toDateKey(winner.next) }, overrides);
    if (applied) result.push(applied);
    winner.next = new Date(winner.next.getFullYear(), winner.next.getMonth(), winner.next.getDate() + 7);
  }
  return result;
}
