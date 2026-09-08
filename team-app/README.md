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
    wechseln"-Rücksprung), statt beides gleichzeitig anzuzeigen — die
    Auswahl bleibt zwischen mehreren Aktionen desselben Spielers bestehen,
    für schnelle Serien (z. B. zwei Körbe hintereinander).

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
