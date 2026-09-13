-- Trikotnummern pro Spiel statt fest am Spieler: bei TB Wülfrath wechseln
-- die Nummern von Spiel zu Spiel (keine festen Trikots), deshalb keine
-- Spalte auf players, sondern eine eigene Zuordnungstabelle je Spiel.
-- Gleiches Zugriffsmuster wie game_stat_events/game_court_state (Migration
-- 0028/0029): jeder Spieler oder Trainer darf für jedes Spiel die Nummern
-- pflegen, nicht nur wer gerade den Tracking-Lock hält — die Nummern sind
-- reine Zuordnungsdaten, kein exklusiver Schreibzugriff nötig.

create table public.game_player_numbers (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  number smallint not null check (number >= 0 and number <= 99),
  primary key (game_id, player_id)
);

alter table public.game_player_numbers enable row level security;

create policy "game_player_numbers select" on public.game_player_numbers for select
  using (auth.uid() is not null);

create policy "game_player_numbers write" on public.game_player_numbers for all
  using (public.is_trainer() or public.current_player_id() is not null)
  with check (public.is_trainer() or public.current_player_id() is not null);
