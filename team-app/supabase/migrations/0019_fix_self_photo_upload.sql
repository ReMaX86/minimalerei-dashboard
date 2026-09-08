-- Der Foto-Upload über "Mein Profil" schlug in Produktion mit
-- "new row violates row-level security policy" fehl. Vermutete Ursache:
-- die "self"-Policies aus Migration 0018 prüfen den Dateinamen über
-- current_player_id() — eine security-definer Funktion, die intern über
-- player_auth_links joint. Dieser Join scheint innerhalb einer
-- Storage-Policy (anderer Dienst als PostgREST) nicht zuverlässig
-- aufzulösen. Ersetzt durch das offizielle, deutlich einfachere
-- Supabase-Muster für Storage-RLS: ein Ordner-Präfix direkt anhand von
-- auth.uid() — kein Funktionsaufruf, kein Join, keine verschachtelte
-- RLS-Prüfung einer anderen Tabelle. Dateien landen jetzt unter
-- "<auth_user_id>/<timestamp>.<ext>" statt "<player_id>-<timestamp>.<ext>".

drop policy if exists "player photos insert self" on storage.objects;
drop policy if exists "player photos update self" on storage.objects;

create policy "player photos insert self" on storage.objects for insert
  with check (
    bucket_id = 'player-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "player photos update self" on storage.objects for update
  using (
    bucket_id = 'player-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );
