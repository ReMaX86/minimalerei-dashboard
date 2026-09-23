-- Element 10 "Spielplan/Ergebnisse/Tabelle": der Tabellen-Reiter soll bei
-- einer fehlgeschlagenen Aktualisierung den letzten bekannten Stand stehen
-- lassen, aber einen Warnhinweis zeigen (siehe PROMPT.md "Klappt eine
-- Aktualisierung nicht ..."). league_standings.updated_at allein reicht
-- dafür nicht — die Zeile behält bei einem fehlgeschlagenen Sync einfach
-- ihren alten Zeitstempel, es gibt sonst kein Signal "der letzte Versuch
-- ist schiefgegangen" vs. "es wurde nur noch nicht wieder synchronisiert".
-- Singleton-Zeile wie reminder_settings (Migration 0031).
create table public.standings_sync_status (
  id int primary key default 1 check (id = 1),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text
);

insert into public.standings_sync_status (id) values (1);

alter table public.standings_sync_status enable row level security;

create policy "standings_sync_status select" on public.standings_sync_status for select
  using (auth.uid() is not null);

-- Schreibzugriff ausschließlich über den Sync (service_role, umgeht RLS
-- ohnehin) — kein Client schreibt hier direkt, daher keine Write-Policy.
grant select, update on public.standings_sync_status to service_role;
