-- Ergebnisse & Punkte, manuell vom Trainer gepflegt (siehe README für die
-- Abwägung zu einer automatischen DBB-Anbindung — dafür gibt es aktuell
-- keine dokumentierte öffentliche Schnittstelle). Steht hinter dem
-- "stats"-Feature-Flag (Migration 0011). "us"/"opponent" statt "home"/"away",
-- damit der Vergleich unabhängig von Heim/Auswärts direkt Sieg/Niederlage
-- ergibt.

alter table public.games
  add column final_score_us int,
  add column final_score_opponent int;

create table public.game_player_points (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  points int not null check (points >= 0),
  primary key (game_id, player_id)
);

alter table public.game_player_points enable row level security;

create policy "game_player_points select" on public.game_player_points for select
  using (auth.uid() is not null);

create policy "game_player_points write trainer" on public.game_player_points for all
  using (public.is_trainer()) with check (public.is_trainer());

insert into public.feature_flags (key, enabled) values ('stats', false);
