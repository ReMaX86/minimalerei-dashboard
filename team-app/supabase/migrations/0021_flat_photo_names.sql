-- Zweiter Diagnose-Schritt (Migration 0020) zeigt: selbst eine komplett
-- offene "auth.uid() is not null"-Policy ohne jeden Namens-Abgleich
-- schlägt weiterhin mit "new row violates row-level security policy"
-- fehl. Das schließt die Namens-/Ordner-Abgleichslogik als Ursache
-- endgültig aus.
--
-- Neuer Verdacht: unser Pfadschema "<auth_user_id>/<timestamp>.<ext>"
-- (Migration 0019) enthält ein "/" — Supabase Storage pflegt für Objekte
-- in einem Unterordner zusätzlich eine Zeile in einer internen
-- Ordner-Hierarchie-Tabelle, für die es bislang keine eigene Policy gibt.
-- Das würde exakt dieselbe generische RLS-Fehlermeldung auslösen, nur
-- eben nicht auf storage.objects selbst.
--
-- Sicherster Ausweg: zurück auf flache Dateinamen ohne "/" — genau das
-- Schema, das der bereits bestehende Trainer-Upload-Pfad in
-- PlayersAdmin.tsx verwendet ("<player_id>-<timestamp>.<ext>"). Der
-- Namens-Abgleich läuft weiterhin direkt über auth.uid() (kein
-- Funktionsaufruf, kein Join, wie schon in Migration 0019), jetzt aber
-- als LIKE-Präfix auf einen flachen Dateinamen statt einem Ordnerpfad.
-- Ersetzt außerdem die testweise offene Policy aus Migration 0020 wieder
-- durch eine auf die eigene Datei beschränkte.

drop policy if exists "player photos insert self" on storage.objects;
drop policy if exists "player photos update self" on storage.objects;

create policy "player photos insert self" on storage.objects for insert
  with check (
    bucket_id = 'player-photos'
    and auth.uid() is not null
    and name like auth.uid()::text || '-%'
  );

create policy "player photos update self" on storage.objects for update
  using (
    bucket_id = 'player-photos'
    and auth.uid() is not null
    and name like auth.uid()::text || '-%'
  );
