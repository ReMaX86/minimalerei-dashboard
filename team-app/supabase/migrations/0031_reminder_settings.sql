-- Konfigurierbare Fristen für automatische Erinnerungen auf der
-- Spieler-Startseite (Kader-Zusage, Training-Zusage, Kampfgericht-
-- Mindesteinsätze). Eine einzelne Einstellungs-Zeile statt einzelner
-- feature_flags-Booleans, da hier Zahlenwerte statt an/aus gebraucht werden.
-- "id integer primary key default 1 check (id = 1)" erzwingt, dass es
-- immer genau eine Zeile gibt (Singleton-Settings-Tabelle).

create table public.reminder_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  squad_reminder_days_before integer not null default 3,
  training_reminder_days_before integer not null default 1,
  officiating_season_min integer not null default 2
);

insert into public.reminder_settings (id) values (1);

alter table public.reminder_settings enable row level security;

create policy "reminder_settings select" on public.reminder_settings for select
  using (auth.uid() is not null);

create policy "reminder_settings write trainer" on public.reminder_settings for all
  using (public.is_trainer()) with check (public.is_trainer());

-- Manche U18-Spieler sind schon über ihre eigene U18-Mannschaft fürs
-- Kampfgericht eingeteilt und sollen daher von der Herren-Kampfgericht-
-- Erinnerung ausgenommen werden können (sie können trotzdem weiterhin
-- Positionen übernehmen, falls gewünscht — nur die Erinnerung entfällt).
alter table public.players
  add column officiating_exempt boolean not null default false;
