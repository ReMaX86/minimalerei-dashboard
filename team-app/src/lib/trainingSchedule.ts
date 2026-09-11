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
  // Gesetzt für Sondertermine (Training.specific_date) — z. B. "Herbstferien-
  // Sondertermin", übernommen von der zugehörigen Ferienzeit-Notiz.
  note?: string;
}

type OverrideInput = Pick<TrainingOverride, 'id' | 'start_date' | 'end_date' | 'mode' | 'note'>;

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * First calendar date on/after `from` that falls on the training's weekday
 * and hasn't started yet (relative to `from`).
 */
function firstOccurrenceOnOrAfter(training: Training, from: Date): Date {
  const targetDay = WEEKDAY_TO_JS_DAY[training.weekday!];
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

// Ein Sondertermin (specific_date) hat höchstens eine einzige Vorkommnis —
// "kommend", wenn sein Datum noch nicht erreicht ist, oder heute, solange
// die Startzeit noch nicht begonnen hat (analog zu firstOccurrenceOnOrAfter
// für wiederkehrende Trainings).
function isOneOffUpcoming(training: Training, from: Date): boolean {
  const today = toDateKey(from);
  if (training.specific_date! > today) return true;
  if (training.specific_date! < today) return false;
  const [h, m] = training.start_time.split(':').map(Number);
  const startsAt = new Date(from.getFullYear(), from.getMonth(), from.getDate(), h, m);
  return startsAt > from;
}

/**
 * The next `count` concrete training sessions, in chronological order —
 * both wiederkehrende wöchentliche Trainings (Training.weekday) und
 * einzelne Sondertermine innerhalb einer Ferienzeit (Training.
 * specific_date) werden interleaved. Eine Ferienzeit im Modus 'special'
 * lässt alle wiederkehrenden Termine in ihrem Zeitraum entfallen — die
 * Sondertermine selbst sind davon nie betroffen, sie sind ja schon die
 * explizite Ausnahme.
 */
export function nextTrainingOccurrences(
  trainings: Training[],
  count: number,
  from: Date = new Date(),
  overrides: OverrideInput[] = []
): TrainingOccurrence[] {
  if (count <= 0) return [];

  const recurring = trainings.filter((t) => t.weekday !== null);
  const oneOff = trainings.filter((t) => t.specific_date !== null && isOneOffUpcoming(t, from));

  interface Cursor {
    training: Training;
    next: Date | null;
    recurring: boolean;
  }

  const cursors: Cursor[] = [
    ...recurring.map((training) => ({ training, next: firstOccurrenceOnOrAfter(training, from), recurring: true })),
    ...oneOff.map((training) => ({
      training,
      next: new Date(training.specific_date! + 'T00:00:00'),
      recurring: false
    }))
  ];

  const specialRanges = overrides.filter((o) => o.mode === 'special');

  const result: TrainingOccurrence[] = [];
  // Eine 'special'-Ferienzeit kann wiederkehrende Termine überspringen
  // (z. B. eine ganze Ferienwoche) — die Schleife muss dann über `count`
  // Runden hinaus weiterlaufen, bis wieder `count` tatsächlich
  // stattfindende Termine zusammenkommen. Sicherheitsgrenze gegen eine
  // Endlosschleife, falls irgendwann mal dauerhaft alles ausfällt.
  const maxRounds = Math.max(count * 10, 104);
  for (let round = 0; round < maxRounds && result.length < count; round++) {
    const active = cursors.filter((c) => c.next !== null);
    if (active.length === 0) break;
    active.sort((a, b) => a.next!.getTime() - b.next!.getTime());
    const winner = active[0];
    const date = toDateKey(winner.next!);

    const cancelled = winner.recurring && specialRanges.some((o) => date >= o.start_date && date <= o.end_date);
    if (!cancelled) {
      let note: string | undefined;
      if (!winner.recurring) {
        const override = winner.training.override_id ? overrides.find((o) => o.id === winner.training.override_id) : undefined;
        note = override?.note ?? 'Sondertermin (Ferien)';
      }
      result.push({ training: winner.training, date, note });
    }

    winner.next = winner.recurring
      ? new Date(winner.next!.getFullYear(), winner.next!.getMonth(), winner.next!.getDate() + 7)
      : null;
  }
  return result;
}
