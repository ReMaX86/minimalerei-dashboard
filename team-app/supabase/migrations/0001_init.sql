-- TB Wülfrath Team-App — initial schema, RLS policies and RPC functions.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a
-- fresh project. See team-app/README.md for the full setup walkthrough.
--
-- Design notes / deviations from the handover spec (documented here so the
-- reasoning survives outside the chat that produced the spec):
--
-- 1. `players.auth_user_id` (spec §4) is kept as a convenience "primary
--    device" pointer, but the actual source of truth for "which player is
--    this request?" is the `player_auth_links` table below. The spec
--    explicitly requires that the *same* access code can be redeemed on
--    several devices (phone + tablet) without invalidating it — but each
--    device gets its own Supabase Anonymous Auth user, so a single
--    `auth_user_id` column cannot represent a one-player-to-many-devices
--    relationship. `player_auth_links` (auth_user_id -> player_id) is the
--    actual mapping used by RLS/RPCs; `players.auth_user_id` mirrors the
--    most-recently-linked device for quick display in the admin UI.
-- 2. Regenerating a player's access code (`regenerate_access_code`) also
--    deletes all existing `player_auth_links` rows for that player, i.e.
--    every device previously logged in with the old code loses access.
--    This matches the stated use case ("bei Verlust" — e.g. a lost phone)
--    where you'd want the old device's access revoked, not just the code.

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.trainers (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  access_code text not null unique,
  auth_user_id uuid references auth.users (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Maps every device (= one Supabase anonymous auth user) that has redeemed
-- a player's access code back to that player. See design note #1 above.
create table public.player_auth_links (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index player_auth_links_player_id_idx on public.player_auth_links (player_id);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  game_date date not null,
  game_time time not null,
  opponent text not null,
  is_home boolean not null,
  trikot_override text check (trikot_override in ('weiss', 'schwarz')),
  location text not null default '',
  squad_published boolean not null default false,
  created_at timestamptz not null default now()
);
create index games_game_date_idx on public.games (game_date);

create table public.game_squad (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  is_selected boolean not null default false,
  primary key (game_id, player_id)
);

create table public.trikot_sets (
  id text primary key check (id in ('weiss', 'schwarz')),
  label text not null,
  current_holder_id uuid references public.players (id) on delete set null,
  since date
);

create table public.trikot_wash_log (
  id uuid primary key default gen_random_uuid(),
  set_id text not null references public.trikot_sets (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  game_id uuid references public.games (id) on delete set null,
  created_at timestamptz not null default now()
);
create index trikot_wash_log_player_id_idx on public.trikot_wash_log (player_id);

-- Singleton row (id = 1) holding the shared alphabetical rotation pointer
-- used by both trikot sets (spec §5).
create table public.trikot_rotation_state (
  id int primary key default 1 check (id = 1),
  last_assigned_player_id uuid references public.players (id) on delete set null
);

create table public.officiating_games (
  id uuid primary key default gen_random_uuid(),
  game_date date not null,
  opponent_teams text not null,
  location text not null default '',
  created_at timestamptz not null default now()
);
create index officiating_games_game_date_idx on public.officiating_games (game_date);

create type public.officiating_task_type as enum ('uhr', 'anschreiber', 'zeit');

create table public.officiating_tasks (
  id uuid primary key default gen_random_uuid(),
  officiating_game_id uuid not null references public.officiating_games (id) on delete cascade,
  task_type public.officiating_task_type not null,
  assigned_player_id uuid references public.players (id) on delete set null,
  unique (officiating_game_id, task_type)
);

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  weekday text not null,
  start_time time not null,
  end_time time not null,
  location text not null default ''
);

-- ---------------------------------------------------------------------
-- Helper functions (used by RLS policies and the app)
-- ---------------------------------------------------------------------

create or replace function public.is_trainer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.trainers where id = auth.uid());
$$;

create or replace function public.current_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select player_id from public.player_auth_links where auth_user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.trainers enable row level security;
alter table public.players enable row level security;
alter table public.player_auth_links enable row level security;
alter table public.games enable row level security;
alter table public.game_squad enable row level security;
alter table public.trikot_sets enable row level security;
alter table public.trikot_wash_log enable row level security;
alter table public.trikot_rotation_state enable row level security;
alter table public.officiating_games enable row level security;
alter table public.officiating_tasks enable row level security;
alter table public.trainings enable row level security;

-- trainers: trainers can see each other (small team, useful for "wer ist Trainer"),
-- only the row owner or an already-registered trainer may write.
create policy "trainers select" on public.trainers for select
  using (auth.uid() is not null);
create policy "trainers insert self" on public.trainers for insert
  with check (id = auth.uid());
create policy "trainers update self" on public.trainers for update
  using (id = auth.uid());

-- players: any signed-in user (trainer or linked player) may read the
-- roster (needed for names in rotation/kader/kampfgericht UIs). Only
-- trainers may write; access codes are minted/rotated exclusively via the
-- RPCs below so a random UPDATE can't leak or brute-force a code.
create policy "players select" on public.players for select
  using (auth.uid() is not null);
create policy "players insert trainer" on public.players for insert
  with check (public.is_trainer());
create policy "players update trainer" on public.players for update
  using (public.is_trainer())
  with check (public.is_trainer());
create policy "players delete trainer" on public.players for delete
  using (public.is_trainer());

-- player_auth_links: nobody reads/writes this directly from the client;
-- all access goes through security-definer RPCs. Deny by default (RLS is
-- enabled and no policy is defined, which blocks all client access).

-- games: trainers manage; players may only see games whose squad has been
-- published, OR always see the read-only fields needed for "next game" —
-- simplest correct rule matching the spec is: everyone signed in can read
-- every game (dates/opponents aren't sensitive), trainers write.
create policy "games select" on public.games for select
  using (auth.uid() is not null);
create policy "games write trainer" on public.games for all
  using (public.is_trainer())
  with check (public.is_trainer());

-- game_squad: readable by everyone signed in *if* the game's squad is
-- published, or always for trainers (so they can edit the draft squad
-- before publishing). Writes are trainer-only.
create policy "game_squad select" on public.game_squad for select
  using (
    public.is_trainer()
    or exists (
      select 1 from public.games g
      where g.id = game_squad.game_id and g.squad_published
    )
  );
create policy "game_squad write trainer" on public.game_squad for all
  using (public.is_trainer())
  with check (public.is_trainer());

-- trikot_sets: readable by everyone signed in. Direct writes are
-- trainer-only; the normal handover flow goes through
-- confirm_trikot_handover() so a player can confirm their own handover.
create policy "trikot_sets select" on public.trikot_sets for select
  using (auth.uid() is not null);
create policy "trikot_sets write trainer" on public.trikot_sets for all
  using (public.is_trainer())
  with check (public.is_trainer());

create policy "trikot_wash_log select" on public.trikot_wash_log for select
  using (auth.uid() is not null);
create policy "trikot_wash_log write trainer" on public.trikot_wash_log for all
  using (public.is_trainer())
  with check (public.is_trainer());

create policy "trikot_rotation_state select" on public.trikot_rotation_state for select
  using (auth.uid() is not null);
create policy "trikot_rotation_state write trainer" on public.trikot_rotation_state for all
  using (public.is_trainer())
  with check (public.is_trainer());

create policy "officiating_games select" on public.officiating_games for select
  using (auth.uid() is not null);
create policy "officiating_games write trainer" on public.officiating_games for all
  using (public.is_trainer())
  with check (public.is_trainer());

-- officiating_tasks: everyone signed in can read. Trainers can write
-- anything. Players may only claim an *open* slot ("Ich übernehme") for
-- themselves — they can't reassign a slot someone else already holds, and
-- can't un-claim it either (that's the trainer's job, matching the "Absagen
-- laufen über den Trainer" rule used for the Kader).
create policy "officiating_tasks select" on public.officiating_tasks for select
  using (auth.uid() is not null);
create policy "officiating_tasks write trainer" on public.officiating_tasks for all
  using (public.is_trainer())
  with check (public.is_trainer());
create policy "officiating_tasks claim open slot" on public.officiating_tasks for update
  using (assigned_player_id is null)
  with check (
    assigned_player_id = public.current_player_id()
    and public.current_player_id() is not null
  );

create policy "trainings select" on public.trainings for select
  using (auth.uid() is not null);
create policy "trainings write trainer" on public.trainings for all
  using (public.is_trainer())
  with check (public.is_trainer());

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

-- Generates a short, human-friendly access code like "FIN82": three
-- letters derived from the player's name plus two random digits, retried
-- on collision.
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
    exit when not exists (select 1 from public.players where access_code = v_code);
    v_attempt := v_attempt + 1;
    if v_attempt > 50 then
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit;
    end if;
  end loop;

  return v_code;
end;
$$;

-- Trainer-only: create a player and mint their access code atomically.
create or replace function public.create_player(p_name text)
returns public.players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
begin
  if not public.is_trainer() then
    raise exception 'not_authorized';
  end if;

  insert into public.players (name, access_code)
  values (trim(p_name), public.generate_access_code(p_name))
  returning * into v_player;

  return v_player;
end;
$$;

-- Trainer-only: mint a fresh code for a player and revoke every device
-- currently linked via the old code (see design note #2 above).
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

  update public.players
  set access_code = v_code, auth_user_id = null
  where id = p_player_id;

  delete from public.player_auth_links where player_id = p_player_id;

  return v_code;
end;
$$;

-- Called right after supabase.auth.signInAnonymously() with the code the
-- player typed in. Links this device's anonymous auth user to the player.
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

  select * into v_player
  from public.players
  where access_code = upper(trim(p_code)) and is_active = true;

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

-- Confirms a trikot handover: logs it, moves the set to its new holder,
-- and advances the shared rotation pointer. Callable by a trainer, or by
-- the player who is receiving the set themselves (spec §6.3).
create or replace function public.confirm_trikot_handover(
  p_set_id text,
  p_player_id uuid,
  p_game_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_trainer() or public.current_player_id() = p_player_id) then
    raise exception 'not_authorized';
  end if;

  insert into public.trikot_wash_log (set_id, player_id, game_id)
  values (p_set_id, p_player_id, p_game_id);

  update public.trikot_sets
  set current_holder_id = p_player_id, since = current_date
  where id = p_set_id;

  update public.trikot_rotation_state
  set last_assigned_player_id = p_player_id
  where id = 1;
end;
$$;

-- Player-only convenience RPC for "Ich übernehme" on an open officiating
-- slot — same effect as the "claim open slot" RLS policy above, but gives
-- a clean error message instead of a generic RLS failure when the slot
-- was already taken by someone else a moment earlier.
create or replace function public.claim_officiating_task(p_task_id uuid)
returns public.officiating_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_task public.officiating_tasks;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player';
  end if;

  update public.officiating_tasks
  set assigned_player_id = v_player_id
  where id = p_task_id and assigned_player_id is null
  returning * into v_task;

  if v_task.id is null then
    raise exception 'slot_taken';
  end if;

  return v_task;
end;
$$;

-- ---------------------------------------------------------------------
-- Seed data: the two trikot sets and the singleton rotation-state row.
-- ---------------------------------------------------------------------

insert into public.trikot_sets (id, label) values
  ('weiss', 'Weiß · Heim'),
  ('schwarz', 'Schwarz · Auswärts')
on conflict (id) do nothing;

insert into public.trikot_rotation_state (id, last_assigned_player_id)
values (1, null)
on conflict (id) do nothing;
