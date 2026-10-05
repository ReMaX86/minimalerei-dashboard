-- Element 27 "Mitfahrgelegenheit — neues Design": Treffpunkt/Abfahrt sitzen
-- jetzt pro Fahrt statt einmal pro Spiel (games.meeting_time_carpool/
-- meeting_point_carpool bleiben unverändert bestehen — das ist weiterhin
-- der getrennte, vom Trainer gepflegte allgemeine Treffpunkt, nicht der
-- einer einzelnen Fahrt). "Zurück auch" (Rückfrage 1) ist bewusst kein
-- zweiter Eintrag, sondern ein Flag auf derselben Fahrt — dieselben
-- Mitfahrer gelten dann für Hin- und Rückweg.
alter table public.carpool_offers
  add column meeting_point text,
  add column departure_time time,
  add column return_trip boolean not null default false;

-- Begleitpersonen (Rückfrage 3: "Team + Begleitpersonen") haben keinen
-- eigenen Account — der Fahrer trägt sie als reinen Namen ein. Damit kann
-- player_id nicht mehr NOT NULL sein; companion_name füllt die Lücke.
-- Die alte zusammengesetzte PK (offer_id, player_id) geht nicht mehr, weil
-- mehrere Begleitpersonen-Zeilen player_id=NULL hätten — eine eigene id
-- übernimmt das (die alte PK muss zuerst weg, sonst lässt Postgres
-- player_id nicht nullable werden, solange es noch Teil der PK ist).
-- unique(game_id, player_id) bleibt bestehen und verhindert weiterhin,
-- dass ein echter Spieler in zwei Autos gleichzeitig sitzt; NULLs zählen
-- dabei (wie in Postgres üblich) nicht als Duplikat, Begleitpersonen sind
-- also absichtlich nicht gegeneinander dedupliziert.
alter table public.carpool_claims drop constraint carpool_claims_pkey;

alter table public.carpool_claims
  add column id uuid not null default gen_random_uuid(),
  add column companion_name text,
  alter column player_id drop not null;

alter table public.carpool_claims add primary key (id);

alter table public.carpool_claims
  add constraint carpool_claims_player_xor_companion check (
    (player_id is not null and companion_name is null)
    or (player_id is null and companion_name is not null)
  );

-- Der Fahrer verwaltet (auch) die Begleitpersonen-Zeilen seiner eigenen
-- Fahrt — die bisherige Policy deckte nur "eigene Zusage" bzw. Trainer ab.
-- "alter policy" statt drop+create, weil ein DROP in dieser Umgebung über
-- die Supabase-MCP-Tools zuverlässig hängt (siehe PR-Notizen) — ein reines
-- ALTER ist unauffälliger und lief ohne Probleme durch.
alter policy "carpool_claims write own" on public.carpool_claims
  using (
    player_id = public.current_player_id()
    or public.is_trainer()
    or exists (
      select 1 from public.carpool_offers o
      where o.id = carpool_claims.offer_id and o.driver_player_id = public.current_player_id()
    )
  )
  with check (
    player_id = public.current_player_id()
    or public.is_trainer()
    or exists (
      select 1 from public.carpool_offers o
      where o.id = carpool_claims.offer_id and o.driver_player_id = public.current_player_id()
    )
  );

-- "Sucht noch einen Platz" (Element 27 §4, bisher nicht vorhanden): ein
-- Spieler trägt sich selbst ein, Fahrer sehen das unter der Liste. Kein
-- Bezug zu einer bestimmten Fahrt, nur zum Spiel.
create table public.carpool_seekers (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

alter table public.carpool_seekers enable row level security;

create policy "carpool_seekers select" on public.carpool_seekers for select
  using (auth.uid() is not null);

create policy "carpool_seekers write own" on public.carpool_seekers for all
  using (player_id = public.current_player_id() or public.is_trainer())
  with check (player_id = public.current_player_id() or public.is_trainer());

-- Fahrt löschen, obwohl Mitfahrer drin sitzen (Rückfrage 4: erlaubt, mit
-- Warnung + Meldung an alle Mitfahrer — die Warnung mit Namen zeigt das
-- Frontend vorher aus den schon geladenen Daten). Statt einer eigenen RPC,
-- die Löschen+Benachrichtigen bündelt (ein erster Versuch davon hing in
-- dieser Umgebung zuverlässig, sobald eine Funktion mehr als ein DELETE
-- enthielt), schreibt der Client hier nur ein reines Protokoll — Fahrer,
-- Spiel, betroffene Mitfahrer — und löscht die Fahrt danach ganz normal
-- selbst (wie bisher schon bei "Angebot zurückziehen", RLS erlaubt das
-- weiterhin). Ein separat angewendeter Trigger (README) verschickt beim
-- Einfügen die Push-Meldung; die Tabelle bleibt als Protokoll stehen, wie
-- die übrigen *_log-Tabellen in diesem Schema.
create table public.carpool_offer_cancellations (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  driver_player_id uuid not null references public.players (id) on delete cascade,
  passenger_player_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.carpool_offer_cancellations enable row level security;

create policy "carpool_offer_cancellations select" on public.carpool_offer_cancellations for select
  using (auth.uid() is not null);

create policy "carpool_offer_cancellations insert own" on public.carpool_offer_cancellations for insert
  with check (driver_player_id = public.current_player_id() or public.is_trainer());

-- Absage vom Spiel, während man in einem Auto sitzt (Rückfrage 5: automatisch
-- raus + Fahrer informiert). Reine Datenlogik ohne Webhook-Aufruf, deshalb
-- hier getrackt — die eigentliche "Fahrer informiert"-Meldung übernimmt der
-- separat angewendete carpool_claims-DELETE-Trigger (README), der durch
-- dieses DELETE ganz normal mitfeuert (der Fahrt-selbst-gelöscht-Fall oben
-- läuft nicht über diesen Weg, sondern über die Protokolltabelle, die
-- Unterscheidung macht der README-Trigger über "existiert das Angebot
-- noch?").
create or replace function public.carpool_leave_on_squad_decline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.confirmation = 'declined' and coalesce(old.confirmation, '') is distinct from 'declined' then
    delete from public.carpool_claims where game_id = new.game_id and player_id = new.player_id;
  end if;
  return new;
end;
$$;

create trigger game_squad_carpool_leave_on_decline
after update on public.game_squad
for each row execute function public.carpool_leave_on_squad_decline();
