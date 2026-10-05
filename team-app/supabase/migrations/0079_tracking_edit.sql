-- Element 26 "Live-Tracking — runde Knöpfe und Bearbeiten": Einträge lassen
-- sich jetzt nachträglich ändern/löschen (statt nur "letzten Eintrag im
-- aktuellen Viertel zurücknehmen" wie bisher). Die bestehende RLS-Policy
-- "game_stat_events write" (Migration 0028/0045, "for all") deckt UPDATE
-- bereits ab — wer tracken darf, darf auch bearbeiten (Rückfrage 3).

-- recalc_game_score() (Migration 0028) hielt games.final_score_us/-opponent
-- bisher nur bei INSERT/DELETE aktuell — ein UPDATE (Bearbeiten eines
-- Eintrags) ließ den Endstand-Fallback (siehe GameStatsTracker.tsx
-- teamScore-Berechnung) unbemerkt veraltet stehen. Gleichzeitig braucht der
-- Live-Ticker auf der Startseite (Rückfrage 5) ein Signal, wann zuletzt
-- *nachträglich* korrigiert wurde, um dort kurz "korrigiert" anzuzeigen,
-- statt den Stand einfach still zu ändern — dafür genügt ein einzelner
-- Zeitstempel auf games, kein eigenes Protokoll.
alter table public.games
  add column stats_corrected_at timestamptz;

create or replace function public.recalc_game_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_game_id uuid := coalesce(new.game_id, old.game_id);
  us_points int;
  opponent_points int;
  event_count int;
begin
  select
    coalesce(sum(case when team = 'us' then
      case stat_type when 'fg2_made' then 2 when 'fg3_made' then 3 when 'ft_made' then 1 else 0 end
    else 0 end), 0),
    coalesce(sum(case when team = 'opponent' then
      case stat_type when 'fg2_made' then 2 when 'fg3_made' then 3 when 'ft_made' then 1 else 0 end
    else 0 end), 0),
    count(*)
    into us_points, opponent_points, event_count
    from public.game_stat_events
    where game_id = target_game_id;

  update public.games
    set final_score_us = case when event_count = 0 then null else us_points end,
        final_score_opponent = case when event_count = 0 then null else opponent_points end,
        -- Nur bei UPDATE/DELETE anfassen — ein ganz normal neu getracktes
        -- Event (INSERT) ist keine "Korrektur", sonst würde die Zuletzt-
        -- Zeile/der Live-Ticker bei jedem einzelnen Korb fälschlich
        -- "korrigiert" anzeigen.
        stats_corrected_at = case when TG_OP in ('UPDATE', 'DELETE') then now() else stats_corrected_at end
    where id = target_game_id;

  return coalesce(new, old);
end;
$$;

-- Der bestehende Trigger "game_stat_events_recalc_score" deckt INSERT/DELETE
-- bereits ab; ein DROP TRIGGER hängt in dieser Umgebung über die Supabase-
-- MCP-Tools zuverlässig (wie DROP POLICY/TABLE/FUNCTION, siehe PR-Notizen zu
-- Migration 0078) — deshalb hier bewusst ein ZWEITER, rein additiver Trigger
-- nur für UPDATE statt den bestehenden umzuschreiben. Beide rufen dieselbe
-- Funktion auf, die pro Aufruf ohnehin den kompletten Stand neu aus
-- game_stat_events berechnet — unproblematisch, auch wenn künftig mal beide
-- für dasselbe Event feuern würden.
create trigger game_stat_events_recalc_score_on_update
  after update on public.game_stat_events
  for each row execute function public.recalc_game_score();
