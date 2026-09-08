-- Wechsel von der vereinfachten 3er-Positionseinteilung (Aufbau/Flügel/
-- Center) auf die klassische 5er-Einteilung mit englischen Kürzeln
-- (pg/sg/sf/pf/c), auf Wunsch. players.position ist eine reine
-- text-Spalte ohne CHECK-Constraint (Migration 0014), daher rein
-- informativ — bestehende Werte der alten Codes werden hier auf
-- sinnvolle neue Entsprechungen umgemappt, damit kein Spieler
-- unbemerkt seine Position verliert. Trainer können danach in Admin ->
-- Spieler bei Bedarf präzisieren (z. B. "Flügel" könnte ursprünglich
-- SF oder PF gemeint gewesen sein — wir mappen auf SF als naheliegenden
-- Standard).

update public.players
set position = case position
  when 'aufbau' then 'pg'
  when 'fluegel' then 'sf'
  when 'center' then 'c'
  else position
end
where position in ('aufbau', 'fluegel', 'center');
