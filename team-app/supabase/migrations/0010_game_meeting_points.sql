-- Treffpunkt-Infos pro Spiel. Heimspiele haben nur einen Treffpunkt (die
-- Halle); Auswärtsspiele können zusätzlich einen Fahrgemeinschaft-Treffpunkt
-- haben (Zeit + Ort, z. B. ein Parkplatz) für alle, die nicht direkt zur
-- gegnerischen Halle fahren. Alle Felder sind optional — bestehende Spiele
-- ohne Treffpunkt zeigen einfach nichts an.

alter table public.games
  add column meeting_time_hall time,
  add column meeting_time_carpool time,
  add column meeting_point_carpool text;
