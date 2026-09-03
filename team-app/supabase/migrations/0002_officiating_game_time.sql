-- Adds the kickoff time to officiating_games. The original schema (0001)
-- only had a date, which turned out to be insufficient once real
-- Kampfgericht schedules (with several games per day) were imported —
-- see team-app/README.md for context. Nullable so existing rows are
-- unaffected.

alter table public.officiating_games
  add column if not exists game_time time;
