-- Bugfix: Migration 0075 hat beim Wiederherstellen von "Absage entfernt
-- automatisch aus dem Kader" versehentlich auch die WHERE-Klausel wieder
-- auf `is_selected = true` verengt (statt nur die is_selected-Zuweisung
-- zurückzunehmen, wie im Kommentar dort beschrieben). Da eine Absage
-- is_selected selbst auf false setzt, konnte respond_to_squad() danach nie
-- wieder eine Zeile finden — "Doch dabei?" (Startseite) und "Doch wieder
-- dabei?" (eigene Kader-Zeile) scheiterten in echt immer mit
-- 'not_in_squad', obwohl der clientseitige Mock-Test das nicht gezeigt
-- hatte (er bildet nur die REST-Schicht nach, nicht die echte SQL-Logik
-- der RPC). Per direktem SQL-Test auf Staging nachgewiesen und hier
-- behoben: WHERE-Klausel wieder wie in Migration 0060 (`is_selected = true
-- or confirmation = 'declined'`), is_selected-Verhalten bleibt wie in 0075
-- (Absage setzt automatisch is_selected = false, eine erneute Zusage
-- rührt is_selected nicht an — ob der Platz zurückkommt, entscheidet der
-- Trainer).
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
      and (is_selected = true or confirmation = 'declined');

  if not found then
    raise exception 'not_in_squad';
  end if;

  if not p_confirmed then
    update public.games set squad_decline_pending = true where id = p_game_id;
  end if;
end;
$$;
