-- Live-Test der Training-Erinnerung (api/send-training-reminders.ts) zeigte:
-- der service_role fehlten Leserechte auf reminder_settings & Co. — führte
-- bislang zu "permission denied", was der Endpunkt (vor dieser Migration
-- unbemerkt) genauso behandelte wie "Erinnerungen sind deaktiviert". Analog
-- zu Migration 0036 (push_subscriptions) hier für alle vom Erinnerungs-
-- Versand gelesenen Tabellen nachgeholt, damit ein frisches Projekt
-- (0001..0037 der Reihe nach) direkt funktioniert.

grant select on public.reminder_settings to service_role;
grant select on public.trainings to service_role;
grant select on public.training_overrides to service_role;
grant select on public.players to service_role;
grant select on public.feature_flags to service_role;
grant select on public.training_rsvps to service_role;
grant select on public.player_absences to service_role;
grant select on public.player_auth_links to service_role;
