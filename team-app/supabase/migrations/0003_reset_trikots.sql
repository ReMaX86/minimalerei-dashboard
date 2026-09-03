-- Trainer-only RPC to reset the trikot rotation back to its initial state
-- (no wash-log history, no current holders, rotation pointer cleared).
-- Used by the "Zurücksetzen" button in Admin -> Trikots, e.g. to clear out
-- test data.

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

  delete from public.trikot_wash_log;
  update public.trikot_sets set current_holder_id = null, since = null;
  update public.trikot_rotation_state set last_assigned_player_id = null where id = 1;
end;
$$;
