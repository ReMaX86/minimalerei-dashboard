-- Optionale Zusatzfunktionen (Meldungen, Mitfahrgelegenheit, ...) lassen
-- sich pro Team einzeln an-/abschalten, statt für alle Teams fest im Code zu
-- stehen. Ein deaktiviertes Feature ist überall ausgeblendet (Nav, Startseite,
-- Admin-Reiter) bis auf den Admin-Reiter "Funktionen" selbst, über den es
-- wieder aktiviert werden kann. Kernfunktionen (Kader, Trikots, Kampfgericht,
-- Training) sind davon nicht betroffen — nur neue, optionale Erweiterungen.

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false
);

alter table public.feature_flags enable row level security;

create policy "feature_flags select" on public.feature_flags for select
  using (auth.uid() is not null);

create policy "feature_flags write trainer" on public.feature_flags for all
  using (public.is_trainer()) with check (public.is_trainer());

insert into public.feature_flags (key, enabled) values
  ('announcements', false);
