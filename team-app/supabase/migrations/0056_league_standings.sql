-- Liga-Tabelle vom DBB (basketball-bund.net) — auf Nutzeranfrage, um die
-- offizielle Tabelle direkt in der App zu zeigen, statt extern nachschauen
-- zu müssen. Der DBB bietet dafür keine öffentliche API (alte, reine
-- Server-seitig gerenderte JSP-Anwendung) — die Daten kommen daher per
-- serverseitigem Scraping der HTML-Tabelle (api/sync-league-standings.ts,
-- per pg_cron einmal täglich aufgerufen, siehe README "Liga-Tabelle") statt
-- per Direktzugriff aus dem Client.
--
-- Bei jedem Sync-Lauf wird die komplette Tabelle für die jeweilige liga_id
-- gelöscht und neu eingefügt (kein Zeilen-Update), da sich Rang UND
-- Mannschaftszusammensetzung jede Runde ändern können — ein einfacher
-- Full-Refresh ist hier robuster als Diffing.
create table public.league_standings (
  id uuid primary key default gen_random_uuid(),
  liga_id text not null,
  rang int not null,
  team_name text not null,
  -- Server-seitig ermittelt (Namens-Abgleich auf "Wülfrath" beim Sync),
  -- damit die Hervorhebung der eigenen Mannschaft nicht per Namens-String
  -- im Client dupliziert werden muss.
  is_own_team boolean not null default false,
  spiele int not null,
  siege int not null,
  niederlagen int not null,
  punkte int not null,
  koerbe_erzielt int not null,
  koerbe_erhalten int not null,
  diff int not null,
  updated_at timestamptz not null default now()
);

create unique index league_standings_liga_rang_idx on public.league_standings (liga_id, rang);

alter table public.league_standings enable row level security;

create policy "league_standings select" on public.league_standings for select
  using (auth.uid() is not null);

-- Schreibzugriff ausschließlich über den Sync (service_role, umgeht RLS
-- ohnehin) — kein Client schreibt hier direkt, daher keine Write-Policy.
grant select, insert, delete on public.league_standings to service_role;

-- Standardmäßig aus (wie jedes neue Feature, siehe Migration 0013/0014/
-- 0015/0016) — erst einschalten, wenn der tägliche Sync-Cronjob eingerichtet
-- ist (README "Liga-Tabelle"), sonst zeigt "Spiele" eine leere Karte.
insert into public.feature_flags (key, enabled) values ('standings', false);
