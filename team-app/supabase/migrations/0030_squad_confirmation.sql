-- Kader-Bestätigung: ein Spieler, der im veröffentlichten Kader steht, kann
-- selbst zu- oder absagen. Bei Absage wird er automatisch aus dem Kader
-- entfernt (is_selected = false); der Trainer bekommt auf dem Dashboard
-- eine Meldung, solange er die Kader-Bearbeitung für dieses Spiel noch
-- nicht geöffnet hat.

alter table public.game_squad
  add column confirmation text not null default 'pending'
    check (confirmation in ('pending', 'confirmed', 'declined'));

alter table public.games
  add column squad_decline_pending boolean not null default false;

-- Security-definer statt offener RLS-Schreibrechte für game_squad: die
-- bestehende "game_squad write trainer"-Policy bleibt Trainer-only, ein
-- Spieler darf über diese Funktion ausschließlich seine EIGENE Zeile für
-- ein Spiel ändern, bei dem er tatsächlich (noch) im Kader steht.
create or replace function public.respond_to_squad(p_game_id uuid, p_confirmed boolean)
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
        is_selected = case when p_confirmed then is_selected else false end
    where game_id = p_game_id and player_id = v_player_id and is_selected = true;

  if not found then
    raise exception 'not_in_squad';
  end if;

  if not p_confirmed then
    update public.games set squad_decline_pending = true where id = p_game_id;
  end if;
end;
$$;
