Bereich unter der Spielkarte im Reiter „Spiele & Kader" neu bauen – drei Reiter: Spielplan, Ergebnisse, Tabelle.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/10-spielplan-tabelle/

- spielplan-tabelle.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  plan · results · table · stale · noplan · noresults · notable
- 1-spielplan.png · 2-ergebnisse.png · 3-tabelle.png · 4-tabelle-veraltet.png ·
  5-keine-spiele.png · 6-keine-ergebnisse.png · 7-tabelle-fehlt.png

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Spielplan-Import, Ergebnisse, Tabelle, Tracking/Box-Score.
Das ersetzt den bisherigen Umschalter „Spielplan | Tabelle" samt der weißen Karten.

## Die Reiter
Unterstrich-Reiter direkt unter der Spielkarte: **Spielplan · Ergebnisse · Tabelle**.
Aktiv: Text und 2px-Unterstrich in --to-accent, inaktiv --to-text-3, Unterstrich transparent.
Umschalten animiert nur Farbe und Rand (.15s), kein Layoutsprung.
Echte Knöpfe mit role="tab" / aria-selected. Der zuletzt gewählte Reiter muss NICHT gemerkt werden;
beim Öffnen der Seite ist „Spielplan" aktiv.

Bisher waren Ergebnisse Teil des Spielplans – sie bekommen jetzt einen eigenen Reiter.

## Spielplan
ALLE kommenden Spiele der Saison, nach Monat gruppiert (Mono-Label „OKTOBER", --to-text-4).
Kein „Weitere Spieltage anzeigen", kein Nachladen auf Tipp – die Liste ist vollständig.
Pro Spiel eine Zeile (Radius 18, --to-surface, Rand --to-border):
- links Datumsblock: Wochentag in Mono 10px, Tag in Archivo condensed 20px
- Mitte: Gegner 15/600, darunter in Mono 11px `20:30 · AUSWÄRTS · PLATZ DER REPUBLIK`
  (beide Zeilen einzeilig mit Ellipse, nie umbrechen)
- das nächste Spiel: Fläche rgba(200,255,46,.06), Rand --to-accent-frame, Tag in --to-accent
  und rechts die Pille „NÄCHSTES"
Tipp auf eine Zeile öffnet die Spieldetails (Kader, Treffpunkt, Mitfahrgelegenheit) wie bei der Karte oben.
Keine Spiele: „Keine Spiele geplant" / „Sobald der Spielplan steht, taucht er hier auf."

## Ergebnisse
Gespielte Spiele, das jüngste zuerst. Pro Spiel eine Karte:
- S/N-Kachel 28×28 (S in --to-accent-soft/--to-accent, N in --to-danger-soft/--to-danger-text)
- Gegner und darunter `SO 20.09. · AUSWÄRTS` in Mono
- rechts das Ergebnis in Archivo condensed 22px, tabular-nums
- **„Box-Score ansehen" NUR, wenn das Spiel über die App getrackt wurde.** Sonst entfällt die Zeile
  samt Trennlinie ersatzlos – kein ausgegrauter Knopf (siehe drittes Spiel in 2-ergebnisse.png).
Noch keine Ergebnisse: „Noch keine Ergebnisse" / „Nach dem ersten Spiel steht hier das Ergebnis."

## Tabelle
Eine Karte, Spalten in fester Breite:
`#` 22 · Team 152 (Ellipse) · `SP` 22 · `S-N` 34 · `PKT` 26 · `KÖRBE` 58, Innenabstand 12px.
Kopfzeile in Mono 9px (--to-text-4), Zahlen in Mono mit tabular-nums, Punkte fett.
Das eigene Team: Zeile in rgba(200,255,46,.07), Platz, Name und Punkte in --to-accent, Name fett.
Namen werden NICHT gekürzt oder umbenannt, nur per Ellipse abgeschnitten.
Unten immer die Quellzeile: „Quelle: basketball-bund.net · Stand 23.09. 08:00 Uhr".

## Daten von basketball-bund.net
Abgleich dreimal täglich. Der Stand ist immer sichtbar, nie „live" suggerieren.

- Klappt eine Aktualisierung nicht, bleibt der LETZTE bekannte Stand stehen und darüber erscheint die
  gelbe Fläche „Letzte Aktualisierung fehlgeschlagen." mit dem Textknopf „Erneut laden"
  (4-tabelle-veraltet.png). Die Quellzeile zeigt weiter den alten Zeitstempel.
- Gab es noch nie Daten: „Tabelle nicht verfügbar" / „Die Tabelle konnte noch nicht geladen werden."
- Beim ersten Laden ohne Daten kein Dauer-Spinner, sondern dieselbe leere Karte.
Falls der Abgleich noch gar nicht steht: Reiter trotzdem bauen und die Zustände an die vorhandene
Datenquelle hängen; in der Rückmeldung schreiben, was für den automatischen Import noch fehlt.

Zum Schluss: Screenshots bei 390px Breite für alle drei Reiter und den veralteten Stand, dazu eine
kurze Liste, was du geändert hast und wo die App anders funktioniert als hier beschrieben.
