-- Lets a player also hold trainer/admin rights (e.g. a playing coach), without
-- a second login. The person keeps their normal player access-code login and
-- sees the regular player home screen, but additionally gets the Admin tab
-- and every trainer-only permission.
--
-- Implementation: `is_trainer()` is the single function every RLS policy and
-- trainer-only RPC in this project already checks. Rather than touching each
-- of those individually, its definition is widened here to also return true
-- for a player flagged `is_admin` — every existing policy picks that up
-- automatically. Despite the name, treat it as "has trainer/admin rights"
-- from this migration on.

alter table public.players add column is_admin boolean not null default false;

create or replace function public.is_trainer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.trainers where id = auth.uid())
    or exists (
      select 1
      from public.player_auth_links pal
      join public.players p on p.id = pal.player_id
      where pal.auth_user_id = auth.uid() and p.is_admin
    );
$$;
