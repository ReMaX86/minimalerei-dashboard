-- Grundlage für die neue Live-Ticker-Push "Zwischenstand nach Viertel X":
-- reine Schema-/RPC-Änderung, kein Secret enthalten. Der eigentliche
-- Trigger, der den Push auslöst (braucht Domain + Webhook-Secret), wird wie
-- alle übrigen Push-Trigger von Hand im SQL Editor angelegt (siehe README
-- "Push-Benachrichtigungen"), bewusst nicht hier versioniert.

alter table public.games
  add column last_announced_quarter smallint not null default 0;

-- "Ratchet": setzt last_announced_quarter nur hoch, nie runter, und nur
-- beim allerersten Erreichen eines Viertels. Verhindert doppelte Pushes,
-- falls im Viertel-Umschalter aus Versehen vor- und wieder zurückgeklickt
-- wird (z. B. um einen spät erfassten Korb im vorherigen Viertel
-- nachzutragen). Gibt zurück, ob dies wirklich ein neuer Höchststand war
-- (true) oder das Viertel schon mal erreicht wurde (false) — daran
-- entscheidet der Trigger auf last_announced_quarter, ob gepusht wird.
create or replace function public.announce_quarter_score(p_game_id uuid, p_quarter smallint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_trainer() or public.current_player_id() is not null) then
    raise exception 'not_authorized';
  end if;

  update public.games
    set last_announced_quarter = p_quarter
    where id = p_game_id and p_quarter > last_announced_quarter;

  return found;
end;
$$;
