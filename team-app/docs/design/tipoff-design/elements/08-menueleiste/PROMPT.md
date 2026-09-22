Schwebende Menüleiste (Tab Bar) neu bauen – aktives Ziel als volt Kapsel.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/08-menueleiste/

- menueleiste.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  start · duty · admin · badges · player · games
- 1-start-aktiv.png · 2-kampfgericht-aktiv.png · 3-admin-aktiv.png ·
  4-hinweispunkte.png · 5-spieler-ohne-admin.png · 6-spieler-spiele-aktiv.png

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Routing, bisherige Tab-Leiste, Rollen (Trainer, Admin, Captain).
Ziele und Reihenfolge bleiben wie bisher, es geht um die Darstellung.

## Aufbau
Die Leiste schwebt weiter über dem Inhalt:
position: fixed; left/right 10px; bottom: calc(10px + env(safe-area-inset-bottom)); z-index 50;
Radius 26, Rand --to-border, Hintergrund rgba(18,21,26,.92) mit backdrop-filter: blur(18px)
(plus -webkit-), Schatten 0 14px 34px rgba(0,0,0,.55), Innenabstand 7px, 2px zwischen den Zielen.
Ab 430px Breite die Leiste auf 370px festnageln und mittig setzen.
`<meta name="viewport" … viewport-fit=cover>` muss gesetzt sein, sonst greift die Safe-Area nicht.

Der Seiteninhalt bekommt unten padding-bottom: calc(60px + 34px), damit nichts unter der Leiste verschwindet.

Markup: ein `<nav aria-label="Hauptmenü">` mit echten `<a href>` je Ziel – keine divs mit onClick.

## Die Ziele
Reihenfolge: Start · Spiele · Team · Trikots · Kampfgericht · Admin.
Kampfgericht bleibt ein eigener Reiter. Admin sehen nur Trainer und Admins – für Spieler entfällt der
Eintrag ersatzlos, die Leiste hat dann fünf Ziele (5-spieler-ohne-admin.png).

Symbole als Strich-SVG wie in der Vorlage (Haus, Spielfeld mit Mittellinie, zwei Personen, Trikot,
Stoppuhr, Sonne/Zahnrad). Keine Emojis, keine gefüllten Flächen.

## Aktiv und inaktiv
- inaktiv: 38×44, nur das Symbol in --to-text-3, Strichstärke 1.9
- aktiv: dasselbe Element wird zur Kapsel – Breite auto, 14px Innenabstand links/rechts, 8px Abstand
  zwischen Symbol und Text, Hintergrund --to-accent, Symbol und Text in --to-on-accent,
  Text 13px/600. Gekennzeichnet über aria-current="page", NICHT über eine Extra-Klasse allein.
- Der Wechsel wird animiert: width, background-color, color und padding über .18s ease,
  der Text über max-width (0 → 140px) und opacity. Kein Sprung, keine Extra-Bibliothek.
- Alle sechs passen nebeneinander, auch wenn „Kampfgericht" aktiv ist (Vorlage prüfen, 370px Leiste).
  Die Beschriftung wird NICHT gekürzt.

## Hinweispunkt (neu)
Jedes inaktive Ziel kann einen volt Punkt tragen (7px, 2px Rand in der Leistenfarbe, oben rechts am
Symbol), wenn dort etwas offen ist:
- Spiele: eigene Zu-/Absage für ein veröffentlichtes Kader-Spiel steht aus
- Kampfgericht: eigener Einsatz in den nächsten 7 Tagen
- Team, Trikots, Admin: vorerst kein Punkt
Auf dem aktiven Ziel wird der Punkt ausgeblendet. Für Screenreader eine unsichtbare Zeile
„Es liegt etwas an" im Link (Klasse .sr wie in der Vorlage).
Falls die Daten dafür auf der Startseite noch nicht global vorliegen: erst ohne Punkte bauen und in der
Rückmeldung schreiben, was dafür fehlt – nicht raten.

## Barrierefreiheit
Jedes Ziel ≥44px hoch, aria-label mit dem vollen Namen (auch wenn nur das Symbol sichtbar ist),
SVGs aria-hidden. Keine globalen Tastatur-Handler.

Zum Schluss: Screenshots bei 390px Breite für „Start aktiv", „Kampfgericht aktiv" und die Spieler-Ansicht,
dazu eine kurze Liste, was du geändert hast und wo die App anders funktioniert als hier beschrieben.
