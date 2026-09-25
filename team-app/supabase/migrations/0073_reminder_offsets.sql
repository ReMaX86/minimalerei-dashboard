-- Element 23 "Funktionen", Rückfrage 3: die drei Erinnerungsarten
-- (Training/Kampfgericht/Kader-Zusage) hatten bisher je drei feste Spalten
-- in reminder_settings (training_push_offset_1/2/3_min usw., siehe
-- Migration 0039/0049/0051) — im neuen Design ist das stattdessen eine
-- Liste von bis zu drei frei hinzufüg-/entfernbaren Erinnerungen pro
-- Bereich. Eine Zeile pro tatsächlich gesetztem Zeitpunkt statt neun immer
-- vorhandener Spalten bildet das direkt ab; ein fehlender Zeitpunkt fehlt
-- dann einfach als Zeile, statt wie bisher als "0" gespeichert zu sein.
create table public.reminder_offsets (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('training', 'officiating', 'squad')),
  minutes_before integer not null check (minutes_before > 0),
  created_at timestamptz not null default now()
);

alter table public.reminder_offsets enable row level security;

create policy "reminder_offsets select" on public.reminder_offsets for select
  using (auth.uid() is not null);

create policy "reminder_offsets write trainer" on public.reminder_offsets for all
  using (public.is_trainer()) with check (public.is_trainer());

grant select on public.reminder_offsets to service_role;

-- Bestehende, tatsächlich gesetzte Werte (> 0) 1:1 übernehmen — 0 fiel
-- schon bisher praktisch nie an sich vor (Default-Werte aller drei
-- Bereiche sind > 0), fällt hier aber ohnehin automatisch weg, weil der
-- check (minutes_before > 0) eine 0-Zeile gar nicht zuließe.
insert into public.reminder_offsets (area, minutes_before)
  select 'training', training_push_offset_1_min from public.reminder_settings where id = 1 and training_push_offset_1_min > 0
  union all
  select 'training', training_push_offset_2_min from public.reminder_settings where id = 1 and training_push_offset_2_min > 0
  union all
  select 'training', training_push_offset_3_min from public.reminder_settings where id = 1 and training_push_offset_3_min > 0
  union all
  select 'officiating', officiating_push_offset_1_min from public.reminder_settings where id = 1 and officiating_push_offset_1_min > 0
  union all
  select 'officiating', officiating_push_offset_2_min from public.reminder_settings where id = 1 and officiating_push_offset_2_min > 0
  union all
  select 'officiating', officiating_push_offset_3_min from public.reminder_settings where id = 1 and officiating_push_offset_3_min > 0
  union all
  select 'squad', squad_push_offset_1_min from public.reminder_settings where id = 1 and squad_push_offset_1_min > 0
  union all
  select 'squad', squad_push_offset_2_min from public.reminder_settings where id = 1 and squad_push_offset_2_min > 0
  union all
  select 'squad', squad_push_offset_3_min from public.reminder_settings where id = 1 and squad_push_offset_3_min > 0;

alter table public.reminder_settings
  drop column training_push_offset_1_min,
  drop column training_push_offset_2_min,
  drop column training_push_offset_3_min,
  drop column officiating_push_offset_1_min,
  drop column officiating_push_offset_2_min,
  drop column officiating_push_offset_3_min,
  drop column squad_push_offset_1_min,
  drop column squad_push_offset_2_min,
  drop column squad_push_offset_3_min;

-- reminder_settings.enabled ist jetzt der feature_flags-Eintrag "reminders"
-- (Migration 0072 hat dessen aktuellen Wert schon übernommen) — die Spalte
-- selbst wird dadurch überflüssig.
alter table public.reminder_settings drop column enabled;

-- Die drei Log-Tabellen dedupliziertem bisher über ein festes
-- reminder_type in ('slot_1','slot_2','slot_3') — bei einer frei
-- veränderbaren Liste ist "Slot 2" aber kein stabiler Bezug mehr (er kann
-- durch Löschen/Hinzufügen einen anderen Zeitpunkt meinen als beim letzten
-- Versand). api/notify.ts speichert dort ab sofort die tatsächliche
-- Minutenzahl als Text (z. B. "1440") statt des Slot-Labels — das bleibt
-- über Löschen/Hinzufügen hinweg eindeutig. Alte "slot_1"-Zeilen sind damit
-- nur noch Verlaufsdaten ohne Bezug zu einer aktuellen Erinnerung, richten
-- aber keinen Schaden an (sie blockieren höchstens einen Versand, der ihren
-- exakten alten Minutenwert zufällig wieder träfe).
alter table public.training_reminder_log drop constraint training_reminder_log_reminder_type_check;
alter table public.officiating_reminder_log drop constraint officiating_reminder_log_reminder_type_check;
alter table public.squad_reminder_log drop constraint squad_reminder_log_reminder_type_check;
