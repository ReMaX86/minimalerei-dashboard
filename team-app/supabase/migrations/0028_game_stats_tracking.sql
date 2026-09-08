-- Live-Stats-Tracking während des Spiels (löst die bisherige manuelle
-- "Punkte pro Spieler"-Nacherfassung aus Migration 0016 ab): jede Aktion
-- (Korb, Rebound, Assist, ...) wird als einzelnes Event mit Viertel erfasst,
-- der Endstand ergibt sich automatisch daraus statt manuell gepflegt zu
-- werden. Zugriff bewusst nicht auf Trainer/Admin beschränkt — laut
-- Absprache trackt "wer gerade Zeit hat beim Spiel", also jeder Spieler
-- oder Trainer.
--
-- "Nur eine Person gleichzeitig" ist ein weicher Lock mit Herzschlag
-- (game_stat_sessions + die untenstehenden RPCs), kein harter Lock: wird
-- die Ansicht einfach verlassen/das Handy weggesteckt statt sauber
-- geschlossen, läuft der Lock nach 30s Funkstille automatisch ab, damit
-- niemand dauerhaft ausgesperrt bleibt. Ein anderer Nutzer kann außerdem
-- jederzeit aktiv "übernehmen".

drop policy "game_player_points select" on public.game_player_points;
drop policy "game_player_points write trainer" on public.game_player_points;
drop table public.game_player_points;

alter table public.games
  add column stats_finalized_at timestamptz;

create table public.game_stat_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  team text not null check (team in ('us', 'opponent')),
  player_id uuid references public.players (id) on delete set null,
  quarter smallint not null default 1 check (quarter >= 1),
  stat_type text not null check (stat_type in (
    'fg2_made', 'fg2_miss', 'fg3_made', 'fg3_miss', 'ft_made', 'ft_miss',
    'rebound', 'assist', 'steal', 'block', 'turnover', 'foul'
  )),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  constraint game_stat_events_player_matches_team check (
    (team = 'us' and player_id is not null) or (team = 'opponent' and player_id is null)
  ),
  -- Für den Gegner wird nur der Punktestand mitgezählt (kein eigener
  -- Box-Score) — daher dort nur die drei wurfrelevanten Stat-Typen.
  constraint game_stat_events_opponent_scoring_only check (
    team = 'us' or stat_type in ('fg2_made', 'fg3_made', 'ft_made')
  )
);
create index game_stat_events_game_id_idx on public.game_stat_events (game_id);

alter table public.game_stat_events enable row level security;

create policy "game_stat_events select" on public.game_stat_events for select
  using (auth.uid() is not null);

-- Absichtlich nicht auf den eigenen Kader oder Trainer beschränkt — jeder
-- Spieler oder Trainer darf für jedes Spiel Aktionen erfassen bzw. per
-- Undo wieder löschen. Welcher Account das gerade tut, klärt der weiche
-- Lock unten, nicht diese Policy.
create policy "game_stat_events write" on public.game_stat_events for all
  using (public.is_trainer() or public.current_player_id() is not null)
  with check (public.is_trainer() or public.current_player_id() is not null);

create or replace function public.recalc_game_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_game_id uuid := coalesce(new.game_id, old.game_id);
  us_points int;
  opponent_points int;
  event_count int;
begin
  select
    coalesce(sum(case when team = 'us' then
      case stat_type when 'fg2_made' then 2 when 'fg3_made' then 3 when 'ft_made' then 1 else 0 end
    else 0 end), 0),
    coalesce(sum(case when team = 'opponent' then
      case stat_type when 'fg2_made' then 2 when 'fg3_made' then 3 when 'ft_made' then 1 else 0 end
    else 0 end), 0),
    count(*)
    into us_points, opponent_points, event_count
    from public.game_stat_events
    where game_id = target_game_id;

  update public.games
    set final_score_us = case when event_count = 0 then null else us_points end,
        final_score_opponent = case when event_count = 0 then null else opponent_points end
    where id = target_game_id;

  return coalesce(new, old);
end;
$$;

create trigger game_stat_events_recalc_score
  after insert or delete on public.game_stat_events
  for each row execute function public.recalc_game_score();

create table public.game_stat_sessions (
  game_id uuid primary key references public.games (id) on delete cascade,
  holder_auth_id uuid not null,
  holder_name text not null,
  started_at timestamptz not null default now(),
  last_heartbeat timestamptz not null default now()
);

alter table public.game_stat_sessions enable row level security;

create policy "game_stat_sessions select" on public.game_stat_sessions for select
  using (auth.uid() is not null);

-- Kein direktes Schreiben — nur über die security-definer RPCs unten, damit
-- "eine Person gleichzeitig" serverseitig statt nur clientseitig gilt.
create policy "game_stat_sessions no direct write" on public.game_stat_sessions for all
  using (false) with check (false);

-- Versucht, den Lock für ein Spiel zu übernehmen: klappt, wenn er frei ist,
-- bereits mir gehört, seit >30s keinen Herzschlag hatte, oder p_force
-- gesetzt ist ("Trotzdem übernehmen"). Gibt danach immer den aktuellen
-- Lock-Stand zurück, inkl. is_me — so muss der Client nicht extra seine
-- eigene auth.uid() kennen, um zu erkennen ob die Übernahme geklappt hat.
create or replace function public.claim_stat_session(
  p_game_id uuid,
  p_holder_name text,
  p_force boolean default false
)
returns table (
  holder_name text,
  started_at timestamptz,
  last_heartbeat timestamptz,
  is_me boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.game_stat_sessions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into existing from public.game_stat_sessions gs where gs.game_id = p_game_id;

  if existing.game_id is null
     or existing.holder_auth_id = auth.uid()
     or existing.last_heartbeat < now() - interval '30 seconds'
     or p_force then
    insert into public.game_stat_sessions as s (game_id, holder_auth_id, holder_name, started_at, last_heartbeat)
    values (p_game_id, auth.uid(), p_holder_name, now(), now())
    on conflict (game_id) do update
      set holder_auth_id = excluded.holder_auth_id,
          holder_name = excluded.holder_name,
          started_at = case when s.holder_auth_id = excluded.holder_auth_id then s.started_at else excluded.started_at end,
          last_heartbeat = excluded.last_heartbeat;
  end if;

  return query
    select gs.holder_name, gs.started_at, gs.last_heartbeat, gs.holder_auth_id = auth.uid()
    from public.game_stat_sessions gs
    where gs.game_id = p_game_id;
end;
$$;

-- Rückgabewert = "halte ich den Lock noch?" — false heißt, jemand anderes
-- hat währenddessen übernommen; der Client soll dann die Eingabe sperren.
create or replace function public.heartbeat_stat_session(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.game_stat_sessions
    set last_heartbeat = now()
    where game_id = p_game_id and holder_auth_id = auth.uid();
  return found;
end;
$$;

create or replace function public.release_stat_session(p_game_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.game_stat_sessions
    where game_id = p_game_id and holder_auth_id = auth.uid();
$$;

create or replace function public.finalize_game_stats(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_trainer() or public.current_player_id() is not null) then
    raise exception 'not_authorized';
  end if;

  update public.games set stats_finalized_at = now() where id = p_game_id;
  delete from public.game_stat_sessions where game_id = p_game_id;
end;
$$;

-- Falls ein Spiel versehentlich zu früh abgeschlossen wurde — bewusst
-- Trainer/Admin-only, damit nicht jeder ein fertiges Ergebnis wieder
-- aufreißen kann.
create or replace function public.reopen_game_stats(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then
    raise exception 'not_authorized';
  end if;
  update public.games set stats_finalized_at = null where id = p_game_id;
end;
$$;
