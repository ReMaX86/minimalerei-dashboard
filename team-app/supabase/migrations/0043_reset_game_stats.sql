-- "Tracking zurücksetzen" für Trainer im Admin: löscht alle erfassten
-- Stats-Events, die Aufstellung ("wer steht auf dem Feld") und einen
-- eventuell noch aktiven Tracking-Lock für ein Spiel, und setzt es wieder
-- auf "Stats laufen noch" zurück (falls es zwischenzeitlich abgeschlossen
-- war). Gedacht für Testdaten (z. B. beim Ausprobieren des Live-Tickers vor
-- der Saison) oder falsch erfasste Spiele — nicht für den normalen Betrieb.
--
-- final_score_us/final_score_opponent müssen hier nicht manuell
-- zurückgesetzt werden: recalc_game_score() (Migration 0028) läuft bei
-- jedem Löschen aus game_stat_events automatisch mit und setzt sie auf
-- null, sobald keine Events mehr übrig sind.
--
-- Bewusst trainer-only (wie reopen_game_stats) — löscht unwiderruflich
-- erfasste Daten, das soll nicht jeder Spieler versehentlich auslösen
-- können.
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
        last_announced_quarter = 0
    where id = p_game_id;
end;
$$;
