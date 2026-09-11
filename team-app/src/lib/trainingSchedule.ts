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
  // Gesetzt von cancelledOccurrencesUntil() für einen sonst stattfindenden
  // Termin, der durch eine 'cancelled'/'special'-Ferienzeit oder eine
  // einzelne Tages-Absage entfällt — nextTrainingOccurrences() selbst lässt
  // solche Termine weiterhin einfach aus (siehe dort).
  cancelled?: boolean;
  cancelledBy?: OverrideInput;
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
 * specific_date) werden interleaved. Eine Ferienzeit im Modus 'cancelled'
 * oder 'special' lässt alle wiederkehrenden Termine in ihrem Zeitraum
 * entfallen — die Sondertermine selbst sind davon nie betroffen, sie sind
 * ja schon die explizite Ausnahme.
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

  // 'cancelled' und 'special' lassen beide die regulären Trainings im
  // Zeitraum entfallen — 'special' ersetzt sie zusätzlich durch die
  // verknüpften Sondertermine, 'cancelled' lässt sie ersatzlos ausfallen.
  const cancelledRanges = overrides.filter((o) => o.mode === 'cancelled' || o.mode === 'special');

  const result: TrainingOccurrence[] = [];
  // Eine 'cancelled'/'special'-Ferienzeit kann wiederkehrende Termine überspringen
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

    const cancelled = winner.recurring && cancelledRanges.some((o) => date >= o.start_date && date <= o.end_date);
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

/**
 * Wiederkehrende Termine, die zwischen `from` und `until` (inklusive)
 * durch eine 'cancelled'/'special'-Ferienzeit — oder eine einzelne
 * Tages-Absage, technisch derselbe Mechanismus mit start_date === end_date
 * — entfallen. Anders als nextTrainingOccurrences() werden diese Termine
 * hier nicht einfach übersprungen, sondern explizit zurückgegeben (mit
 * `cancelled: true` und einer Referenz auf die auslösende Ferienzeit unter
 * `cancelledBy`), damit sie z. B. auf der Startseite sichtbar als "fällt
 * aus" markiert bleiben können, statt kommentarlos zu verschwinden.
 * Sondertermine (specific_date) sind hiervon nie betroffen — sie sind ja
 * schon die explizite Ausnahme einer Ferienzeit.
 */
export function cancelledOccurrencesUntil(
  trainings: Training[],
  from: Date,
  until: string | undefined,
  overrides: OverrideInput[]
): TrainingOccurrence[] {
  if (!until) return [];

  const recurring = trainings.filter((t) => t.weekday !== null);
  const cancelledRanges = overrides.filter((o) => o.mode === 'cancelled' || o.mode === 'special');
  if (cancelledRanges.length === 0) return [];

  const result: TrainingOccurrence[] = [];
  for (const training of recurring) {
    let next = firstOccurrenceOnOrAfter(training, from);
    // Sicherheitsgrenze gegen eine Endlosschleife bei einem unplausibel
    // weit in der Zukunft liegenden `until` (~5 Jahre wöchentlich).
    for (let round = 0; round < 260 && toDateKey(next) <= until; round++) {
      const date = toDateKey(next);
      const match = cancelledRanges.find((o) => date >= o.start_date && date <= o.end_date);
      if (match) {
        result.push({ training, date, cancelled: true, cancelledBy: match });
      }
      next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 7);
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.training.id.localeCompare(b.training.id));
}
