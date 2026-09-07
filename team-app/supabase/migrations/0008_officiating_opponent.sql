-- Adds an optional "Gegner" field to Kampfgericht-Termine. opponent_teams
-- holds the TBW-eigenen Jahrgang/das Team (siehe Migration 0006/0007);
-- dieses Feld ergänzt den tatsächlichen gegnerischen Verein, falls bekannt.
-- Bewusst nullable — bei bestehenden Terminen und teils auch neuen ist der
-- Gegner nicht immer schon bekannt/relevant.

alter table public.officiating_games add column opponent text;
