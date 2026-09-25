-- Auf Nutzerwunsch zurückgenommen: eine Absage soll den Spieler wieder
-- automatisch aus dem Kader nehmen (is_selected = false), statt dass der
-- Trainer den Haken manuell entfernen muss. Widerruft damit gezielt die in
-- Migration 0064 eingeführte Entscheidung — confirmation/decline_reason/
-- decline_note verhalten sich unverändert.
create or replace function public.respond_to_squad(
  p_game_id uuid,
  p_confirmed boolean,
  p_decline_reason text default null,
  p_decline_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid := public.current_player_id();
begin
  if v_player_id is null then
    raise exception 'not_a_player';
  end if;

  update public.game_squad
    set confirmation = case when p_confirmed then 'confirmed' else 'declined' end,
        decline_reason = case when p_confirmed then null else p_decline_reason end,
        decline_note = case when p_confirmed then null else p_decline_note end,
        is_selected = case when p_confirmed then is_selected else false end
    where game_id = p_game_id and player_id = v_player_id
      and is_selected = true;

  if not found then
    raise exception 'not_in_squad';
  end if;

  if not p_confirmed then
    update public.games set squad_decline_pending = true where id = p_game_id;
  end if;
end;
$$;
