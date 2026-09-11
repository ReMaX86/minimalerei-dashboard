import type { Training, TrainingOverride } from '../../src/types/database';

// Bewusste Kopie von src/lib/trainingSchedule.ts (nur der für den Push-
// Versand benötigte Teil, nextTrainingOccurrences) statt eines Imports von
// dort: ein Cross-Verzeichnis-Import aus api/ nach src/lib/ scheiterte live
// bei Vercel mit "Cannot find module .../src/lib/trainingSchedule" (Node
// ESM löst den relativen Import zur Laufzeit anders auf als der lokale
// tsc/vite-Build). Dateien innerhalb von api/ bündelt Vercel dagegen
// zuverlässig. Bei Änderungen an der Terminlogik in src/lib/trainingSchedule.ts
// (z. B. neue Ferienzeit-Regeln) hier synchron nachziehen — abgedeckt sind
// beide durch dieselben Testfälle in src/lib/trainingSchedule.test.ts,
// solange diese Kopie inhaltlich identisch bleibt.

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
  note?: string;
  cancelled?: boolean;
  cancelledBy?: OverrideInput;
}

type OverrideInput = Pick<TrainingOverride, 'id' | 'start_date' | 'end_date' | 'mode' | 'note'>;

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

function isOneOffUpcoming(training: Training, from: Date): boolean {
  const today = toDateKey(from);
  if (training.specific_date! > today) return true;
  if (training.specific_date! < today) return false;
  const [h, m] = training.start_time.split(':').map(Number);
  const startsAt = new Date(from.getFullYear(), from.getMonth(), from.getDate(), h, m);
  return startsAt > from;
}

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

  const cancelledRanges = overrides.filter((o) => o.mode === 'cancelled' || o.mode === 'special');

  const result: TrainingOccurrence[] = [];
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
