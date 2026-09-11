-- Überarbeitung der Ferienzeiten aus Migration 0032: eine "Sonderzeit"
-- konnte bisher nur die Uhrzeit eines ohnehin schon existierenden
-- wöchentlichen Trainingstags überschreiben — ein komplett neuer
-- Wochentag (z. B. Dienstag statt Montag+Freitag) war damit nicht
-- abbildbar. Neues Modell: eine Ferienzeit ist ein Zeitraum mit einem
-- Modus — 'regular' (reine Dokumentation, ändert nichts an der
-- Berechnung) oder 'special' (die regulären wöchentlichen Trainings
-- entfallen im gesamten Zeitraum; stattdessen gelten beliebig viele
-- einzeln eingetragene Sondertermine). Ein Sondertermin ist technisch
-- eine ganz normale Zeile in `trainings`, nur mit einem konkreten Datum
-- (`specific_date`) statt einem wiederkehrenden Wochentag — dadurch
-- funktioniert Zu-/Absage (training_rsvps, FK auf trainings.id) ohne
-- jede Änderung an training_rsvps. Noch keine echten Ferienzeiten-Daten
-- im Umlauf (Feature erst in dieser Session eingeführt), daher wird die
-- Tabelle aus Migration 0032 einfach neu aufgesetzt statt migriert.

drop table public.training_overrides;

create table public.training_overrides (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  mode text not null check (mode in ('regular', 'special')),
  note text,
  created_at timestamptz not null default now(),
  constraint training_overrides_range check (end_date >= start_date)
);

alter table public.training_overrides enable row level security;

create policy "training_overrides select" on public.training_overrides for select
  using (auth.uid() is not null);

create policy "training_overrides write trainer" on public.training_overrides for all
  using (public.is_trainer())
  with check (public.is_trainer());

alter table public.trainings
  alter column weekday drop not null,
  add column specific_date date,
  add column override_id uuid references public.training_overrides (id) on delete cascade;

alter table public.trainings
  add constraint trainings_weekday_or_date check (
    (weekday is not null and specific_date is null) or
    (weekday is null and specific_date is not null)
  );

create index trainings_specific_date_idx on public.trainings (specific_date) where specific_date is not null;
