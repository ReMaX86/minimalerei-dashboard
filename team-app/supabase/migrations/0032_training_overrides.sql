-- Ferienzeiten: Hallen sind in den Schulferien oft geschlossen, aber nicht
-- immer — teils gelten die gewohnten Zeiten weiter, teils gibt es
-- Sonderzeiten vom Verband. Statt für jede Ferienwoche einzelne Trainings
-- an/abzuschalten, trägt der Trainer wie schon bei player_absences
-- (Migration 0015) einen Zeitraum ein. Beim Berechnen der nächsten Termine
-- (nextTrainingOccurrences in trainingSchedule.ts) wird geprüft, ob ein
-- berechneter Termin in so einen Zeitraum fällt, und je nach status
-- entweder übersprungen (cancelled) oder mit anderen Zeiten/Ort
-- überschrieben (special). Optional auf einen einzelnen Wochentag
-- eingrenzbar (weekday = null → gilt für alle wöchentlichen Trainings im
-- Zeitraum).

create table public.training_overrides (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  weekday text,
  status text not null check (status in ('cancelled', 'special')),
  start_time time,
  end_time time,
  location text,
  note text,
  created_at timestamptz not null default now(),
  constraint training_overrides_range check (end_date >= start_date),
  constraint training_overrides_special_times check (
    status = 'cancelled' or (start_time is not null and end_time is not null)
  )
);

create index training_overrides_range_idx on public.training_overrides (start_date, end_date);

alter table public.training_overrides enable row level security;

create policy "training_overrides select" on public.training_overrides for select
  using (auth.uid() is not null);

create policy "training_overrides write trainer" on public.training_overrides for all
  using (public.is_trainer())
  with check (public.is_trainer());
