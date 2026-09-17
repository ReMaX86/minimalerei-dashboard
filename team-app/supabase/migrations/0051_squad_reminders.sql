-- Vierte Benachrichtigungsart nach "neue Meldung" (send-push.ts), Training-
-- (send-training-reminders.ts) und Kampfgericht-Erinnerung
-- (send-officiating-reminders.ts): erinnert Spieler, die für ein
-- veröffentlichtes Spiel im Kader stehen (game_squad.is_selected) und noch
-- nicht geantwortet haben (game_squad.confirmation = 'pending'), zu bis zu
-- drei Zeitpunkten vor Spielbeginn an ihre Kader-Zusage/-Absage.
--
-- Anders als beim Training/Kampfgericht sind die drei Zeitpunkte hier in
-- ganzen TAGEN vor Spielbeginn gedacht (Default: 5/3/1 Tage vorher), nicht
-- Stunden — trotzdem wie dort in Minuten gespeichert (5 Tage = 7200 Min.),
-- damit api/send-squad-reminders.ts dieselbe "X Minuten vor Spielbeginn"-
-- Schwellenlogik wie die anderen beiden Erinnerungsarten wiederverwenden
-- kann; nur die Admin-Eingabe rechnet in Tagen statt Stunden um.
--
-- Dedupliziert wie beim Training pro Spieler+Termin (hier: pro Spiel, da
-- ein Spiel anders als ein wiederkehrendes Training keinen weiteren
-- Termin-Schlüssel wie session_date braucht).
alter table public.reminder_settings
  add column squad_push_offset_1_min integer not null default 7200, -- 5 Tage
  add column squad_push_offset_2_min integer not null default 4320, -- 3 Tage
  add column squad_push_offset_3_min integer not null default 1440; -- 1 Tag

create table public.squad_reminder_log (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  reminder_type text not null check (reminder_type in ('slot_1', 'slot_2', 'slot_3')),
  sent_at timestamptz not null default now(),
  primary key (game_id, player_id, reminder_type)
);

alter table public.squad_reminder_log enable row level security;
-- Bewusst keine Policies — nur der service_role-Key (umgeht RLS) greift
-- hierauf zu, siehe api/send-squad-reminders.ts.

grant select, insert on public.squad_reminder_log to service_role;
-- games, players, player_auth_links, reminder_settings haben bereits einen
-- service_role-Grant (Migration 0037/0041) — nur game_squad fehlt noch.
grant select on public.game_squad to service_role;
