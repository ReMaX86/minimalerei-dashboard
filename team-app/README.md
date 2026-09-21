# TBW Team App

Team-Organisation für die TB Wülfrath Herren-Mannschaft: Trikot-Wäsche-Rotation, Kampfgericht-Einteilung,
Kader-Verwaltung und Spielplan/Trainingszeiten an einem Ort. PWA-fähig (add-to-homescreen).

Lebt als eigenständiges Projekt in diesem Unterordner, unabhängig vom Minimalerei-Dashboard
im Repo-Root (eigenes `package.json`, eigenes Vercel-Deployment mit Root Directory `team-app/`).

## Stack

- Frontend: Vite + React + TypeScript + Tailwind CSS, PWA via `vite-plugin-pwa`
- Backend: [Supabase](https://supabase.com) (Postgres + Auth + Realtime)
- Hosting: Vercel (Hobby-Tarif)

## Setup

### 1. Supabase-Projekt anlegen

1. Neues Projekt auf [supabase.com](https://supabase.com) erstellen (kostenloser Tarif reicht
   für ~20 Spieler locker aus).
2. Im SQL-Editor das Migrations-Skript `supabase/migrations/0001_init.sql` ausführen. Es legt
   alle Tabellen, RLS-Policies und RPC-Funktionen an und sät die beiden Trikot-Sets.
3. Unter **Authentication -> Providers**: **Anonymous Sign-Ins** aktivieren (wird für den
   Spieler-Login per Zugangscode benötigt).
4. Unter **Authentication -> Providers -> Email**: Magic Link/Passwort-Login ist standardmäßig
   aktiv; das reicht für den Trainer-Login.
5. Trainer-Account anlegen: In **Authentication -> Users** einen Nutzer per E-Mail/Passwort
   erstellen, dann im SQL-Editor:
   ```sql
   insert into public.trainers (id, name, email)
   values ('<user-id-aus-auth.users>', 'Vorname Nachname', 'trainer@example.com');
   ```
6. Unter **Authentication -> URL Configuration -> Redirect URLs** die Produktions-URL der App
   plus `/reset-password` eintragen (z. B. `https://team-app.vercel.app/reset-password`), sonst
   funktioniert der "Passwort vergessen"-Link im Trainer-Login nicht.

### 2. Lokale Entwicklung

```bash
cd team-app
cp .env.example .env
# .env mit den Werten aus Supabase Project Settings -> API befüllen
npm install
npm run dev
```

### 3. Tests & Build

```bash
npm test    # Vitest — u. a. die Trikot-Rotationslogik
npm run build
```

### 4. Deployment auf Vercel

1. Neues Vercel-Projekt aus diesem GitHub-Repo anlegen.
2. **Root Directory** auf `team-app` setzen (Project Settings -> General).
3. Environment Variables `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` setzen.
4. Framework wird automatisch als Vite erkannt (siehe `vercel.json`).

### 5. Supabase Keep-Alive

Kostenlose Supabase-Projekte pausieren nach 7 Tagen ohne API-Aktivität. Der Workflow
`.github/workflows/supabase-keepalive.yml` im Repo-Root pingt das Projekt alle 3 Tage an.
Dafür in den GitHub-Repo-Settings unter **Secrets and variables -> Actions** anlegen:

- `TBW_SUPABASE_URL`
- `TBW_SUPABASE_ANON_KEY`

### 6. Supabase Backup

Automatische Backups gibt es bei Supabase erst ab einem bezahlten Tarif — der Workflow
`.github/workflows/supabase-backup.yml` zieht deshalb täglich einen vollständigen
`pg_dump` (Schema + Daten) und legt ihn als GitHub-Actions-Artefakt ab (30 Tage
Aufbewahrung, danach automatisch gelöscht, kein zusätzlicher Dienst nötig). Dafür in den
GitHub-Repo-Settings unter **Secrets and variables -> Actions** anlegen:

- `TBW_SUPABASE_DB_URL` — der Verbindungsstring aus Supabase unter **Project Settings ->
  Database -> Connection string -> Session pooler** (nicht "Direct connection" — die ist
  von GitHub-Actions-Runnern aus oft nicht erreichbar, da nur per IPv6).

Manuell anstoßen: im Reiter **Actions** des Repos den Workflow "Supabase Database Backup
(TBW Team App)" auswählen und **Run workflow** klicken. Die fertigen Dumps liegen danach
im jeweiligen Workflow-Lauf unter "Artifacts" zum Download bereit.

Wiederherstellung im Notfall: heruntergeladenes Artefakt entpacken, dann
`psql "<Connection-String>" -f backup-YYYY-MM-DD.sql` gegen ein leeres/neues
Supabase-Projekt laufen lassen.

### 7. Push-Benachrichtigungen

Optionale Zusatzfunktion (Feature-Flag `push_notifications`, siehe Admin -> Funktionen) —
Spieler/Trainer/Betrachter können sich auf der Startseite für Benachrichtigungen anmelden und
bekommen z. B. bei einer neuen Meldung eine Push-Benachrichtigung aufs Gerät, auch wenn die
App gerade nicht offen ist (auf iPhone/iPad nur, wenn die App vorher per "Zum Home-Bildschirm"
hinzugefügt wurde — im normalen Safari-Tab unterstützt iOS keine Web-Push-Benachrichtigungen).

Läuft komplett kostenlos: kein Push-Dienst-Abo nötig (Web Push über VAPID-Schlüssel ist
Standard und kostenlos), Versand läuft über eine Vercel-Serverless-Function
(`api/send-push.ts`, im kostenlosen Hobby-Tarif enthalten) statt über eine Supabase Edge
Function, damit kein zusätzlicher CLI-/Dashboard-Zugriff aufs Supabase-Projekt nötig ist.

**Setup (mehrere Schritte, da drei verschiedene Dienste beteiligt sind):**

1. **Migrationen ausführen**: `supabase/migrations/0035_push_subscriptions.sql` und
   `0036_push_subscriptions_grants.sql` im SQL-Editor laufen lassen (legen die Tabelle für die
   Geräte-Anmeldungen, das Feature-Flag und die nötigen Zugriffsrechte für die service_role an
   — ohne `0036` schlägt der Versand später mit `permission denied for table
   push_subscriptions` fehl, das war beim ersten Live-Test der Fall).
2. **VAPID-Schlüsselpaar erzeugen** (einmalig, z. B. lokal mit
   `npx web-push generate-vapid-keys`): liefert einen Public und einen Private Key.
3. **Vercel Environment Variables** setzen (Project Settings -> Environment Variables):
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — das eben erzeugte Schlüsselpaar.
   - `VAPID_SUBJECT` — `mailto:` + eine erreichbare Kontakt-E-Mail-Adresse (Pflichtangabe
     der Push-Dienste, z. B. von Apple/Google, falls mal etwas schiefläuft).
   - `SUPABASE_SERVICE_ROLE_KEY` — aus Supabase unter **Project Settings -> API Keys** (bei
     neueren Projekten der `sb_secret_...`-Wert unter "Secret keys"; alternativ der klassische
     `service_role`-Key unter dem Tab "Legacy anon, service_role API keys" — beide
     funktionieren, entscheidend ist Schritt 1/Migration `0036`). Geheim halten — dieser Key
     umgeht alle RLS-Policies, deshalb nur als Server-Env-Var, nie im Frontend.
   - `PUSH_WEBHOOK_SECRET` — ein selbst ausgedachtes langes Zufallspasswort, sichert den
     `/api/send-push`-Endpunkt gegen fremde Aufrufe ab.
4. **`VITE_VAPID_PUBLIC_KEY`** zusätzlich (!) als Vercel-Env-Var setzen, mit demselben
   Public-Key-Wert aus Schritt 2 — landet ausdrücklich im Frontend-Bundle (der Public Key ist
   dafür gedacht, ist also unbedenklich), wird beim Anmelden fürs Abonnieren gebraucht. Vercel
   warnt bei einem `VITE_`-Namen, dass er öffentlich sichtbar wird ("change the variable to
   Config") — das ist hier gewollt, Präfix nicht entfernen.
5. **Vercel Deployment Protection prüfen** (Settings -> Deployment Protection): Falls
   "Require Log In" / "Vercel Authentication" aktiv ist und keine eigene Domain (Custom Domain)
   eingerichtet ist, blockiert das auch Aufrufe von außen (z. B. vom Trigger in Schritt 6) mit
   einem 401 — ohne eigene Domain den Schalter **ausschalten**. Mit eigener Domain reicht
   "Standard Protection" (schützt nur die `*.vercel.app`-Adresse, nicht die Custom Domain).
6. **Datenbank-Trigger anlegen**, der bei jeder neuen Meldung `api/send-push.ts` aufruft. Die
   naheliegende Supabase-UI dafür (Database -> Webhooks -> Create a new hook) schlug beim
   ersten Live-Test mit `ERROR: 3F000: schema "supabase_functions" does not exist` fehl (ein
   Supabase-seitiges Infrastruktur-Problem, nicht projektspezifisch behebbar) — funktioniert hat
   stattdessen derselbe Effekt direkt per SQL über die `pg_net`-Extension (im SQL-Editor prüfen,
   ob `pg_net` unter Database -> Extensions aktiviert ist, dann):
   ```sql
   create or replace function public.notify_new_announcement()
   returns trigger
   language plpgsql
   security definer
   set search_path = public
   as $$
   begin
     perform net.http_post(
       url := 'https://<deine-vercel-domain>/api/send-push',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-webhook-secret', '<derselbe Wert wie PUSH_WEBHOOK_SECRET>'
       ),
       body := jsonb_build_object(
         'type', 'INSERT',
         'table', 'announcements',
         'record', to_jsonb(new)
       )
     );
     return new;
   end;
   $$;

   create trigger announcements_notify_push
   after insert on public.announcements
   for each row execute function public.notify_new_announcement();
   ```
   Achtung: die Vercel-Domain hier ist die tatsächlich genutzte Produktions-Domain (in Vercel
   unter dem Projekt sichtbar) — nicht zwangsläufig identisch mit der ersten/automatisch
   vergebenen `*.vercel.app`-Adresse, davon kann es pro Projekt mehrere geben.
7. Danach im **Admin -> Funktionen** das Feature `Push-Benachrichtigungen` aktivieren — erst
   jetzt taucht die Opt-in-Karte auf der Startseite überhaupt auf.

Zum Testen: eine neue Meldung im Admin veröffentlichen, während mindestens ein Gerät
Benachrichtigungen aktiviert hat. Zum Debuggen zeigt
```sql
select status_code, content, created from net._http_response order by created desc limit 5;
```
im SQL-Editor die letzten Aufrufe von Schritt 6 inkl. etwaiger Fehlermeldungen.

**Weitere Benachrichtigungsart: Training-Erinnerung.** Erinnert Spieler per Push, die für den
nächsten Trainingstermin noch nicht geantwortet haben — zu bis zu drei Zeitpunkten vor
Trainingsbeginn (Default: 1 Tag, 1 Stunde, 30 Minuten vorher; **im Admin unter Funktionen ->
Erinnerungen -> "Push-Erinnerung fürs Training" in Stunden änderbar (Nachkommastellen erlaubt,
z. B. 0,5 für 30 Minuten), 0 = abgeschaltet**),
unabhängig voneinander: ein Spieler kann bis zu drei Erinnerungen für denselben Termin
bekommen, sofern er bis dahin nicht geantwortet hat. `training_reminder_log` (Migration `0038`)
verhindert Mehrfachversand derselben Erinnerungsart für denselben Termin, auch wenn der Check
mehrfach läuft.

Anders als "neue Meldung" gibt es hier keine einzelne auslösende Zeile — der Versand läuft über
`api/send-training-reminders.ts`, aufgerufen von **`pg_cron`** direkt in Supabase (nicht per
GitHub-Actions-Cron: für ein 30-Minuten-Fenster bräuchte es einen Check alle 10–15 Minuten, das
hätte auf Dauer das kostenlose GitHub-Actions-Minutenkontingent gesprengt — `pg_cron` läuft
dagegen kostenlos direkt in der Datenbank, ohne separate Abrechnung pro Aufruf). Setup
zusätzlich zu den Schritten oben:

1. **`pg_cron`-Erweiterung aktivieren**: Database -> Extensions -> nach `pg_cron` suchen ->
   aktivieren (analog zu `pg_net` weiter oben).
2. **Cron-Job anlegen**, im SQL-Editor (läuft alle 10 Minuten, ruft `api/send-training-reminders`
   auf):
   ```sql
   select cron.schedule(
     'training-reminders',
     '*/10 * * * *',
     $$
     select net.http_post(
       url := 'https://<deine-vercel-domain>/api/send-training-reminders',
       headers := jsonb_build_object('x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>')
     );
     $$
   );
   ```
3. Kein weiteres Setup nötig — nutzt dieselben Vercel-Env-Vars (VAPID, Service-Role-Key) wie
   "neue Meldung".

Manuell/testweise auslösen, ohne auf den nächsten `pg_cron`-Lauf zu warten, per SQL:
```sql
select net.http_post(
  url := 'https://<deine-vercel-domain>/api/send-training-reminders',
  headers := jsonb_build_object('x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>')
);
```
Läuft der `pg_cron`-Job noch nicht (nur der manuelle Aufruf), gibt es kein 30-Minuten-Fenster —
nur der jeweils exakte Moment beim manuellen Aufruf zählt als "fällig".

Den Cron-Job wieder entfernen: `select cron.unschedule('training-reminders');`

**Weitere Benachrichtigungsart: Kampfgericht-Erinnerung** (Migration `0049`,
`api/send-officiating-reminders.ts`). Erinnert Spieler mit einer zugewiesenen
Kampfgericht-Aufgabe (`officiating_tasks.assigned_player_id`) an ihren Einsatz — zu bis zu drei
Zeitpunkten vor Spielbeginn (Default: 5 Tage, 1 Tag, 2 Stunden vorher; **im Admin unter
Funktionen -> Erinnerungen -> "Push-Erinnerung fürs Kampfgericht" in Stunden änderbar, 0 =
abgeschaltet**). Anders als bei der Training-Erinnerung gibt es hier keine Zu-/Absage — die
Aufgabe ist bereits vom Trainer fest zugewiesen, die Erinnerung ist reine Gedächtnisstütze.
`officiating_reminder_log` dedupliziert deshalb direkt pro einzelner Aufgabe
(`officiating_task_id` + `reminder_type`), nicht pro Spieler+Termin wie beim Training — eine
Aufgabe hat ohnehin nur einen zugewiesenen Spieler. Technisch auch sonst eng an die
Training-Erinnerung angelehnt (bewusste Kopien statt lokaler Imports, siehe dortige Begründung):
dieselbe `berlinTimeToUtc()`-Zeitzonen-Umrechnung, derselbe Claim-vor-Versand-Mechanismus gegen
doppelten Versand bei überlappenden `pg_cron`-Durchläufen, derselbe personalisierte Push-Text
ohne Zeitpunkt-Hinweis (z. B. "Kampfgericht Sa. 15:00 Uhr" / "Marc, du bist für '24-Sekunden-Uhr'
eingeteilt (TBW vs. BC Beispielstadt)."). Ein wichtiger struktureller Unterschied zur
Training-Erinnerung: dort gibt es nur einen einzelnen "nächsten Termin", hier dagegen potenziell
mehrere unabhängige Spiele mit je eigenen fälligen Aufgaben in einem einzigen Durchlauf — die
Fälligkeitsprüfung läuft deshalb über jedes anstehende Spiel mit gesetzter Uhrzeit einzeln.
Spiele ohne eingetragene Uhrzeit (`officiating_games.game_time` ist nullable) werden dabei
übersprungen, da sich ohne Uhrzeit keine "X Stunden vorher"-Schwelle berechnen lässt.

**Nachtrag:** Damit dieser stille Lücken-Fall bei neuen Terminen gar nicht erst entsteht, ist
die Uhrzeit im Formular "Neuer Kampfgericht-Termin" (`OfficiatingAdmin.tsx`) seit diesem
Nachtrag ein Pflichtfeld (`<TimeField required>`, analog zum bereits vorhandenen `required`
beim Datum). Bestehende Termine ohne Uhrzeit sind davon nicht betroffen und bleiben nullable —
das Feld war zum Zeitpunkt dieser Änderung laut Prüfung des Nutzers bei allen bisherigen
Terminen ohnehin schon ausgefüllt.

Setup zusätzlich zu den Schritten oben — derselbe `pg_cron`-Job-Takt reicht aus, nur ein
zweiter `cron.schedule(...)`-Eintrag mit dieser URL (dieselben Vercel-Env-Vars, kein neues
Secret nötig):
```sql
select cron.schedule(
  'officiating-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<deine-vercel-domain>/api/send-officiating-reminders',
    headers := jsonb_build_object('x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>')
  );
  $$
);
```
Manuell/testweise auslösen: derselbe `net.http_post`-Aufruf wie oben, nur mit
`/api/send-officiating-reminders` als URL. Wieder entfernen:
`select cron.unschedule('officiating-reminders');`

**Fünfte Benachrichtigungsart: Kader-Zusage-Erinnerung** (Migration `0051`,
`api/send-squad-reminders.ts`). Erinnert Spieler, die für ein veröffentlichtes Spiel im Kader
stehen (`game_squad.is_selected`) und noch nicht geantwortet haben (`game_squad.confirmation
= 'pending'`), an ihre Zu-/Absage — zu bis zu drei Zeitpunkten vor Spielbeginn (Default: 5
Tage/3 Tage/1 Tag vorher; **im Admin unter Funktionen -> Erinnerungen -> "Push-Erinnerung für
Kader-Zusage" in ganzen Tagen änderbar, 0 = abgeschaltet**). Anders als bei den anderen beiden
Push-Erinnerungen ist die Eingabe hier bewusst in Tagen statt Stunden (`minutesToDaysStr`/
`daysStrToMinutes` in `FeatureFlagsAdmin.tsx`) — gespeichert wird trotzdem in Minuten wie bei
Training/Kampfgericht (5 Tage = 7200 Minuten), damit dieselbe "X Minuten vor Spielbeginn"-
Schwellenlogik wiederverwendet werden kann. Technisch eng an die Kampfgericht-Erinnerung
angelehnt (bewusste Kopien statt lokaler Imports, siehe dortige Begründung): dieselbe
`berlinTimeToUtc()`-Zeitzonen-Umrechnung, derselbe Claim-vor-Versand-Mechanismus gegen
doppelten Versand, dieselbe "mehrere unabhängige Spiele in einem Durchlauf"-Struktur wie beim
Kampfgericht (nicht die einzelne "nächster Termin"-Ermittlung wie beim Training). Dedupliziert
wird wie beim Training pro Spieler+Termin (`squad_reminder_log`: `game_id` + `player_id` +
`reminder_type`) — hier ohne zusätzlichen `session_date`-Schlüssel, da ein Spiel anders als ein
wiederkehrendes Training nur einmal stattfindet.

Setup zusätzlich zu den Schritten oben — derselbe `pg_cron`-Job-Takt reicht aus, nur ein
weiterer `cron.schedule(...)`-Eintrag mit dieser URL (dieselben Vercel-Env-Vars, kein neues
Secret nötig):
```sql
select cron.schedule(
  'squad-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<deine-vercel-domain>/api/send-squad-reminders',
    headers := jsonb_build_object('x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>')
  );
  $$
);
```
Manuell/testweise auslösen: derselbe `net.http_post`-Aufruf wie oben, nur mit
`/api/send-squad-reminders` als URL. Wieder entfernen:
`select cron.unschedule('squad-reminders');`

**Drei weitere Benachrichtigungsarten: Training abgesagt, Kader veröffentlicht,
Kader-Absage.** Alle drei nach demselben Muster wie "neue Meldung" — je ein eigener
Datenbank-Trigger (INSERT/UPDATE) ruft eine eigene, in sich geschlossene Vercel-Function auf.
"Training abgesagt" und "Kader veröffentlicht" gehen an **alle** mit aktivierten
Benachrichtigungen, "Kader-Absage" nur an **Trainer**. Setup zusätzlich zu den Schritten oben
(dieselben Vercel-Env-Vars, kein neues Secret nötig):

```sql
-- Training abgesagt (einzelner Tag oder ganze Ferienzeit im Modus "Fällt aus")
create or replace function public.notify_training_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mode = 'cancelled' then
    perform net.http_post(
      url := 'https://<deine-vercel-domain>/api/send-training-cancelled',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>'),
      body := jsonb_build_object('record', jsonb_build_object('start_date', new.start_date, 'end_date', new.end_date, 'note', new.note))
    );
  end if;
  return new;
end;
$$;

create trigger training_overrides_notify_cancelled
after insert on public.training_overrides
for each row execute function public.notify_training_cancelled();

-- Kader veröffentlicht (squad_published wechselt auf true)
create or replace function public.notify_squad_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.squad_published = true and coalesce(old.squad_published, false) = false then
    perform net.http_post(
      url := 'https://<deine-vercel-domain>/api/send-squad-published',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>'),
      body := jsonb_build_object('record', jsonb_build_object('opponent', new.opponent, 'game_date', new.game_date))
    );
  end if;
  return new;
end;
$$;

create trigger games_notify_squad_published
after update on public.games
for each row execute function public.notify_squad_published();

-- Kader-Absage (confirmation wechselt auf 'declined') — nur an Trainer
create or replace function public.notify_squad_decline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.confirmation = 'declined' and coalesce(old.confirmation, '') is distinct from 'declined' then
    perform net.http_post(
      url := 'https://<deine-vercel-domain>/api/send-squad-decline',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>'),
      body := jsonb_build_object('record', jsonb_build_object('game_id', new.game_id, 'player_id', new.player_id))
    );
  end if;
  return new;
end;
$$;

create trigger game_squad_notify_decline
after update on public.game_squad
for each row execute function public.notify_squad_decline();
```

Zusätzliche `service_role`-Rechte dafür (Migration `0041`): `games`, `trainers` (`players` und
`push_subscriptions` waren bereits berechtigt).

**Sechste Benachrichtigungsart: Kader-Nachnominierung.** Wird ein Spieler nach bereits
veröffentlichtem Kader neu aufgenommen (z. B. weil jemand anders abgesagt hat und der Trainer
ihn nachnominiert), bekommt genau dieser Spieler eine Push — nicht alle wie bei "Kader
veröffentlicht". Derselbe `game_squad`-Trigger wie bei "Kader-Absage" (ein Trigger pro Tabelle
reicht, ruft aber zwei verschiedene Functions auf):

```sql
create or replace function public.notify_squad_nomination()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  was_selected boolean := false;
begin
  -- OLD bewusst nur bei UPDATE lesen: bei INSERT ist OLD noch gar nicht
  -- zugewiesen, ein direkter Zugriff (auch per coalesce(old.x, ...)) bricht
  -- dann mit "record 'old' is not assigned yet" ab — live so aufgefallen,
  -- weil eine Erstaufnahme (kein vorheriger game_squad-Eintrag) genau das ist.
  if TG_OP = 'UPDATE' then
    was_selected := coalesce(old.is_selected, false);
  end if;

  if new.is_selected = true and not was_selected then
    perform net.http_post(
      url := 'https://<deine-vercel-domain>/api/send-squad-nomination',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>'),
      body := jsonb_build_object('record', jsonb_build_object('game_id', new.game_id, 'player_id', new.player_id, 'is_selected', new.is_selected))
    );
  end if;
  return new;
end;
$$;

create trigger game_squad_notify_nomination
after insert or update on public.game_squad
for each row execute function public.notify_squad_nomination();
```

Ob der Kader zum Zeitpunkt der Aufnahme schon veröffentlicht war, prüft
`api/send-squad-nomination.ts` selbst (Feld `games.squad_published`) — wird ein Spieler während
der ursprünglichen Kader-Zusammenstellung ausgewählt (Kader noch nicht veröffentlicht), soll das
noch keine Push auslösen, das übernimmt erst "Kader veröffentlicht" für alle auf einmal. Keine
zusätzlichen `service_role`-Rechte nötig — `games`, `players` und `player_auth_links` waren
bereits berechtigt.

**Siebte und achte Benachrichtigungsart: Live-Ticker während des Spiels.** Im Live-Stats-Tracker
(`GameStatsTracker.tsx`) löst der Wechsel in ein neues Viertel (Q2/Q3/Q4) automatisch eine Push
mit dem aktuellen Gesamtstand des soeben beendeten Viertels aus, "Spiel beenden" eine Push mit
Endstand und Sieg/Niederlage/Unentschieden. Beide gehen an alle mit aktivierten Push-
Benachrichtigungen. Die Dedupe-Logik gegen versehentliches Vor-/Zurückklicken im
Viertel-Umschalter (`announce_quarter_score`, "Ratchet" auf `games.last_announced_quarter`) ist
bereits über Migration `0042` eingerichtet — hier nur noch die zwei Trigger anlegen:

```sql
-- Zwischenstand nach Viertel X (last_announced_quarter steigt)
create or replace function public.notify_quarter_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_announced_quarter > coalesce(old.last_announced_quarter, 0) then
    perform net.http_post(
      url := 'https://<deine-vercel-domain>/api/send-quarter-score',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>'),
      body := jsonb_build_object('record', jsonb_build_object('game_id', new.id, 'quarter', new.last_announced_quarter))
    );
  end if;
  return new;
end;
$$;

create trigger games_notify_quarter_score
after update on public.games
for each row execute function public.notify_quarter_score();

-- Spiel beendet (stats_finalized_at wechselt von null auf einen Zeitstempel)
create or replace function public.notify_game_finished()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stats_finalized_at is not null and old.stats_finalized_at is null then
    perform net.http_post(
      url := 'https://<deine-vercel-domain>/api/send-game-finished',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>'),
      body := jsonb_build_object('record', jsonb_build_object('game_id', new.id))
    );
  end if;
  return new;
end;
$$;

create trigger games_notify_finished
after update on public.games
for each row execute function public.notify_game_finished();
```

`games` hat jetzt mehrere `after update`-Trigger gleichzeitig (auch `games_notify_squad_published`
aus dem vorherigen Abschnitt) — das ist unproblematisch, Postgres feuert bei einem `UPDATE` alle
passenden Trigger, jeder prüft selbst per `IF`, ob seine jeweilige Spalte sich geändert hat.
Bewusst kein Push bei Wechsel in die Verlängerung (OT) — dafür müsste zuerst geklärt werden, wie
oft/ob das überhaupt gewünscht ist; der finale Stand inklusive OT kommt ohnehin über "Spiel
beendet". Keine zusätzlichen `service_role`-Rechte nötig — `games` und `push_subscriptions` waren
bereits berechtigt.

Zusätzlich: "Spiel beenden" fragt jetzt erst per Bestätigungsdialog nach ("Spiel wirklich
beenden? ..."), bevor `finalize_game_stats()` aufgerufen wird — ein versehentlicher Tap beendet
die Erfassung nicht mehr sofort.

**Beide Live-Ticker-Functions testweise nur an sich selbst schicken.** Praktisch, um vor einem
echten Spiel zu testen, ohne die ganze Mannschaft/Eltern mit Test-Pushes zu stören: beide
Payloads akzeptieren ein zusätzliches, rein manuelles Feld `test_user_id` — ist es gesetzt, geht
die Push nur an diese eine `auth_user_id` statt an alle. Der echte Trigger übergibt das Feld nie,
Live-Verhalten (Broadcast an alle) bleibt also unverändert. Eigene `auth_user_id`(s) finden
(mehrere bei Mehrgeräte-Login, siehe oben):

```sql
select pal.auth_user_id
from public.player_auth_links pal
join public.players p on p.id = pal.player_id
where p.name ilike '%<eigener Name>%';
```

Test auslösen (beliebige echte `game_id` aus `games` einsetzen):

```sql
select net.http_post(
  url := 'https://team-app-two-orpin.vercel.app/api/send-quarter-score',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>'),
  body := jsonb_build_object('record', jsonb_build_object('game_id', '<game-id>', 'quarter', 1, 'test_user_id', '<eigene auth_user_id>'))
);

select net.http_post(
  url := 'https://team-app-two-orpin.vercel.app/api/send-game-finished',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>'),
  body := jsonb_build_object('record', jsonb_build_object('game_id', '<game-id>', 'test_user_id', '<eigene auth_user_id>'))
);
```

**Neunte Benachrichtigungsart: Dreier-Push** (`api/send-three-pointer.ts`), Erweiterung des
Live-Tickers auf Wunsch des Nutzers. Sobald im Live-Stats-Tracker ein Dreier fürs eigene Team
erfasst wird, geht sofort eine Push mit Spielstand raus — Titel "💥 Bang!", Text "\<Vorname> from
Downtown — TB Wülfrath \<Stand> \<Gegner>". Anders als bei Viertelwechsel/Spielende (Ratchet auf
einer eigenen Spalte) reicht hier ein simpler `after insert`-Trigger auf `game_stat_events`, der
nur bei `team = 'us' and stat_type = 'fg3_made'` feuert — jedes INSERT ist bereits ein
eigenständiger, echter Treffer, es gibt also nichts zu deduplizieren. Bewusst nur `after insert`,
nicht `after delete`: ein versehentlich erfasster Dreier, der per "Zurück" im Tracker sofort
wieder gelöscht wird, hat die Push zu dem Zeitpunkt aber schon verschickt — dasselbe akzeptierte
Restrisiko wie beim bewusst weggelassenen OT-Push oben. Keine neue Migration nötig (keine neue
Spalte, `games`/`players`/`push_subscriptions` haben bereits `service_role`-Rechte) — nur der
Trigger selbst, wieder von Hand angelegt (enthält den Webhook-Secret im Klartext):

```sql
create or replace function public.notify_three_pointer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team = 'us' and new.stat_type = 'fg3_made' then
    perform net.http_post(
      url := 'https://<deine-vercel-domain>/api/send-three-pointer',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>'),
      body := jsonb_build_object('record', jsonb_build_object('game_id', new.game_id, 'player_id', new.player_id))
    );
  end if;
  return new;
end;
$$;

create trigger game_stat_events_notify_three_pointer
after insert on public.game_stat_events
for each row execute function public.notify_three_pointer();
```

Testweise nur an sich selbst schicken (`test_user_id`, siehe oben) — beliebige echte `game_id`
und `player_id` (aus `players`, eigenes Team) einsetzen:

```sql
select net.http_post(
  url := 'https://team-app-two-orpin.vercel.app/api/send-three-pointer',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>'),
  body := jsonb_build_object('record', jsonb_build_object('game_id', '<game-id>', 'player_id', '<player-id>', 'test_user_id', '<eigene auth_user_id>'))
);
```

**Tracking zurücksetzen** (Migration `0043`, `GamesAdmin.tsx`): im Admin unter Spiele gibt es bei
jedem Spiel mit erfassten Stats jetzt einen roten "Tracking zurücksetzen"-Button (nur sichtbar,
wenn `gameResult()` einen Endstand liefert). Löscht per RPC `reset_game_stats()`
(trainer-only, wie `reopen_game_stats`) alle `game_stat_events`, die Aufstellung
(`game_court_state`) und einen eventuell noch aktiven Tracking-Lock (`game_stat_sessions`) für
dieses eine Spiel und setzt `stats_finalized_at`/`last_announced_quarter` zurück — der Endstand
wird dabei automatisch wieder `null` (derselbe `recalc_game_score()`-Trigger aus Migration `0028`,
der auch beim normalen Live-Tracking läuft). Gedacht für Testdaten (z. B. beim Ausprobieren des
Live-Tickers vor der Saison, siehe oben) oder falsch erfasste Spiele, nicht für den normalen
Betrieb — löscht unwiderruflich, daher der Bestätigungsdialog. Löst dabei bewusst **keine** neue
"Spiel beendet"-Push aus: der Trigger dafür feuert nur beim Wechsel von `null` auf einen
Zeitstempel, nicht umgekehrt.

**Live-Score + "wer trackt gerade" auf der Startseite** (`Dashboard.tsx`): sobald jemand das
Stats-Tracking für das nächste Spiel gestartet hat, sehen alle anderen (auch Betrachter) in der
"Nächstes Spiel"-Kachel den aktuellen Zwischenstand plus, falls gerade aktiv jemand trackt,
dessen Namen ("Tom Trainer trackt gerade · 18:14"). Der auffällige grüne "📊 Spiel-Stats
tracken"-Button wird dann durch einen kleinen "Tracking übernehmen"-Link ersetzt (nur für
Spieler/Trainer, löst denselben Übernahme-Dialog wie bisher aus, falls tatsächlich schon wer
trackt) — niemand braucht mehr den großen Button suchen, wenn eh schon getrackt wird. "Aktiv
getrackt" wird dabei genauso beurteilt wie der weiche Lock selbst (`claim_stat_session`,
Migration `0028`): länger als 30s kein Herzschlag mehr zählt als "trackt niemand mehr", sonst
würde ein Tracker, der die App einfach zugemacht statt sauber verlassen hat, die
Übernahme-Anzeige dauerhaft an Stelle des großen Start-Buttons stehen lassen. Der Zwischenstand
selbst kommt wie beim Live-Ticker direkt aus `games.final_score_us`/`final_score_opponent`, die
`recalc_game_score()` ohnehin ständig aktuell hält — keine zusätzliche Abfrage nötig.

**Nachtrag: automatisches Aktualisieren + Anzeigetafel-Optik.** Der große Datenabruf beim Öffnen
der Startseite (`load()`, ~10 Abfragen) läuft nur einmal — ein bereits geöffnetes Dashboard hätte
also nie mitbekommen, wenn währenddessen wer anders zu tracken anfängt (live so aufgefallen:
"erst nach mehrmaligem Neuladen sichtbar"). Deshalb eigener, leichtgewichtiger Refresh
(`refreshLiveScore`, nur die zwei relevanten Felder aus `games` + `game_stat_sessions`, nicht der
komplette `load()`): automatisch alle 15s (wie der Herzschlag im Tracker selbst,
`HEARTBEAT_MS`), sofort beim Sichtbarwerden der Seite (`visibilitychange`/`focus` — deckt auch
den Fall ab, dass die PWA im Hintergrund lag), und zusätzlich ein manueller
"🔄 Aktualisieren"-Text oben rechts in der Kachel. Optisch als eigene dunkle Kachel im
`headline`-Font (Anton, schon für "HI {Name}!" im Einsatz) mit großer Punktzahl, rotem
pulsierendem "Live"-Punkt bei aktivem Tracking bzw. "Zwischenstand" ohne Punkt sonst — bewusst
mit den vorhandenen `tbw-navy`/`tbw-navyDark`/`tbw-gold`-Farbtönen statt neuer Werte, damit es
wie ein Teil des bestehenden Designsystems wirkt statt wie ein Fremdkörper.

**Nachtrag: letzte Punktaktion in der Anzeigetafel.** Unter dem großen Spielstand steht jetzt
klein, wer zuletzt getroffen hat ("Zuletzt: Lena Muster (+3)"), bei einem Gegnertreffer der
Vereinsname statt eines Spielernamens ("Zuletzt: H-Town United (+2)"). Fragt dafür das jüngste
`game_stat_events`-Ereignis mit wurfrelevantem `stat_type` ab (Rebounds/Fouls/etc. sollen den
Stand nicht überschreiben), sowohl beim initialen Laden als auch bei jedem `refreshLiveScore`
(15s-Takt/Sichtbarwerden/manueller Button — siehe oben). Der Spielername wird über das ohnehin
schon geladene `data.players`-Lookup aufgelöst, keine zusätzliche Abfrage dafür nötig.

**"Vergangene Spiele" auf der Spiele-Seite** (`Spiele.tsx`): bisher hatten normale Spieler nur
für das jeweils *letzte* Spiel einen Box-Score-Link (Startseite "Letztes Ergebnis"), ältere
Spiele waren nur über Admin -> Spiele erreichbar. Das war aber nie ein echter
Zugriffsunterschied — `game_stat_events` ist laut RLS für jeden angemeldeten Nutzer lesbar
(Migration `0028`), es fehlte nur der Einstiegspunkt in der Navigation für Nicht-Admins. Neue
Sektion "Vergangene Spiele" auf `/spiele` (alle abgeschlossenen Spiele, `stats_finalized_at is
not null`, neueste zuerst) zeigt Endstand + Sieg/Niederlage/Unentschieden + Box-Score-Link für
jedes Spiel, erste drei direkt sichtbar, der Rest über "Weitere vergangene Spiele anzeigen"
aufklappbar (gleiches Muster wie die bestehende "Weitere Spieltage"-Sektion für kommende
Spiele). Bewusst auch dann sichtbar, wenn gerade kein anstehendes Spiel geplant ist (z. B.
Saisonende) — die Seite bricht in dem Fall nicht mehr komplett ab, sondern zeigt nur den
Hinweis "Kein anstehendes Spiel geplant" plus die vergangenen Spiele. Für Betrachter ohnehin
irrelevant, da die ganze `/spiele`-Route für sie schon gesperrt ist (wie `/stats/:gameId`
selbst auch).

**Trikotnummern pro Spiel** (Migration `0044`, `GameStatsTracker.tsx`): bei TB Wülfrath gibt es
keine festen Trikots — die Nummern wechseln von Spiel zu Spiel. Neue Tabelle
`game_player_numbers` (`game_id`, `player_id`, `number`, 0-99) ordnet die Nummer deshalb pro
Spiel statt fest am Spieler zu, gleiches Zugriffsmuster wie `game_stat_events`/
`game_court_state` (jeder Spieler oder Trainer darf pflegen, nicht nur wer gerade den
Tracking-Lock hält).

Ablauf beim Start des Trackings: ist für ein Spiel noch keine einzige Nummer hinterlegt und die
Startaufstellung noch nicht gewählt, zeigt der Tracker zuerst eine Karte "Trikotnummern" mit
einem Zahlenfeld pro Kader-Spieler (leer bleiben erlaubt — "Weiter zur Aufstellung" speichert
auch mit Lücken), erst danach folgt wie bisher die Startaufstellung. Kein eigenes
"erledigt"-Flag in der Datenbank dafür nötig: die Karte verschwindet automatisch, sobald
entweder eine Nummer gespeichert wurde oder die Aufstellung feststeht (`onCourtIds.length > 0`)
— beides zusammen ergibt zuverlässig "hier gibt's nichts mehr zu klären". "Überspringen" markiert
das nur lokal als erledigt (kein Speichern), ein Neuladen der Seite würde danach erneut fragen —
bewusst in Kauf genommen, statt dafür einen eigenen Zustand in der Datenbank zu pflegen.

Danach jederzeit über den kleinen Link "🔢 Trikotnummern bearbeiten" korrigierbar (auch mitten im
Spiel) — löscht beim Speichern zunächst alle Nummern-Zeilen des Kaders und legt die
nicht-leeren neu an, einfacher als ein Diff aus Einzel-Updates und unkritisch bei diesen
Low-Stakes-Zuordnungsdaten. Angezeigt wird die Nummer überall dort, wo während des Trackings
ein Spieler ausgewählt wird (Startaufstellung, Wechsel-Picker, "Wer?"-Aktions-Picker — als kleines
Badge oben links auf dem Avatar) sowie als `#N`-Präfix vor dem Namen in kompakteren Textkontexten
(Auf-dem-Feld-Grid, Bank-Liste, "Zuletzt"-Zeile/-Verlauf, Box-Score-Tabelle — Letztere auch in der
schreibgeschützten Ansicht nach Spielende).

Per Playwright end-to-end verifiziert: Trikotnummern-Screen beim ersten Öffnen, Nummern
eintragen, Weiter zur Aufstellung (Badges sichtbar), Startaufstellung wählen, normale
Tracking-Ansicht (Nummern im Auf-dem-Feld-Grid/Bank), erneutes Öffnen über "Trikotnummern
bearbeiten" mit korrekt vorausgefüllten Werten.

**Betrachter: Spiele, Team, Live-Tracking** (Migration `0045`, `App.tsx`, `BottomNav.tsx`):
Betrachter (z. B. Abteilungsleiter) sahen bisher nur Start und Kampfgericht. Jetzt zusätzlich:
- **Reiter "Spiele"** (`/spiele`) — inklusive der "Vergangene Spiele"-Sektion mit Box-Score-Links
  (siehe oben), da dort ohnehin schon kein Rollen-Unterschied bestand.
- **Reiter "Team"** (`/team`, weiterhin nur wenn `player_profiles` aktiviert ist — das Flag
  entscheidet, nicht die Rolle).
- **Live-Stats-Tracking übernehmen** (`/stats/:gameId`) inklusive des Zwischenstands/"Tracking
  übernehmen"-Bereichs auf der Startseite und des Box-Score-Links beim letzten Ergebnis.

Anders als bei den vorherigen Nachträgen dieser Art reichte hier eine reine Client-Routing-
Änderung nicht aus: die RLS-Policies für `game_stat_events`, `game_court_state` und
`game_player_numbers` prüften bisher nur `is_trainer() or current_player_id() is not null` —
ein Betrachter hat keins von beidem, RLS hätte also jeden Schreibversuch abgelehnt. Migration
`0045` ergänzt überall `or current_viewer_id() is not null`, ebenso in `finalize_game_stats()`
("Spiel beenden") und `announce_quarter_score()` (Live-Ticker-Push beim Viertelwechsel — sonst
wäre die Push beim Tracking durch einen Betrachter einfach still ausgeblieben, siehe
`selectQuarter()` in `GameStatsTracker.tsx`). `claim_stat_session`/`heartbeat_stat_session`/
`release_stat_session` brauchten keine Änderung, die prüften von Anfang an nur
`auth.uid() is not null` ohne Rollen-Einschränkung. `reopen_game_stats` und `reset_game_stats`
bleiben bewusst trainer-only (Admin-Aktionen, kein Teil von "normal tracken").

Nebenbei aufgefallen und mitbehoben: `GameStatsTracker.tsx` ermittelte den angezeigten Namen
bisher nur aus `trainer?.name ?? player?.name ?? 'Unbekannt'` — ein Betrachter wäre dadurch
überall als "Unbekannt" aufgetaucht (Tracking-Lock-Anzeige, `created_by_name` an jedem
erfassten Stat-Event). Jetzt `?? viewer?.name` ergänzt.

Per Playwright verifiziert: Bottom-Nav zeigt Start/Spiele/Team/Kampfgericht für Betrachter,
`/spiele` und `/team` bleiben (kein Redirect mehr), Live-Score + "Tracking übernehmen" auf der
Startseite sichtbar, `claim_stat_session` über `/stats/:gameId` erfolgreich ohne Fehler.

**Endstand nachtragen ohne Live-Tracking** (Migration `0046`, `GamesAdmin.tsx`): falls ein Spiel
nicht live getrackt wurde, aber der Endstand nachträglich bekannt ist (z. B. per Anruf/Zuruf),
gibt es im Admin bei jedem Spiel ohne Endstand jetzt einen Button "Endstand nachtragen" —
öffnet ein kleines Inline-Formular (zwei Zahlenfelder), speichert direkt per Update auf
`games.final_score_us`/`final_score_opponent` und setzt `stats_finalized_at`. Bewusst ohne neue
RPC: `games` ist per RLS ohnehin trainer-schreibbar (dieselbe Policy, die auch das normale
Bearbeiten-Formular nutzt), keine eigene Berechtigungsprüfung nötig. Da `stats_finalized_at`
dabei von `null` auf einen Zeitstempel wechselt, feuert der bestehende
`games_notify_finished`-Trigger (Live-Ticker) ganz normal mit — das Team bekommt also auch bei
einem nachgetragenen Ergebnis die "Spiel beendet"-Push, genau wie bei echtem Live-Tracking.
Verschwindet automatisch, sobald ein Endstand existiert (`gameResult()` liefert dann etwas) —
für ein bereits getracktes/nachgetragenes Spiel gibt's stattdessen wie gewohnt "Tracking
zurücksetzen".

Dabei auch einen Bug in `reset_game_stats()` (Migration `0043`) behoben: das Zurücksetzen des
Endstands verließ sich komplett auf den `recalc_game_score()`-Trigger, der nur bei tatsächlichen
`game_stat_events`-Änderungen feuert. Bei einem nachgetragenen Endstand ohne jegliche Events
hätte das `delete from game_stat_events` dort null Zeilen betroffen, der Trigger wäre nie
gelaufen, und "Tracking zurücksetzen" hätte den nachgetragenen Stand fälschlich stehen lassen.
`reset_game_stats()` setzt `final_score_us`/`final_score_opponent` jetzt zusätzlich direkt
zurück, unabhängig vom Trigger.

**Nachtrag: "Endstand nachtragen" ließ das Spiel weiter als "Nächstes Spiel" stehen.**
Die "Nächstes Spiel"-Abfrage auf der Startseite (`Dashboard.tsx`) und die Kader-Ansicht
(`Spiele.tsx`) filterten bisher nur nach `game_date >= heute` — ein Spiel, das heute
stattfindet und (egal ob live oder nachträglich) bereits abgeschlossen ist, blieb dadurch
trotzdem "das nächste Spiel", samt Kader-Zusage-Karte usw. für ein bereits vorbeigegangenes
Spiel. Beide Abfragen filtern jetzt zusätzlich `stats_finalized_at is null` heraus — ein
abgeschlossenes Spiel taucht nur noch unter "Letztes Ergebnis" bzw. "Vergangene Spiele" auf.
Die Trikot-Rückgabe-Erinnerung (die bisher "Spieltag = heute" über `nextGame` erkannt hat)
prüft für den Fallback jetzt `game_date <= heute` statt `< heute`, damit ein heute
abgeschlossenes Spiel dort nicht durchs Raster fällt.

**Nachtrag: Box-Score-Ansicht für nachgetragene Endstände.** Wer bei einem Spiel ohne
Live-Tracking auf "Box-Score ansehen" klickt, landete im vollen Tracking-Screen mit "Stats
abgeschlossen / Wieder öffnen" — "Wieder öffnen" hat dort aber nur unnötig eine neue
Live-Tracking-Sitzung gestartet (Aufstellung, Trikotnummern …), die anschließend erneut mit
"Spiel beenden" abgeschlossen werden musste und dabei ein zweites Mal die "Spiel
beendet"-Push verschickt hat. Da es für ein nachgetragenes Ergebnis (keine
`game_stat_events`) ohnehin keinen Box-Score zum Ansehen gibt, zeigt `GameStatsTracker.tsx`
in diesem Fall jetzt stattdessen einen erklärenden Hinweis ("keine Einzelspieler-Stats
erfasst — Endstand wurde manuell nachgetragen") ohne "Wieder öffnen"-Button. Echte
live-getrackte und abgeschlossene Spiele zeigen weiterhin wie gewohnt "Wieder öffnen" +
Box-Score-Tabelle. Zusätzlich zeigte die Kopfzeile dort fälschlich "0 : 0" (berechnet aus den
— hier leeren — `game_stat_events`) statt des tatsächlichen nachgetragenen Endstands; zeigt
jetzt in diesem Fall `games.final_score_us`/`final_score_opponent` an.

Per Playwright verifiziert: Formular öffnen, Werte eintragen, Speichern → korrekter
`PATCH`-Request, "Endstand: 55:48 · Sieg · Stats abgeschlossen" erscheint, Button wechselt zu
"Tracking zurücksetzen".

### 8. Liga-Tabelle (DBB-Sync)

Optionale Zusatzfunktion (Feature-Flag `standings`, siehe Admin -> Funktionen), auf
Nutzeranfrage: zeigt die aktuelle Tabelle der eigenen Liga unter "Spiele" an, mit der eigenen
Mannschaft farblich hervorgehoben. Der DBB (basketball-bund.net) bietet dafür keine öffentliche
API — die Seite ist eine alte, rein serverseitig gerenderte JSP-Anwendung, und der sichtbare
"Export (Excel)"-Button ruft nur eine JavaScript-Funktion auf statt einer festen URL, ist also
nicht direkt automatisiert abrufbar. Die Daten kommen daher per Scraping der öffentlich
erreichbaren HTML-Tabellenseite (`api/sync-league-standings.ts`, per `pg_cron` einmal täglich
aufgerufen), geparst mit `cheerio` und in `public.league_standings` (Migration `0056`)
geschrieben — bei jedem Lauf wird die komplette Tabelle für die konfigurierte `liga_id` gelöscht
und neu eingefügt (Rang UND Mannschaftszusammensetzung können sich jede Runde ändern, ein
einfacher Full-Refresh ist robuster als Diffing).

**Wichtiger Hinweis:** die genaue HTML-Struktur der DBB-Seite konnte beim Bauen dieser Funktion
nicht live geprüft werden (die Entwicklungsumgebung hatte keinen Netzwerkzugriff auf
basketball-bund.net) — das Parsing sucht die Tabelle deshalb bewusst robust über ihre
Kopfzeilen-Texte ("Rang"/"Name" statt feste CSS-Klassen) und ordnet Spalten über die
Kopfzeilen-Reihenfolge zu, statt feste Spaltenpositionen anzunehmen. Ein Smoke-Test gegen eine
Beispiel-HTML-Seite (nachgebaut nach einem Screenshot der echten Tabelle) hat alle Werte korrekt
extrahiert, inkl. Umlaut-Dekodierung ("TB Wülfrath" korrekt erkannt) — trotzdem lohnt sich nach
dem ersten echten Sync-Lauf ein Blick auf den JSON-Response bzw. `net._http_response` (siehe
unten), falls die Tabelle in der App leer bleibt.

Läuft komplett kostenlos: Vercel-Serverless-Function wie die Push-Funktionen (Hobby-Tarif
enthalten), kein zusätzlicher Dienst.

**Setup:**

1. **Migration ausführen**: `supabase/migrations/0056_league_standings.sql` im SQL-Editor
   laufen lassen (legt die Tabelle, ihre Policies und das Feature-Flag `standings` an, standardmäßig
   ausgeschaltet).
2. **Liga-ID prüfen**: die Zahl aus der DBB-URL (`...&liga_id=54636`) — standardmäßig fest im
   Code hinterlegt (`54636`, die aktuelle Liga von TB Wülfrath Herren). Falls sich die Liga mal
   ändert (Auf-/Abstieg), als Vercel-Env-Var `DBB_LIGA_ID` mit dem neuen Wert überschreiben, kein
   Redeploy des Codes nötig.
3. **Cron-Job anlegen** (nutzt denselben `PUSH_WEBHOOK_SECRET` wie die anderen Cron-Jobs, kein
   neues Secret nötig):
   ```sql
   select cron.schedule(
     'sync-league-standings',
     '0 6 * * *',
     $$
     select net.http_post(
       url := 'https://<deine-vercel-domain>/api/sync-league-standings',
       headers := jsonb_build_object('x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>')
     );
     $$
   );
   ```
4. Manuell/testweise auslösen, ohne auf den nächsten Lauf zu warten:
   ```sql
   select net.http_post(
     url := 'https://<deine-vercel-domain>/api/sync-league-standings',
     headers := jsonb_build_object('x-webhook-secret', '<PUSH_WEBHOOK_SECRET-Wert>')
   );
   ```
   Ergebnis prüfen:
   ```sql
   select status_code, content, created from net._http_response order by created desc limit 5;
   ```
   Erwartete Erfolgsmeldung: `{"updated": 12}` (Anzahl Zeilen). `{"skipped":"no_rows_parsed"}`
   bedeutet, das Parsing hat auf der aktuellen Seite keine Tabelle gefunden — dann bitte melden,
   dann wird das Parsing anhand der echten Seite nachgebessert.
5. Danach im **Admin -> Funktionen** das Feature `Liga-Tabelle` aktivieren — erst jetzt taucht
   die "Tabelle"-Karte unter "Spiele" überhaupt auf.

## Design

Die Farben in `tailwind.config.js` (`tbw.*`) sind noch Platzhalter — bitte gegen die echten
TB-Wülfrath-Vereinsfarben austauschen, sobald diese vorliegen.

Das echte Vereinslogo ist seit dem Klub-Upload im Einsatz (`design/tbw-logo.png`, die
hochauflösende Originaldatei — bewusst außerhalb von `public/`, damit sie nicht mit ins
PWA-Precache gerät). Daraus generiert: `public/icons/icon-192.png` /
`icon-512.png` (Manifest, transparenter Hintergrund), `icon-512-maskable.png` (Manifest,
dunkler Hintergrund, Logo im 70%-Safe-Zone-Kreis für maskierbare Icons), sowie
`apple-touch-icon.png` (180×180, weißer Hintergrund — iOS stellt Transparenz sonst schwarz
dar) und `favicon.ico`/`favicon-32.png`. Soll das Logo nochmal angepasst werden (z. B. andere
Zuschnitte/Skalierung), einfach aus `design/tbw-logo.png` neu generieren.

## Abweichungen / Entscheidungen gegenüber der Spec

Diese Punkte waren in der Projektübergabe als offen markiert oder ergaben sich beim Bauen;
hier die getroffenen Entscheidungen samt Begründung:

- **Mehrgeräte-Login pro Zugangscode (`players.auth_user_id`).** Die Spec verlangt, dass
  derselbe Code auf mehreren Geräten nutzbar ist, ohne verbraucht zu werden. Da jedes Gerät
  bei Supabase Anonymous Auth einen eigenen Auth-User bekommt, kann eine einzelne
  `auth_user_id`-Spalte das nicht abbilden. Zusätzlich zur Spalte (die weiterhin das zuletzt
  verknüpfte Gerät zeigt) gibt es daher eine Zuordnungstabelle `player_auth_links`
  (`auth_user_id -> player_id`), die die eigentliche Quelle der Wahrheit für RLS/RPCs ist.
  Siehe Kommentar am Anfang von `supabase/migrations/0001_init.sql`.
- **Code-Neugenerierung widerruft bestehende Geräte-Logins.** Wenn ein Trainer den Code eines
  Spielers neu generiert (z. B. bei Verlust des Handys), werden alle bisherigen
  `player_auth_links`-Einträge dieses Spielers gelöscht — bereits eingeloggte Geräte verlieren
  also den Zugriff, nicht nur der alte Code wird ungültig für neue Logins.
- **Kurzfristige Kader-Absage nach Veröffentlichung.** Die Trikot-Rotationsvorschau
  (`naechsterSpieler`) wird bei jedem Laden neu berechnet, nicht einmalig gespeichert. Nimmt
  der Trainer einen bereits vorgeschlagenen Spieler nachträglich aus dem Kader, verschiebt
  sich der Vorschlag automatisch auf den nächsten verfügbaren Spieler in der Warteschlange —
  bis eine Übergabe tatsächlich bestätigt wurde, passiert nichts Endgültiges.
- **Trikot-Rotation: Waschzähler statt Zeiger (Migration `0004`).** Ursprünglich lief die
  Rotation über einen gemeinsamen alphabetischen Zeiger (`trikot_rotation_state`). Auf
  Wunsch umgebaut auf ein Waschzähler-Modell: vorgeschlagen wird immer, wer im aktuellen
  Kader am wenigsten oft insgesamt gewaschen hat (Gleichstand → alphabetisch). Vorteil:
  wird ein Spieler per ✗ übersprungen (jemand anderes bestätigt stattdessen), bleibt sein
  Zähler unverändert — er landet dadurch von selbst wieder ganz vorne in der Warteschlange,
  ganz ohne separate Merker-Logik. Die alte Zeiger-Tabelle wurde entfernt.
- **Spieler mit Trainer-/Admin-Rechten (Migration `0006`).** Für Spieler, die gleichzeitig
  Trainer sind (z. B. ein spielender Co-Trainer): statt eines zweiten Logins gibt es ein
  `is_admin`-Flag auf `players`, das ein Trainer im Admin-Bereich unter "Spieler" per Button
  ("Zu Trainer machen") setzt. Die Person bleibt mit ihrem normalen Zugangscode als Spieler
  eingeloggt und sieht auf der Startseite weiterhin ihre persönlichen Infos, bekommt aber
  zusätzlich den Admin-Reiter und alle Trainer-Rechte (Kader festlegen, Kampfgericht zuordnen,
  Trikots zurücksetzen etc.). Technisch weitet die Migration `is_trainer()` — die eine
  Helper-Funktion, die praktisch jede RLS-Policy und trainer-only RPC im Projekt schon nutzt —
  so aus, dass sie auch für admin-geflaggte Spieler `true` liefert; dadurch war keine einzelne
  Policy anzufassen. Im Frontend steuert `AuthContext`'s `isAdmin` (= echter Trainer ODER
  admin-geflaggter Spieler) den Zugriff, während `role` bestimmt, welche Ansicht (Trainer-
  Aggregat vs. persönliche Spieler-Sicht) angezeigt wird.
- **Warnschwelle Kampfgericht:** aktuell fest bei < 2 Einsätzen (Saison-Soll 2–3) über
  `SEASON_TARGET_MIN`/`SEASON_TARGET_MAX` in `src/pages/Kampfgericht.tsx`. Bei Bedarf mit dem
  Trainer final abstimmen und dort anpassen.
- **Kampfgericht-Aufgabenauswahl beim manuellen Anlegen.** Ursprünglich wurden beim Anlegen
  eines Kampfgericht-Termins im Admin-Bereich immer automatisch alle drei Aufgaben
  (24-Sekunden-Uhr, Anschreiben, Zeit & Punkte) angelegt — "nicht unsere Aufgabe" konnte
  dadurch faktisch nur über den SQL-Import entstehen, nicht über die App selbst. Das Formular
  hat jetzt Checkboxen, mit denen ausgewählt wird, welche der drei Aufgaben die Herren für
  diesen Termin tatsächlich stellen müssen; nur dafür werden Task-Zeilen angelegt. Das
  Freitextfeld (`opponent_teams`) ist außerdem von "Gegnerische Teams" auf "Team / Jahrgang"
  umbeschriftet, da es in der Praxis für den eigenen Jahrgang (z. B. "TBW U16") befüllt wird,
  nicht für den tatsächlichen Gegner.
- **Pflegbare Jahrgangsliste für Kampfgericht (Migration `0007`).** Das Freitextfeld für
  Team/Jahrgang wurde durch ein Dropdown ersetzt, dessen Optionen aus einer neuen Tabelle
  `officiating_teams` kommen; im Admin-Bereich unter Kampfgericht gibt es dafür eine eigene
  Karte zum Anlegen/Löschen von Jahrgängen. `officiating_games.opponent_teams` bleibt bewusst
  eine reine Text-Spalte (kein Fremdschlüssel) — ein Jahrgang aus der Liste zu löschen wirkt
  sich dadurch nicht auf bereits angelegte Termine aus. Die Migration übernimmt beim Anlegen
  der Tabelle automatisch alle bereits verwendeten Team-Namen aus bestehenden Terminen.
- **Optionales Gegner-Feld (Migration `0008`).** `officiating_games.opponent_teams` bleibt der
  eigene Jahrgang (Dropdown, s. o.); ergänzend gibt es jetzt ein nullable `opponent`-Feld für
  den tatsächlichen gegnerischen Verein, falls bekannt — freiwillig, da er nicht immer feststeht
  bzw. für die Kampfgericht-Planung selbst nicht relevant ist. Wo der Termin angezeigt wird
  (Admin, Kampfgericht-Seite, Startseite), zeigt `officiatingGameLabel()` in
  `src/types/database.ts` "Team vs. Gegner" an, falls ein Gegner hinterlegt ist, sonst nur das
  Team.
- **Read-only "Betrachter"-Rolle (Migration `0009`).** Für jemanden, der weder Spieler noch
  Trainer ist (z. B. ein Abteilungsleiter), aber Spielplan und Kampfgericht sehen soll — ganz
  ohne Kader-/Trikot-Zugriff und ohne jede Schreibberechtigung. Nutzt dieselbe
  Zugangscode-Anmeldung wie Spieler (siehe Design-Notiz #1 in `0001_init.sql`), gespiegelt in
  parallelen `viewers`/`viewer_auth_links`-Tabellen, damit Betrachter-Accounts komplett getrennt
  vom Kader/der Trikot-Rotation/Kampfgericht-Zuweisung bleiben. Da praktisch jede
  Select-Policy im Projekt schon "jeder angemeldete Nutzer" erlaubt, brauchte für den Lesezugriff
  keine bestehende Policy angefasst zu werden — nur die neuen Tabellen selbst brauchten RLS.
  `generate_access_code()` prüft jetzt Eindeutigkeit über Spieler- UND Betrachter-Codes hinweg,
  da beide über dasselbe "Zugangscode"-Feld eingegeben werden (`redeemCode` im `AuthContext`
  probiert beim Einlösen zuerst `redeem_access_code`, bei `invalid_code` dann
  `redeem_viewer_code`). Trainer verwalten Betrachter im Admin-Bereich unter dem neuen Reiter
  "Betrachter" (`src/pages/admin/ViewersAdmin.tsx`, spiegelt `PlayersAdmin.tsx`).
- **Treffpunkt-Infos pro Spiel (Migration `0010`).** Auf Wunsch ergänzt: der Trainer kann pro
  Spiel hinterlegen, wann/wo man sich trifft. Heimspiele haben nur einen Treffpunkt (Zeit in
  der Halle, `meeting_time_hall`); Auswärtsspiele können zusätzlich einen
  Fahrgemeinschaft-Treffpunkt haben (`meeting_time_carpool` + `meeting_point_carpool`, z. B.
  ein Parkplatz) für alle, die nicht direkt zur gegnerischen Halle fahren —
  `meeting_time_hall` bedeutet dann "direkt an der Halle". Alle drei Felder sind nullable,
  ein Spiel ohne hinterlegten Treffpunkt zeigt einfach nichts an. Editierbar ist das an zwei
  Stellen mit derselben `MeetingPointFields`-Komponente: kompakt direkt auf der Kader-Seite
  beim nächsten Spieltag (dort, wo der Trainer ohnehin den Kader zusammenstellt und
  veröffentlicht), und vollständig im Formular unter Admin -> Spiele für beliebige/zukünftige
  Spiele. Angezeigt wird der Treffpunkt überall, wo auch Datum/Ort des Spiels stehen
  (Startseite, Kader-Seite, Admin-Spieleliste) über den gemeinsamen Helper `meetingPoints()`
  in `src/types/database.ts`.
- **Schaltbare Zusatzfunktionen (Migration `0011`).** Auf Wunsch ergänzt: neue, optionale
  Funktionen (aktuell nur "Meldungen") lassen sich pro Team über Admin -> Funktionen einzeln
  an-/ausschalten, statt fest im Code für alle Teams aktiv zu sein — relevant sobald die App
  für weitere Jahrgänge genutzt wird, die nicht jede Zusatzfunktion brauchen. Umgesetzt über
  eine simple `feature_flags`-Tabelle (Key + Boolean) und `FeatureFlagsContext`
  (`src/context/FeatureFlagsContext.tsx`), der die Flags einmal lädt und per `useFeatureFlags()`
  überall verfügbar macht. Ein deaktiviertes Feature ist überall ausgeblendet (Startseite,
  Admin-Reiter) außer im "Funktionen"-Reiter selbst, über den es wieder aktiviert wird. Neue
  Zusatzfunktion hinzufügen: Key + Label/Beschreibung in `FEATURE_LABELS`
  (`src/types/database.ts`) ergänzen, Zeile im Seed der Migration (oder eine neue Migration)
  ergänzen — Admin-UI und Toggle-Persistenz funktionieren dann automatisch mit.
- **Meldungen / Schwarzes Brett (Migration `0012`).** Erste schaltbare Zusatzfunktion: der
  Trainer kann kurze Hinweise veröffentlichen (optional angeheftet, dann immer oben), die auf
  der Startseite für alle Rollen erscheinen. Bewusst nur einseitig (Trainer -> Team, kein Chat)
  — passt zur bisherigen "Self-Check beim Öffnen"-Logik der App und braucht keine
  Push-Benachrichtigungen, um nützlich zu sein.
- **Mitfahrgelegenheit (Migration `0013`).** Zweite schaltbare Zusatzfunktion, direkt auf der
  Kader-Seite integriert (nicht als eigener Nav-Reiter) — erscheint nur bei Auswärtsspielen,
  dort wo auch die Treffpunkt-Infos gepflegt werden. Spieler tragen sich als Fahrer mit einer
  Platzzahl (+ optionaler Notiz) ein oder reservieren sich einen Platz bei einem Fahrer;
  `carpool_claims.game_id` ist redundant zu `offer_id` (statt eines Joins), damit ein
  Unique-Constraint "ein Platz pro Spiel und Spieler" direkt in der DB durchsetzbar ist. Bewusst
  kein Admin-Bereich dafür — die Selbstverwaltung durch die Spieler reicht, der Trainer kann bei
  Bedarf über die ohnehin vorhandene `is_trainer()`-Berechtigung in den RLS-Policies eingreifen.
  Nur mit eigenem Spieler-Login nutzbar (reines Trainer-Konto ohne verknüpften Spieler sieht die
  Liste nur lesend, siehe `CarpoolSection.tsx`).
- **Spielerprofile (Migration `0014`).** Dritte schaltbare Zusatzfunktion — Foto, Position,
  Größe, Geburtsdatum (Alter wird daraus berechnet, siehe `ageFromBirthDate()` in
  `src/lib/format.ts`, statt separat gespeichert und dadurch potenziell veraltet) und ein paar
  feste Skill-Tags pro Spieler. Im Gegensatz zu Meldungen/Mitfahrgelegenheit bekommt diese
  Funktion einen eigenen Nav-Reiter ("Team", `/team`) statt in eine bestehende Seite integriert
  zu werden — Team-Roster-Browsing ist ein eigenständiger Anwendungsfall, keine Randnotiz auf
  einer anderen Seite. Für Fotos kommt erstmals Supabase Storage zum Einsatz (öffentlicher
  Bucket `player-photos`, Schreibzugriff nur für Trainer über Storage-RLS-Policies); die
  Basisdaten pflegt der Trainer weiterhin in Admin -> Spieler (erweitertes Formular je Spieler,
  aufklappbar über "Profil bearbeiten"). Bewusst kein Zugriff für Betrachter (mehr persönliche
  Daten als der ursprünglich vereinbarte Spielplan/Kampfgericht-Rahmen).

  Beim Bauen aufgefallen und mitgefixt: `/team` (und jede künftige flag-gesteuerte Route) konnte
  bei einem Direktaufruf/Reload kurz zur Startseite umleiten, weil die Routenentscheidung schon
  vor dem ersten Laden der Feature-Flags getroffen wurde. `App.tsx` wartet jetzt zusätzlich zum
  bestehenden `role === 'loading'`-Check auch auf `flags.loading`, bevor die Routen gerendert
  werden.
- **Urlaub/Abwesenheit (Migration `0015`).** Vierte schaltbare Zusatzfunktion. Spieler tragen
  selbst einen Zeitraum ein (Von/Bis + optionale Notiz), statt dass der Trainer das pflegt.
  Bewusst als Zeitraum in einer eigenen Tabelle statt als einzelne Absage-Zeilen: `playerAbsenceOn()`
  in `src/types/database.ts` prüft beim Anzeigen, ob ein Termin/Spiel in den Zeitraum fällt — ein
  Urlaub verschwindet dadurch automatisch aus vergangenen Terminen, ohne dass irgendwo Zeilen
  aufgeräumt werden müssen. Wirkt sich an zwei Stellen aus: in `UpcomingTrainings` werden
  betroffene Trainingstermine für den Spieler wie eine Absage behandelt (eigene "Urlaub"-Gruppe
  statt Zu-/Absage-Buttons, kein Schreiben einzelner RSVP-Zeilen); auf der Kader-Seite zeigt der
  Trainer beim Zusammenstellen ein 🌴-Badge neben dem Namen, blockiert die Auswahl aber bewusst
  nicht — der Trainer kennt Ausnahmefälle besser als eine automatische Regel. Trainer sehen
  zusätzlich eine kompakte "Aktuell abwesend"-Übersicht auf der Startseite; auch hier bewusst kein
  Zugriff für Betrachter (persönliche Daten, wie schon bei den Spielerprofilen).
- **Punkte & Ergebnisse (Migration `0016`).** Fünfte schaltbare Zusatzfunktion, manuell vom
  Trainer gepflegt statt automatisch von einer Liga-Plattform übernommen — für basketball-bund.net
  ist keine dokumentierte öffentliche Schnittstelle bekannt, ein Scraper wäre fehleranfällig
  (bricht bei jeder Layout-Änderung) und im Zweifel nicht im Sinne der Nutzungsbedingungen. Bei
  Bedarf lässt sich das später ergänzen, sobald klar ist, ob/wie ein Zugriff möglich ist. Endstand
  ist bewusst `final_score_us`/`final_score_opponent` statt `home`/`away`, damit Sieg/Niederlage
  direkt aus dem Vergleich der beiden Werte folgt, unabhängig vom Heimrecht (`gameResult()` in
  `src/types/database.ts`). Punkte pro Spieler liegen in einer eigenen Tabelle
  (`game_player_points`), gepflegt über eine ausklappbare Punkte-Eingabe je Spiel in Admin ->
  Spiele; leere Eingabefelder löschen eine vorhandene Zeile wieder, statt sie auf 0 zu setzen.
  Zeigt auf der Startseite das letzte Ergebnis (inkl. Sieg/Niederlage-Badge) und für Spieler ihre
  Saison-Punktesumme.
- **Captain / Co-Captain (Migration `0017`).** Kein Feature-Flag, sondern zwei weitere Flags auf
  `players` nach demselben Muster wie das bestehende `is_admin` (Migration `0006`): der Spieler
  bleibt ganz normal eingeloggt, bekommt aber zusätzliche Rechte. Trainer weist die Rollen in
  Admin -> Spieler zu (kein Alleinstellungs-Zwang — theoretisch könnten mehrere Spieler gleichzeitig
  Captain sein, falls ein Team das so will). Aktuell zwei Sonderrechte: (1) den nächsten
  Trikotwäscher bestätigen/ablehnen, bisher nur der betroffene Spieler selbst und der Trainer —
  serverseitig durchgesetzt über eine neue `is_captain_or_co_captain()`-Helper-Funktion, die
  `confirm_trikot_handover()` zusätzlich zu `is_trainer()` prüft (rein clientseitiges Ausblenden
  der Buttons wäre nicht ausreichend); (2) auf der Startseite dieselbe Kampfgericht-Team-Übersicht
  wie Trainer/Betrachter sehen (`showOfficiatingOverview`), um Mitspieler an offene Termine erinnern
  zu können — zusätzlich zur eigenen persönlichen Kampfgericht-Karte, nicht statt ihr.
- **Startseite: Trennung persönliche Infos / Teaminformationen (kein neues Migration nötig,
  reiner Frontend-Umbau von `Dashboard.tsx`).** Captains/Co-Captains sehen jetzt zusätzlich auch
  die Urlaubs-Übersicht (`showAbsencesOverview`, bisher nur Trainer/Admin) — gleiche Begründung wie
  bei der Kampfgericht-Übersicht: Kader-Planungsinfo, kein Betrachter-Recht. Die Startseite ist nun
  in zwei Zonen gegliedert: oben die persönlichen Karten (nächstes Spiel, eigener
  Kampfgericht-Termin, eigene Urlaubseinträge via `AbsenceSection`), darunter ein Bereich mit der
  Überschrift „Teaminformationen“ mit der Kampfgericht-Team-Übersicht, der Urlaubs-Übersicht und dem
  Trikot-Status (`Wer hat die Trikots?`, wie zuvor für alle sichtbar). „Nächste Trainingseinheit“
  bleibt unverändert ganz unten, außerhalb beider Zonen.
- **Spieler pflegen ihr eigenes Profilfoto/Größe/Geburtsdatum selbst (Migration `0018`).**
  Bisher ging das nur über Admin -> Spieler (Trainer). Einstieg bewusst nicht als eigener Reiter in
  der Bottom-Nav (zu wertvoller Platz für ein Randfeature), sondern über den Rollen-Pill oben rechts
  im Header: für Spieler zeigt der bisherige reine „Spieler“-Text-Pill jetzt zusätzlich den eigenen
  Avatar (Foto oder Initialen) und ist antippbar, öffnet dann ein Bottom-Sheet („Mein Profil“) mit
  Foto-Upload, Größe und Geburtsdatum — Position/Stärken bleiben bewusst Trainer-Sache. Nur sichtbar,
  wenn das `player_profiles`-Feature-Flag an ist, sonst bleibt es beim reinen Text-Pill. Serverseitig
  bewusst keine generelle UPDATE-RLS-Policy für Spieler auf `players` (RLS prüft nur Zeilen, keine
  Spalten) — stattdessen eine neue `update_my_profile()`-RPC, die nur genau die drei Felder der
  eigenen Zeile schreibt, plus zwei neue Storage-Policies auf dem `player-photos`-Bucket, die einen
  Upload/Ersatz nur für die eigenen Dateien erlauben (Details/Korrektur siehe Migration `0019`
  unten). Technischer Stolperstein beim Bauen: das Profil-Modal ist ein `position: fixed`-Overlay,
  das anfangs als Kind des Headers gerendert wurde — dessen `backdrop-blur` (`backdrop-filter`)
  erzeugt laut CSS-Spec einen eigenen Containing Block für `fixed`-Nachfahren, wodurch das Overlay
  nur die kleine Header-Box statt des ganzen Bildschirms füllte. Behoben über
  `createPortal(..., document.body)` in `MyProfileModal.tsx`.
- **Fix: Foto-Upload aus "Mein Profil" schlug in Produktion fehl (Migration `0019`).** Die
  "self"-Storage-Policies aus Migration `0018` prüften den Dateinamen über `current_player_id()`
  — eine security-definer Funktion mit Join über `player_auth_links`. Das lieferte beim direkten
  RPC-Aufruf (Größe/Geburtsdatum speichern funktionierte einwandfrei) korrekte Ergebnisse, aber
  nicht zuverlässig innerhalb einer Storage-Policy (eigener Dienst, eigene DB-Verbindung) — Ergebnis
  war `new row violates row-level security policy` beim Foto-Upload. Ersetzt durch das offizielle,
  simplere Supabase-Muster direkt über `auth.uid()` — kein Funktionsaufruf, kein Join, keine
  verschachtelte RLS-Prüfung einer zweiten Tabelle (Details zum finalen Namensschema siehe Migration
  `0021` unten). `MyProfileModal.tsx` liest die `auth_user_id` dafür über
  `supabase.auth.getSession()` (lokal, kein Netzwerk-Roundtrip) statt `getUser()`, analog zum
  bereits bestehenden Muster in `AuthContext.tsx`.
- **Fix Teil 2: Foto-Upload schlug auch mit auth.uid()-Ordner-Policy fehl (Migrationen `0020`/`0021`).**
  Nach Migration `0019` trat exakt derselbe `new row violates row-level security policy`-Fehler
  weiterhin auf — bestätigt per `pg_policies`, dass die Policy selbst korrekt in der Datenbank
  ankam. Migration `0020` lockerte die Policy testweise auf "jeder angemeldete Nutzer" (temporäres
  Sicherheits-Zugeständnis zur Eingrenzung) — schlug identisch fehl, was die Namens-/Ordner-Abgleichslogik
  als Ursache endgültig ausschloss. Verdacht: das Ordner-Pfadschema aus 0019
  (`<auth_user_id>/<timestamp>.<ext>`, enthält "/") lässt Supabase Storage zusätzlich eine Zeile in
  einer internen Ordner-Hierarchie-Tabelle anlegen, für die keine Policy existiert — dieselbe
  generische RLS-Fehlermeldung, nur für eine andere Tabelle als `storage.objects`. Migration `0021`
  geht zurück auf flache Dateinamen ohne "/" (`<auth_user_id>-<timestamp>.<ext>`, genau das Schema,
  das der bestehende Trainer-Upload-Pfad in `PlayersAdmin.tsx` schon verwendet) und ersetzt die
  offene Testpolicy wieder durch eine auf die eigene Datei beschränkte (`name like auth.uid()::text
  || '-%'`).
- **Fix Teil 3: Foto-Upload schlug auch mit flachem Dateinamen fehl (Migration `0022`,
  laufende Diagnose).** Auch nach Migration `0021` (flacher Dateiname statt Ordnerpfad) derselbe
  `new row violates row-level security policy`-Fehler. Gemeinsamer Nenner aller bisher
  gescheiterten Varianten (`0018`–`0021`): jede enthielt `auth.uid() is not null`, entweder direkt
  oder über eine Funktion. Verdacht: `auth.uid()` liefert innerhalb der Storage-RLS-Auswertung für
  dieses Projekt grundsätzlich `NULL`, unabhängig von Namens-/Ordnerlogik. Migration `0022` ist ein
  reiner Diagnose-Schritt: eine Policy ganz ohne Auth-Bezug, nur auf den Bucket beschränkt
  (`bucket_id = 'player-photos'`) — **bewusst offen für jeden, auch nicht angemeldete Nutzer,
  temporär und nur zur Eingrenzung, danach sofort wieder einschränken.** Zusätzlich zeigt
  `MyProfileModal.tsx` jetzt den Schritt (Foto-Upload vs. Profil-RPC) und mehr Fehlerdetails
  (`statusCode`/`error`/`code` aus dem Supabase-Fehlerobjekt, nicht nur `message`) an, falls auch
  das noch fehlschlägt.
- **Fix Teil 4: `storage.buckets` fehlte komplett eine Policy — Verdacht, aber nicht die
  Ursache (Migration `0023`).** Die Detail-Fehlermeldung aus Fix Teil 3 zeigte trotz einer
  nachweislich komplett offenen Policy auf `storage.objects` weiterhin `403 · AccessDenied · new
  row violates row-level security policy`. Eine Abfrage über alle Tabellen im `storage`-Schema
  (`pg_tables`) zeigte: auch `storage.buckets` hat RLS aktiviert (Supabase-Standard) — eine zweite
  Abfrage über `pg_policies` zeigte, dass dafür aber noch nie eine einzige Policy existierte.
  Migration `0014` hat den `player-photos`-Bucket zwar per `INSERT` angelegt, aber nie eine
  `SELECT`-Policy dafür ergänzt. Naheliegende Theorie: Supabase Storage muss vor jedem
  Objekt-Schreibzugriff die Bucket-Zeile selbst lesen können. Migration `0023` ergänzte die
  fehlende `select`-Policy — **hat das Problem aber nicht behoben** (siehe Fix Teil 5), war aber
  unabhängig davon eine korrekte Lücke, die es sich lohnte zu schließen.
- **Fix Teil 5: Ursache liegt außerhalb der Datenbank — an Supabase-Support eskaliert
  (Migrationen `0024`/`0025`).** Migration `0024` testete isoliert "buckets-Policy vorhanden UND
  objects-Policy komplett offen" (vorher war immer mindestens eine der beiden kaputt/fehlend) —
  schlug identisch fehl. Ein Projekt-Neustart über das Supabase-Dashboard (gegen einen veralteten
  internen Cache-Stand nach dem Aufwachen aus der Kostenlos-Tarif-Pause) brachte ebenfalls keine
  Änderung. Ein manueller Upload direkt im Supabase-Dashboard (Storage -> player-photos ->
  Upload) funktionierte einwandfrei — das Projekt/der Bucket ist also grundsätzlich intakt.
  Entscheidender letzter Test: ein Upload über die App mit einem **echten** Trainer-Login
  (E-Mail/Passwort, keine anonyme Sitzung) über Admin -> Spieler -> Profil bearbeiten -> Foto
  schlug ebenfalls fehl — das schließt sowohl unsere Policies (mehrfach nachweislich komplett
  offen getestet) als auch anonyme Spieler-Logins als Ursache aus. Jeder App-initiierte Upload
  schlägt fehl, unabhängig von Auth-Methode und RLS-Konfiguration, während das Dashboard selbst
  funktioniert (nutzt vermutlich privilegierten internen Zugriff statt der öffentlichen
  Storage-API). Das deutet auf eine projektinterne Fehlkonfiguration bei Supabase selbst hin
  (z. B. ein Sync-Problem zwischen Auth- und Storage-Dienst bei diesem Projekt), die sich nicht
  über SQL-Migrationen beheben lässt. Migration `0025` schließt die zu Diagnosezwecken offene
  `objects`-Policy aus `0024` aus Sicherheitsgründen wieder (zurück auf "nur die eigene Datei",
  identisch zu `0021`/`0023`), auch wenn das aktuell noch keinen Upload ermöglicht — Nutzer wurde
  gebeten, Supabase-Support zu kontaktieren.
- **Fix Teil 6: tatsächliche Ursache — fehlende SELECT-Policy für den Metadaten-Rücklese-Schritt
  nach dem Upload.** Der Supabase-Support (über deren Dashboard-Assistenten) fand die
  eigentliche Ursache: Storage macht beim Hochladen intern ein `INSERT ... RETURNING`, um die
  neu angelegten Objekt-Metadaten zurückzugeben — dafür gilt eine eigene `SELECT`-Berechtigung,
  unabhängig von der `INSERT`-Policy. Wir hatten nie eine `SELECT`-Policy auf `storage.objects`
  gesetzt (nur die öffentliche Lese-URL für den Bucket, die komplett am RLS-System vorbeigeht) —
  daher schlug der komplette Request fehl, obwohl der Insert selbst erlaubt gewesen wäre, und
  zwar exakt mit derselben generischen RLS-Fehlermeldung wie ein echter Insert-Fehlschlag. Das
  erklärt rückwirkend wirklich alle bisherigen Fehlschläge, unabhängig von Auth-Methode oder
  Namens-/Ordnerlogik. Zusätzlicher Hinweis vom Support: `upsert: true` (bisher in
  `MyProfileModal.tsx` und `PlayersAdmin.tsx` verwendet) erfordert für denselben
  Metadaten-Rücklese-Schritt zusätzlich `UPDATE`-Berechtigung, auch ohne tatsächlichen Konflikt —
  auf `upsert: false` umgestellt, da Dateinamen ohnehin immer eindeutig sind
  (Zeitstempel-Suffix), also nie eine echte Datei zum Ersetzen ansteht.
- **Layout-Fix: Datum-/Uhrzeit-Felder ohne Beschriftung wirkten leer, Felder liefen über den
  Kartenrand hinaus.** Zwei getrennte, aber verwandte Probleme in Formularen mit
  `grid-cols-2`-Feldpaaren: (1) Die Datum-/Uhrzeit-Felder in "Neues Spiel"
  (`GamesAdmin.tsx`), "Neuer Kampfgericht-Termin" (`OfficiatingAdmin.tsx`) und "Neue
  Trainingszeit" (`TrainingsAdmin.tsx`) hatten keine Beschriftung — auf iOS zeigt ein leeres
  `<input type="date/time">` anders als am Desktop keinerlei Platzhaltertext, wirkte dadurch wie
  ein unbenutzbarer leerer Kasten. Jetzt mit "Datum"/"Uhrzeit" bzw. "Beginn"/"Ende"-Label darüber,
  analog zum bereits bestehenden Muster bei "Größe"/"Geburtsdatum". (2) Wo ein Datum-/Uhrzeit-Feld
  in ein `<label>` eingepackt in einer `grid-cols-2`-Zeile steht (`MyProfileModal.tsx`,
  `AbsenceSection.tsx`, `MeetingPointFields.tsx`), lief das Feld auf dem iPhone über den
  Kartenrand hinaus — native Datum-/Uhrzeit-Eingabefelder haben auf iOS eine Mindestbreite, die
  ohne `min-w-0` auf dem direkten Grid-Kind (hier: dem `<label>`, nicht dem `<input>` selbst) die
  Grid-Spalte über die verfügbare Breite hinaus aufzwingt. `min-w-0` allein am `<input>` reicht
  nicht, wenn ein `<label>` dazwischen sitzt — es muss am direkten Grid-Kind sitzen.
  **Nachtrag:** `min-w-0` hat den Überlauf auf echten iPhones trotzdem nicht behoben — iOS
  erzwingt für `<input type="date">`/`type="time"` eine interne Mindest-Rendergröße für das
  native Steuerelement selbst (Kalender-Icon + Segmente), die sich per CSS gar nicht
  unterschreiten lässt, unabhängig von `width`/`min-width` auf Container-Ebene. Bei zwei
  Datum-/Uhrzeit-Feldern nebeneinander in einer 390px-Karte reicht der Platz schlicht nicht.
  Einzig zuverlässige Lösung: diese Feldpaare in `MyProfileModal.tsx`, `AbsenceSection.tsx`,
  `MeetingPointFields.tsx`, `GamesAdmin.tsx`, `OfficiatingAdmin.tsx` und `TrainingsAdmin.tsx`
  von `grid grid-cols-2` auf `space-y-2` (untereinander statt nebeneinander) umgestellt — kein
  Feld konkurriert mehr um Breite mit einem anderen Datum-/Uhrzeit-Feld.
  **Zweiter Nachtrag:** selbst einzeln (volle Kartenbreite, kein Nachbarfeld) liefen leere
  Datum-/Uhrzeit-Felder auf dem iPhone noch über den Kartenrand hinaus. Ursache: das native
  Steuerelement rendert seinen Inhalt (Platzhalter-Segmente + Icon) über das Shadow-DOM, das
  Safari nicht zuverlässig auf die per CSS gesetzte `width` des `<input>` selbst begrenzt — das
  Feld kann dadurch breiter erscheinen, als seine eigene Box vorgibt, unabhängig von jeglichem
  `width`/`min-width` auf Eltern-Ebene. In `src/index.css` `overflow: hidden` + `max-width: 100%`
  direkt auf `input[type="date"]`/`input[type="time"]` ergänzt, damit der Inhalt bei Bedarf
  innerhalb der eigenen Box abgeschnitten statt überlaufen wird. **Hinweis:** dieses
  Safari-spezifische Rendering-Verhalten lässt sich mit dem hier verfügbaren
  Chromium-Test-Browser nicht nachstellen — dieser Fix ist unverifiziert und braucht eine
  Rückmeldung vom echten iPhone.
  **Dritter Nachtrag:** `overflow: hidden` hat auf dem echten iPhone nicht zuverlässig geholfen
  (laut Rückmeldung war "Mein Profil" davor sogar noch in Ordnung, danach lief dort wieder ein
  Feld über den Rand — die anderen Formulare weiterhin unverändert betroffen). Grundproblem:
  `overflow: hidden` clippt nur nachträglich, verhindert aber nicht, dass die Box des nativen
  Steuerelements selbst größer gerendert wird, als CSS vorgibt — auf iOS offenbar nicht
  zuverlässig wirksam. Statt weiter am nativen Rendering herumzudoktern (drei Versuche in Folge
  unverifizierbar, da Safari-spezifisch und mit dem hier verfügbaren Chromium-Browser nicht
  nachstellbar), jetzt strukturell gelöst: neue `DateField`/`TimeField`-Komponenten
  (`src/components/DateTimeField.tsx`) lassen das native `<input type="date"/"time">` weiter
  Werte liefern und den nativen iOS-Picker öffnen, machen es aber komplett unsichtbar
  (`opacity: 0`) und positionieren es `absolute` mit `inset-0` innerhalb eines
  `overflow-hidden`-Wrappers — dadurch wird seine Box zwingend auf die Wrapper-Größe begrenzt,
  unabhängig vom internen Rendering. Der sichtbare Wert (Datum/Uhrzeit oder Platzhaltertext) wird
  stattdessen von einem ganz normalen `<span>` mit der `.input`-Klasse darunter angezeigt — für
  dessen Breite/Overflow gelten die üblichen, plattformübergreifend zuverlässigen CSS-Regeln, da
  kein natives Shadow-DOM mehr beteiligt ist. Alle sieben Datum-/Uhrzeit-Felder der App
  (`MyProfileModal.tsx`, `AbsenceSection.tsx`, `MeetingPointFields.tsx`, `GamesAdmin.tsx`,
  `OfficiatingAdmin.tsx`, `TrainingsAdmin.tsx`, `PlayersAdmin.tsx`) auf die neuen Komponenten
  umgestellt; die jetzt überflüssige `overflow: hidden`/`max-width: 100%`-Regel aus dem zweiten
  Nachtrag wieder aus `src/index.css` entfernt.
- **5er-Positionssystem statt vereinfachter 3er-Einteilung (Migration `0026`).** Auf Wunsch von
  der vereinfachten Aufbau/Flügel/Center-Einteilung auf die klassischen fünf Basketball-Positionen
  mit englischen Kürzeln umgestellt: Point Guard (PG), Shooting Guard (SG), Small Forward (SF),
  Power Forward (PF), Center (C) — Anzeige jeweils als "Englisch (deutsche Erklärung)", z. B.
  "Point Guard (Aufbauspieler)". `players.position` ist eine reine `text`-Spalte ohne
  CHECK-Constraint (Migration `0014`), der Wechsel ist also rein clientseitig (`PlayerPosition`-Typ
  + `POSITION_LABELS` in `src/types/database.ts`) — Migration `0026` mappt nur bereits vorhandene
  Werte der alten Codes um (`aufbau`→`pg`, `fluegel`→`sf`, `center`→`c`), damit kein Spieler beim
  Umstieg unbemerkt seine Position verliert; wo "Flügel" ursprünglich SF oder PF gemeint haben
  könnte, wird auf SF mit gemappt, vom Trainer bei Bedarf in Admin -> Spieler zu korrigieren.
- **Skill-Tags mit Icon + Spitzname, neuer Fastbreak-Skill (Migration `0027`).** Auf Wunsch
  umbenannt von schlichten Begriffen ("Distanzwurf") zu "Deutsch (Spitzname)" mit Emoji-Icon
  davor ("🎯 3-Point (Sniper)"), analog zum bestehenden Icon-Muster bei `SectionTitle`. Neuer
  Skill "⚡ Fastbreak (Turbo)" für schnelle Spieler, die im Gegenstoß stark sind. Icons liegen in
  `SKILL_ICONS` (`src/types/database.ts`), rein clientseitig — `players.skills` bleibt eine
  einfache `text[]`-Spalte, die Icons werden nur beim Anzeigen vorangestellt (Admin -> Spieler
  Profil-Editor, Team-Profildetail). Migration `0027` benennt bereits vergebene Tags der alten
  fünf Namen auf die neuen um, damit kein Spieler beim Umstieg eine gesetzte Stärke verliert.
- **Upload-Format für Spieltermine/Kampfgericht-Termine:** noch nicht implementiert; aktuell
  werden Spiele, Kampfgericht-Termine und Trainingszeiten einzeln über die Admin-Formulare
  angelegt (`/admin`). Ein Sammel-Import (PDF/Excel/ICS) lässt sich später als zusätzliche
  Aktion in `src/pages/admin/GamesAdmin.tsx` bzw. `OfficiatingAdmin.tsx` ergänzen, sobald klar
  ist, in welchem Format der Verband/das Ligaportal liefert.
- **Notizfeld bei zukünftigen Spieltagen:** noch nicht umgesetzt (kein Feld im Schema). Ließe
  sich als optionale `note text`-Spalte auf `games` ergänzen.
- **`officiating_games.game_time`** (Migration `0002`) wurde nachträglich ergänzt — die
  ursprüngliche Spec (§4) hatte hier nur ein Datum vorgesehen, was sich beim Import echter
  Kampfgericht-Termine (mehrere pro Tag) als unzureichend erwies.
- **Kampfgericht-Import Saison 26/27** (`supabase/imports/2026-27_kampfgericht_herren.sql`):
  enthält nur die Termine, bei denen die Quelltabelle (klubweite Dienstplan-Excel über alle
  TBW-Mannschaften) "Herren" oder bereits einen Namen bei Anschreiber/Zeit/24Sek eingetragen
  hatte — andere Mannschaften zugewiesene Slots wurden nicht mit importiert.
  Spieler-Zuordnung ist bewusst offen (`assigned_player_id = null`).
- **"Passwort vergessen" für Trainer-Accounts.** War in der Spec nicht explizit erwähnt, fehlte
  aber komplett (nur reiner E-Mail/Passwort-Login). Ergänzt über Supabase Auth
  (`resetPasswordForEmail` + `updateUser`) mit eigener `/reset-password`-Route, die unabhängig
  vom aufgelösten Login-Status erreichbar ist (siehe `App.tsx`), da der Mail-Link bereits eine
  gültige Recovery-Session mitbringt. Erfordert, dass die Redirect-URL in Supabase unter
  Authentication -> URL Configuration eingetragen ist (siehe Setup-Schritt 6).
- **Urlaub/Abwesenheit auf der Startseite aktualisierte "Nächste Trainingseinheit" erst nach
  Verlassen/Wiederbetreten der Seite.** `AbsenceSection.tsx` und `UpcomingTrainings.tsx` sind
  zwei unabhängige Komponenten auf `Dashboard.tsx`, jede mit eigenem Datenabruf — ein Eintragen
  oder Löschen einer Abwesenheit hat den bereits geladenen `absences`-State in
  `UpcomingTrainings` nicht mitbekommen. `AbsenceSection` bekommt jetzt einen
  `onChange`-Callback, den `Dashboard.tsx` nutzt, um einen `absenceVersion`-Zähler
  hochzuzählen; der wird sowohl als `refreshKey`-Prop an `UpcomingTrainings` durchgereicht (dort
  in den `useCallback`-Deps von `load()`, damit ein Wertwechsel einen Refetch auslöst, obwohl
  `refreshKey` selbst nicht gelesen wird) als auch in die Dependency-Liste von `Dashboard.tsx`s
  eigenem Lade-Effekt aufgenommen (aktualisiert die "Aktuell abwesend"-Übersicht für
  Captains/Trainer mit).
- **Reiterwechsel (Bottom-Nav) behielt die Scroll-Position der vorherigen Seite bei.**
  React Router setzt bei einer clientseitigen Navigation den Scroll nicht automatisch zurück
  (anders als ein echter Seitenwechsel) — in `App.tsx` per `useEffect` auf `location.pathname`
  ergänzt: `window.scrollTo(0, 0)` bei jedem Routenwechsel.
- **Live-Stats-Tracking während des Spiels (Migration `0028`) statt manueller
  "Punkte pro Spieler"-Nacherfassung (Migration `0016`).** Ersetzt eine eigene
  Zusatz-App (easystatsapp.com) durch eine direkt integrierte, an Kader/Spielplan
  angebundene Funktion — bewusst nicht in der normalen Tab-Oberfläche, sondern als
  eigene Vollbild-Route `/stats/:gameId` ohne `Shell`/`BottomNav`
  (`src/pages/GameStatsTracker.tsx`), erreichbar über einen "📊 Spiel-Stats
  tracken"-Button auf der Startseite (ab Spieltag) bzw. einen "Stats
  tracken"/"Stats ansehen"-Link je Spiel im Admin-Bereich.
  - **Datenmodell:** jede Aktion (Korb, Rebound, Assist, Foul, ...) ist eine
    einzelne Zeile in `game_stat_events` (Team, Spieler, Viertel, Stat-Typ) —
    kein aggregierter Zwischenstand in der DB. `games.final_score_us`/
    `final_score_opponent` werden per Trigger (`recalc_game_score()`) bei
    jedem Insert/Delete aus den Events neu berechnet, es gibt also keine
    zweite, manuell zu pflegende Quelle für den Endstand mehr. Box-Score
    und Viertel-Stände werden rein clientseitig aus den geladenen Events
    aggregiert (`src/lib/gameStats.ts`).
  - **Zugriff bewusst nicht auf Trainer/Admin beschränkt** — laut Absprache
    trackt "wer gerade Zeit hat beim Spiel", also jeder Spieler oder Trainer.
  - **"Nur eine Person gleichzeitig"** ist ein weicher Lock mit Herzschlag
    (`game_stat_sessions` + `claim_stat_session`/`heartbeat_stat_session`/
    `release_stat_session`-RPCs), bewusst kein harter Lock: läuft der
    Herzschlag (alle 15s) länger als 30s nicht, gilt der Lock als frei, und
    ein anderer Nutzer kann jederzeit aktiv "Trotzdem übernehmen" — verhindert,
    dass jemand dauerhaft ausgesperrt bleibt, nur weil eine Seite nicht sauber
    verlassen wurde (Handy weggesteckt, Tab geschlossen). Wer den Lock
    verliert, bekommt das beim nächsten Herzschlag mitgeteilt und die Eingabe
    wird clientseitig gesperrt.
  - **Abschluss:** "Spiel beenden" (`finalize_game_stats`) setzt
    `games.stats_finalized_at` und gibt den Lock frei — danach zeigt dieselbe
    Route nur noch den Box-Score, ohne Eingabe-UI. Trainer/Admin können über
    "Wieder öffnen" (`reopen_game_stats`, bewusst Trainer-only) ein
    versehentlich abgeschlossenes Spiel erneut freigeben.
  - **Alte Funktion entfernt:** `game_player_points`-Tabelle und
    `GamePointsEditor.tsx` gelöscht, das manuelle Endstand-Eingabefeld im
    "Neues Spiel"-Formular entfernt (Endstand ist jetzt reine Ableitung).
  - **Nachtrag:** Spieler-Auswahl im Tracker auf den veröffentlichten Kader
    des jeweiligen Spiels eingeschränkt (`game_squad` mit `is_selected =
    true`) statt immer alle aktiven Spieler des Vereins zu zeigen — fällt
    auf alle aktiven Spieler zurück, falls für ein Spiel (noch) kein Kader
    hinterlegt ist, damit das Tracken nicht blockiert. Der Ablauf ist jetzt
    zweistufig: Spieler-Raster wird nach der Auswahl ausgeblendet und durch
    das Aktions-Panel für genau diesen Spieler ersetzt (mit "Spieler
    wechseln"-Rücksprung), statt beides gleichzeitig anzuzeigen.
  - **Zweiter Nachtrag (Feedback nach dem ersten echten Testlauf, "kann
    hektisch werden — muss einfach und schnell bedienbar sein"):** drei
    Anpassungen. (1) Neue Unterscheidung "Auf dem Feld" (genau 5 Spieler)
    vs. "Bank" (Rest des Kaders) statt aller Kader-Spieler gleichrangig in
    einem Raster — nur die 5 aktuell spielenden sind als große Buttons
    antippbar, die Bank wird klein/ausgegraut nur zur Information darunter
    gezeigt. Neue Tabelle `game_court_state` (Migration `0029`) hält die
    aktuelle Aufstellung als Spieler-ID-Array, bewusst getrennt von
    `game_squad` (das ist der Kader *vor* dem Spiel, "auf dem Feld" ändert
    sich ständig währenddessen durch Wechsel) und getrennt vom
    Tracking-Lock (`game_stat_sessions`) selbst, damit eine Übernahme durch
    einen anderen Tracker mitten im Spiel (siehe oben) die Aufstellung
    nicht verliert. Beim ersten Öffnen ohne gespeicherte Aufstellung startet
    eine "Startaufstellung"-Auswahl (Kader antippen, bis genau 5 gewählt
    sind); danach ein "🔄 Auswechseln"-Button mit zweistufigem Ablauf (erst
    antippen wer raus geht, dann wer von der Bank reinkommt) statt einer
    freien Mehrfachauswahl — weniger Fehlbedienung unter Zeitdruck. Bei
    einem Kader mit 5 oder weniger Spielern (z. B. beim Testen) entfällt
    die ganze Unterscheidung, dann sind einfach alle direkt antippbar.
    (2) Spieler-Buttons zeigen nur noch Vorname + Anfangsbuchstabe
    Nachname (`shortPlayerName()` in `src/lib/format.ts`, z. B. "Marc R."),
    voller Name war auf den großen Buttons unnötig breit. (3) Nach einer
    erfassten Aktion springt die Ansicht automatisch zurück (siehe
    Dritter Nachtrag: seit dort zur Aktionsauswahl statt zur
    Spielerauswahl) — der Trainer wollte laut eigener Aussage lieber
    jedes Mal neu antippen, als sich merken zu müssen, ob noch der
    richtige Spieler ausgewählt ist.
  - **Dritter Nachtrag (Vergleich mit der bisher genutzten Zusatz-App
    easystatsapp.com, per Screenshots):** zwei weitere Anpassungen.
    (1) Reihenfolge umgedreht — erst Aktion, dann Spieler, statt
    umgekehrt: Standardansicht ist jetzt ein Raster aus runden
    Aktions-Buttons (`ActionCircle` in `GameStatsTracker.tsx`, angelehnt
    an easystatsapp.com aber in der eigenen Farbwelt statt deren
    Lila-Verlauf) — 2er/3er/Freiwurf als Treffer/Fehlwurf-Paar
    grün/rot, darunter Rebound/Assist/Steal/Block/Ballverlust/Foul in
    Kurzform. Erst nach dem Antippen einer Aktion erscheint "Wer? —
    <Aktion>" mit den 5 Spielern auf dem Feld zur Auswahl (nur bei
    diesen, nicht der Bank); "Abbrechen" verwirft die Aktion und geht
    zurück zum Aktions-Raster. Startaufstellung/Auswechseln bleiben
    unverändert Spieler-zuerst (dort gibt es keine Aktion zum Voranstellen).
    (2) Spielerprofil-Fotos statt reiner Namens-Buttons — neue
    `PlayerTile`-Komponente nutzt die bestehende `Avatar`-Komponente
    (dieselbe wie in Kader/Spielerprofile, mit Foto oder Initialen-Kreis
    als Fallback) für Startaufstellung, Auswechseln, den "Wer?"-Picker,
    den "Auf dem Feld"-Streifen, das "Zuletzt"-Log und die
    Box-Score-Tabelle — durchgängig statt nur an einzelnen Stellen.
  - **Vierter Nachtrag (Layout-Feedback):** drei Anpassungen. (1) Die
    "Auf dem Feld"-Karte steht jetzt unter statt über der Aktions-Karte,
    damit die Aktionen — das, was man während des Spiels am häufigsten
    braucht — zuerst kommen. (2) Der "Auf dem Feld"-Streifen war eine
    horizontal scrollende Leiste (`overflow-x-auto`), auf der bei 5
    Spielern seitlich gescrollt werden musste — jetzt ein festes
    `grid-cols-5` mit kleineren Avataren (`size="xs"`), damit alle 5 auf
    einen Blick sichtbar sind, ohne zu scrollen. (3) `ActionCircle` hatte
    zuvor keine feste Größe (`aspect-square`, gestreckt auf die volle
    Grid-Spaltenbreite) — auf einem Handy wurden die Kreise dadurch riesig
    (2P/3P/FW allein brauchten ca. 550px Höhe). Jetzt eine feste, kleinere
    Größe (`size`-Prop: "md" 64px für die Wurf-Paare, "sm" 56px für die
    übrigen Stats) — auf einem gängigen iPhone (390×844) passen jetzt
    wieder alle Aktionen ohne Scrollen auf den Bildschirm. Auf sehr
    kleinen/älteren Geräten (z. B. iPhone SE, 375×667) bleibt ein kurzes
    Scrollen für die letzte Stat-Reihe nötig — bewusst nicht noch weiter
    verkleinert, um die Buttons unter Zeitdruck treffsicher antippbar zu
    halten.
  - **Fünfter Nachtrag (Optik + Verwechslungsschutz):** zwei Anpassungen.
    (1) `ActionCircle` von dünnem farbigem Umriss auf Volltonfarbe mit
    sanftem Verlauf (helltönig zur Kernfarbe) und Schatten umgestellt —
    auf einen Blick klarer erkennbar als Treffer/Fehlwurf/neutral als ein
    dünner Rand mit farbiger Schrift, wirkt moderner. Dabei auch wieder
    etwas größer (76px für die Wurf-Paare, 64px für die übrigen Stats,
    vorher 64px/56px aus dem vierten Nachtrag). (2) Direkt über der
    Aktions-Karte zeigt eine dezente Zeile "Zuletzt: [Foto] Name · Aktion"
    die zuletzt erfasste Aktion an (nur im Aktions-Raster, nicht während
    Startaufstellung/Auswechseln/"Wer?"-Auswahl) — dient als schnelle
    Verwechslungskontrolle, ohne extra zum "Zuletzt"-Log weiter unten
    scrollen zu müssen; das Log dort bleibt unverändert für die volle
    Historie + Rückgängig.
  - **Sechster Nachtrag (Gegner-Punkte in den Aktions-Ablauf integriert):**
    die eigene "Gegner"-Karte mit +2/+3/+1-Buttons ist weg. Stattdessen
    läuft das Erfassen von Gegner-Punkten über denselben Aktion-zuerst-
    Ablauf wie für die eigene Mannschaft: 2er/3er/Freiwurf-Treffer
    antippen, im "Wer?"-Picker erscheint als sechste, optisch abgesetzte
    Kachel (`OpponentTile`, gestrichelter Rand, gedeckte statt navy/grüne
    Farben, 🆚-Symbol) neben den bis zu fünf Spielern auf dem Feld — Tippen
    darauf bucht den Punkt auf `team = 'opponent'`. Taucht bewusst nur bei
    den drei Treffer-Aktionen auf (`OPPONENT_ELIGIBLE`), nicht bei
    Fehlwurf oder den übrigen Stats — für den Gegner wird laut Schema
    (Migration 0028, `game_stat_events_opponent_scoring_only`) ohnehin nur
    der Punktestand getrackt, kein voller Box-Score.
  - **Siebter Nachtrag (Scroll-Position bei Screen-Wechseln):** nach einer
    Aktion, die den angezeigten Inhalt komplett austauscht (z. B.
    "Wechseln" antippen, wenn man dafür erst zur "Auf dem Feld"-Karte
    runtergescrollt hatte), blieb die Seite auf der bisherigen
    Scroll-Position stehen — der neue Bildschirm ("Wer geht raus?") war
    dadurch unsichtbar, ohne von Hand wieder hochzuscrollen. Ein
    `screenKey` fasst die sich gegenseitig ausschließenden Ansichten
    zusammen (Startaufstellung/Auswechseln inkl. beider Teilschritte/
    "Wer?"-Picker je Aktion/Aktions-Raster); ändert sich dieser Wert,
    scrollt ein `useEffect` per `window.scrollTo(0, 0)` nach oben — analog
    zum bereits bestehenden Scroll-Reset bei Tab-Wechseln in `App.tsx`.
  - **Achter Nachtrag (Spielerauswahl 2 statt 3 Spalten):** Startaufstellung,
    Auswechseln und der "Wer?"-Picker zeigen die Spieler-Kacheln jetzt in
    einem `grid-cols-2`-Raster statt `grid-cols-3` — bei 5 Spielern +
    Gegner-Kachel ergibt das genau 3 Zeilen zu 2 Spalten. Die Kacheln
    (`PlayerTile`/`OpponentTile`) sind dadurch spürbar größer und leichter
    zu treffen: `Avatar`-Größe von "sm" (64px) auf "lg" (96px) hoch,
    Innenabstand und Namensschrift ebenfalls vergrößert. Betrifft nur die
    Spielerauswahl — das Aktions-Raster (2P/3P/FW + Rebound/Assist/...)
    bleibt unverändert bei 2 bzw. 3 Spalten.
- **"Kader"-Reiter zu "Spiele" umbenannt und umstrukturiert
  (`src/pages/Kader.tsx` → `src/pages/Spiele.tsx`, Route `/kader` →
  `/spiele` mit Redirect für alte Links, Shell-Titel "Spiele & Kader").**
  Vorher stand das nächste Spiel direkt über dem (bei Spielern immer
  sichtbaren, bei Trainern immer editierbaren) Kader, und alle weiteren
  Spieltage waren komplett hinter einem Ausklapp-Button versteckt. Neue
  Struktur für beide Rollen: oben das nächste Spiel prominent mit allen
  Infos, darunter direkt die nächsten 3 Spieltage, erst danach ein
  "Weitere Spieltage anzeigen"-Button für den Rest (blendet den Button
  ganz aus, falls es keine weiteren gibt). Der Kader selbst ist jetzt in
  beiden Rollen eingeklappt: Spieler sehen einen "Kader anzeigen"-Button
  (nur sobald `squad_published`), Trainer/Admin zwei Buttons "Kader
  festlegen" und "Treffpunkt hinterlegen", die die bisherige
  Editier-Liste bzw. das `MeetingPointFields`-Formular erst bei Klick
  einblenden — der Fokus liegt dadurch zuerst auf der Spielübersicht,
  nicht mehr auf der Namensliste.
  - **Nachtrag (Buttons ändern Beschriftung nach dem Speichern):** die
    beiden Trainer/Admin-Buttons schließen ihr Panel jetzt automatisch,
    sobald die jeweilige Aktion erfolgreich gespeichert wurde — bei
    "Kader festlegen" ist das der Klick auf "Veröffentlichen"/
    "Zurückziehen" (`togglePublish`), bei "Treffpunkt hinterlegen" der
    Klick auf "Treffpunkt speichern" (`saveMeetingPoint`). Der Button-Text
    selbst richtet sich danach, ob für das nächste Spiel bereits etwas
    hinterlegt ist, nicht nach der Panel-Historie: "Kader festlegen" wird
    zu "Kader ansehen", sobald `squad_published` true ist; "Treffpunkt
    hinterlegen" wird zu "Treffpunkt bearbeiten", sobald `meetingPoints()`
    für das Spiel mindestens einen Eintrag liefert. Beide Buttons öffnen
    unter ihrem neuen Namen weiterhin dasselbe (voll editierbare) Panel —
    nur die Beschriftung ändert sich. Die bisherige separate
    "Gespeichert"-Bestätigung neben dem Treffpunkt-Speichern-Button ist
    dadurch redundant geworden (das Panel schließt sich ja direkt) und
    wurde entfernt.
  - **Zweiter Nachtrag (Status-Pill umbenannt):** die Pill neben dem
    nächsten Spiel hieß bislang schlicht "Entwurf"/"veröffentlicht" —
    das las sich so, als stünde das ganze Spiel noch nicht fest, obwohl
    sich der Status ausschließlich auf `squad_published` bezieht. Jetzt
    "Kader ausstehend"/"Kader veröffentlicht", macht also explizit, dass
    nur der Kader betroffen ist.
  - **Dritter Nachtrag (Pill lief auf echten Geräten zweizeilig um):** der
    längere Text ("Kader veröffentlicht") ist knapp zu breit für den
    verbleibenden Platz neben den Spiel-Infos, wodurch die Pill auf
    zweizeilig umgebrochen ist statt sich einzeilig einzureihen — sichtbar
    erst im Screenshot vom echten iPhone, nicht im Playwright-Test mit
    kürzerem Beispieltext. Pill jetzt `shrink-0 whitespace-nowrap` (bricht
    nie um, wird vom Flex-Layout nicht mehr gestaucht) mit etwas kleinerer
    Schrift (`!text-[10px]` statt der Standard-`text-xs` aus `.pill`); der
    linken Spalte (Gegner/Datum/Ort) dafür `min-w-0` ergänzt, damit sie bei
    Platzmangel wie gehabt selbst umbricht statt die Pill zu verdrängen.
- **Reihenfolge der Bottom-Nav geändert** (`src/components/BottomNav.tsx`):
  Start – Spiele – Team – Trikots – Kampfgericht – Admin. Team wird
  weiterhin nur bei aktiviertem `player_profiles`-Flag eingeblendet und
  Admin weiterhin nur für Trainer/Admin-Spieler — beide werden jetzt aber
  an ihrer festen Zielposition eingefügt (Team direkt hinter Spiele,
  Admin am Ende) statt wie zuvor pauschal ans Ende der Liste angehängt.
- **Trikot-Kacheln auf dem Dashboard brachen uneinheitlich um** (nur
  "Schwarz · Auswärts" wickelte sich in der zweispaltigen Kachel auf zwei
  Zeilen, "Weiß · Heim" blieb einzeilig — sah auf echten Geräten schief
  aus). `set.label` (Format immer "Farbe · Ort", siehe Seed-Daten in
  `0001_init.sql`) wird in `Dashboard.tsx` jetzt am " · " gesplittet und
  jeder Teil als eigener `block`-Span gerendert, statt den Umbruch dem
  Browser bei zufälliger Containerbreite zu überlassen — beide Kacheln
  sind dadurch immer zweizeilig.
  - **Nachtrag:** dasselbe Muster (`set.label.split(' · ')` als je ein
    `block`-Span) auch im eigenständigen Trikots-Reiter (`Trikots.tsx`)
    ergänzt — dort liegt dieselbe zweispaltige Kachel-Ansicht vor, war
    aber beim ersten Fix übersehen worden.
- **"Kader ansehen"-Link auf dem Dashboard öffnete den Kader auf der
  Spiele-Seite nicht automatisch mit** (`Dashboard.tsx` → `Spiele.tsx`).
  Der Link führt jetzt auf `/spiele?kader=1`; `Spiele.tsx` liest den
  Query-Parameter per `useSearchParams` und öffnet beim Laden automatisch
  das passende Panel — `squadOpen` für Spieler, `squadEditorOpen` für
  Trainer/Admin (relevant für einen spielenden Trainer mit `isAdmin`,
  der trotzdem über den Spieler-Dashboard-Link kommt).
- **Scroll-Reset bei In-Page-Screenwechseln vereinheitlicht.** Bislang gab
  es nur den Scroll-Reset bei Routenwechseln (`App.tsx`, per
  `location.pathname`) sowie eine einzelne Insel-Lösung dafür in
  `GameStatsTracker.tsx` (`screenKey`-Effekt) — jede andere Seite, die
  innerhalb derselben Route zwischen deutlich unterschiedlichen Inhalten
  wechselt (Liste → Detail, Tabs, Formular-Schritte), hatte keinen
  Scroll-Reset. Konkret aufgefallen bei `PlayerProfiles.tsx` (Team):
  runterscrollen in der Spielerübersicht, dann einen Spieler antippen —
  die Detailansicht öffnete sich, aber nur angeschnitten auf der alten
  Scroll-Position statt von oben.
  - Dafür jetzt der wiederverwendbare Hook `useScrollResetOnChange(key)`
    (`src/hooks/useScrollResetOnChange.ts`, `window.scrollTo(0, 0)` in
    einem `useEffect` über `key`) — `GameStatsTracker.tsx` wurde darauf
    umgestellt (identisches Verhalten wie vorher, nur ohne Duplikation),
    und zusätzlich ergänzt bei `PlayerProfiles.tsx` (`selectedId`, Liste
    ↔ Detail), `Admin.tsx` (`tab`, wechselt zwischen den
    Admin-Unterseiten) und `Onboarding.tsx` (`step`, wechselt zwischen
    Intro/Login/Code-Screens).
  - **Konvention für neue Features:** sobald eine Seite innerhalb
    derselben Route per State zwischen "Screens" umschaltet, die den
    bisherigen Inhalt komplett ersetzen (nicht: ein Abschnitt klappt sich
    unterhalb des vorhandenen Inhalts auf, wie z. B. "Kader anzeigen" auf
    `Spiele.tsx` — das braucht keinen Reset), `useScrollResetOnChange`
    mit dem entsprechenden State-Wert aufrufen.
- **Kader-Bestätigung (Migration `0030_squad_confirmation.sql`).** Ein
  Spieler, der im veröffentlichten Kader steht, sieht in der Kader-Liste
  unter "Spiele" seine eigene Zeile hervorgehoben (fett, "(Du)") mit zwei
  Buttons "✓ Kann" / "✗ Kann nicht" statt nur des Namens.
  - **Datenmodell:** `game_squad.confirmation` (`pending` | `confirmed` |
    `declined`, Default `pending`). Direktes Schreiben bleibt weiterhin
    Trainer-only (bestehende RLS-Policy unverändert) — ein Spieler ändert
    ausschließlich über die neue security-definer-RPC
    `respond_to_squad(p_game_id, p_confirmed)` seine EIGENE Zeile, und
    nur solange er dort noch `is_selected = true` ist.
  - **Absage entfernt automatisch aus dem Kader:** die RPC setzt bei
    `p_confirmed = false` neben `confirmation = 'declined'` auch
    `is_selected = false` — der Spieler verschwindet damit sofort aus
    der (nur ausgewählte Spieler zeigenden) Kader-Liste, auch für sich
    selbst. Eine Zusage kann er jederzeit wieder zu einer Absage ändern
    (Link "Doch nicht?" neben der "✓ Zugesagt"-Pille); nach einer Absage
    ist er raus und kann nicht mehr selbst zurück — nur der Trainer kann
    ihn erneut aufnehmen, danach kann er wieder reagieren.
  - **"Abgesagt"-Zustand nur für den Trainer sichtbar:** die Trainer-Kader-
    Bearbeitung zeigt für einen entfernten Spieler mit
    `confirmation = 'declined'` statt "nicht im Kader" die Pille
    "abgesagt" (`pill-warn`), damit eine Absage von einer normalen
    Nichtberücksichtigung unterscheidbar bleibt. Jeder manuelle Trainer-
    Eingriff (`toggle()` in `Spiele.tsx`, egal ob rein oder raus) setzt
    `confirmation` wieder auf `pending` zurück — für andere Spieler bleibt
    der Absage-Status also unsichtbar, sie sehen die abgesagte Person
    einfach nicht mehr in der Liste.
  - **Dashboard-Meldung für den Trainer:** neue Spalte
    `games.squad_decline_pending` (Default `false`), von der RPC bei
    einer Absage auf `true` gesetzt. Solange sie gesetzt ist, zeigt
    `Dashboard.tsx` für Trainer/Admin oberhalb von "Nächstes Spiel" eine
    Kachel ("Kader-Absage", Warnfarbe) mit den Namen aller aktuell
    abgesagten Spieler und einem "Kader bearbeiten"-Link auf
    `/spiele?kader=1`. Die Meldung gilt bewusst schon als "gesehen",
    sobald der Trainer die Kader-Bearbeitung für dieses Spiel öffnet
    (unabhängig davon, ob er den betroffenen Spieler tatsächlich
    anfasst) — `Spiele.tsx` setzt `squad_decline_pending` per Effekt auf
    `false`, sobald `squadEditorOpen` wahr wird. Das ist bewusst getrennt
    von der pro Spieler persistenten "abgesagt"-Pille im Editor (die
    bleibt bestehen, bis der Trainer den Spieler wieder aufnimmt) — die
    Dashboard-Kachel ist nur ein einmaliger Hinweis, keine Aufgabenliste.
  - **Nachtrag (Zusage sichtbar für den Trainer):** in der Trainer-Kader-
    Bearbeitung steht jetzt neben dem Namen eines ausgewählten und
    bereits zugesagten Spielers (`is_selected` und `confirmation ===
    'confirmed'`) ein grünes ✓ — vorher war für den Trainer nicht
    unterscheidbar, ob ein im Kader stehender Spieler schon reagiert hat
    oder noch auf "pending" steht.
  - **Zweiter Nachtrag (Uhr-Symbol für noch offene Antworten, Hinweis auf
    dem Spieler-Dashboard):** ausgewählte Spieler mit `confirmation ===
    'pending'` zeigen in der Trainer-Kader-Bearbeitung jetzt statt gar
    keinem Symbol ein 🕐 neben dem Namen (analog zum ✓ bei Zusage) — macht
    auf einen Blick sichtbar, wer noch nicht reagiert hat. Auf dem
    Spieler-Dashboard steht unter "Du bist dabei!" bei ausstehender
    Rückmeldung (`myConfirmation === 'pending'`) zusätzlich ein auffälliger
    roter Hinweis "⚠️ Bitte Teilnahme bestätigen" (verlinkt auf
    `/spiele?kader=1`); bei erfolgter Zusage steht stattdessen
    "Du bist dabei! (zugesagt)" ohne den Hinweis. Dashboard.tsx lädt dafür
    zusätzlich `confirmation` aus der eigenen `game_squad`-Zeile
    (vorher nur `is_selected`).
- **Intro-Folien im Onboarding laufen jetzt automatisch durch**
  (`Onboarding.tsx`, `Intro`-Komponente): alle 5 Sekunden (`INTRO_SLIDE_MS`)
  blättert ein `useEffect`/`setTimeout` selbständig zur nächsten Folie
  bzw. ruft nach der letzten Folie `onDone()` auf (identisches Verhalten
  zum manuellen "Weiter"-Klick, der Effekt hängt an `index` und setzt sich
  dadurch bei jedem — manuellen wie automatischen — Fortschritt neu auf).
  "Weiter" und "Überspringen" funktionieren weiterhin normal. `onDone`
  bewusst nicht in den Effekt-Deps, da `Onboarding.tsx` bei jedem Rerender
  eine neue Closure übergibt, was den 5s-Timer sonst unnötig
  zurückgesetzt hätte.
- **"Aktuell abwesend" auf dem Dashboard zeigte auch zukünftige Abwesenheiten
  mit an** (`Dashboard.tsx`): die Query filterte nur auf `end_date >= heute`,
  wodurch auch noch nicht begonnene Urlaube in der Liste auftauchten. Die
  bereits geladenen Zeilen werden jetzt clientseitig per `start_date` in
  aktuell (`start_date <= heute`) und kommend (`start_date > heute`) getrennt
  — aktuell laufende Abwesenheiten stehen direkt sichtbar, kommende sind über
  einen Ausklapp-Button ("N kommende Abwesenheiten anzeigen") erreichbar. Kein
  zusätzlicher Query nötig, die Daten waren schon vorhanden.
- **Admin-geflaggte Spieler sahen ihre eigene Kader-Bestätigung
  (✓ Kann / ✗ Kann nicht) nicht** (`Spiele.tsx`): der Block war an
  `role === 'player' && !isAdmin` geknüpft, wodurch jeder Spieler mit
  Trainer-Rechten (z. B. ein spielender Co-Trainer) komplett ausgeschlossen
  war — er sah nur noch die Trainer-Kader-Bearbeitung, aber keine Möglichkeit
  mehr, für sich selbst zu- oder abzusagen. Die `!isAdmin`-Ausnahme wurde
  entfernt; ein admin-geflaggter Spieler sieht jetzt wie vorgesehen beides:
  die Trainer-Werkzeuge und seine eigene Spieler-Ansicht mit
  Bestätigungs-Buttons.
- **Automatische Erinnerungen auf der Spieler-Startseite (Migration
  `0031_reminder_settings.sql`).** Neue Karte "Für dich zu erledigen" ganz
  oben (optisch wie die Kader-Absage-Meldung beim Trainer), die drei
  unabhängige Erinnerungen bündelt: Kader-Zusage noch offen, nächstes
  Training noch nicht beantwortet, Kampfgericht-Mindesteinsätze der Saison
  noch nicht erreicht (nur wenn es auch offene Kampfgericht-Termine gibt).
  Reine Anzeige-Logik in `lib/reminders.ts` (`computeReminders`, mit
  Tests) — jede der drei Quellen wird unabhängig geprüft und ist optional,
  damit z. B. eine deaktivierte Kampfgericht-Funktion die anderen beiden
  nicht blockiert. Die Fristen ("ab wie vielen Tagen vorher") sind pro
  Team unter Admin → Funktionen → "Erinnerungen" einstellbar
  (`reminder_settings`-Singleton-Tabelle statt weiterer `feature_flags`,
  da hier Zahlenwerte statt an/aus gebraucht werden). U18-Spieler, die
  schon über ihre eigene Mannschaft fürs Kampfgericht eingeteilt werden,
  lassen sich pro Spieler unter Admin → Spieler von der
  Kampfgericht-Erinnerung ausnehmen (`players.officiating_exempt`) — sie
  können bei Bedarf trotzdem weiterhin Positionen übernehmen, nur die
  Erinnerung entfällt. Der Training-Eintrag verlinkt per Anker (`#training`)
  auf die schon vorhandene "Nächste Trainingseinheit"-Karte weiter unten auf
  derselben Seite, statt eine eigene Seite zu öffnen.
- **Eigene Kader-Bestätigung für admin-geflaggte Spieler war trotz Fix aus
  PR #90 in der Praxis nicht auffindbar** (`Spiele.tsx`): PR #90 hatte den
  Sichtbarkeits-Bug behoben, aber die Bestätigungs-Buttons standen weiterhin
  nur in einem separaten, zweiten "👥 Kader anzeigen"-Abschnitt unterhalb der
  Trainer-Kader-Bearbeitung — und ein admin-geflaggter Spieler öffnet als
  Erstes praktisch immer den (ähnlich benannten) Trainer-Button "👥 Kader
  ansehen", nicht diesen zweiten. Die eigene Zeile in der
  Trainer-Kader-Bearbeitung (`sortedForTrainer`-Liste) zeigt jetzt zusätzlich
  direkt "Kannst du selbst?" mit ✓/✗-Buttons (bzw. "✓ Du hast zugesagt" +
  "Doch nicht?"), sobald der eigene Spieler im Kader steht.
- **Zwei parallele, ähnlich benannte Kader-Ansichten für admin-geflaggte
  Spieler entfernt** (`Spiele.tsx`): nachdem die eigene Zu-/Absage direkt in
  die Trainer-Kader-Bearbeitung eingebaut wurde (siehe vorheriger Punkt), war
  der separate Spieler-Abschnitt ("👥 Kader anzeigen") für diese Nutzer nur
  noch verwirrende Dopplung neben "👥 Kader ansehen" — beide taten für sie
  praktisch dasselbe. Der separate Abschnitt ist jetzt wieder
  `role === 'player' && !isAdmin` (wie ursprünglich vor PR #90), ein
  admin-geflaggter Spieler sieht nur noch die eine Trainer-Ansicht, die
  Verwaltung und eigene Zusage vereint.
- **Training-Erinnerung nennt jetzt das konkrete Datum** (`lib/reminders.ts`):
  der Text war generisch "Nächstes Training noch nicht beantwortet". Ist die
  Startzeit des heutigen Trainings schon vorbei, rutscht der intern geprüfte
  "nächste" Termin korrekt auf den übernächsten Tag weiter (z. B. Montag bei
  zwei Trainingstagen pro Woche) — die Erinnerung selbst hat also immer nur
  einen einzigen Termin im Blick, nie beide auf der Startseite angezeigten.
  Ohne Datum im Text wirkte das aber wie ein Bug, wenn man den erstgenannten
  (bereits beantworteten) Termin schon zugesagt hatte. Text jetzt z. B.
  "Training am Mo., 14.09.2026 noch nicht beantwortet".
- **Training-Erinnerung blieb nach dem Zusagen sichtbar, bis man die Seite
  neu lud** (`UpcomingTrainings.tsx`, `Dashboard.tsx`): Zu-/Absagen zu einem
  Training passiert direkt in der `UpcomingTrainings`-Komponente auf der
  Startseite, aber die "Für dich zu erledigen"-Karte lebt im umgebenden
  `Dashboard.tsx` mit eigenem, unabhängigem Ladezustand — eine Zusage dort
  hat den nie neu ausgelöst. Analog zum bereits bestehenden
  `AbsenceSection`/`absenceVersion`-Muster bekommt `UpcomingTrainings` jetzt
  einen optionalen `onChange`-Callback, der nach jeder erfolgreichen
  Zu-/Absage feuert; `Dashboard.tsx` zählt darüber einen neuen
  `trainingVersion`-State hoch, der in den Abhängigkeiten des
  Lade-Effekts steht — die Erinnerung verschwindet dadurch sofort, ganz
  ohne Reload.
- **Training-Erinnerung erschien trotz bereits erfolgter Zusage, auch nach
  vollständigem Neustart** (`Dashboard.tsx`): der eigentliche Bug — anders als
  der vorherige Punkt, der nur das Live-Update betraf. Die Abfrage der
  eigenen RSVP für die Erinnerung nutzte `.select('id')` auf
  `training_rsvps` — diese Tabelle hat aber gar keine `id`-Spalte, sondern
  einen zusammengesetzten Primary Key aus
  `(training_id, session_date, player_id)` (siehe Migration
  `0005_training_rsvps.sql`). Die Abfrage schlug dadurch serverseitig mit
  einem "column does not exist"-Fehler fehl; da der Fehler nicht geprüft
  wurde, blieb `rsvpRow` immer `null` — die Erinnerung hielt eine
  Zu-/Absage für nicht vorhanden, egal was wirklich in der Datenbank stand.
  Jetzt `.select('is_attending')` (ein Feld, das dort tatsächlich existiert)
  plus Fehlerprotokollierung, falls sowas nochmal passiert. Im
  Playwright-Mock-Testing dieser Session fiel das nicht auf, weil die Mocks
  Tabellen-Antworten frei erfinden, statt wie echtes PostgREST tatsächliche
  Spalten zu validieren — ein struktureller blinder Fleck des bisherigen
  Test-Ansatzes für diese Art Fehler.
- **Trikot-Übergabe: Erinnerung + Nachtrag-Banner bei vergessener
  Bestätigung** (`lib/trikots.ts`, `lib/reminders.ts`, `Trikots.tsx`,
  `Dashboard.tsx`): bisher zeigte die Trikots-Seite nur den nächsten
  Wäscher an, ohne Erinnerung auf der Startseite und ohne Reaktion, falls
  die Übergabe am Spieltag vergessen wurde. Die gemeinsame Rotationslogik
  (wer ist laut `naechsterSpieler` dran, ist die Übergabe fürs jeweilige
  Set schon in `trikot_wash_log` bestätigt) steckt jetzt in einer einzigen
  reinen, getesteten Funktion `pendingWasherFor()`, die sowohl von
  `Trikots.tsx` als auch von der Erinnerungs-Berechnung in `Dashboard.tsx`
  genutzt wird, damit beide Stellen nie auseinanderlaufen. Zwei Teile:
  (1) Auf der Trikots-Seite erscheinen die "✓ Übernimmt" / "✗ Kann
  nicht"-Buttons für das nächste Spiel erst ab dem Spieltag selbst
  (`game_date === heute`) — vorher steht dort nur informativ "Nächster
  Trikotwäscher: X" mit dem Hinweis "Bestätigen kann X ab dem Spieltag."
  (Nutzer-Feedback: vorzeitiges Bestätigen vor dem eigentlichen Spieltag
  wäre verwirrend). (2) Bleibt die Übergabe für ein bereits gespieltes
  Spiel unbestätigt, erscheint oben auf der Trikots-Seite dauerhaft (ohne
  Ablaufdatum) ein rotes Banner "Bitte nachtragen" mit der Frage "Hat X
  beim Spiel vs. Y die Trikots mitgenommen?" und Ja-/Nein-Buttons; "Nein"
  öffnet eine Auswahl, wer das Set stattdessen mitgenommen hat. Bestätigen
  können wie bisher nur der/die betroffene Spieler/in selbst, Captains
  oder der Trainer. Auf der Startseite erscheint parallel ein
  "🧺 Trikot-Übergabe … noch nicht bestätigt"-Eintrag in der
  "Für dich zu erledigen"-Karte, solange die Übergabe (für das aktuelle
  oder das letzte Spiel) den eigenen Spieler betrifft und offen ist. Keine
  neue Migration nötig — die Funktion nutzt ausschließlich bereits
  vorhandene Tabellen (`trikot_wash_log`, `game_squad`, `games`). Auf eine
  zusätzliche manuelle Wäscher-Zuweisung durch den Trainer wurde bewusst
  verzichtet, da das rote Banner samt Alternativ-Auswahl den Korrekturfall
  schon abdeckt.
- **Ferienzeiten & Sonderregelungen fürs Training** (`training_overrides`,
  `lib/trainingSchedule.ts`, `TrainingsAdmin.tsx`): in Schulferien ist die
  Halle oft geschlossen, manchmal gibt es aber weiterhin die gewohnten
  Zeiten oder sogar eigene Sonderzeiten vom Verband — auch an ganz anderen
  Wochentagen als sonst üblich. Der Trainer trägt unter Admin → Training →
  "Ferienzeiten & Sonderregelungen" einen Zeitraum ein (analog zu
  `player_absences`, siehe weiter oben) und wählt einen Modus: "Reguläres
  Training" (reine Dokumentation/Notiz, ändert nichts an der Berechnung)
  oder "Sonderzeiten" — dann entfallen alle regulären wöchentlichen
  Trainings im gesamten Zeitraum, und der Trainer trägt darunter beliebig
  viele einzelne Sondertermine mit eigenem Datum, eigener Zeit und Ort
  nach. Technisch ist ein Sondertermin eine ganz normale Zeile in
  `trainings`, nur mit einem konkreten Datum (`specific_date`) statt
  einem wiederkehrenden Wochentag (`weekday`) — dadurch funktioniert
  Zu-/Absage (training_rsvps, FK auf `trainings.id`) ohne jede Änderung.
  Auf der Startseite erscheinen Sondertermine wie normale Trainings mit
  einem 🏖️-Hinweis (Notiz der Ferienzeit, z. B. "Herbstferien"). Die
  Berechnung der nächsten Termine (`nextTrainingOccurrences`) interleaved
  wiederkehrende und einzelne Termine chronologisch und überspringt
  reguläre Termine, die in eine 'special'-Ferienzeit fallen (mit
  Sicherheitsgrenze gegen eine Endlosschleife, falls dauerhaft alles
  wegfällt).
  **Nachtrag (Redesign nach Nutzer-Feedback):** die erste Version konnte
  eine Sonderzeit nur auf einen bereits bestehenden wöchentlichen
  Trainingstag anwenden (nur Zeit/Ort ändern) — ein komplett neuer
  Wochentag (z. B. Dienstag statt Montag+Freitag in den Ferien) war damit
  nicht abbildbar, weil es dafür keinen Termin gab, auf den sich die
  Sonderzeit hätte beziehen können. Auf Vorschlag des Trainers umgebaut
  auf das oben beschriebene zweistufige Modell (Zeitraum + Modus, mit frei
  wählbaren Einzeltagen statt einer pauschalen Uhrzeit für den ganzen
  Zeitraum) — die alte `training_overrides`-Tabelle aus der ersten Version
  wurde dafür (noch ohne echte Nutzdaten) neu aufgesetzt statt migriert.
  **Zweiter Nachtrag (dritter Modus "Fällt aus"):** "Sonderzeiten" ganz
  ohne eingetragene Sondertermine hätte technisch schon einen kompletten
  Ausfall ohne Ersatz bewirkt, war als Option aber weder erkennbar noch
  eindeutig — sah in der Liste wie ein unvollständiger Eintrag aus. Dritter
  expliziter Modus `cancelled` ergänzt (Migration `0034`, erweitert nur den
  Check-Constraint auf `mode`): lässt in der Terminberechnung genauso wie
  `special` alle regulären Trainings im Zeitraum ersatzlos entfallen, ohne
  die Möglichkeit oder Erwartung, Sondertermine einzutragen. Der Trainer
  wählt jetzt zwischen drei klar benannten Buttons: "Regulär", "Fällt aus",
  "Sonderzeiten".
  **Dritter Nachtrag (Bereich aufgeräumt, Ferienzeiten bearbeitbar):** zwei
  Anpassungen auf Nutzer-Feedback. (1) Die Neuanlage-Formulare ("Neue
  Trainingszeit", "Neue Ferienzeit", "Sondertermin hinzufügen") waren immer
  offen sichtbar und haben die Seite unübersichtlich gemacht — sie stecken
  jetzt hinter einem "+ Neu"-Button und klappen erst auf Wunsch auf (mit
  Abbrechen-Button, der Formularwerte wieder zurücksetzt). Das
  Sondertermin-Formular bleibt nach dem Speichern bewusst offen (nur die
  Felder werden geleert), da hier typischerweise mehrere Termine
  hintereinander eingetragen werden. (2) Ferienzeiten lassen sich jetzt
  nachträglich bearbeiten ("Bearbeiten"-Button öffnet ein vorausgefülltes
  Formular für Zeitraum/Notiz/Modus, `training_overrides.update()`) — der
  Trainer kann eine Ferienzeit also erstmal als "Regulär" anlegen und erst
  umstellen, sobald die tatsächlichen Sonderzeiten feststehen, ohne den
  Eintrag löschen und neu anlegen zu müssen.
- **"+ Neu" auch bei Spiele- und Kampfgericht-Admin** (`GamesAdmin.tsx`,
  `OfficiatingAdmin.tsx`): das "+ Neu"-Muster aus dem Training-Admin kam
  beim Trainer gut an, deshalb auf die beiden anderen Admin-Seiten mit
  Neuanlage-Formularen übertragen. Bei `GamesAdmin.tsx` teilt sich das
  Formular ohnehin schon zwischen Neuanlage und Bearbeiten (`editingId`) —
  ein Klick auf "Bearbeiten" bei einem bestehenden Spiel öffnet das
  Formular jetzt genauso wie "+ Neu", nur eben vorausgefüllt und mit
  "Speichern" statt "Anlegen" als Button-Text; "Abbrechen" klappt in
  beiden Fällen wieder ein. Die schon vorhandene "Jahrgänge / Teams"-
  Ablage im Kampfgericht-Admin (eigener ▲/▼-Toggle) blieb unverändert, da
  sie bereits demselben "erst auf Wunsch aufklappen"-Prinzip folgt.
- **Startseite neu sortiert + reine Trainingszeiten-Übersicht**
  (`Dashboard.tsx`, `WeeklyTrainingTimes.tsx`, `AbsenceSection.tsx`): bisher
  zeigte die Startseite die nächsten beiden Trainingstermine zum
  Zu-/Absagen erst weit unten bei den Teaminformationen, und es gab gar
  keine reine Übersicht über die regulären wöchentlichen Trainingszeiten.
  Auf Wunsch neu sortiert: der persönliche Bereich oben ist jetzt
  Erinnerungen/Meldungen → Nächstes Spiel → **Nächste Trainingseinheit
  (Zu-/Absage, von weiter unten hochgezogen)** → Dein nächster
  Kampfgericht-Termin → Dein Urlaub / Abwesenheit (Überschrift von "🌴
  Urlaub / Abwesenheit" auf "🌴 Dein Urlaub / Abwesenheit" präzisiert, da
  jetzt direkt neben anderen "Dein …"-Karten). Im Teaminformationen-
  Bereich (Trainer-/Captain-Übersichtskarten bleiben unverändert an ihrer
  bisherigen Stelle) folgt auf "Wer hat die Trikots?" jetzt eine neue,
  rein informative "Trainingszeiten"-Karte (`WeeklyTrainingTimes.tsx`,
  Wochentag + Uhrzeit + Halle, ohne Zu-/Absage-Buttons) — sie filtert
  bewusst nur reguläre wöchentliche Trainings (`weekday` gesetzt) heraus,
  Sondertermine einer Ferienzeit gehören nicht in diese Dauer-Übersicht.
  Der `id="training"`-Anker für den Sprunglink aus der Erinnerung
  (`lib/reminders.ts`, `to: '#training'`) wanderte mit der Zu-/Absage-
  Karte an ihre neue Position nach oben.
- **Einzelne Trainingseinheit spontan absagen** (`lib/trainingSchedule.ts`,
  `TrainingsAdmin.tsx`, `UpcomingTrainings.tsx`): bisher gab es keine
  schnelle Möglichkeit, nur einen einzelnen Termin ausfallen zu lassen
  (z. B. Trainer krank, Halle kurzfristig belegt) — nur den Umweg über eine
  ganze "Ferienzeit". Technisch ist eine Einzelabsage derselbe Mechanismus
  wie eine Ferienzeit im Modus "Fällt aus", nur mit `start_date === end_date`
  für genau diesen einen Tag — keine neue Tabelle/Migration nötig. Neuer
  Abschnitt "Anstehende Termine" im Training-Admin (zwischen der
  wöchentlichen Liste und den Ferienzeiten) zeigt die nächsten vier
  anstehenden Termine mit einem direkten "Absagen"-Button (optionaler
  Grund, z. B. "Trainer krank") — kein Umweg über die Ferienzeiten-UI
  nötig, auch wenn dort derselbe Eintrag dann ebenfalls auftaucht und
  bearbeitet werden kann. Bereits abgesagte Termine erscheinen in dieser
  Liste weiterhin (rot markiert) mit "Absage zurücknehmen", sofern es sich
  um eine reine Einzeltages-Absage handelt (mehrtägige Ferienzeiten werden
  dort nur informativ angezeigt, ihre Bearbeitung bleibt der
  Ferienzeiten-Sektion vorbehalten, da ein "Rückgängig" sonst versehentlich
  eine ganze Ferienwoche aufheben könnte).
  Wichtiger Unterschied zur bestehenden Ferienzeiten-Logik:
  `nextTrainingOccurrences()` selbst überspringt abgesagte Termine weiterhin
  einfach (unverändert, damit z. B. die "Training noch nicht
  beantwortet"-Erinnerung korrekt den nächsten *echten* Termin nennt) —
  eine neue, separate Funktion `cancelledOccurrencesUntil()` liefert
  zusätzlich genau die abgesagten Termine bis zu einem Stichtag, damit sie
  auf der Startseite (`UpcomingTrainings.tsx`) sichtbar als "❌ Training
  fällt aus" zwischen den echten Terminen stehen bleiben, statt
  kommentarlos zu verschwinden und den Eindruck eines Fehlers zu erwecken.
  **Nebenbei behobener Bug:** die RSVP-Filterung in `UpcomingTrainings.tsx`
  ordnete Zu-/Absagen bisher nur nach `training_id` einem angezeigten
  Termin zu — bei einem Team mit nur einem einzigen wöchentlichen Training
  hätte das zwei verschiedene angezeigte Termine (z. B. "nächsten" und
  "übernächsten" Dienstag) auf denselben `training_id`-Schlüssel gemappt
  und dadurch eine der beiden Zu-/Absage-Listen fälschlich geleert; jetzt
  wird nach `training_id` **und** Datum gefiltert.
- **Push-Benachrichtigungen** (Migration `0035`, `src/sw.ts`, `src/lib/push.ts`,
  `PushNotificationCard.tsx`, `api/send-push.ts`) — Sicherheitsnetz zuerst: bevor an diesem
  Umbau gearbeitet wurde, wurde erst ein automatisches Datenbank-Backup eingerichtet (siehe
  "Supabase Backup" oben), weil die App bereits live im Einsatz war. Größte technische
  Änderung: `vite-plugin-pwa` läuft jetzt mit `strategies: 'injectManifest'` statt
  `generateSW` — nur so kann der Service Worker eigene `push`/`notificationclick`-Listener
  haben. Das bisher automatisch generierte Precaching + die `NetworkFirst`-Route für die
  Supabase-API (siehe "Supabase Keep-Alive") wurden dafür 1:1 von Hand in `src/sw.ts`
  nachgebaut, inklusive `skipWaiting()`/`clients.claim()`, damit sich am Update-/
  Offline-Verhalten für bereits installierte Nutzer nichts ändert. `src/sw.ts` läuft in
  einer eigenen Worker-Umgebung (kein DOM) und wird deshalb über eine eigene
  `tsconfig.sw.json` typgeprüft statt über die App-weite `tsconfig.json`. Versand läuft
  nicht über eine Supabase Edge Function (dafür fehlt CLI-/Dashboard-Zugriff aufs
  Supabase-Projekt), sondern über eine Vercel-Serverless-Function (`api/send-push.ts`,
  ebenfalls kostenlos im Hobby-Tarif, eigene `tsconfig.api.json`), die ein Supabase
  Database Webhook bei jeder neuen Meldung aufruft. Aus demselben Vorsichtsgrund läuft die
  komplette Funktion hinter dem neuen, standardmäßig deaktivierten Feature-Flag
  `push_notifications` — die Opt-in-Karte auf der Startseite erscheint erst, wenn der
  Trainer sie nach abgeschlossenem Setup (siehe "Push-Benachrichtigungen" oben) bewusst
  einschaltet, statt dass allen Nutzern sofort eine halb eingerichtete Funktion angezeigt
  wird. Erste (und bisher einzige) Benachrichtigungsart: neue Meldung im Schwarzen Brett.
- **Nachtrag zum Live-Setup von Push-Benachrichtigungen** (Migration `0036`, `api/send-push.ts`):
  beim ersten Durchlauf gegen die echte Produktionsumgebung kamen drei unabhängige Stolpersteine
  zusammen, alle jetzt in der Setup-Anleitung oben berücksichtigt. (1) Supabase Database Webhooks
  (die naheliegende UI dafür) schlugen mit `schema "supabase_functions" does not exist` fehl —
  ein plattformseitiges Problem, nicht am Projekt behebbar; funktioniert hat stattdessen derselbe
  Effekt über einen von Hand angelegten Trigger, der direkt die `pg_net`-Extension nutzt (siehe
  Setup-Schritt 6). (2) Vercel "Deployment Protection" (Require Log In) blockierte externe
  Aufrufe an `/api/send-push` mit 401, weil keine eigene Domain eingerichtet ist — für Projekte
  ohne Custom Domain muss das ausgeschaltet werden. (3) Die neu angelegte `push_subscriptions`-
  Tabelle bekam nicht automatisch die sonst üblichen Standard-Rechte für die `service_role`,
  was zu `permission denied for table push_subscriptions` (42501) führte — Migration `0036`
  holt das per explizitem `grant` nach. `api/send-push.ts` gibt bei einem Ladefehler seitdem
  auch Fehlerdetails (Message + Code) zurück statt nur einer generischen Meldung, was diese
  Fehlersuche über `select * from net._http_response` im SQL-Editor erst ermöglicht hat.
- **Opt-in-Karte wandert nach unten, sobald aktiviert** (`hooks/usePushStatus.ts`,
  `PushNotificationCard.tsx`, `Dashboard.tsx`): Der Status (`getPushStatus()`) wurde aus der
  Karte selbst in einen eigenen Hook gezogen, den die Startseite jetzt vorab kennt — solange
  noch nicht aktiviert (`unsubscribed`/`denied`), steht die Karte weiterhin oben als
  Aufforderung; sobald aktiviert (`subscribed`), rutscht dieselbe Karte an den Boden der Seite,
  jetzt nur noch als Verwalten-/Deaktivieren-Option statt weiter prominent oben zu stehen.
  Die Karte selbst bekommt den Status per Prop statt ihn selbst zu laden, damit nicht beide
  Stellen unabhängig voneinander pollen.
- **Zweite Benachrichtigungsart: Training-Erinnerung, drei Zeitpunkte** (`api/send-training-
  reminders.ts`, Migration `0038`): erste Benachrichtigungsart ohne einzelne auslösende Zeile
  — statt eines Datenbank-Triggers wie bei "neue Meldung" läuft hier `pg_cron` direkt in
  Supabase (alle 10 Minuten), der dieselbe "wer hat noch nicht geantwortet"-Logik wie die
  Startseiten-Erinnerungskarte (`lib/reminders.ts`) serverseitig nachbildet. Auf Wunsch nicht
  nur einmalig, sondern zu drei festen Zeitpunkten vor Trainingsbeginn (1 Tag/1 Stunde/30
  Minuten), unabhängig voneinander — `training_reminder_log` (Migration `0038`) merkt sich pro
  Termin/Spieler/Erinnerungsart, was schon geschickt wurde, damit `pg_cron` beliebig oft
  nachfragen kann, ohne doppelt zu verschicken.
  **Live-Debugging-Verlauf** (mehrere Runden am Abend des ersten Tests, alle drei
  projektspezifisch, nicht offensichtlich vorab erkennbar): (1) `ERR_MODULE_NOT_FOUND` für
  einen Import aus `src/lib/` — Vercel bündelt für dieses Projekt keine lokalen
  Dateiabhängigkeiten in `api/`-Functions, auch nicht für Hilfsdateien innerhalb von `api/`
  selbst; einzig zuverlässig sind Imports aus `node_modules`. Die Terminlogik
  (`nextTrainingOccurrences`) ist deshalb direkt in `send-training-reminders.ts` kopiert statt
  aus `src/lib/trainingSchedule.ts` importiert — bei Änderungen dort bitte hier synchron
  nachziehen. (2) `permission denied` für mehrere Tabellen (`reminder_settings`, `trainings`
  usw.) — dieselbe Ursache wie bei `push_subscriptions` in #106 (neue/nicht explizit
  berechtigte Tabellen bekommen bei diesem Projekt nicht automatisch die üblichen
  `service_role`-Standardrechte), behoben in Migration `0037`. Der Code prüfte anfangs nur, ob
  die Einstellungen `null` waren, nicht ob die Abfrage selbst fehlgeschlagen war — ein
  Berechtigungsfehler sah dadurch identisch aus wie "Erinnerungen sind deaktiviert"; behoben,
  indem alle Abfragefehler jetzt explizit geprüft und mit Details zurückgegeben werden. (3) Die
  ursprüngliche Umsetzung nutzte einen täglichen GitHub-Actions-Cron (siehe #111) — für ein
  30-Minuten-Fenster reicht das nicht, ein GitHub-Actions-Cron im 10-Minuten-Takt hätte aber auf
  Dauer das kostenlose Minutenkontingent gesprengt; `pg_cron` läuft stattdessen kostenlos direkt
  in der Datenbank.
- **Die drei Erinnerungszeitpunkte im Admin änderbar** (Migration `0039`,
  `FeatureFlagsAdmin.tsx`): auf Wunsch nachgezogen, nachdem die drei Zeitpunkte zunächst fest im
  Code standen. `reminder_settings.training_push_offset_{1,2,3}_min` (Minuten vor
  Trainingsbeginn, 0 = aus) ersetzen die vorherige feste `REMINDER_OFFSETS`-Konstante in
  `api/send-training-reminders.ts`. `training_reminder_log.reminder_type` protokolliert dafür
  bewusst nach Position (`slot_1`/`2`/`3`) statt nach dem konkreten Zeitwert (z. B. `1_hour`) —
  sonst hätte eine spätere Änderung des Abstands (z. B. von 60 auf 90 Minuten) denselben Slot
  wie einen neuen, noch nie verschickten Zeitpunkt aussehen lassen und zu einem doppelten
  Versand geführt.
- **Admin-Übersicht "Wer hat Push aktiviert?"** (Migration `0040`,
  `components/admin/PushSubscribersList.tsx`): zeigt im Funktionen-Reiter unter dem
  Push-Benachrichtigungen-Schalter Name, Rolle, Geräteanzahl und Aktivierungsdatum aller
  Nutzer mit mindestens einer `push_subscriptions`-Zeile. `push_subscriptions` hatte bisher nur
  eine RLS-Policy für die eigene Zeile (`user_id = auth.uid()`) — Migration `0040` ergänzt eine
  zusätzliche, mit der bestehenden per OR kombinierte Policy, die Trainern Lesezugriff auf alle
  Zeilen gibt. Die Zuordnung `user_id` -> Name läuft client-seitig über dieselben Link-Tabellen
  wie in `AuthContext` (`player_auth_links`/`viewer_auth_links`; Trainer haben ihre `auth.uid()`
  direkt als `trainers.id`), da PostgREST keine beliebigen Joins über mehrere Tabellen in einer
  Abfrage erlaubt.
- **Drei weitere Benachrichtigungsarten: Training abgesagt, Kader veröffentlicht,
  Kader-Absage** (`api/send-training-cancelled.ts`, `api/send-squad-published.ts`,
  `api/send-squad-decline.ts`, Migration `0041`): komplettieren die ursprünglich geplante
  Liste. Alle drei nach demselben Trigger-Muster wie "neue Meldung" — bewusst als jeweils
  eigene, komplett in sich geschlossene Vercel-Function statt `send-push.ts`
  wiederzuverwenden, obwohl der Versand-Code nahezu identisch ist: `send-push.ts` ist bereits
  live geprüft, ein Umbau zu einem generischeren Endpunkt hätte das Risiko getragen, etwas an
  der schon funktionierenden "neue Meldung"-Kette zu verändern (und einen bereits von Hand im
  SQL-Editor angelegten Trigger neu anlegen zu lassen) — Code-Duplizierung war hier die
  vorsichtigere Wahl. "Kader-Absage" ist die einzige der fünf Arten, die **nicht** an alle
  geht, sondern gezielt nur an Trainer (`push_subscriptions` gefiltert auf `user_id in
  (select id from trainers)`) — der Trigger übergibt nur `game_id`/`player_id`, Gegner und
  Spielername werden serverseitig nachgeschlagen. "Training abgesagt" deckt über
  `training_overrides.mode = 'cancelled'` sowohl einzelne Tages-Absagen als auch ganze
  Ferienzeiten ab, da beide denselben Mechanismus nutzen (siehe #104).
- **Kader-Nachnominierung** (`api/send-squad-nomination.ts`): ergänzt eine Lücke, die beim Bau
  von "Kader-Absage" auffiel — sagt ein Spieler nach Kader-Veröffentlichung ab und der Trainer
  nominiert dafür jemand anderen nach, bekam dieser Spieler bisher keine Info, da "Kader
  veröffentlicht" nur beim ersten Veröffentlichen feuert (`squad_published` wechselt nur einmal
  auf `true`). Löst stattdessen auf jede `game_squad`-Aufnahme (`is_selected` wechselt auf
  `true`) aus und prüft serverseitig selbst, ob `games.squad_published` bereits `true` ist —
  nur dann ist es wirklich eine Nachnominierung und nicht Teil der ursprünglichen
  Kader-Zusammenstellung. Geht wie "Kader-Absage" gezielt nur an den einen betroffenen
  Spieler, aufgelöst über `player_auth_links` (`player_id -> auth_user_id`).
- **Nachtrag zu Kader-Nachnominierung und Trainings-Erinnerungen: zwei Live-Bugs behoben.**
  Erstens brach `send-squad-nomination.ts` beim Live-Test mit `PGRST116: multiple rows
  returned` ab — die Abfrage auf `player_auth_links` nutzte `.maybeSingle()`, was aber falsch
  ist: ein Spieler kann durch Mehrgeräte-Login mehrere Zeilen dort haben (siehe
  "Mehrgeräte-Login pro Zugangscode" oben), bei einem Vieltester inzwischen 50 Stück. Fix:
  alle Zeilen abfragen statt einer einzelnen, Push an alle zugehörigen Geräte. Denselben
  Fehler (nur unbemerkt, da er nicht abstürzte, sondern still nur an ein Gerät sendete) hatte
  auch `send-training-reminders.ts` — dort ebenfalls behoben (`Map<player_id, string[]>` statt
  `Map<player_id, string>`). Zweitens traten bei `send-training-reminders.ts` und
  `send-squad-nomination.ts` wiederholt `Gateway Timeout`-Fehler von Supabase auf (Datenbank
  laut Supabase-Dashboard dabei "Healthy", CPU/RAM unauffällig — vermutlich kurze Aussetzer der
  API-Gateway-Schicht auf dem Nano-Compute-Free-Tier), die dazu führten, dass Erinnerungen an
  ganzen Tagen ausblieben. Fix: `withRetry()`-Hilfsfunktion in `send-training-reminders.ts`,
  die jede Supabase-Abfrage bei einem Fehler einmal nach 1,2 Sekunden wiederholt, sowie
  durchgängige Fehlerprüfung auch bei den bisher ungeprüften späteren Abfragen (RSVPs,
  Abwesenheiten, bereits verschickte Erinnerungen, Geräte-Zuordnung, Push-Abos) — vorher hätte
  ein einzelner stiller Fehlschlag dort eine Erinnerung dauerhaft als "verschickt" protokolliert,
  obwohl nie eine Push ankam.
- **Nachtrag: Trainings-Erinnerung kam mehrfach für dieselbe Erinnerungsart.** Live beobachtet:
  dieselbe "Training in 1 Tag"-Push kam zweimal exakt zur gleichen Zeit an, und dieselbe
  Erinnerungsart feuerte später am selben Tag noch einmal erneut — obwohl
  `training_reminder_log` (Migration `0038`) genau das verhindern soll. Ursache: der alte Ablauf
  hat erst gesendet und danach protokolliert (`toSend` aus dem `alreadySent`-Stand berechnet, am
  Ende ein `upsert(..., { ignoreDuplicates: true })` ohne Fehlerprüfung). `pg_cron` ruft diesen
  Endpunkt alle 10 Minuten auf — läuft er dabei einmal doppelt (z. B. durch einen versehentlich
  doppelt angelegten Cron-Job oder einen erneut ausgelösten Vercel-Aufruf) an, sehen beide
  Durchläufe denselben (noch leeren) Log-Stand, halten die Erinnerung beide für fällig und noch
  nicht verschickt, und senden beide — das Protokollieren danach kommt dafür zu spät. Fix: der
  Claim (`upsert` auf `training_reminder_log` + `.select()`) läuft jetzt VOR dem Versand, mit
  Fehlerprüfung. Der Unique-Key der Tabelle (`training_id, session_date, player_id,
  reminder_type`) wirkt dabei als atomarer Lock — von zwei parallelen Durchläufen bekommt nur
  einer die Zeile per `INSERT ... ON CONFLICT DO NOTHING RETURNING *` tatsächlich zurück, nur der
  verschickt anschließend die Push. Ein zweiter, überlappender Durchlauf kann eine bereits
  beanspruchte Erinnerung dadurch nicht mehr doppelt verschicken, egal wie oft `pg_cron` den
  Endpunkt aufruft oder wie viele Durchläufe sich zeitlich überschneiden.

  Zwei mögliche Auslöser für überlappende Durchläufe sind über die SQL-Konsole prüfbar, falls das
  Problem weiter auftritt (der Fix oben verhindert den doppelten Versand so oder so, das ist nur
  zur Ursachensuche): `select * from cron.job;` zeigt, ob `send-training-reminders` versehentlich
  von zwei separaten Cron-Jobs aus aufgerufen wird (z. B. weil die Einrichtung aus diesem README
  ein zweites Mal ausgeführt wurde, ohne den alten Job vorher mit `cron.unschedule(...)` zu
  entfernen). Und da ein Vieltester wie der Trainer selbst durch wiederholtes Testen leicht
  mehrere `player_auth_links`-Zeilen (Mehrgeräte-Login, siehe oben) mit je eigenem, weiterhin
  gültigem `push_subscriptions`-Eintrag fürs gleiche physische Gerät ansammelt, kann auch das wie
  ein doppelter Versand aussehen, ist aber keiner — dann kommen zwei *unterschiedliche*, beide
  korrekt einzeln verschickte Pushes einfach auf demselben Handy an. Sichtbar über: `select pal.
  auth_user_id, ps.id, ps.created_at from player_auth_links pal join push_subscriptions ps on
  ps.user_id = pal.auth_user_id where pal.player_id = (select id from players where name ilike
  '%Name%');` — mehr als eine Zeile bedeutet mehrere aktive Anmeldungen mit Push-Abo für diesen
  Spieler.
- **Nachtrag: der eigentliche Grund für die Mehrfachversände gefunden — kaputte Check-Constraint
  auf `training_reminder_log.reminder_type`.** Live-Test des Claim-vor-Versand-Fixes oben ergab
  sofort `ERROR 23514: violates check constraint "training_reminder_log_reminder_type_check"` bei
  jedem Insert mit dem gültigen Wert `slot_1` — der Claim schlug dadurch komplett fehl, keine
  Erinnerung ging mehr raus. Ursache: `select reminder_type, count(*) from
  training_reminder_log group by reminder_type` zeigte 6 Zeilen mit dem Wert `1_day` — einem
  Bezeichner aus einer früheren Version dieser Funktion, von vor der Umstellung auf die
  Positions-Namen `slot_1/2/3` (siehe Kommentar in Migration `0038`), der nie bereinigt wurde und
  die Check-Constraint dauerhaft in einem inkonsistenten Zustand hielt. Das war vermutlich die
  ganze Zeit der wahre Grund für die oben beschriebenen Mehrfachversände: der alte Code hat
  Fehler beim Protokollieren (`upsert(...).then()`-artig, ohne Fehlerprüfung) still verschluckt —
  jeder Log-Versuch ist an dieser kaputten Constraint gescheitert, ohne dass es je auffiel, und
  jeder folgende `pg_cron`-Lauf hat die fällige Erinnerung deshalb erneut für "noch nicht
  verschickt" gehalten. Behoben direkt in der SQL-Konsole (kein Code-Fix nötig, reine
  Datenbereinigung): alte `1_day`-Zeilen gelöscht (`delete from training_reminder_log where
  reminder_type not in ('slot_1', 'slot_2', 'slot_3')`), Constraint neu angelegt. Seitdem
  protokolliert `training_reminder_log` wieder erfolgreich, und der Claim-vor-Versand-Fix oben
  kann seine eigentliche Aufgabe (kein Doppelversand bei überlappenden Cron-Durchläufen) endlich
  wirksam erfüllen.
- **Nachtrag: Trainings-Erinnerung — Eingabe in Stunden statt Minuten, Push-Text vereinfacht.**
  Die drei Zeitpunkte im Admin (`training_push_offset_1/2/3_min`) waren bisher nur in Minuten
  einzugeben (z. B. `1440` für "1 Tag vorher") — bei größeren Abständen unhandlich zu rechnen.
  Gespeichert wird weiterhin in Minuten (keine Migration nötig, `send-training-reminders.ts`
  rechnet ebenfalls in Minuten) — nur `FeatureFlagsAdmin.tsx` rechnet beim Laden/Speichern jetzt
  zwischen Minuten (DB) und Stunden (Anzeige) um, inklusive Nachkommastellen für den 30-Minuten-
  Default (`0,5`). Zusätzlich verzichtet die Push selbst jetzt bewusst auf den Zeitpunkt-Hinweis
  ("Training in 1 Tag"/"in 1 Stunde") — für den Spieler ist ohnehin nur relevant, wann das
  Training stattfindet, nicht zu welchem der drei Zeitpunkte gerade erinnert wird. Titel/Text
  sind jetzt für alle drei Erinnerungsarten identisch: "Training {Wochentag}. {Uhrzeit} Uhr" /
  "Bist du dabei?" (z. B. "Training Mo. 20:30 Uhr" / "Bist du dabei?").
- **Nachtrag: Vorname in der Trainings-Erinnerung.** Der Push-Text nennt jetzt den Vornamen des
  jeweiligen Empfängers statt eines generischen "Bist du dabei?" — z. B. "Marc, bist du dabei?".
  Dafür musste der Payload (Titel bleibt gleich, nur der Text ändert sich) von einmalig vor der
  Schleife zurück in die Pro-Spieler-Schleife wandern, da er jetzt wieder von `player.name`
  abhängt — derselbe "erstes Leerzeichen abschneiden"-Vorname-Zuschnitt wie z. B. `firstName` in
  `Dashboard.tsx`.
- **Nachtrag: "Wer hat Push aktiviert?" zeigte durchweg "Unbekannt".** Die ursprüngliche
  Umsetzung (siehe oben) hat `player_auth_links`/`viewer_auth_links` direkt per Client-Query
  abgefragt, um `user_id` auf einen Namen aufzulösen — genau diese beiden Tabellen haben aber
  laut Migration `0001` bewusst KEINE client-seitige RLS-Policy (Zugriff nur über die
  security-definer `current_player_id()`/`current_viewer_id()`-Funktionen, siehe `AuthContext`)
  und lieferten deshalb immer eine leere Liste, egal wer fragt — die Auflösung schlug für
  ausnahmslos jeden Eintrag fehl. Migration `0047` löst das über eine eigene security-definer RPC
  `admin_push_subscribers()` (nur per `is_trainer()`-Check aufrufbar), die diese Zuordnung
  serverseitig auflöst und nur (`auth_user_id`, Name, Rolle) zurückgibt — bewusst keine RLS-Policy
  direkt auf `player_auth_links`/`viewer_auth_links` geöffnet, sonst könnte jeder Trainer darüber
  auch alle Zugangscode-Zuordnungen einsehen. `PushSubscribersList.tsx` ruft jetzt nur noch diese
  eine RPC statt der bisherigen fünf Einzelabfragen auf.
- **Nachtrag: die 9-Stunden-Erinnerung kam nicht — Zeitzonen-Bug bei der Fälligkeitsberechnung.**
  Live-Test ergab: die 3. Erinnerung (an diesem Tag auf 9 Stunden vorher gestellt, Training
  20:30 Uhr, Schwelle also 11:30 Uhr deutscher Zeit) war um 11:40 Uhr immer noch nicht verschickt
  — `training_reminder_log` zeigte für den betroffenen Spieler nur `slot_1`/`slot_2`, kein
  `slot_3`, obwohl er (noch) nicht geantwortet hatte. Ursache: `training.start_time` (z. B.
  `"20:30"`) ist als deutsche Wanduhrzeit gemeint, aber `new Date(y, mo, d, h, m)` interpretiert
  diese Zahlen als Ortszeit **des laufenden Prozesses** — und der läuft auf Vercel mit `TZ=UTC`,
  nicht Europe/Berlin. "20:30" wurde dadurch unbemerkt als 20:30 UTC behandelt (= 22:30 deutscher
  Zeit im Sommer, zwei Stunden zu spät), wodurch **jede** "X Stunden vorher"-Schwelle systematisch
  um den aktuellen UTC-Offset (Sommer +2h, Winter +1h) zu spät lag — bei den ursprünglichen
  Standardwerten (1 Tag/1 Stunde/30 Minuten) kaum auffällig, bei größeren, custom eingestellten
  Abständen aber klar sichtbar, wie hier. Fix: neue Hilfsfunktion `berlinTimeToUtc()` in
  `send-training-reminders.ts` — der Standard-"doppelte Umrechnung"-Trick ohne zusätzliche
  Abhängigkeit (einmal naiv als UTC interpretieren, per `Intl`/`toLocaleString('en-US', {
  timeZone: 'Europe/Berlin' })` ablesen, wie spät es zu diesem Zeitpunkt tatsächlich in Berlin
  ist, um die Differenz korrigieren — DST-bewusst, funktioniert also sowohl für Sommer- als auch
  Winterzeit). Ersetzt jede bisherige naive `new Date(y, mo, d, h, m)`-Konstruktion in dieser
  Datei (auch innerhalb der kopierten `nextTrainingOccurrences`-Terminlogik, die denselben Fehler
  für die "ist der heutige Termin schon vorbei"-Prüfung hatte). Betrifft ausschließlich diese
  Server-Funktion — die Client-Seite (`src/lib/trainingSchedule.ts`) läuft im Browser der
  Spieler, dessen Ortszeit ohnehin schon Europe/Berlin ist, und war nie betroffen.
- **Nachtrag zu Kader-Absage: spielende Trainer bekamen die Push nie.** `send-squad-decline.ts`
  fragte nur die `trainers`-Tabelle ab (Login per E-Mail/Passwort). Ein "Spieler mit
  Trainer-Rechten" (`players.is_admin`, siehe Migration `0006` — bewusst kein zweiter Login,
  sondern derselbe Zugangscode wie jeder andere Spieler) taucht dort aber nie auf und bekam die
  Push deshalb auf keinem Gerät, unabhängig davon, wer absagt. Genau dieser Fall ist überall
  sonst im Projekt bereits sauber gelöst — `is_trainer()` (Migration `0006`) zählt admin-Spieler
  ausdrücklich mit, nur diese eine Function hat das nicht beachtet. Fix: zusätzlich zu
  `trainers.id` auch alle `player_auth_links.auth_user_id` von Spielern mit `is_admin = true`
  als Empfänger einbeziehen (wieder ohne `.maybeSingle()`, aus demselben Mehrgeräte-Grund wie
  oben).
- **Live-Ticker im Spiel** (`api/send-quarter-score.ts`, `api/send-game-finished.ts`, Migration
  `0042`): Wunsch, die Zwischenstände aus dem ohnehin schon live geführten Stats-Tracking auch
  per Push zu teilen. Der Viertel-Umschalter im Tracker war bisher reiner Client-State
  (`useState`) ohne jede DB-Spur — für den Push-Trigger musste daher erst ein serverseitiger
  Anker her: `games.last_announced_quarter` plus die RPC `announce_quarter_score()`, die diese
  Spalte nur per "Ratchet" hochzählt (nie runter, nur beim allerersten Erreichen eines Viertels).
  Ohne dieses Ratchet hätte correctives Vor-/Zurückklicken im Umschalter (z. B. um einen spät
  erfassten Korb im Vorviertel nachzutragen) bei jedem erneuten Vorwärtsklick eine weitere Push
  ausgelöst. Der eigentliche Spielstand kommt nicht aus einer eigenen Berechnung, sondern direkt
  aus `games.final_score_us`/`final_score_opponent` — die hält der bereits bestehende
  `recalc_game_score()`-Trigger (Migration `0028`) bei jedem Stats-Event ohnehin aktuell. Bewusst
  kein Push beim Wechsel in die Verlängerung. Zusätzlich: "Spiel beenden" fragt jetzt erst per
  Bestätigungsdialog nach, bevor die Erfassung tatsächlich abgeschlossen wird.
- **Direkte Trikot-Übergabe außerhalb des Wasch-Rhythmus** (Migration `0048`,
  `lib/trikots.ts`, `Dashboard.tsx`, `Trikots.tsx`): bisher wechselte ein Trikot-Set nur über den
  normalen Wasch-Ablauf (`confirm_trikot_handover()`) den Besitzer — kein Weg für den Fall, dass
  der aktuelle Halter beim nächsten Spiel gar nicht dabei ist und die Trikots stattdessen z. B.
  schon beim Training direkt an jemand anderen weitergegeben hat. Neue, bewusst separate
  Tabelle/RPC (`trikot_transfer_log`/`transfer_trikot_set()`) statt `trikot_wash_log`
  mitzunutzen: eine Übergabe ist kein Waschen und darf den Wasch-Zähler (Basis der Rotation in
  `naechsterSpieler()`) nicht erhöhen und die Rotationsreihenfolge nicht verschieben — wer das
  Set nur kurz weiterreicht, hat es ja nicht gewaschen. Auslösbar vom aktuellen Halter selbst, von
  Captains/Co-Captains oder vom Trainer, jederzeit (kein Spielbezug wie beim Wasch-Flow).
  Startseite (persönlicher Bereich): neue "Deine Trikots"-Karte für jeden Spieler, der aktuell
  ein Set hält — "Du hast aktuell den weißen/schwarzen Trikotsatz", mit Hinweis auf den nächsten
  Einsatz sowie einem "Set übergeben?"-Aufklapper mit Spieler-Auswahl. "Wer hat die
  Trikots?" (Startseite + Trikots-Reiter) zeigt unter dem aktuellen Halter jetzt zusätzlich
  "Übergeben von X", sobald der letzte Vorgang für dieses Set eine Übergabe statt eine
  Wasch-Bestätigung war — ermittelt clientseitig über `latestTransferFrom()`
  (`lib/trikots.ts`), die den jeweils neuesten Eintrag aus `trikot_wash_log` und
  `trikot_transfer_log` für das Set vergleicht. Der "Verlauf"-Abschnitt auf der Trikots-Seite
  zeigt jetzt beide Vorgangsarten chronologisch gemeinsam, damit dort keine Lücke entsteht, wenn
  ein Set zwischendurch nur weitergereicht statt gewaschen wurde. `reset_trikots()` (Migration
  `0004`) räumt jetzt zusätzlich `trikot_transfer_log` mit leer — sonst hätte ein Reset alte
  Übergaben stehen lassen und der "Übergeben von"-Hinweis wäre fälschlich unter einem frisch auf
  "Niemand" zurückgesetzten Set hängen geblieben.
- **Nachtrag: "Deine Trikots" nannte nur einen allgemeinen Hinweis statt des nächsten Termins.**
  Der Einsatz-Hinweis prüfte bisher nur, ob `nextGame` (das nächste Spiel überhaupt) zufällig das
  eigene Set braucht — hält man z. B. "Schwarz" (für Auswärtsspiele), das nächste Spiel ist aber
  ein Heimspiel (braucht "Weiß"), fiel die Karte auf einen allgemeinen "Bitte zum nächsten
  Einsatz mitbringen" zurück, obwohl der eigentliche Termin (das nächste Auswärtsspiel) bereits
  feststand. `Dashboard.tsx` lädt dafür jetzt zusätzlich die nächsten 20 anstehenden Spiele
  (`upcomingGames`, nicht nur das eine `nextGame`) und sucht darin client-seitig per
  `benoetigterSatz()` das erste Spiel, das wirklich das gehaltene Set braucht — die Karte nennt
  jetzt also Datum und Gegner des tatsächlich relevanten nächsten Einsatzes, nicht mehr nur des
  nächsten Spiels überhaupt.
- **Nachtrag: Mitfahrgelegenheit optisch an die Nächster-Spieltag-Karte angebunden.**
  `CarpoolSection.tsx` stand auf der Spiele-Seite bisher als eigene, unabhängige Karte unter der
  "Nächster Spieltag"-Karte — obwohl sie sich immer auf genau dieses eine Spiel bezieht, wirkte
  sie optisch wie ein losgelöster, allgemeiner Abschnitt. Die Komponente hat jetzt eine neue
  `embedded`-Prop: `false` (Default) rendert wie bisher eine eigene `<section className="card">`,
  `true` stattdessen nur einen `<div>` mit derselben `border-t`-Trennlinie, die auch die
  Kader-/Treffpunkt-Abschnitte innerhalb derselben Karte voneinander trennen. `Spiele.tsx` rendert
  die Mitfahrgelegenheit jetzt mit `embedded` direkt am Ende der "Nächster Spieltag"-Karte statt
  danach als eigene Karte — dieselbe Karte, ein Abschnitt mehr, macht auf einen Blick klar, dass
  sich beides auf denselben Termin bezieht.
- **Nachtrag: Kampfgericht-Selbstverwaltung mit Meldefrist + Änderungs-Log (Migration `0050`).**
  Bisher konnte ein Spieler eine offene Position zwar selbst übernehmen ("Ich übernehme"), aber nie
  wieder rückgängig machen — laut Kommentar in Migration 0001 bewusst so, "das ist der Job des
  Trainers". Das wurde als zu starr empfunden: Spieler sollen sich bis zu einer vom Trainer
  festgelegten Meldefrist (`reminder_settings.officiating_signup_deadline`, Admin → Funktionen →
  Erinnerungen; leer = keine Frist, dauerhaft frei änderbar) noch frei um- und abmelden können.
  Ab dieser Frist werden die Zuteilungen "fix" — Spieler verlieren dann jegliche Selbstverwaltung
  (weder Übernehmen noch Abwählen), spontane Ausfälle laufen ab da nur noch privat (z. B.
  WhatsApp) mit anschließender manueller Änderung durch Trainer **oder Kapitän/Co-Kapitän** (neu:
  die Zuteilungs-Dropdowns auf der Kampfgericht-Seite, bisher nur für `isAdmin`, sind jetzt auch für
  `is_captain`/`is_co_captain` sichtbar — passend zur bereits bestehenden Kapitän-Sonderrolle aus
  Migration `0017`). Damit trotz dieser Freiheit nachvollziehbar bleibt, wer wann was geändert hat,
  schreibt jeder der drei Wege (Selbst-Übernahme, Selbst-Abwahl, Trainer/Kapitän-Zuteilung) jetzt
  einen Eintrag in die neue Tabelle `officiating_assignment_log` (from/to-Spieler + ein per
  `current_actor_label()` aufgelöster Klartext-Name inkl. Rollenhinweis beim Trainer) — sichtbar
  in einem neuen, einklappbaren "Letzte Änderungen"-Abschnitt unten auf der Kampfgericht-Seite.
  Technisch bündelt eine neue RPC `admin_assign_officiating_task()` jetzt sowohl den
  Trainer-Dropdown auf dieser Seite als auch den bisherigen direkten `.update()` in
  `OfficiatingAdmin.tsx`, damit wirklich jede Zuteilungsänderung protokolliert wird; die neue RPC
  `release_officiating_task()` ist das Gegenstück zum bestehenden `claim_officiating_task()` (beide
  prüfen die Meldefrist serverseitig, nicht nur in der UI). Die alte RLS-Policy, die einer/einem
  Spieler:in einen offenen Slot auch per direktem Tabellen-Write erlaubte, wurde entfernt — jede
  Spieler-Änderung läuft jetzt ausschließlich über die beiden RPCs, sonst ließe sich die
  Meldefrist-Prüfung und Protokollierung umgehen.
- **Nachtrag: Meldefrist-Einstellung von "Funktionen" in den "Kampfgericht"-Admin-Reiter verschoben.**
  Das Feld saß bisher im `FeatureFlagsAdmin.tsx`-Erinnerungen-Block zusammen mit den Push-Zeitpunkten
  — inhaltlich aber näher am Kampfgericht selbst. Jetzt eine eigene kleine Karte oben auf
  `OfficiatingAdmin.tsx` (Admin → Kampfgericht), mit eigenem Speichern-Button statt Teil des
  gemeinsamen "Erinnerungen speichern"-Formulars. Rein clientseitige Verschiebung derselben
  `reminder_settings.officiating_signup_deadline`-Spalte — keine Migration nötig.
- **Nachtrag: Kader-Zu-/Absage direkt auf der Startseite.** Die "Nächstes Spiel"-Karte zeigte
  bisher nur einen Warnhinweis ("⚠️ Bitte Teilnahme bestätigen") mit Link zur Kader-Liste auf der
  Spiele-Seite — die eigentliche Ja/Nein-Antwort war dadurch einen Klick zu weit weg und wirkte
  laut Nutzer "etwas versteckt". `Dashboard.tsx` hat jetzt dieselben ✓ Kann/✗ Kann nicht-Buttons
  (bzw. "✓ Zugesagt" + "Doch nicht?" nach einer Zusage) direkt in der Karte, optisch identisch zur
  bestehenden Kader-Liste auf `Spiele.tsx` — beide rufen dieselbe RPC `respond_to_squad()` auf.
  Eigener `respondError`/`responding`-State (nicht der seitenweite `error`) und ein neuer
  `squadVersion`-Zähler in der Haupt-`useEffect`-Abhängigkeitsliste lösen nach einer Antwort einen
  Reload aus — dasselbe Muster wie schon bei `trikotVersion` für die Trikot-Übergabe.
- **Nachtrag: Push-Text der Kader-Zusage-Erinnerung konkretisiert.** War bisher eine reine Frage
  ("Bist du beim Spiel gegen X dabei?"), ohne explizite Handlungsaufforderung — auf Wunsch des
  Nutzers jetzt direkter: "Bitte zu- oder absagen fürs Spiel gegen X." (`api/send-squad-reminders.ts`).
- **Nachtrag: Trikot-Übergabe erst ab Anpfiff bestätigbar + Übergabe-Protokoll (Migration `0052`).**
  Live aufgefallen: die Bestätigung der Trikot-Übergabe war bisher schon ab 00:00 Uhr des Spieltags
  möglich ("ab dem Spieltag") — tatsächlich werden die Trikots aber erst NACH dem Spiel in der
  Kabine geklärt und mitgenommen, die Anzeige "X hat die Trikots seit heute" konnte also schon
  Stunden vor dem eigentlichen Anpfiff auftauchen, obwohl real noch niemand etwas mitgenommen
  hatte. Neuer Helfer `hasKickedOff(game_date, game_time)` (`lib/format.ts`, mit Tests) ersetzt
  den bisherigen reinen Datums-Vergleich überall dort, wo bisher nur "ist heute Spieltag?" geprüft
  wurde: der Bestätigen-Button auf der Trikots-Seite (`gameStarted` statt `isGameDay`, Hinweistext
  jetzt "ab Spielbeginn (HH:MM Uhr)" statt "ab dem Spieltag") sowie die zugehörige Fallback-Abfrage
  für die "Für dich zu erledigen"-Erinnerung auf der Startseite (sonst hätte ein heute noch nicht
  begonnenes Spiel über die dortige `<=today`-Abfrage die gleiche verfrühte Erinnerung ausgelöst).
  Läuft komplett im Browser (nicht auf dem Vercel-Server wie die Push-Functions), ein einfacher
  `new Date()`-Vergleich in der Geräte-Zeitzone reicht deshalb aus, keine Berlin-Umrechnung nötig.

  Zusätzlich (auf Nutzeranfrage, da sich beim obigen Anlass nicht mehr nachvollziehen ließ, ob ein
  vorgeschlagener Spieler über "Kann nicht" abgelehnt oder direkt jemand anderes bestätigt wurde):
  neue Tabelle `trikot_handover_log` protokolliert ab jetzt zu jeder Bestätigung, wer laut Rotation
  vorgeschlagen war und wer tatsächlich bestätigt hat (plus `current_actor_label()`-Name der
  bestätigenden Person, wiederverwendet aus Migration `0050`). `confirm_trikot_handover()` bekommt
  dafür einen neuen Parameter `p_suggested_player_id` (vom Client mitgegeben, da die Rotationslogik
  clientseitig in `rotation.ts` lebt, nicht in SQL) und schreibt den Log-Eintrag als Nebeneffekt.
  Sichtbar direkt im "Verlauf"-Abschnitt der Trikots-Seite: bei einer Abweichung zwischen Vorschlag
  und tatsächlicher Bestätigung erscheint eine zusätzliche Zeile "Vorschlag war X, bestätigt von Y".
- **Nachtrag: Zwischenstand-Push nach Viertelwechsel blieb beim ersten echten Spiel stumm
  (Migration `0053`).** Ursache über `net._http_response` live nachvollzogen: vor dem Anpfiff
  wurde im Tracker (vermutlich beim Ausprobieren) mehrfach kurz hintereinander durch die Viertel
  geklickt, bevor auch nur ein Punkt erfasst war. `announce_quarter_score()` (Migration `0042`)
  erhöhte den Ratchet `last_announced_quarter` dabei trotzdem — unabhängig davon, ob überhaupt ein
  gültiger Spielstand existierte. Die Push selbst brach zwar sauber mit `"game_or_score_not_found"`
  ab (kein Fehler, kein Absturz), aber der Ratchet stand danach schon auf "erledigt" — und weil er
  nie wieder runtergeht, konnten die echten Viertelwechsel später im tatsächlichen Spiel dieselben
  Quarter-Nummern nicht mehr auslösen, ohne dass irgendwo ein sichtbarer Fehler auftauchte. Fix:
  der Ratchet darf jetzt nur noch vorrücken, wenn zu diesem Zeitpunkt bereits ein gültiger
  Spielstand existiert (`final_score_us is not null`, laut `recalc_game_score()` aus Migration
  `0028` erst ab dem ersten erfassten Stats-Event der Fall) — ein Klicken durch die Viertel vor dem
  ersten Korb verbraucht den Ratchet dadurch nicht mehr. Kein Client-Code betroffen (reine
  SQL-Funktionsänderung, keine neue Migration-Reihenfolge-Abhängigkeit zum Deploy).
- **Nachtrag: "Tracking zurücksetzen" war ausgerechnet in genau diesem Fall unsichtbar.** Direkte
  Folge des Bugs oben: der Button in `GamesAdmin.tsx` war bisher nur sichtbar, wenn schon ein
  Endstand existiert (`gameResult(g)`) — der entsteht laut `recalc_game_score()` (Migration `0028`)
  aber erst ab dem ersten erfassten Punkt. Genau die Situation "durch die Viertel geklickt, aber
  noch kein Korb erfasst" machte den Reset-Button damit unsichtbar, obwohl er dafür gedacht ist.
  Sichtbarkeit erweitert um `last_announced_quarter > 0` (Migration `0042`, jetzt auch im
  `Game`-Type deklariert — war bisher nur zur Laufzeit vorhanden, da `select('*')`) sowie
  `stats_finalized_at` als zusätzliche Bedingungen — der Button erscheint jetzt, sobald es
  überhaupt etwas zurückzusetzen gibt, nicht erst ab einem fertigen Endstand.
- **Nachtrag: 3er-Push kam im echten Spiel trotz korrekt auslösendem Trigger nie an.** Über
  `net._http_response` millisekundengenau mit den echten `fg3_made`-Events in `game_stat_events`
  abgeglichen: `game_stat_events_notify_three_pointer` hat bei jedem der 3er sauber ausgelöst und
  auch tatsächlich einen Request an `/api/send-three-pointer` abgesetzt — der kam aber jedes Mal
  mit `401 Unauthorized` zurück. Ursache: beim ersten Anlegen des Triggers (siehe oben, "trigger
  already exists"-Vorfall) wurde `notify_three_pointer()` einmal ohne das `PUSH_WEBHOOK_SECRET`
  ausgeführt — die Funktion trug seitdem ein falsches/leeres Secret, unabhängig vom Trigger selbst.
  Fix: `notify_three_pointer()` per Hand mit dem korrekten, aus dem funktionierenden
  `training-reminders`-Cronjob übernommenen Secret neu angelegt (`create or replace function`,
  Trigger unverändert, da er die Funktion nur über den Namen referenziert). Nicht als Migration
  committet, aus denselben Gründen wie beim ursprünglichen Trigger-Setup (Secret würde sonst im
  Git-Verlauf landen).
- **Nachtrag: Live-Ticker auf der Startseite zeigte den Spielstand ohne erkennbare Zuordnung, wer
  welche Zahl hat.** Die große "42:38"-Anzeige in der "Nächstes Spiel"-Kachel (Dashboard.tsx) hatte
  keine Beschriftung, welche Zahl zu TB Wülfrath und welche zum Gegner gehört — für Zuschauer ohne
  Tracking-Kontext nicht erkennbar. Fix: kleine Zeile "TB Wülfrath – {Gegner}" oberhalb des
  Spielstands ergänzt, in derselben Reihenfolge wie die Zahlen daneben.
- **Nachtrag: "Wer hat die Trikots?"-Anzeige blieb nach einer bestätigten Übergabe an einen
  Ersatz-Wäscher auf "Niemand" stehen (Migration `0054`).** Eigene Regression aus Migration `0052`:
  beim Hinzufügen von `trikot_handover_log` wurde `confirm_trikot_handover()` komplett neu
  geschrieben und dabei die `update trikot_sets set current_holder_id = ..., since = ...`-Zeile aus
  der ursprünglichen Fassung (Migration `0001`/`0017`) versehentlich weggelassen. Die Bestätigung
  landete danach zwar korrekt in `trikot_wash_log` (Wasch-Zähler stimmte) und im neuen
  `trikot_handover_log` (Verlauf zeigte "Vorschlag war X, bestätigt von Y" korrekt an), aber
  `trikot_sets.current_holder_id`/`since` — wovon die große "Wer hat die Trikots?"-Kachel gespeist
  wird — wurde nie mehr aktualisiert. Fix: die fehlende Zeile wieder ergänzt, Rest der Funktion
  unverändert. Reine additive SQL-Korrektur (kein Signatur-Wechsel, kein Client-Code betroffen).
- **Nachtrag: Bestätigung vor Viertelwechsel im Tracker.** Auf Nutzeranfrage, nachdem ein
  versehentliches Durchklicken durch die Viertel vor Spielbeginn schon einmal den Ratchet aus
  Migration `0042` verbraucht hatte (siehe oben) — jeder Klick auf einen anderen Viertel-Button
  (inkl. OT) fragt jetzt erst per `window.confirm()` nach ("Ist Q1 wirklich beendet und möchtest du
  zu Q2 wechseln?"), bevor `selectQuarter()` tatsächlich umschaltet und — bei Q2–Q4 — die
  Live-Ticker-Push auslöst. Bei "Abbrechen" bleibt alles unverändert. Selbes `window.confirm()`-Muster
  wie bereits bei "Spiel beenden" in derselben Datei, kein neuer UI-Baustein nötig.
- **Nachtrag: Box-Score — Trefferquoten-Spalten und Team-Zuordnung im Score-Header.** Zwei
  Anpassungen. (1) Neue Spalten `2P%`/`3P%`/`FW%` direkt hinter den jeweiligen Wurfspalten, via
  neuer Hilfsfunktion `fgPct(made, attempted)` in `gameStats.ts` (zeigt "–" statt "0%" ohne jeden
  Versuch). (2) Der Score-Header (`GameStatsTracker.tsx`, sticky oben — gilt für Live-Tracking UND
  die reine Box-Score-Ansicht, da beides dieselbe Route/Komponente nutzt) hatte dasselbe Problem wie
  zuvor der Live-Ticker auf der Startseite: keine erkennbare Zuordnung, welche Zahl zu wem gehört.
  Zeile "TB Wülfrath – {Gegner}" ergänzt, eigener Score zusätzlich in Gold hervorgehoben (`text-tbw-gold`,
  dieselbe Akzentfarbe wie sonst im Team-Kontext).
- **Nachtrag: +/- (Plus/Minus) bewusst nicht eingebaut.** Auf Nutzeranfrage geprüft: +/- ist die
  Punktedifferenz, die sich ansammelt, während ein bestimmter Spieler auf dem Feld steht (jeder
  Korb der eigenen Mannschaft +, jeder Gegentreffer − für alle 5 gerade aktiven Spieler). Keine
  feste, von der Anzahl Ballaktionen unabhängige Formel — sie braucht zwingend eine lückenlose
  Historie, WANN welche Aufstellung auf dem Feld stand. `game_court_state` (Migration `0029`) hält
  aber nur die *aktuelle* Aufstellung als Snapshot (wird bei jeder Auswechslung überschrieben, keine
  Historie) — aus den bestehenden Daten lässt sich +/- also nicht rückwirkend berechnen. Würde eine
  neue Tabelle brauchen, die jede Auswechslung mit Zeitstempel protokolliert, und beim Verknüpfen
  mit `game_stat_events` einiges an zusätzlicher Sorgfalt (z. B. was zählt, wenn während eines
  Assist/Rebound-Events kurz vorher wenige Sekunden nicht sauber gewechselt wurde) — nicht
  umgesetzt, da nicht angefragt.
- **Nachtrag: +/- doch angefragt und eingebaut (Migration `0055`).** Neue Tabelle
  `game_lineup_log` protokolliert ab jetzt jede Aufstellungsänderung (Startaufstellung UND jede
  Ein-/Auswechslung) mit echtem Zeitstempel, geschrieben parallel zu `game_court_state` in
  `persistOnCourt()` — dessen "nur aktueller Stand"-Modell bleibt dafür unverändert, die neue
  Tabelle historisiert nur zusätzlich. Neue reine Funktion `computePlusMinus(events, lineupLog,
  fallbackOnCourtIds)` in `gameStats.ts`: für jeden wurfrelevanten Treffer (eigener wie gegnerischer)
  den zu diesem Zeitpunkt laut Log aktuellen Aufstellungs-Stand ermitteln (letzter Eintrag mit
  `created_at <= event.created_at`) und allen dort gelisteten Spielern den Punktewert gutschreiben
  (eigener Treffer) bzw. abziehen (Gegentreffer). `fallbackOnCourtIds` greift nur, wenn zu einem
  Event noch gar kein Log-Eintrag existiert — planmäßig der Fall bei einem Kader mit höchstens 5
  trackbaren Spielern (dann blendet `useCourtSplit` die Aufstellungs-Auswahl komplett aus, da
  ohnehin alle die ganze Zeit spielen) sowie defensiv für ein vor Einführung dieses Features
  getracktes Spiel ohne jede Historie — dort werden pauschal alle Kader-Spieler als durchgehend auf
  dem Feld angenommen. Anzeige als neue letzte Spalte "+/-" im Box-Score, grün bei positivem, rot bei
  negativem Wert (`fmtPlusMinus()`, echtes Minuszeichen U+2212 statt Bindestrich). `reset_game_stats()`
  (Migration `0043`) räumt die neue Tabelle beim "Tracking zurücksetzen" mit auf — sonst bliebe eine
  alte Aufstellungs-Historie stehen und würde die Berechnung beim erneuten Tracken verfälschen (siehe
  die Trikot-Regression weiter oben, diesmal direkt mitgedacht statt nachträglich gefixt).
- **Nachtrag: Box-Score-Tabelle — Spieler-Spalte beim horizontalen Scrollen fixiert.** Auf
  Nutzeranfrage (die Tabelle ist inzwischen breiter als der Bildschirm, siehe die %- und +/- -Spalten
  oben): erste Spalte ("Spieler") in `th`/`td` mit `sticky left-0` versehen, plus `bg-white` (Farbe
  von `.card`) und `z-10`, damit darunter liegende Zellen beim Scrollen nicht durchscheinen, sowie
  ein dezenter rechter Rand zur optischen Abgrenzung.
- **Nachtrag: Team-Summenzeile im Box-Score.** Neue Funktion `computeTeamTotals(boxScore)` in
  `gameStats.ts` summiert alle Spalten (Punkte, Treffer/Versuche, Rebounds, Assists, ...) über die
  bereits berechneten Spieler-Zeilen — bewusst aus den fertigen `PlayerBoxScore`-Zeilen statt erneut
  aus den Events, damit die Summe garantiert zur sichtbaren Tabelle passt. Die Trefferquoten der
  Team-Zeile (2P%/3P%/FW%) werden dabei aus den summierten Treffern/Versuchen neu berechnet
  (`fgPct()` auf die Summen angewendet) statt die einzelnen Prozentwerte zu mitteln — eine "Quote
  aus Quoten" wäre bei unterschiedlicher Versuchszahl pro Spieler falsch. Die +/- -Spalte der
  Team-Zeile ist bewusst NICHT die Summe der einzelnen +/- -Werte, sondern schlicht der tatsächliche
  Punktabstand (`teamScore.us - teamScore.opponent`) — jeder Korb fließt oben in bis zu 5
  Spieler-+/- -Werte gleichzeitig ein, eine Summe würde also mehrfach zählen und wäre um ein
  Vielfaches zu hoch. Angezeigt als `<tfoot>`-Zeile unterhalb aller Spieler, optisch abgesetzt
  (`bg-tbw-bg`, fett, dickerer oberer Rand), mit derselben Sticky-Behandlung wie die
  Spieler-Namensspalte darüber.
- **Nachtrag: Box-Score-Namensspalte gekürzt.** Zeigte bisher den vollen Namen — bei der jetzt
  deutlich breiteren Tabelle (%-Spalten, +/-) nimmt das zu viel von der ohnehin knappen sticky
  Spalte weg. Nutzt jetzt dieselbe `shortPlayerName()` aus `format.ts`, die im Tracker bereits an
  anderer Stelle (Picker, Bank-Pills) verwendet wird ("Marc Rewald" → "Marc R.").

## Projektstruktur

```
team-app/
  src/
    lib/            Supabase-Client, Rotationslogik, Formatierung
    context/         AuthContext (Trainer-/Spieler-Session)
    hooks/           geteilte React-Hooks (z. B. useScrollResetOnChange)
    components/      geteilte UI-Bausteine (Header, BottomNav, ...)
    pages/           Start, Trikots, Kampfgericht, Kader, Onboarding
    pages/admin/      Admin-Unterseiten (Spieler, Spiele, Kampfgericht, Training)
  supabase/
    migrations/0001_init.sql   Schema, RLS, RPCs
```
