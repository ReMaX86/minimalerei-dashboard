-- Dritte Ferienzeit-Option: "Fällt aus" (kompletter Ausfall ohne
-- Ersatztermine). Bisher ließ sich das nur behelfsmäßig über "Sonderzeiten"
-- ganz ohne eingetragene Sondertermine abbilden — sah in der Liste aber wie
-- ein unvollständiger Eintrag aus, und war als Option nicht erkennbar.
-- Neuer expliziter Modus 'cancelled': lässt in der Terminberechnung genauso
-- wie 'special' alle regulären Trainings im Zeitraum entfallen, nur eben
-- ohne die Möglichkeit (und ohne die Erwartung), Sondertermine einzutragen.

alter table public.training_overrides drop constraint if exists training_overrides_mode_check;
alter table public.training_overrides
  add constraint training_overrides_mode_check check (mode in ('regular', 'special', 'cancelled'));
