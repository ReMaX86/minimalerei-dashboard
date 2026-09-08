-- Mitfahrgelegenheit für Auswärtsspiele: Spieler können sich als Fahrer mit
-- freien Plätzen eintragen, andere Spieler sich einen Platz sichern. Steht
-- hinter dem "carpool"-Feature-Flag (Migration 0011). Ein Spieler kann pro
-- Spiel nur einmal Fahrer sein und nur bei einem Fahrer mitfahren
-- (game_id auf carpool_claims ist redundant zu offer_id, ermöglicht aber den
-- Unique-Constraint "ein Platz pro Spiel und Spieler" ohne Join).

create table public.carpool_offers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  driver_player_id uuid not null references public.players (id) on delete cascade,
  seats int not null check (seats > 0),
  note text,
  created_at timestamptz not null default now(),
  unique (game_id, driver_player_id)
);

create table public.carpool_claims (
  offer_id uuid not null references public.carpool_offers (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (offer_id, player_id),
  unique (game_id, player_id)
);

alter table public.carpool_offers enable row level security;
alter table public.carpool_claims enable row level security;

create policy "carpool_offers select" on public.carpool_offers for select
  using (auth.uid() is not null);

create policy "carpool_offers write own" on public.carpool_offers for all
  using (driver_player_id = public.current_player_id() or public.is_trainer())
  with check (driver_player_id = public.current_player_id() or public.is_trainer());

create policy "carpool_claims select" on public.carpool_claims for select
  using (auth.uid() is not null);

create policy "carpool_claims write own" on public.carpool_claims for all
  using (player_id = public.current_player_id() or public.is_trainer())
  with check (player_id = public.current_player_id() or public.is_trainer());

insert into public.feature_flags (key, enabled) values ('carpool', false);
