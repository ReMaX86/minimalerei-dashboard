-- Element 21 "Admin · Betrachter": Detailseite zeigt "Code wurde am DD.MM.
-- erzeugt", genau wie Element 15 "Admin · Spieler" (Migration 0068) — dort
-- wurde player_access_codes.created_at ergänzt, das spiegelbildliche
-- viewer_access_codes blieb dabei unangetastet. Gleicher Nachtrag hier,
-- additive Spalte, kein bestehendes Verhalten ändert sich: create_viewer()
-- befüllt sie automatisch über den Spalten-Default, regenerate_viewer_
-- access_code() setzt sie jetzt zusätzlich explizit neu.
alter table public.viewer_access_codes add column created_at timestamptz not null default now();

drop function if exists public.list_viewer_access_codes();

create function public.list_viewer_access_codes()
returns table (viewer_id uuid, access_code text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select vac.viewer_id, vac.access_code, vac.created_at
  from public.viewer_access_codes vac
  where public.is_trainer();
$$;

create or replace function public.regenerate_viewer_access_code(p_viewer_id uuid)
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

  select name into v_name from public.viewers where id = p_viewer_id;
  if v_name is null then
    raise exception 'viewer_not_found';
  end if;

  v_code := public.generate_access_code(v_name);

  update public.viewer_access_codes set access_code = v_code, created_at = now() where viewer_id = p_viewer_id;
  delete from public.viewer_auth_links where viewer_id = p_viewer_id;

  return v_code;
end;
$$;
