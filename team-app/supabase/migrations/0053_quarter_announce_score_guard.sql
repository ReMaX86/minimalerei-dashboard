-- Live aufgefallen: Die Zwischenstand-Push nach Viertelwechsel kam während
-- eines echten Spiels nicht an, obwohl der Trigger korrekt eingerichtet
-- war. Ursache: vor dem Anpfiff wurde im Tracker (vermutlich beim
-- Ausprobieren) mehrfach kurz hintereinander durch die Viertel geklickt,
-- bevor auch nur ein Punkt erfasst war. announce_quarter_score() (Migration
-- 0042) erhöht last_announced_quarter aber IMMER, sobald p_quarter >
-- last_announced_quarter ist — unabhängig davon, ob zu diesem Zeitpunkt
-- überhaupt ein gültiger Spielstand existiert. api/send-quarter-score.ts
-- bricht in diesem Fall zwar sauber mit "game_or_score_not_found" ab (kein
-- Fehler, kein Absturz) — der Ratchet war zu dem Zeitpunkt aber bereits
-- hochgezählt, und weil er nie wieder runtergeht, konnten die echten
-- Viertelwechsel später im tatsächlichen Spiel dieselben Quarter-Nummern
-- nicht mehr "neu" auslösen. Die Push blieb dadurch für den Rest des
-- Spiels stumm, ohne dass irgendwo ein sichtbarer Fehler auftauchte (live
-- über net._http_response nachvollzogen: drei "game_or_score_not_found"
-- innerhalb von 2 Sekunden, alle vor Spielbeginn).
--
-- Fix: der Ratchet darf nur noch vorrücken, wenn zu diesem Zeitpunkt schon
-- ein gültiger Spielstand existiert (final_score_us is not null — laut
-- recalc_game_score() aus Migration 0028 erst ab dem ersten erfassten
-- Stats-Event der Fall). Ein Klicken durch die Viertel vor dem ersten Korb
-- verbraucht den Ratchet dadurch nicht mehr.
create or replace function public.announce_quarter_score(p_game_id uuid, p_quarter smallint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_trainer() or public.current_player_id() is not null) then
    raise exception 'not_authorized';
  end if;

  update public.games
    set last_announced_quarter = p_quarter
    where id = p_game_id
      and p_quarter > last_announced_quarter
      and final_score_us is not null;

  return found;
end;
$$;
