-- Captain / Co-Captain: vom Trainer benannte Spieler mit ein paar
-- Sonderrechten, ohne einen eigenen Login/eine eigene Rolle einzuführen —
-- genau wie das bestehende is_admin-Flag bleiben sie ganz normale Spieler
-- mit ihrer persönlichen Startseite, nur mit zusätzlichen Rechten. Für den
-- Anfang: den nächsten Trikotwäscher bestimmen (bisher nur der betroffene
-- Spieler selbst und der Trainer/Admin) und auf der Startseite sehen, wer
-- beim nächsten Kampfgericht-Termin eingeteilt ist (bisher nur
-- Trainer/Admin/Betrachter).

alter table public.players
  add column is_captain boolean not null default false,
  add column is_co_captain boolean not null default false;

create or replace function public.is_captain_or_co_captain()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_captain or p.is_co_captain from public.players p where p.id = public.current_player_id()),
    false
  );
$$;

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
  if not (
    public.is_trainer()
    or public.current_player_id() = p_player_id
    or public.is_captain_or_co_captain()
  ) then
    raise exception 'not_authorized';
  end if;

  insert into public.trikot_wash_log (set_id, player_id, game_id)
  values (p_set_id, p_player_id, p_game_id);

  update public.trikot_sets
  set current_holder_id = p_player_id, since = current_date
  where id = p_set_id;
end;
$$;
