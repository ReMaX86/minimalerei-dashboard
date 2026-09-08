-- "Wer steht gerade auf dem Feld" fürs Live-Stats-Tracking: getrennt vom
-- vor dem Spiel festgelegten Kader (game_squad) und unabhängig vom
-- weichen Tracking-Lock (game_stat_sessions) — bleibt über Ablösungen des
-- Trackers hinweg erhalten, damit eine Übernahme mitten im Spiel nicht die
-- aktuelle Aufstellung verliert. Ein Array statt einer eigenen Zeile pro
-- Spieler, weil es nur um "wer ist gerade drin" geht, nicht um eine
-- historisierte Auswechsel-Liste.

create table public.game_court_state (
  game_id uuid primary key references public.games (id) on delete cascade,
  on_court_player_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.game_court_state enable row level security;

create policy "game_court_state select" on public.game_court_state for select
  using (auth.uid() is not null);

-- Gleiche Regel wie game_stat_events: jeder Spieler oder Trainer darf für
-- jedes Spiel die Aufstellung pflegen.
create policy "game_court_state write" on public.game_court_state for all
  using (public.is_trainer() or public.current_player_id() is not null)
  with check (public.is_trainer() or public.current_player_id() is not null);
