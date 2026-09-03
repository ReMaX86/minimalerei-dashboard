-- Switches the trikot rotation from an alphabetical "pointer" to a
-- wash-count-based one: the suggestion is now always whoever in the
-- current squad has washed the fewest times in total (tie-break
-- alphabetically), computed directly from trikot_wash_log. This makes the
-- `trikot_rotation_state` pointer table obsolete — dropped below.
--
-- Why: with the pointer approach, a player who gets declined (someone else
-- confirms in their place — see the ✓/✗ buttons in the app) could end up
-- waiting an unpredictable number of turns depending on alphabetical
-- position. With a wash-count approach, a declined player's count simply
-- stays unchanged, so they naturally stay at (or near) the front of the
-- queue and get suggested again next time, automatically, with no extra
-- bookkeeping needed.

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
end;
$$;

create or replace function public.reset_trikots()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then
    raise exception 'not_authorized';
  end if;

  delete from public.trikot_wash_log where true;
  update public.trikot_sets set current_holder_id = null, since = null where true;
end;
$$;

drop table if exists public.trikot_rotation_state;
