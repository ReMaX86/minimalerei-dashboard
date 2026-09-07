-- Maintainable list of "Jahrgänge"/Teams for Kampfgericht-Termine, so das
-- Anlege-Formular ein Dropdown statt eines Freitextfelds anbieten kann.
--
-- officiating_games.opponent_teams bleibt bewusst eine reine Text-Spalte
-- (kein Fremdschlüssel) — dadurch bleiben bestehende Termine unangetastet,
-- und ein Team kann aus der Liste entfernt werden, ohne dass dafür erst
-- alle Termine mit diesem Team umgehängt werden müssten.

create table public.officiating_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.officiating_teams enable row level security;

create policy "officiating_teams select" on public.officiating_teams for select
  using (auth.uid() is not null);
create policy "officiating_teams write trainer" on public.officiating_teams for all
  using (public.is_trainer())
  with check (public.is_trainer());

-- Bereits verwendete Team-Namen aus bestehenden Kampfgericht-Terminen
-- übernehmen, damit im neuen Dropdown nichts fehlt, was schon eingetragen war.
insert into public.officiating_teams (name)
select distinct opponent_teams
from public.officiating_games
where opponent_teams is not null and opponent_teams <> ''
on conflict (name) do nothing;
