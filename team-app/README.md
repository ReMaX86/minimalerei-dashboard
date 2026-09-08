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
- **Push-Benachrichtigungen** sind (noch) nicht umgesetzt — die App zeigt alle relevanten
  Termine/Zuweisungen beim Öffnen an ("Self-Check"). Ließe sich später über die Web Push API
  ergänzen, ohne am Datenmodell etwas zu ändern.
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

## Projektstruktur

```
team-app/
  src/
    lib/            Supabase-Client, Rotationslogik, Formatierung
    context/         AuthContext (Trainer-/Spieler-Session)
    components/      geteilte UI-Bausteine (Header, BottomNav, ...)
    pages/           Start, Trikots, Kampfgericht, Kader, Onboarding
    pages/admin/      Admin-Unterseiten (Spieler, Spiele, Kampfgericht, Training)
  supabase/
    migrations/0001_init.sql   Schema, RLS, RPCs
```
