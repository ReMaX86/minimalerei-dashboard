-- Admin-konfigurierbare Liga-ID für den DBB-Tabellen-Sync
-- (api/sync-league-standings.ts), statt der bisher fest codierten Vercel-
-- Env-Var DBB_LIGA_ID. Liegt in derselben Singleton-Zeile wie der Sync-
-- Status (Migration 0065), da beides zusammengehörige "Tabellen-Sync"-
-- Konfiguration ist. Default '54636' übernimmt den bisherigen Wert
-- unverändert für bestehende Installationen.
alter table public.standings_sync_status
  add column liga_id text not null default '54636';

-- Bisher nur per service_role beschreibbar (siehe Migration 0065) — jetzt
-- zusätzlich per Trainer/Admin-Spieler änderbar, damit die Liga-ID im
-- Adminbereich editiert werden kann. is_trainer() deckt beides ab (echte
-- Trainer-Zeile ODER Spieler mit is_admin, siehe Migration 0006).
create policy "standings_sync_status write trainer" on public.standings_sync_status for update
  using (public.is_trainer()) with check (public.is_trainer());
