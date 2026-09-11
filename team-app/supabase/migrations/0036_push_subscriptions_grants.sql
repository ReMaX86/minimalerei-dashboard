-- Live-Test von #107 zeigte: neue Tabellen bekommen bei diesem Projekt nicht
-- automatisch die üblichen Standard-Rechte für die service_role (führte zu
-- "permission denied for table push_subscriptions", 42501, beim Versand über
-- api/send-push.ts). Explizit nachgeholt, damit ein frisches Supabase-Projekt
-- (0001..0036 der Reihe nach ausgeführt) direkt funktioniert.

grant select, insert, update, delete on public.push_subscriptions to service_role;
