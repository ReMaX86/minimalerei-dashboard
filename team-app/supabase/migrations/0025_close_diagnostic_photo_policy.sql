-- Sicherheits-Aufräumen nach der Diagnose in Migration 0024: Foto-Uploads
-- schlagen nachweislich unabhängig von den storage.objects-Policies fehl
-- (auch mit "with check (true)"-artiger, komplett offener Regel, sowohl
-- über anonyme Spieler-Logins als auch über einen echten Trainer-Login
-- via E-Mail/Passwort) — das Problem liegt außerhalb dessen, was wir per
-- SQL beeinflussen können (vermutlich eine projektinterne
-- Fehlkonfiguration bei Supabase selbst, siehe README). Es gibt daher
-- aktuell keinen funktionalen Grund, die Policy offen zu lassen — aus
-- Sicherheitsgründen zurück auf "nur die eigene Datei", identisch zu
-- Migration 0023/0021, bis Supabase-Support das zugrunde liegende
-- Problem geklärt hat.

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
