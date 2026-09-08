-- Schwarzes Brett fürs Team: kurze Hinweise vom Trainer ("Training fällt
-- aus", "Neue Trikotgröße bestellen"), sichtbar für alle Rollen auf der
-- Startseite. Steht hinter dem "announcements"-Feature-Flag (Migration 0011).

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  pinned boolean not null default false,
  author_name text not null,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

create policy "announcements select" on public.announcements for select
  using (auth.uid() is not null);

create policy "announcements write trainer" on public.announcements for all
  using (public.is_trainer()) with check (public.is_trainer());
