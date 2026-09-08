-- Urlaub/Abwesenheit: Spieler tragen selbst einen Zeitraum ein, in dem sie
-- nicht verfügbar sind. Steht hinter dem "absences"-Feature-Flag (Migration
-- 0011). Wird als Zeitraum gespeichert statt pro Trainingstermin einzelne
-- Absage-Zeilen zu erzeugen — die App prüft beim Anzeigen, ob ein Termin/Spiel
-- in einen eingetragenen Zeitraum fällt (siehe playerAbsenceOn() in
-- src/types/database.ts). Dadurch verschwindet der Urlaub automatisch aus
-- alten Terminen, ohne dass irgendwo aufgeräumt werden muss.

create table public.player_absences (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now(),
  constraint player_absences_range check (end_date >= start_date)
);

create index player_absences_player_id_idx on public.player_absences (player_id);

alter table public.player_absences enable row level security;

create policy "player_absences select" on public.player_absences for select
  using (auth.uid() is not null);

create policy "player_absences write own" on public.player_absences for all
  using (player_id = public.current_player_id() or public.is_trainer())
  with check (player_id = public.current_player_id() or public.is_trainer());

insert into public.feature_flags (key, enabled) values ('absences', false);
