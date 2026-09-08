-- Spielerprofile: Foto, Position, Größe, Geburtsdatum (Alter wird daraus
-- berechnet statt separat gespeichert, damit es nicht veraltet), ein paar
-- feste Skill-Tags. Steht hinter dem "player_profiles"-Feature-Flag
-- (Migration 0011). Alle Felder sind optional/nullable.

alter table public.players
  add column position text,
  add column height_cm int,
  add column birth_date date,
  add column photo_url text,
  add column skills text[] not null default '{}';

-- Öffentlicher Bucket für Spielerfotos (öffentlich lesbar über die
-- Public-URL, damit die App keine signierten URLs verwalten muss — nur
-- Trainer dürfen Dateien hochladen/ändern/löschen).
insert into storage.buckets (id, name, public)
values ('player-photos', 'player-photos', true)
on conflict (id) do nothing;

create policy "player photos insert trainer" on storage.objects for insert
  with check (bucket_id = 'player-photos' and public.is_trainer());

create policy "player photos update trainer" on storage.objects for update
  using (bucket_id = 'player-photos' and public.is_trainer());

create policy "player photos delete trainer" on storage.objects for delete
  using (bucket_id = 'player-photos' and public.is_trainer());

insert into public.feature_flags (key, enabled) values ('player_profiles', false);
