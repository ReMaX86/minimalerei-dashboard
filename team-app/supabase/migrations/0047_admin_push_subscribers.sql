-- "Wer hat Push aktiviert?" im Admin (PushSubscribersList.tsx) zeigte bisher
-- durchweg "Unbekannt": die Komponente hat player_auth_links/
-- viewer_auth_links direkt per Client-Query abgefragt, um deren
-- auth_user_id auf einen Spieler-/Betrachter-Namen aufzulösen — genau diese
-- beiden Tabellen haben aber laut Migration 0001 bewusst KEINE
-- client-seitige RLS-Policy (Zugriff nur über die security-definer
-- current_player_id()/current_viewer_id()-Funktionen, siehe AuthContext.tsx)
-- und liefern deshalb bei einer direkten Abfrage immer eine leere Liste,
-- egal wer fragt. Statt hierfür extra eine RLS-Policy auf diese sensiblen
-- Link-Tabellen zu öffnen (jeder Trainer könnte damit alle Zugangscode-
-- Zuordnungen abgreifen), eine einzelne security-definer RPC nur für genau
-- diesen Zweck: liefert ausschließlich (auth_user_id, Name, Rolle) für alle
-- Trainer/Spieler/Betrachter, nichts Sensibleres — und nur an Trainer.
create or replace function public.admin_push_subscribers()
returns table (auth_user_id uuid, name text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then
    raise exception 'not_authorized';
  end if;

  return query
    select t.id, t.name, 'Trainer'::text
    from public.trainers t
    union all
    select pal.auth_user_id, p.name, 'Spieler'::text
    from public.player_auth_links pal
    join public.players p on p.id = pal.player_id
    union all
    select val.auth_user_id, v.name, 'Betrachter'::text
    from public.viewer_auth_links val
    join public.viewers v on v.id = val.viewer_id;
end;
$$;

grant execute on function public.admin_push_subscribers() to authenticated;
