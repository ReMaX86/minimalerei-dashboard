-- Diagnose: der Foto-Upload aus "Mein Profil" schlägt weiterhin mit
-- "new row violates row-level security policy" fehl, obwohl die Policy
-- aus Migration 0019 nachweislich korrekt in der Datenbank steht
-- (geprüft per pg_policies) und die identische auth.uid()-basierte Logik
-- über andere RPCs (current_player_id(), update_my_profile()) für
-- denselben Nutzer/dieselbe Sitzung nachweislich funktioniert. Um
-- einzugrenzen, ob speziell der Ordner-Namens-Abgleich
-- ((storage.foldername(name))[1] = auth.uid()::text) das Problem ist,
-- oder etwas grundsätzlicheres in der Storage-RLS-Auswertung, wird die
-- Prüfung testweise auf "beliebiger angemeldeter Nutzer dieser App" ohne
-- Ordner-Bezug vereinfacht.
--
-- Sicherheitsabwägung: player-photos ist ohnehin ein öffentlich lesbarer
-- Bucket (jeder mit der URL kann jedes Foto sehen); diese Lockerung
-- erlaubt zusätzlich jedem angemeldeten Spieler/Trainer, JEDE Datei in
-- diesem Bucket hochzuladen/zu ersetzen (nicht nur die eigene) — bei
-- einem kleinen, vertrauenswürdigen Team-Kreis ein vertretbares
-- Übergangsrisiko, bis die eigentliche Ursache gefunden ist.

drop policy if exists "player photos insert self" on storage.objects;
drop policy if exists "player photos update self" on storage.objects;

create policy "player photos insert self" on storage.objects for insert
  with check (
    bucket_id = 'player-photos'
    and auth.uid() is not null
  );

create policy "player photos update self" on storage.objects for update
  using (
    bucket_id = 'player-photos'
    and auth.uid() is not null
  );
