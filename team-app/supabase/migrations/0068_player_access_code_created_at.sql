-- Element 15 "Admin · Spieler": Detailseite zeigt "Code wurde am DD.MM.
-- erzeugt" — dafür fehlte bisher jede Zeitangabe, player_access_codes
-- speicherte nur player_id/access_code. Additive Spalte, kein bestehendes
-- Verhalten ändert sich: create_player() befüllt sie automatisch über den
-- Spalten-Default (INSERT ohne explizite created_at-Angabe), regenerate_
-- access_code() setzt sie jetzt zusätzlich explizit neu — ein neu
-- erzeugter Code zeigt danach "heute", nicht mehr das alte Datum.
alter table public.player_access_codes add column created_at timestamptz not null default now();

drop function if exists public.list_player_access_codes();

create function public.list_player_access_codes()
returns table (player_id uuid, access_code text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select pac.player_id, pac.access_code, pac.created_at
  from public.player_access_codes pac
  where public.is_trainer();
$$;

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

  update public.player_access_codes set access_code = v_code, created_at = now() where player_id = p_player_id;
  update public.players set auth_user_id = null where id = p_player_id;

  delete from public.player_auth_links where player_id = p_player_id;

  return v_code;
end;
$$;
