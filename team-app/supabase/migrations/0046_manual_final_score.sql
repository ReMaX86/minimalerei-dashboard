-- reset_game_stats() (Migration 0043) verließ sich für final_score_us/
-- final_score_opponent bisher komplett auf den recalc_game_score()-Trigger
-- (Migration 0028), der nur bei INSERT/DELETE auf game_stat_events feuert.
-- Ein von Hand nachgetragener Endstand (siehe GamesAdmin.tsx "Endstand
-- nachtragen") hat aber gar keine game_stat_events-Zeilen — das DELETE dort
-- betrifft dann 0 Zeilen, der Trigger feuert nicht, und der nachgetragene
-- Stand würde stehen bleiben, obwohl "Tracking zurücksetzen" ihn eigentlich
-- löschen soll. Jetzt explizit mit zurückgesetzt, unabhängig vom Trigger.
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
  delete from public.game_stat_sessions where game_id = p_game_id;

  update public.games
    set stats_finalized_at = null,
        last_announced_quarter = 0,
        final_score_us = null,
        final_score_opponent = null
    where id = p_game_id;
end;
$$;
