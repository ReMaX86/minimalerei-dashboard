Neu: Bestenliste unter dem Kader im Reiter „Team".
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/12-bestenliste/

- bestenliste.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  points · rebounds · blocks · all · empty
- 1-punkte.png · 2-rebounds.png · 3-bloecke-gescrollt.png · 4-alle-spieler.png · 5-nichts-getrackt.png

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Tracking/Box-Score, Spielerliste, Reiter „Team".
Das ist ein NEUER Abschnitt – er kommt unter das Kader-Raster (Element 11), im selben Reiter.

## Was gezeigt wird
Pro Kategorie eine Rangliste aller Spieler, berechnet über die GANZE SAISON als SUMME aller Werte
aus Spielen, die über die App getrackt wurden. Kein Schnitt, keine Hochrechnung.

Kategorien in dieser Reihenfolge: **Punkte · Rebounds · Assists · Steals · Blöcke**.
Wichtig: Blöcke werden laut bisherigem Stand NICHT getrackt (getrackt sind Punkte, Rebounds, Assists,
Steals, Turnover, Fouls). Prüfe das im Code. Ist ein Wert nicht vorhanden, lass die Kategorie weg und
schreib es in die Rückmeldung – keine leere Kategorie und keine erfundenen Zahlen.
Turnover und Fouls bleiben bewusst draußen.

## Kategorie-Pillen – eine Zeile, seitlich scrollbar
Das ist der Kern dieses Elements:
- `display:flex; flex-wrap:nowrap; overflow-x:auto` – die Pillen brechen NIE um, sie scrollen seitwärts.
- Jede Pille `flex:0 0 auto`, Höhe 34, Radius 999, `white-space:nowrap`.
  Inaktiv: Rand --to-line, Text --to-text-2. Aktiv: Fläche --to-accent, Text --to-on-accent.
- Die Scrollleiste wird ausgeblendet (`scrollbar-width:none`, `::-webkit-scrollbar{display:none}`),
  `-webkit-overflow-scrolling:touch`, `scroll-snap-type:x proximity` und pro Pille `scroll-snap-align:start`.
- Der Innenabstand links/rechts von 20px gehört an den SCROLL-CONTAINER, nicht an eine Hülle –
  so läuft die erste/letzte Pille sauber an den Bildschirmrand (siehe 3-bloecke-gescrollt.png).
- Beim Antippen wird die gewählte Pille per `scrollIntoView({inline:'nearest', behavior:'smooth'})`
  in den sichtbaren Bereich geholt.
Die Pillen sind echte Knöpfe mit role="tab" und aria-selected.

## Die Liste
Karte (Radius 22, --to-surface, Rand --to-border), pro Spieler eine Zeile, 54px hoch:
- Platz in Mono 12px, beim Ersten in --to-accent
- Avatar 34px rund (Foto mit object-fit:cover, sonst Initialen)
- Name 14/600, darunter ein Balken: Spur in --to-surface-2, Füllung im Verhältnis zum Spitzenwert
  (`width = wert / bestwert`, mindestens 2 %). Erster Platz volt, alle anderen #3A414C.
- rechts der Wert in Archivo condensed 19px (tabular-nums) und darunter in Mono 9px die Zahl der
  Spiele dieses Spielers (`4 SP`). Die gehört dazu: bei Summen wäre ein Spieler mit zwei Einsätzen
  sonst unfair weit hinten.
- Die eigene Zeile ist volt getönt (rgba(200,255,46,.06)) und der Name in --to-accent.
Standardmäßig die ersten SECHS, darunter „Alle 12 Spieler anzeigen" (klappt auf, Chevron dreht sich).

Spieler ohne getracktes Spiel erscheinen erst beim Aufklappen, ganz unten, mit „—" statt Wert,
`0 SP` und leerem Balken (4-alle-spieler.png).

Bei Gleichstand entscheidet die kleinere Zahl an Spielen, danach der Nachname.

Unter der Karte die Zeile „Summe aus 4 getrackten Spielen · kleine Zahl = Spiele des Spielers".

## Noch nichts getrackt
Statt der Liste eine Karte: „Noch keine Statistik" / „Sobald ein Spiel über die App getrackt wurde,
steht hier die Bestenliste." Die Pillen bleiben trotzdem stehen.

Zum Schluss: Screenshots bei 390px Breite für Punkte, die gescrollte Pillenzeile und die aufgeklappte
Liste, dazu eine kurze Liste, was du geändert hast und wo die App anders funktioniert als hier beschrieben –
insbesondere, ob Blöcke getrackt werden.
