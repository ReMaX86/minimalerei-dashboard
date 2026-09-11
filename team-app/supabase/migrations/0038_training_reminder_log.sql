-- Protokoll, welche der drei Trainings-Erinnerungen einem Spieler für einen
-- konkreten Termin schon geschickt wurde — verhindert Mehrfachversand, wenn
-- der Check-Job (siehe README "Push-Benachrichtigungen") mehrfach in
-- kurzem Abstand läuft. Reiner Server-Zugriff (service_role), kein
-- Client-Zugriff nötig.
--
-- reminder_type ist die Position (slot_1/2/3), nicht der konkrete
-- Zeitabstand — die tatsächlichen Minutenwerte kommen aus
-- reminder_settings (Migration 0039) und sind im Admin änderbar; würde
-- reminder_type stattdessen z. B. wörtlich "1_hour" heißen, bräuchte eine
-- spätere Änderung des Abstands eine Migration der schon geloggten Zeilen.

create table public.training_reminder_log (
  training_id uuid not null references public.trainings(id) on delete cascade,
  session_date date not null,
  player_id uuid not null references public.players(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('slot_1', 'slot_2', 'slot_3')),
  sent_at timestamptz not null default now(),
  primary key (training_id, session_date, player_id, reminder_type)
);

alter table public.training_reminder_log enable row level security;
-- Bewusst keine Policies — nur der service_role-Key (umgeht RLS) greift
-- hierauf zu, siehe api/send-training-reminders.ts.

grant select, insert on public.training_reminder_log to service_role;
