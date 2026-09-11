import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorNote } from './ErrorNote';
import { fmtTime } from '../lib/format';
import { weekdayIndex } from '../lib/weekdays';
import type { Training } from '../types/database';

// Reine Übersicht der wöchentlichen Trainingszeiten (ohne Zu-/Absage) —
// die Zu-/Absage für die nächsten Termine lebt in UpcomingTrainings weiter
// oben auf der Startseite. Sondertermine (specific_date gesetzt) gehören
// zu einer Ferienzeit und tauchen hier bewusst nicht auf, da diese Karte
// nur den regulären, dauerhaften Fahrplan zeigen soll.
export function WeeklyTrainingTimes() {
  const [trainings, setTrainings] = useState<Training[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) return <ErrorNote message={error} />;
  if (!trainings) return <LoadingSpinner />;
  if (trainings.length === 0) return <p className="text-sm text-tbw-ink/50">Keine Trainingszeiten hinterlegt.</p>;

  return (
    <ul className="space-y-1.5">
      {trainings.map((t) => (
        <li key={t.id} className="flex items-center justify-between text-sm">
          <span className="font-medium text-tbw-navyDark">{t.weekday}</span>
          <span className="text-tbw-ink/60">
            {fmtTime(t.start_time)}–{fmtTime(t.end_time)} · {t.location}
          </span>
        </li>
      ))}
    </ul>
  );
}
