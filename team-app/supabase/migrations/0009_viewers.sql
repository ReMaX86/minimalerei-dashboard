-- Read-only "Betrachter" (viewer) role: for someone who is neither Spieler
-- noch Trainer (z. B. ein Abteilungsleiter), aber Spielplan und
-- Kampfgericht sehen soll — ohne Kader/Trikot-Zugriff und ohne jede
-- Schreibberechtigung.
--
-- Reuses the same access-code + anonymous-auth login mechanism as players
-- (see design note #1 in 0001_init.sql), mirrored into parallel
-- `viewers` / `viewer_auth_links` tables so viewer accounts stay fully
-- separate from the roster used for Kader/Trikot-Rotation/
-- Kampfgericht-Zuweisung. Every existing "select" RLS policy already
-- allows any authenticated user (`auth.uid() is not null`), so a viewer's
-- session automatically gets the same read access a player has — no
-- existing policy needs touching for that.

create table public.viewers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  access_code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.viewer_auth_links (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  viewer_id uuid not null references public.viewers (id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index viewer_auth_links_viewer_id_idx on public.viewer_auth_links (viewer_id);

alter table public.viewers enable row level security;
alter table public.viewer_auth_links enable row level security;

create policy "viewers select" on public.viewers for select
  using (auth.uid() is not null);
create policy "viewers write trainer" on public.viewers for all
  using (public.is_trainer())
  with check (public.is_trainer());

-- viewer_auth_links has no client-facing RLS policy by design (mirrors
-- player_auth_links) — all access goes through security-definer RPCs below.

create or replace function public.current_viewer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select viewer_id from public.viewer_auth_links where auth_user_id = auth.uid();
$$;

-- Widen generate_access_code()'s uniqueness check to cover both players
-- and viewers, so a code minted for one never collides with the other —
-- both are typed into the same "Zugangscode" field in the app.
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
    exit when not exists (select 1 from public.players where access_code = v_code)
      and not exists (select 1 from public.viewers where access_code = v_code);
    v_attempt := v_attempt + 1;
    if v_attempt > 50 then
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit;
    end if;
  end loop;

  return v_code;
end;
$$;

-- Trainer-only: create a viewer and mint their access code atomically.
create or replace function public.create_viewer(p_name text)
returns public.viewers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer public.viewers;
begin
  if not public.is_trainer() then
    raise exception 'not_authorized';
  end if;

  insert into public.viewers (name, access_code)
  values (trim(p_name), public.generate_access_code(p_name))
  returning * into v_viewer;

  return v_viewer;
end;
$$;

-- Trainer-only: mint a fresh code for a viewer and revoke every device
-- currently linked via the old code (mirrors regenerate_access_code).
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

  update public.viewers set access_code = v_code where id = p_viewer_id;
  delete from public.viewer_auth_links where viewer_id = p_viewer_id;

  return v_code;
end;
$$;

-- Called right after supabase.auth.signInAnonymously() with the code the
-- viewer typed in, once redeem_access_code() has already ruled out that
-- it's a player code. Separate RPC (rather than folding into
-- redeem_access_code) because that one returns a typed `players` row and
-- a viewer isn't one.
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

  select * into v_viewer
  from public.viewers
  where access_code = upper(trim(p_code)) and is_active = true;

  if v_viewer.id is null then
    raise exception 'invalid_code';
  end if;

  insert into public.viewer_auth_links (auth_user_id, viewer_id)
  values (auth.uid(), v_viewer.id)
  on conflict (auth_user_id) do update set viewer_id = excluded.viewer_id, linked_at = now();

  return v_viewer;
end;
$$;
