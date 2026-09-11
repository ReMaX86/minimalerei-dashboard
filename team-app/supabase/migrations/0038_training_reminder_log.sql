-- Protokoll, welche der drei Trainings-Erinnerungen (1 Tag / 1 Stunde /
-- 30 Minuten vorher) einem Spieler für einen konkreten Termin schon
-- geschickt wurde — verhindert Mehrfachversand, wenn der Check-Job
-- (siehe README "Push-Benachrichtigungen") mehrfach in kurzem Abstand
-- läuft. Reiner Server-Zugriff (service_role), kein Client-Zugriff nötig.

create table public.training_reminder_log (
  training_id uuid not null references public.trainings(id) on delete cascade,
  session_date date not null,
  player_id uuid not null references public.players(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('1_day', '1_hour', '30_min')),
  sent_at timestamptz not null default now(),
  primary key (training_id, session_date, player_id, reminder_type)
);

alter table public.training_reminder_log enable row level security;
-- Bewusst keine Policies — nur der service_role-Key (umgeht RLS) greift
-- hierauf zu, siehe api/send-training-reminders.ts.

grant select, insert on public.training_reminder_log to service_role;
