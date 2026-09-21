-- Neunte Push-Benachrichtigungsart: "Spiel gestartet", sobald der erste
-- wurfrelevante Eintrag für ein Spiel erfasst wird (egal ob eigener Korb
-- oder Gegentreffer) — auf Nutzeranfrage, damit man auf der Startseite
-- mitbekommt, dass gerade live getrackt wird, ohne extra nachzuschauen.
--
-- Dedupliziert über dieses neue Feld statt z. B. "erstes game_stat_events
-- für dieses Spiel" (letzteres würde auch bei Rebounds/Fouls vor dem ersten
-- Korb fälschlich schon auslösen): der auslösende Trigger (von Hand im
-- SQL Editor angelegt, siehe README) claimt dieses Feld atomar per
-- "update ... where game_started_announced_at is null" — nur der Aufruf,
-- der das Feld tatsächlich von null auf now() setzen konnte, verschickt
-- die Push. Verhindert doppelten Versand auch bei zwei Personen, die
-- gleichzeitig tracken.
alter table public.games
  add column game_started_announced_at timestamptz;

-- reset_game_stats() (Migration 0043, zuletzt erweitert in 0055) muss das
-- neue Feld mit zurücksetzen, sonst bliebe nach einem Reset die alte
-- Markierung stehen und die "Spiel gestartet"-Push würde beim erneuten
-- Tracken desselben Spiels nie wieder auslösen.
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
        last_announced_quarter = 0,
        game_started_announced_at = null
    where id = p_game_id;
end;
$$;
