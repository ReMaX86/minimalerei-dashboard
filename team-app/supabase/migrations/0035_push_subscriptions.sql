-- Push-Benachrichtigungen: eine Zeile pro Gerät/Browser, das sich für
-- Benachrichtigungen angemeldet hat. user_id ist die auth.uid() der Session
-- (funktioniert einheitlich für Trainer, Spieler und Betrachter, da alle drei
-- Rollen über eine eigene Supabase-Auth-Session laufen, siehe AuthContext).
-- Der Versand selbst läuft server-seitig über den Service-Role-Key (siehe
-- README "Push-Benachrichtigungen"), der diese RLS-Policies umgeht.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions own" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Schaltbare Zusatzfunktion nach demselben Muster wie die übrigen Features
-- (Migration 0011) — standardmäßig aus, bis der Versand serverseitig
-- eingerichtet ist (siehe README "Push-Benachrichtigungen").
insert into public.feature_flags (key, enabled) values
  ('push_notifications', false);
