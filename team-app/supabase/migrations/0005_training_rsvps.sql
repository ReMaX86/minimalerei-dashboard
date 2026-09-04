-- Training-Zu-/Absagen. `trainings` bleibt ein wöchentlich wiederkehrendes
-- Muster ohne eigene Datumszeilen (siehe Spec §4); die konkreten nächsten
-- Termine werden im Frontend aus Wochentag + Uhrzeit berechnet
-- (src/lib/trainingSchedule.ts). Eine Zu-/Absage hängt sich daher an die
-- Kombination (training_id, session_date) statt an eine eigene
-- Termin-Tabelle — spart es, für jede Woche händisch einen Termin
-- anzulegen.

create table public.training_rsvps (
  training_id uuid not null references public.trainings (id) on delete cascade,
  session_date date not null,
  player_id uuid not null references public.players (id) on delete cascade,
  is_attending boolean not null,
  created_at timestamptz not null default now(),
  primary key (training_id, session_date, player_id)
);
create index training_rsvps_lookup_idx on public.training_rsvps (training_id, session_date);

alter table public.training_rsvps enable row level security;

-- Jeder angemeldete Nutzer darf alle Zu-/Absagen lesen (Trainer will das
-- Team sehen, Spieler sehen wer sonst noch kommt).
create policy "training_rsvps select" on public.training_rsvps for select
  using (auth.uid() is not null);

-- Trainer dürfen uneingeschränkt schreiben (z. B. für einen Spieler
-- nachtragen).
create policy "training_rsvps write trainer" on public.training_rsvps for all
  using (public.is_trainer())
  with check (public.is_trainer());

-- Spieler dürfen nur ihre eigene Zu-/Absage anlegen bzw. ändern.
create policy "training_rsvps player insert own" on public.training_rsvps for insert
  with check (player_id = public.current_player_id());
create policy "training_rsvps player update own" on public.training_rsvps for update
  using (player_id = public.current_player_id())
  with check (player_id = public.current_player_id());
