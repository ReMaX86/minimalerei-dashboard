-- Kampfgericht-Import für die Herren-Mannschaft, Saison 26/27.
--
-- Quelle: Kampfgericht_Herren.xlsx (klubweite Dienstplan-Tabelle über alle
-- TBW-Mannschaften). Enthält nur die 24 Termine, bei denen in der Tabelle
-- unter Anschreiber/Zeit/24Sek entweder "Herren" oder bereits ein
-- Spielername eingetragen war (also Aufgaben, die die Herren-Mannschaft
-- stellen muss) — andere Mannschaften zugewiesene Slots wurden nicht
-- importiert. `opponent_teams` nennt nur, welche TBW-Mannschaft an dem Tag
-- spielt (der eigentliche Gegner stand in der Quelltabelle nicht drin,
-- nur Ort/Zeit). Spieler-Zuordnung ist bewusst offen gelassen
-- (assigned_player_id = null) und wird später in der App vorgenommen.
--
-- Führe diese Datei EINMAL im Supabase SQL-Editor aus, nachdem Migration
-- 0002 (game_time-Spalte) eingespielt wurde.

do $$
declare
  v_game_id uuid;
begin
  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2026-09-19', '14:00', 'TBW U 12-1', 'Barmen')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2026-09-25', '20:00', 'TBW Herren 1', 'Solingen 2')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2026-09-27', '17:00', 'TBW U 18', 'Mettmann')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2026-10-02', '18:30', 'TBW U 18', 'Langenfeld')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber'), ('zeit')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2026-10-11', '15:00', 'TBW U 14-1', 'Langenfeld')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2026-11-08', '14:30', 'TBW U 14-1', 'Monheim')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber'), ('zeit')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2026-11-15', '12:30', 'TBW U 12-1', 'Münster 2')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber'), ('zeit'), ('uhr')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2026-11-28', '16:30', 'TBW U 18', 'Hilden')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2026-11-29', '14:30', 'TBW Herren 1', 'Hilden')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2026-11-29', '17:00', 'TBW U 16', 'Erkrath')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber'), ('zeit'), ('uhr')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2026-12-06', '15:00', 'TBW U 14-1', 'Mettmann')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber'), ('zeit')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2026-12-20', '12:30', 'TBW U 12-1', 'Paderborn')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2026-12-20', '13:00', 'TBW U 16', 'Velbert 1')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber'), ('zeit'), ('uhr')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2027-01-17', '13:00', 'TBW U 16', 'Hilden 2')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2027-01-17', '15:30', 'TBW Herren 1', 'Monheim')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2027-01-24', '15:00', 'TBW U 12-2', 'Velbert 1')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2027-01-24', '11:00', 'TBW U 14-2', 'Haan')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2027-01-31', '10:00', 'TBW U 16', 'Mettmann 2')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2027-01-31', '15:00', 'TBW U 18', 'Velbert')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2027-02-12', '20:00', 'TBW Herren 1', 'Mettmann')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2027-02-21', '12:30', 'TBW U 16', 'Lintorf 2')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber'), ('zeit')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2027-03-14', '13:00', 'TBW U 16', 'Langenfeld')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2027-04-16', '20:00', 'TBW Herren 1', 'Polizei Wuppertal')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

  insert into public.officiating_games (game_date, game_time, opponent_teams, location)
    values ('2027-04-25', '12:30', 'TBW U 12-1', 'Emsdetten')
    returning id into v_game_id;
  insert into public.officiating_tasks (officiating_game_id, task_type)
    select v_game_id, t::public.officiating_task_type from (values ('anschreiber')) as x(t);

end $$;