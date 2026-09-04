import type { Training } from '../types/database';

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
  from: Date = new Date()
): TrainingOccurrence[] {
  if (trainings.length === 0 || count <= 0) return [];

  const cursors = trainings.map((training) => ({
    training,
    next: firstOccurrenceOnOrAfter(training, from)
  }));

  const result: TrainingOccurrence[] = [];
  for (let i = 0; i < count; i++) {
    cursors.sort((a, b) => a.next.getTime() - b.next.getTime());
    const winner = cursors[0];
    result.push({ training: winner.training, date: toDateKey(winner.next) });
    winner.next = new Date(winner.next.getFullYear(), winner.next.getMonth(), winner.next.getDate() + 7);
  }
  return result;
}
