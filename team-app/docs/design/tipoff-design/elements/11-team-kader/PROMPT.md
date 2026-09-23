Reiter „Team" neu bauen – Kader als Raster, Spielerprofil als Blatt von unten.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/11-team-kader/

- team-kader.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  grid · profile · profilemin · profileown · coachview · picker
- 1-kader-raster.png · 2-profil.png · 3-profil-leer.png · 4-eigenes-profil.png ·
  5-trainersicht.png · 6-staerken-auswahl.png

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Spielerliste, Spielerprofil, Rollen, Admin-Bereich, Tracking/Box-Score.
Bestehende Logik bleibt – es geht um die Darstellung, außer wo unten ausdrücklich etwas Neues steht.
Emojis fallen überall weg.

## Kader-Raster
Abschnittskopf: „Kader" (Archivo expanded italic 20px), Haarlinie, rechts „12 SPIELER" in Mono.
Darunter ein dreispaltiges Raster, 10px Abstand. Jede Kachel (Radius 20, --to-surface, Rand --to-border)
ist ein echter Knopf und enthält:
- Avatar 58px rund: Foto mit object-fit: cover, sonst Initialen in Mono auf --to-surface-2
- Vorname und Nachname in ZWEI Zeilen, je 12px/600, einzeilig mit Ellipse
- Position in Mono 9px (--to-text-4) – nur wenn gepflegt, sonst entfällt die Zeile
- Trainer und Captains: Kachelrand in --to-accent-frame und ein volt Punkt am Avatar mit „T" bzw. „C"
Sortierung alphabetisch nach Vorname, so wie jetzt.

## Spielerprofil
Öffnet als Blatt von unten (Bottom-Sheet), nicht als eigene Seite:
1. Kopf: Avatar 76px im 2px-Ring in --to-accent, daneben der Name in Archivo expanded italic 24px
   und darunter die Position in Mono 12px, Großbuchstaben.
   Keine Position hinterlegt: „POSITION NICHT HINTERLEGT" in --to-text-4.
2. Kennzahlen als gleich breite Kacheln: GRÖSSE (`180 cm`), ALTER (`39 J.`), SPIELE (getrackte Spiele).
   Die Einheit in 12px --to-text-3. Fehlt ein Wert, entfällt die Kachel und die verbleibenden teilen
   sich die Breite (siehe 3-profil-leer.png).
3. STÄRKEN als Chips: Begriff in --to-accent/600, dahinter der Spitzname in 11px --to-text-3
   („3-Point Sniper"). Fläche rgba(200,255,46,.10), Rand --to-accent-frame.
   Keine hinterlegt: „Noch keine Stärken hinterlegt."
4. SAISON: Überschrift „SAISON · SUMME AUS 4 GETRACKTEN SPIELEN", darunter ein 3-spaltiges Raster mit
   den SUMMEN (nicht Schnitt) aus allen getrackten Spielen:
   PUNKTE · REBOUNDS · ASSISTS · STEALS · TURNOVER · FOULS.
   Zahl in Archivo condensed 24px, Label in Mono 9px.
   Noch nichts getrackt: „Noch kein Spiel mit diesem Spieler getrackt."

## Wer darf was
- Spieler bearbeiten nur ihr EIGENES Profil (Foto, Größe, Geburtsdatum) – dort erscheint unten der
  Knopf „Profil bearbeiten", der ins bestehende Profil-Pop-up führt.
- Position und Stärken pflegt ausschließlich der Trainer im Admin-Bereich. In der Trainersicht steht
  unten „Im Admin bearbeiten" und führt dorthin.
- Fremde Profile ohne Rechte: kein Knopf.
- Beides sind optionale Angaben – ein Profil ohne Position, Stärken und Statistik muss gut aussehen.
- Kontaktdaten (Telefon, Mail) werden NICHT angezeigt.

## Stärken im Admin
Feste Auswahl, kein Freitext. Genau diese elf, in dieser Reihenfolge:
3-Point (Sniper) · Rebound (Glas-Cleaner) · Blocks (Blockmaschine) · Verteidigung (Defense Monster) ·
Passspiel (Playmaker) · Ballhandling (Crossover-King) · Athletik (Highflyer) · Freiwurf (Mr. Automatik) ·
Fastbreak (Turbo) · Motor (Energizer) · Post-Play (Tank)

Auswahl als Blatt (6-staerken-auswahl.png): alle elf als Chips, nicht gewählte mit Rand --to-line in
--to-text-2, gewählte volt. Höchstens DREI gleichzeitig, rechts oben der Zähler `2/3`;
sind drei gewählt, sind die übrigen nicht mehr antippbar (45 % Deckkraft).
Knöpfe „Speichern" und „Abbrechen".
Die drei sind eine Annahme – falls die App mehr erlaubt, die Zahl anpassen und in der Rückmeldung nennen.

Zum Schluss: Screenshots bei 390px Breite für das Raster, ein volles Profil, ein leeres Profil und die
Stärken-Auswahl, dazu eine kurze Liste, was du geändert hast und wo die App anders funktioniert als hier
beschrieben.
