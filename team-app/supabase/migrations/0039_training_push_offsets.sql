-- Die drei Zeitpunkte der Trainings-Erinnerung (siehe
-- api/send-training-reminders.ts) waren zunächst fest im Code (1 Tag /
-- 1 Stunde / 30 Minuten) — jetzt im Admin unter Funktionen -> Erinnerungen
-- änderbar. In Minuten gespeichert (flexibler als z. B. "Tage" + "Stunden"
-- getrennt); 0 schaltet den jeweiligen Zeitpunkt ab.

alter table public.reminder_settings
  add column training_push_offset_1_min integer not null default 1440,
  add column training_push_offset_2_min integer not null default 60,
  add column training_push_offset_3_min integer not null default 30;
