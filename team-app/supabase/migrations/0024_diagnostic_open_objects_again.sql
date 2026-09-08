-- Nach Migration 0023 (storage.buckets-Policy ergänzt + objects-Policy
-- wieder auf die eigene Datei eingeschränkt) weiterhin identischer
-- Fehler: "new row violates row-level security policy · 403 ·
-- AccessDenied" beim Foto-Upload. Bisher wurde die Kombination "Buckets-
-- Policy vorhanden UND objects-Policy komplett offen" noch nie getestet
-- (vorher war immer mindestens eine der beiden kaputt/fehlend) — dieser
-- Diagnose-Schritt isoliert das: wenn der Upload jetzt klappt, liegt es
-- tatsächlich an der auth.uid()-Namensprüfung aus Migration 0023 (dann
-- wird die genauer untersucht). Klappt er weiterhin nicht, war auch die
-- Buckets-Policy nicht die (alleinige) Ursache, und es steckt noch
-- etwas Grundlegenderes dahinter (z. B. eine der anderen
-- RLS-aktivierten storage-Tabellen wie s3_multipart_uploads).
--
-- ACHTUNG — bewusst nur für die Diagnose, danach umgehend wieder
-- einschränken.

drop policy if exists "player photos insert self" on storage.objects;
drop policy if exists "player photos update self" on storage.objects;

create policy "player photos insert self" on storage.objects for insert
  with check (bucket_id = 'player-photos');

create policy "player photos update self" on storage.objects for update
  using (bucket_id = 'player-photos');
