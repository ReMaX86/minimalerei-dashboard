-- Optionales Rückennummer-Feld für Spieler (siehe docs/design/tipoff-design/
-- elements/01-start-header/PROMPT.md Abschnitt C): manche Teams vergeben
-- feste Trikotnummern, unseres bislang nicht — deshalb rein nullable und
-- ohne eigene Pflege-Oberfläche. Wo man sie einträgt, wird später beim
-- Profil geklärt.
alter table public.players
  add column jersey_number smallint;

comment on column public.players.jersey_number is
  'Optionale, vom Verein vergebene Rückennummer (0-99). Noch keine Pflege-UI — nullable, bis geklärt ist, wo sie eingetragen wird.';

alter table public.players
  add constraint players_jersey_number_range check (jersey_number is null or (jersey_number >= 0 and jersey_number <= 99));
