-- Element 23 "Funktionen": aus Karten werden Zeilen, und vier bisher fest
-- eingebaute Bereiche werden nun genau wie die bestehenden Zusatzfunktionen
-- an-/abschaltbar — Kampfgericht, Trikots, Teamstatistik (Bestenliste) und
-- Erinnerungen. Alle vier hatten bisher gar keinen feature_flags-Eintrag
-- (liefen also fest im Code), deshalb hier bewusst NICHT mit "false" seeden
-- wie neue, opt-in Funktionen (Migration 0011/0013/...) — das würde sie für
-- alle bestehenden Teams beim Deploy sofort ausblenden. "officiating" und
-- "kits" sind heute ungated Pflichtreiter (Admin.tsx CORE_TABS, App.tsx-
-- Routen ohne Flag-Guard) -> true. "team_stats" ersetzt die bisher
-- unbedingte Anzeige von BestenlisteBoard innerhalb der Spielerprofile-Seite
-- -> ebenfalls true, sonst verschwindet die Bestenliste unangekündigt.
-- "reminders" übernimmt die Rolle von reminder_settings.enabled (siehe
-- Migration 0073, die die Spalte anschließend entfernt) -> deren aktueller
-- Wert wird 1:1 übernommen, damit keine bestehende Einstellung verloren geht.

insert into public.feature_flags (key, enabled) values
  ('officiating', true),
  ('kits', true),
  ('team_stats', true);

insert into public.feature_flags (key, enabled)
  select 'reminders', enabled from public.reminder_settings where id = 1;
