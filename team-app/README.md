# TBW Team App

Team-Organisation für TB Wülfrath U16: Trikot-Wäsche-Rotation, Kampfgericht-Einteilung,
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

Die Farben in `tailwind.config.js` (`tbw.*`) sind Platzhalter — bitte gegen die echten
TB-Wülfrath-Vereinsfarben austauschen, sobald diese vorliegen. Ebenso ist
`public/icons/icon.svg` ein einfacher Platzhalter; für produktive PWA-Installs empfiehlt
sich zusätzlich ein echtes 512×512-PNG-Icon.

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
- **Push-Benachrichtigungen** sind (noch) nicht umgesetzt — die App zeigt alle relevanten
  Termine/Zuweisungen beim Öffnen an ("Self-Check"). Ließe sich später über die Web Push API
  ergänzen, ohne am Datenmodell etwas zu ändern.
- **Warnschwelle Kampfgericht:** aktuell fest bei < 2 Einsätzen (Saison-Soll 2–3) über
  `SEASON_TARGET_MIN`/`SEASON_TARGET_MAX` in `src/pages/Kampfgericht.tsx`. Bei Bedarf mit dem
  Trainer final abstimmen und dort anpassen.
- **Upload-Format für Spieltermine/Kampfgericht-Termine:** noch nicht implementiert; aktuell
  werden Spiele, Kampfgericht-Termine und Trainingszeiten einzeln über die Admin-Formulare
  angelegt (`/admin`). Ein Sammel-Import (PDF/Excel/ICS) lässt sich später als zusätzliche
  Aktion in `src/pages/admin/GamesAdmin.tsx` bzw. `OfficiatingAdmin.tsx` ergänzen, sobald klar
  ist, in welchem Format der Verband/das Ligaportal liefert.
- **Notizfeld bei zukünftigen Spieltagen:** noch nicht umgesetzt (kein Feld im Schema). Ließe
  sich als optionale `note text`-Spalte auf `games` ergänzen.

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
