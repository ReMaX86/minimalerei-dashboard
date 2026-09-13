-- Drei neue Benachrichtigungsarten (Training abgesagt, Kader veröffentlicht,
-- Kader-Absage) brauchen service_role-Leserechte auf zwei weitere Tabellen,
-- die bisher noch nie server-seitig abgefragt wurden. Direkt vorab
-- nachgeholt (gelernt aus #114: sonst "permission denied" bei jeder neuen
-- Tabelle, die eine api/-Function zum ersten Mal anfasst).

grant select on public.games to service_role;
grant select on public.trainers to service_role;
