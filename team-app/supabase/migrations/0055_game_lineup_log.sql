-- Historie jeder Aufstellungsänderung (Startaufstellung + jede Ein-/
-- Auswechslung) mit Zeitstempel — auf Nutzeranfrage für die +/- -Statistik
-- im Box-Score. game_court_state (Migration 0029) hält bewusst nur den
-- *aktuellen* Stand (wird bei jedem Wechsel überschrieben, keine Historie),
-- das reicht für "wer steht gerade auf dem Feld", aber nicht für +/-: dafür
-- muss für jeden Korb rückwirkend feststellbar sein, wer zu genau diesem
-- Zeitpunkt auf dem Feld stand. Eigene Tabelle statt game_court_state
-- historisiert, um dessen simples "eine Zeile pro Spiel"-Modell nicht zu
-- verkomplizieren — beide werden ab jetzt parallel bei jeder Aufstellungs-
-- Änderung geschrieben (siehe persistOnCourt() in GameStatsTracker.tsx).
create table public.game_lineup_log (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  on_court_player_ids uuid[] not null,
  created_at timestamptz not null default now()
);

create index game_lineup_log_game_id_idx on public.game_lineup_log (game_id);

alter table public.game_lineup_log enable row level security;

create policy "game_lineup_log select" on public.game_lineup_log for select
  using (auth.uid() is not null);

-- Gleiche Regel wie game_court_state/game_stat_events: jeder Spieler oder
-- Trainer darf für jedes Spiel tracken.
create policy "game_lineup_log write" on public.game_lineup_log for all
  using (public.is_trainer() or public.current_player_id() is not null)
  with check (public.is_trainer() or public.current_player_id() is not null);

-- reset_game_stats() (Migration 0043) muss die neue Tabelle mit aufräumen,
-- sonst bliebe nach einem Reset eine alte Aufstellungs-Historie stehen und
-- würde die +/- -Berechnung beim erneuten Tracken desselben Spiels
-- verfälschen (siehe die frühere Trikot-Regression aus Migration 0052 —
-- diesmal direkt mitgedacht statt nachträglich gefixt).
create or replace function public.reset_game_stats(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then
    raise exception 'not_authorized';
  end if;

  delete from public.game_stat_events where game_id = p_game_id;
  delete from public.game_court_state where game_id = p_game_id;
  delete from public.game_lineup_log where game_id = p_game_id;
  delete from public.game_stat_sessions where game_id = p_game_id;

  update public.games
    set stats_finalized_at = null,
        last_announced_quarter = 0
    where id = p_game_id;
end;
$$;
