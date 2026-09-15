-- Dritte Benachrichtigungsart nach "neue Meldung" und der Training-
-- Erinnerung (siehe api/send-training-reminders.ts): erinnert Spieler mit
-- einer zugewiesenen Kampfgericht-Aufgabe (officiating_tasks.
-- assigned_player_id) an ihren Einsatz, zu bis zu drei Zeitpunkten vor
-- Spielbeginn (Default: 5 Tage / 1 Tag / 2 Stunden vorher, in Minuten
-- gespeichert wie beim Training — im Admin änderbar). Anders als beim
-- Training gibt es hier keine Zu-/Absage, die Aufgabe ist bereits vom
-- Trainer fest zugewiesen — die Erinnerung ist reine Gedächtnisstütze.
-- Dedupliziert wird deshalb pro einzelner Aufgabe (officiating_task_id),
-- nicht pro Spieler+Termin wie beim Training (eine Aufgabe hat ohnehin nur
-- einen zugewiesenen Spieler).
alter table public.reminder_settings
  add column officiating_push_offset_1_min integer not null default 7200,
  add column officiating_push_offset_2_min integer not null default 1440,
  add column officiating_push_offset_3_min integer not null default 120;

create table public.officiating_reminder_log (
  officiating_task_id uuid not null references public.officiating_tasks (id) on delete cascade,
  reminder_type text not null check (reminder_type in ('slot_1', 'slot_2', 'slot_3')),
  sent_at timestamptz not null default now(),
  primary key (officiating_task_id, reminder_type)
);

alter table public.officiating_reminder_log enable row level security;
-- Bewusst keine Policies — nur der service_role-Key (umgeht RLS) greift
-- hierauf zu, siehe api/send-officiating-reminders.ts.

grant select, insert on public.officiating_reminder_log to service_role;
grant select on public.officiating_games to service_role;
grant select on public.officiating_tasks to service_role;
