-- Trainer sollen im Admin sehen können, wer Push-Benachrichtigungen schon
-- aktiviert hat (siehe FeatureFlagsAdmin.tsx) — die bestehende Policy
-- erlaubt jedem Nutzer bisher nur die eigenen Zeilen. Zusätzliche Policy,
-- kombiniert per OR mit der bestehenden "own"-Policy (Postgres-RLS-
-- Standardverhalten für mehrere permissive Policies auf demselben Befehl).

create policy "push_subscriptions trainer read" on public.push_subscriptions for select
  using (public.is_trainer());
