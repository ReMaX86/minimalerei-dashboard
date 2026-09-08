-- Spieler dürfen ihr eigenes Profilfoto, ihre Größe und ihr Geburtsdatum
-- selbst pflegen (bisher nur der Trainer über Admin -> Spieler). Bewusst
-- kein generelles UPDATE-Recht für Spieler auf players (RLS prüft nur
-- Zeilen, keine Spalten) — stattdessen eine security-definer RPC, die nur
-- genau diese drei Spalten der eigenen Zeile anfasst, damit ein Spieler
-- z. B. nicht sein eigenes is_admin/is_captain-Flag oder den Zugangscode
-- manipulieren kann.

create or replace function public.update_my_profile(
  p_height_cm int,
  p_birth_date date,
  p_photo_url text
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
    raise exception 'not_authorized';
  end if;

  update public.players
  set height_cm = p_height_cm,
      birth_date = p_birth_date,
      photo_url = p_photo_url
  where id = v_player_id;
end;
$$;

-- Für den Foto-Upload braucht der Storage-Client direkten INSERT/UPDATE-
-- Zugriff auf den Bucket (kein RPC möglich) — deshalb per Storage-Policy
-- auf den eigenen Dateinamen beschränkt: Dateien werden als
-- "<player_id>-<timestamp>.<ext>" abgelegt, die Policy prüft also den
-- Präfix gegen die eigene current_player_id().
create policy "player photos insert self" on storage.objects for insert
  with check (
    bucket_id = 'player-photos'
    and public.current_player_id() is not null
    and name like public.current_player_id()::text || '-%'
  );

create policy "player photos update self" on storage.objects for update
  using (
    bucket_id = 'player-photos'
    and public.current_player_id() is not null
    and name like public.current_player_id()::text || '-%'
  );
