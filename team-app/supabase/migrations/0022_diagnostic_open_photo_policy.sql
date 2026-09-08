-- Vierter Fehlschlag in Folge, identischer Fehler
-- ("new row violates row-level security policy") über vier verschiedene
-- Varianten hinweg (0018: Funktion+Join, 0019: auth.uid()+Ordner,
-- 0020: auth.uid() ganz ohne Namensabgleich, 0021: auth.uid()+flacher
-- Dateiname). Der einzige gemeinsame Nenner aller vier ist die
-- Bedingung "auth.uid() is not null" — der Verdacht ist jetzt, dass
-- auth.uid() innerhalb der Storage-RLS-Auswertung für dieses Projekt
-- grundsätzlich NULL liefert, unabhängig von Namens-/Ordnerlogik.
--
-- Entscheidender Test: eine Policy komplett ohne jeden Auth-Bezug, nur
-- auf den Bucket beschränkt. Klappt der Upload jetzt, ist auth.uid()
-- in der Storage-Auswertung definitiv das Problem. Klappt er weiterhin
-- nicht, liegt es an etwas noch Grundlegenderem (z. B. Bucket/Grants).
--
-- ACHTUNG — bewusst nur für die Diagnose, danach umgehend wieder
-- einschränken: jeder (auch nicht angemeldete Nutzer) kann während
-- dieser Policy in den player-photos-Bucket schreiben.

drop policy if exists "player photos insert self" on storage.objects;
drop policy if exists "player photos update self" on storage.objects;

create policy "player photos insert self" on storage.objects for insert
  with check (bucket_id = 'player-photos');

create policy "player photos update self" on storage.objects for update
  using (bucket_id = 'player-photos');
