-- Wurzelursache endlich gefunden: storage.buckets hat RLS aktiv
-- (Supabase-Standard), aber noch nie eine einzige Policy bekommen — RLS
-- ohne Policy heißt kompletter Zugriffsentzug für alle Rollen außer dem
-- Superuser. Migration 0014 hat den player-photos-Bucket zwar per INSERT
-- angelegt, aber nie eine SELECT-Policy dafür ergänzt. Supabase Storage
-- muss vor jedem Objekt-Schreibzugriff offenbar die Bucket-Zeile selbst
-- lesen können (z. B. öffentlich/privat, Größenlimit, erlaubte
-- MIME-Typen) — ohne Leserecht darauf schlägt JEDER Upload mit "new row
-- violates row-level security policy" fehl, unabhängig davon, wie offen
-- die Policies auf storage.objects selbst sind. Erklärt rückwirkend alle
-- bisherigen Fehlschläge (Migrationen 0018-0022), vermutlich auch den
-- nie in Produktion getesteten Trainer-Upload-Pfad.
--
-- Bucket-Konfiguration ist nicht sensibel (kein Nutzerinhalt), daher
-- Lesezugriff für alle — passt zum Muster im Rest der App, wo praktisch
-- jede SELECT-Policy "jeder angemeldete Nutzer" erlaubt.

create policy "buckets select all" on storage.buckets for select
  using (true);

-- Jetzt, wo die eigentliche Ursache behoben ist: die testweise komplett
-- offene Policy aus Migration 0022 wieder auf die eigene Datei
-- einschränken (identische Logik wie Migration 0021, die vor der
-- Buckets-Erkenntnis fälschlich als Ursache vermutet worden war).
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
