-- KRITISCHER SICHERHEITS-FIX: players.access_code und viewers.access_code
-- waren für JEDEN lesbar, der überhaupt einen Account hat — die
-- "players select"/"viewers select" Policies aus 0001_init.sql/0009_viewers.sql
-- erlauben select für "auth.uid() is not null", und da "Anonymous Sign-Ins"
-- aktiviert ist (siehe README), reicht dafür ein einziger Aufruf von
-- supabase.auth.signInAnonymously() mit dem ohnehin öffentlichen anon-Key —
-- ganz ohne Zugangscode. D.h. jeder, der die App-URL kennt, konnte per
-- Browser-Konsole `select * from players` (bzw. `viewers`) ausführen und
-- bekam die Zugangscodes ALLER Spieler/Betrachter im Klartext. Ein
-- Zugangscode ist aber das einzige Login-Merkmal — wer ihn kennt, kann sich
-- dauerhaft als der jeweilige Spieler ausgeben (Kader, Trikot-Übernahmen,
-- Kampfgericht-Zusagen, persönliches Profil).
--
-- Ursache: access_code saß in derselben Zeile wie name/is_active, die
-- bewusst breit lesbar sein müssen (jeder Screen listet Spieler mit Namen
-- auf) — Row-Level-Security kann aber keine einzelne Spalte ausblenden, nur
-- ganze Zeilen. Fix: access_code wandert in eigene Tabellen, nach demselben
-- Muster wie player_auth_links/viewer_auth_links (RLS an, aber bewusst KEINE
-- Policy definiert = kompletter Deny für den Client; erreichbar nur über
-- die SECURITY DEFINER Funktionen unten, die als Tabellenbesitzer laufen und
-- RLS damit umgehen).

create table public.player_access_codes (
  player_id uuid primary key references public.players (id) on delete cascade,
  access_code text not null unique
);

create table public.viewer_access_codes (
  viewer_id uuid primary key references public.viewers (id) on delete cascade,
  access_code text not null unique
);

insert into public.player_access_codes (player_id, access_code)
select id, access_code from public.players;

insert into public.viewer_access_codes (viewer_id, access_code)
select id, access_code from public.viewers;

alter table public.players drop column access_code;
alter table public.viewers drop column access_code;

alter table public.player_access_codes enable row level security;
alter table public.viewer_access_codes enable row level security;
-- Absichtlich keine Policies — RLS an + keine Policy blockt jeden direkten
-- Client-Zugriff (select/insert/update/delete), exakt wie player_auth_links.

-- generate_access_code() prüft Kollisionen jetzt gegen die neuen Tabellen
-- statt gegen die entfernten Spalten.
create or replace function public.generate_access_code(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_code text;
  v_attempt int := 0;
begin
  v_base := upper(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z]', '', 'g'));
  if length(v_base) < 3 then
    v_base := rpad(v_base, 3, 'X');
  end if;
  v_base := left(v_base, 3);

  loop
    v_code := v_base || lpad(floor(random() * 100)::int::text, 2, '0');
    exit when not exists (select 1 from public.player_access_codes where access_code = v_code)
      and not exists (select 1 from public.viewer_access_codes where access_code = v_code);
    v_attempt := v_attempt + 1;
    if v_attempt > 50 then
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit;
    end if;
  end loop;

  return v_code;
end;
$$;

-- Trainer-only: legt einen Spieler an und gibt Zeile + frisch generierten
-- Code als zwei Spalten zurück (statt wie vorher als Teil der players-Zeile,
-- die den Code ja jetzt nicht mehr enthält). Client: siehe PlayersAdmin.tsx.
create or replace function public.create_player(p_name text)
returns table (player public.players, access_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_code text;
begin
  if not public.is_trainer() then
    raise exception 'not_authorized';
  end if;

  v_code := public.generate_access_code(p_name);

  insert into public.players (name)
  values (trim(p_name))
  returning * into v_player;

  insert into public.player_access_codes (player_id, access_code) values (v_player.id, v_code);

  player := v_player;
  access_code := v_code;
  return next;
end;
$$;

-- Trainer-only: legt einen Betrachter an, analog zu create_player().
create or replace function public.create_viewer(p_name text)
returns table (viewer public.viewers, access_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer public.viewers;
  v_code text;
begin
  if not public.is_trainer() then
    raise exception 'not_authorized';
  end if;

  v_code := public.generate_access_code(p_name);

  insert into public.viewers (name)
  values (trim(p_name))
  returning * into v_viewer;

  insert into public.viewer_access_codes (viewer_id, access_code) values (v_viewer.id, v_code);

  viewer := v_viewer;
  access_code := v_code;
  return next;
end;
$$;

-- Trainer-only: mint einen frischen Code und entzieht wie bisher alle
-- verlinkten Geräte (siehe design note #2 in 0001_init.sql).
create or replace function public.regenerate_access_code(p_player_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_name text;
begin
  if not public.is_trainer() then
    raise exception 'not_authorized';
  end if;

  select name into v_name from public.players where id = p_player_id;
  if v_name is null then
    raise exception 'player_not_found';
  end if;

  v_code := public.generate_access_code(v_name);

  update public.player_access_codes set access_code = v_code where player_id = p_player_id;
  update public.players set auth_user_id = null where id = p_player_id;

  delete from public.player_auth_links where player_id = p_player_id;

  return v_code;
end;
$$;

create or replace function public.regenerate_viewer_access_code(p_viewer_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_name text;
begin
  if not public.is_trainer() then
    raise exception 'not_authorized';
  end if;

  select name into v_name from public.viewers where id = p_viewer_id;
  if v_name is null then
    raise exception 'viewer_not_found';
  end if;

  v_code := public.generate_access_code(v_name);

  update public.viewer_access_codes set access_code = v_code where viewer_id = p_viewer_id;
  delete from public.viewer_auth_links where viewer_id = p_viewer_id;

  return v_code;
end;
$$;

-- redeem_access_code()/redeem_viewer_code() lesen den Code jetzt über die
-- neue Tabelle statt über die entfernte Spalte.
create or replace function public.redeem_access_code(p_code text)
returns public.players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select p.* into v_player
  from public.players p
  join public.player_access_codes pac on pac.player_id = p.id
  where pac.access_code = upper(trim(p_code)) and p.is_active = true;

  if v_player.id is null then
    raise exception 'invalid_code';
  end if;

  insert into public.player_auth_links (auth_user_id, player_id)
  values (auth.uid(), v_player.id)
  on conflict (auth_user_id) do update set player_id = excluded.player_id, linked_at = now();

  update public.players set auth_user_id = auth.uid() where id = v_player.id;

  return v_player;
end;
$$;

create or replace function public.redeem_viewer_code(p_code text)
returns public.viewers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer public.viewers;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select v.* into v_viewer
  from public.viewers v
  join public.viewer_access_codes vac on vac.viewer_id = v.id
  where vac.access_code = upper(trim(p_code)) and v.is_active = true;

  if v_viewer.id is null then
    raise exception 'invalid_code';
  end if;

  insert into public.viewer_auth_links (auth_user_id, viewer_id)
  values (auth.uid(), v_viewer.id)
  on conflict (auth_user_id) do update set viewer_id = excluded.viewer_id, linked_at = now();

  return v_viewer;
end;
$$;

-- Trainer-only: liefert alle Spieler-/Betrachter-Codes für die Admin-Listen
-- (PlayersAdmin.tsx/ViewersAdmin.tsx zeigen dort weiterhin "Code: XY" an —
-- vorher direkt aus der players/viewers-Zeile, jetzt über diese RPCs).
create or replace function public.list_player_access_codes()
returns table (player_id uuid, access_code text)
language sql
stable
security definer
set search_path = public
as $$
  select pac.player_id, pac.access_code
  from public.player_access_codes pac
  where public.is_trainer();
$$;

create or replace function public.list_viewer_access_codes()
returns table (viewer_id uuid, access_code text)
language sql
stable
security definer
set search_path = public
as $$
  select vac.viewer_id, vac.access_code
  from public.viewer_access_codes vac
  where public.is_trainer();
$$;
