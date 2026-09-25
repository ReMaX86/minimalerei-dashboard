-- Element 24 "Live-Tracking": zwei kleine Schema-Ergänzungen für die als NEU
-- markierten Punkte, ohne an der bestehenden Erfassungslogik selbst etwas
-- zu ändern.

-- 1) Rebounds getrennt (§5): bisher ein einziger stat_type 'rebound'. Neu
-- kommen 'rebound_def'/'rebound_off' als zusätzliche, getrennt speicherbare
-- Werte hinzu — bereits erfasste 'rebound'-Events bleiben unverändert
-- gültig und zählen weiterhin normal mit (siehe gameStats.ts applyStat()),
-- nur neue Erfassungen unterscheiden ab jetzt DEF/OFF.
alter table public.game_stat_events
  drop constraint game_stat_events_stat_type_check;
alter table public.game_stat_events
  add constraint game_stat_events_stat_type_check check (stat_type in (
    'fg2_made', 'fg2_miss', 'fg3_made', 'fg3_miss', 'ft_made', 'ft_miss',
    'rebound', 'rebound_def', 'rebound_off', 'assist', 'steal', 'block', 'turnover', 'foul'
  ));

-- 2) Das aktuelle Viertel steckte bisher nur in einem lokalen React-State
-- von GameStatsTracker.tsx — ein Neuladen der Seite oder eine Übernahme
-- durch eine andere Person (siehe claim_stat_session, Migration 0028)
-- sprang dadurch immer zurück auf Q1, obwohl Punkte/Fouls/Verlauf
-- weiterhin korrekt aus game_stat_events geladen wurden. Für die neuen
-- Teamfouls-pro-Viertel (§4, aus den vorhandenen 'foul'-Events fürs
-- aktuelle Viertel abgeleitet, keine eigene Spalte nötig) und das manuelle
-- Viertel-Ende (§8) muss "welches Viertel läuft gerade" deshalb
-- serverseitig feststehen statt nur im Browser-Tab der zufällig
-- trackenden Person.
alter table public.games
  add column current_quarter smallint not null default 1 check (current_quarter >= 1);

-- reset_game_stats() (Migration 0043) muss das neue Feld mit zurücksetzen,
-- sonst bliebe ein zurückgesetztes Testspiel fälschlich in einem späteren
-- Viertel stehen.
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
        current_quarter = 1
    where id = p_game_id;
end;
$$;

-- Kleine RPC, die den Quarter-Wechsel serverseitig persistiert — der
-- Client ruft sie beim manuellen "Viertel beenden" bzw. beim Wechsel über
-- die Viertel-Leiste auf, statt current_quarter direkt per update() zu
-- setzen, damit dieselbe Berechtigungsprüfung gilt wie beim Erfassen von
-- Stats selbst (Spieler oder Trainer).
create or replace function public.set_game_quarter(p_game_id uuid, p_quarter smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_trainer() or public.current_player_id() is not null) then
    raise exception 'not_authorized';
  end if;
  update public.games set current_quarter = p_quarter where id = p_game_id;
end;
$$;
