# TipOff – Design-Spezifikation (Konzept A „Night Court", v0.1)

Diese Datei beschreibt das neue visuelle Design der TipOff-App. Sie ist die Quelle der Wahrheit für das Redesign.
Die Werte stehen als CSS-Variablen in `tokens.css`, die Logos und Icons in `assets/`, die Referenz-Screens in `reference-screens/`.

> **Status:** Richtung ist entschieden, Details sind noch nicht final. Einzelne Elemente (Buttons, Karten, Listen, Navigation …) werden später noch einmal einzeln durchgegangen. Deshalb gilt: **alle Werte zentral über Tokens und wiederverwendbare Komponenten umsetzen, nichts hart in einzelne Screens codieren.**

---

## 1. Idee

- Dunkel, selbstbewusst, sport-tech – eher Nike Training Club als Vereinsverwaltung.
- Basketball-DNA über **Linien, Timing und Bewegung** (Mittelkreis, Mittellinie, 24-Sekunden-Anzeige, Sprungball) – **keine** Ball-Icons, Netze oder Orange.
- **Eine** Akzentfarbe (Tip Volt `#C8FF2E`) für Aktionen, „du" und „bestätigt". Rot nur für Warnungen.
- Viel Luft: 20 px Seitenrand, 20 px Abstand zwischen Blöcken, große Karten statt vieler kleiner Kästen.

## 2. Farbe

| Token | Hex | Einsatz |
|---|---|---|
| `--to-bg` | `#0A0C0F` | App-Hintergrund |
| `--to-surface` | `#12151A` | Karten |
| `--to-surface-2` | `#1A1E25` | Chips, Eingabefelder, verschachtelte Flächen |
| `--to-border` | `#232830` | Rahmen um Karten (1 px) |
| `--to-line` | `#2A303A` | Outline-Buttons, inaktive Fortschritts-Segmente |
| `--to-divider` | `#1F242C` | Trenner zwischen Listenzeilen |
| `--to-text` | `#F2F4F7` | Primärtext |
| `--to-text-2` | `#A3ABB8` | Sekundärtext |
| `--to-text-3` | `#7C8594` | Labels, Hinweise |
| `--to-accent` | `#C8FF2E` | Primär-Buttons, aktive Tabs, eigene Nummer, Häkchen |
| `--to-on-accent` | `#0A0C0F` | Text auf Volt (niemals weiß auf Volt!) |
| `--to-danger` | `#FF5A67` | offen / abgemeldet / zu viele |
| `--to-vacation` | `#E9B949` | Update 2026-09-22 — ausschließlich "Urlaub" auf der Training-Karte |

Regeln: Volt nie großflächig als Hintergrund in Screens (Ausnahme: App-Icon, Primär-Button, kleine Badges). Kein Weiß auf Volt.

## 3. Schrift

Drei Rollen, alle von Google Fonts (Link steht in `tokens.css`):

| Rolle | Schrift | Einstellung | Beispiele |
|---|---|---|---|
| Display | Archivo | `font-stretch: 125%`, 800, *italic*, `letter-spacing: -0.035em` | „Kader", „Hey Jonas.", „SA 26.09." im Hero |
| Nummern | Archivo | `font-stretch: 62%`, 800 | Trikotnummern `07`, `14` (immer zweistellig) |
| Text | Geist | 400 / 500 / 600 | Namen, Beschreibungen, Buttons |
| Daten & Labels | Geist Mono | 11–15 px, Labels in Versalien mit `letter-spacing: 0.12em` | „NÄCHSTES SPIEL · SPIELTAG 3", „14:00 Uhr", Countdown |

**Display-Headline-Skala** (Update 2026-09-22): Statt screen-eigener Größen gilt jetzt eine feste
Skala für alle Display-Headlines — als Tokens in `tokens.css` (`--to-display-xl/-lg/-md/-num`)
und passenden Klassen (`.to-display-xl/-lg/-md/-num`), jede mit `font-stretch: 125%`, 800,
*italic*, `letter-spacing: -0.035em`, `line-height: 1.05`:

| Token/Klasse | Größe | Einsatz |
|---|---|---|
| `--to-display-xl` | 32px | Begrüßung ("Hi Marc!"), Headline im Willkommens-Screen |
| `--to-display-lg` | 28px | Screen-Titel ("Kader", "Kader bearbeiten") |
| `--to-display-md` | 34px | Datum im "Nächstes Spiel"-Kasten (z. B. "SA 26.09.") |
| `--to-display-num` | 40px | Große Zähler (z. B. "10/12" im Kader) |

Kein Screen setzt mehr eine eigene Headline-Größe — immer eine dieser vier Stufen.

Größen: Screen-Titel 30–36 px · Hero-Datum 46 px · Karten-Titel 18 px/600 · Text 15–16 px · Sekundär 12–13 px · Labels 11 px.

## 4. Logo & Icon

- **Zeichen „Jump Ball":** offener Kreis (Mittelkreis) mit Punkt darüber = der Ball beim Sprungball. Dateien: `assets/tipoff-mark-*.svg`.
- **Wortmarke:** „tipoff" klein geschrieben, Archivo `font-stretch: 112%`, 700, `letter-spacing: -0.045em`, neben dem Zeichen (Abstand ≈ 0,3 × Zeichenhöhe).
- **App-Icon:** Volt-Fläche, dunkles Zeichen. `assets/app-icon-180.png` (apple-touch-icon), `app-icon-192.png`, `app-icon-512.png`, `app-icon-maskable-512.png` (für `purpose: "maskable"` im Web-Manifest), `favicon.svg` / `favicon-32.png`.
- PWA-Manifest: `theme_color` und `background_color` = `#0A0C0F`.

## 5. Komponenten

**Primär-Button:** Höhe 56–58 px, Radius 16, Volt-Hintergrund, Text `--to-on-accent` 16 px/600. Text links, Pfeil-Icon rechts (bei Weiter-Aktionen), sonst Text zentriert. Deaktiviert: `--to-surface-2`-Hintergrund, Text `--to-text-3`.

**Sekundär-Button:** Höhe 44–54 px, 1 px Rahmen `--to-line`, transparent, Text `--to-text` 14–15 px/500.

**Karte:** `--to-surface`, 1 px Rahmen `--to-border`, Radius 22–26, Innenabstand 20–22 px. Titelzeile: Icon (22 px, Strich 1.8) + Titel 18 px/600, rechts optional Status.

**Listenzeile (in Karte):** min. 64 px hoch, 16 px Innenabstand, Trenner `--to-divider`. Aufbau: Trikotnummer (Nummern-Schrift 32 px, Volt wenn nominiert, `#4A515C` wenn nicht) · Name 15 px/600 + Zusatz 12 px `--to-text-2` · rechts Position (Mono) oder Status.

**Badges:**
- „HEIM": Volt-Fläche, Mono 11 px/600, Versalien, Pill.
- „AUSWÄRTS": 1 px Rahmen `--to-text`, transparent.
- Status-Pill: Punkt (6–7 px) + Text; Volt-soft für „Im Kader", `--to-surface-2` für „Auf Abruf", Danger-soft für „Abgemeldet".

**Fortschritt:** 12 Segmente (= 12 Plätze auf dem Spielberichtsbogen), je 6 px hoch, 3 px Abstand, Volt gefüllt / `--to-line` leer, bei Überschreitung alle Rot.

**Countdown:** Mono 30 px/600 Volt, Einheiten (T / STD / MIN) 11 px `--to-text-3`, auf `--to-bg`-Fläche innerhalb der Karte.

**Code-Eingabe:** 6 Felder 46 × 60 px (3 + Strich + 3), Mono 26 px, aktives Feld Volt-Rahmen + Volt-Cursor. Technisch **ein** echtes `<input>` (autocomplete="one-time-code", Großbuchstaben, A–Z/0–9), die Kästen sind nur Darstellung.

**Tab-Leiste:** 5 Einträge (Start, Spiele, Kader, Kampfgericht, Profil), Icons 24 px Strich 1.8, Label 11 px; aktiv = Volt, inaktiv = `--to-text-3`. Hintergrund `--to-bg`, oben 1 px `--to-divider`.

**Icons:** Linien-Icons, 24er-Raster, Strich 1.8, runde Enden (z. B. Lucide passt gut). Keine Emojis.

**Court-Linien (Deko):** dünne Kreise/Linien (1 px, Weiß mit 6–10 % Deckkraft, ein Kreis in Volt mit 50 %) angeschnitten am Kartenrand oder im Willkommens-Screen. Sparsam: max. ein Deko-Element pro Screen, nie hinter Text mit wichtigen Infos.

## 6. Screens (siehe `reference-screens/`)

| Datei | Screen | Inhalt |
|---|---|---|
| `Welcome.dc.html` | Willkommen | Großes Jump-Ball-Motiv als Linienzeichnung, Headline „Alles klar vor dem Sprungball.", 4 Feature-Chips, CTA „Mit Zugangscode starten" |
| `AccessCode.dc.html` | Zugangscode | Zurück, Headline, 6-stellige Code-Eingabe, Bestätigung „Code erkannt · Team", CTA „Anmelden", QR-Alternative |
| `Dashboard.dc.html` | Spielübersicht | Kopf mit Team-Umschalter + Avatar · Begrüßung · Hero „Nächstes Spiel" (Heim/Auswärts, Datum, Teams, Halle + Route, Countdown) · Status-Kacheln Kader/Trikot · Kampfgericht-Karte (3 Rollen) · Trikot-Karte · Spielplan · Tab-Leiste |
| `Roster.dc.html` | Kader | Titel + „Trainer-Modus" · Spiel-Kontext · „10/12" + Segmente · Filter · Listen „Im Kader" / „Nicht dabei" · Trainerteam |
| `RosterEdit.dc.html` | Kader bearbeiten (Trainer) | Abbrechen/Fertig · Zähler mit Live-Segmenten und Warnung > 12 · Schalter pro Spieler · Spieler einladen · „Kader veröffentlichen" |
| `Main`, `AppIcon`, `Foundations` | Marken-Boards | Logo-Richtungen (gewählt: 02 Jump Ball), Icon-Größen, Farben/Schrift |

**Hinweis zu den Referenzdateien:** Das sind Design-Mockups, kein Produktionscode. Die Optik steckt in den `style="…"`-Attributen. `{{ … }}`, `<sc-for>`, `<sc-if>` und der `<script>`-Block am Ende sind Template-Syntax des Design-Tools – ignorieren und durch die Strukturen der bestehenden App ersetzen. Namen, Gegner, Hallen und Zahlen sind Beispieldaten.

## 7. Fachliche Abweichungen – echte App-Logik geht vor

Das Mockup zeigt an ein paar Stellen Dinge, die nicht zur App passen. **Nicht so umsetzen:**
- **Kein Zu-/Absage-System für Spieler.** Der Kader wird nur vom Trainer gesetzt. „Du bist dabei / Zusage ändern" im Dashboard und „hat zugesagt" im Trainer-Modus entfallen bzw. werden zu „Im Kader" / „Nicht im Kader". Spieler melden sich beim Trainer ab, wenn sie nicht können.
- **Trikots:** Die App kennt mehrere Sätze (z. B. weiß = Heim, schwarz = Auswärts) und **eine gemeinsame Wäsche-Reihenfolge** (alphabetisch, Spieler ohne Kader-Platz werden übersprungen und bleiben als Nächste dran). Die Trikot-Karte soll zeigen: welcher Satz beim nächsten Spiel, wer ihn gerade hat, wer als Nächstes wäscht, und die Wasch-Zählung pro Spieler, statt nur des Nummern-Rasters aus dem Mockup.
- **Kampfgericht:** Die drei Aufgaben 24-Sekunden-Uhr, Anschreiben, Zeit & Punkte werden getrennt vergeben, auch für Spiele anderer Teams im Verein.
- Alle Funktionen, die es in der App schon gibt, aber nicht im Mockup, bekommen dieselbe Optik (Karten, Listen, Badges, Buttons wie oben).

## 8. Barrierefreiheit

- Touch-Flächen mindestens 44 × 44 px.
- Kontrast: Text mindestens 4.5:1 – `--to-text-3` ist das dunkelste erlaubte Grau für Text auf `--to-surface`.
- Echte `<button>`/`<a>`/`<input>` mit Label, `aria-label` bei reinen Icon-Buttons, `aria-pressed` bei Schaltern/Filtern.
- `prefers-reduced-motion` respektieren, falls Animationen dazukommen.
