# Änderung am Live-Tracking · nur Querformat (ab 900px bzw. Querlage)

Die Handy-Ansicht bleibt **unverändert**. Es geht ausschließlich um das Querformat-Layout.
Aktualisierte Vorlage: `tracking.html` (?state=pad · padaction · sub), neue Bilder:
`8-ipad-quer.png`, `9-ipad-aktion.png`, `11-ipad-wechseln.png`.

**An der Logik nichts ändern. Nur Layout und Anordnung. Ansonsten nachfragen.**

---

## 1 · Kopfbereich: eine Zeile statt gestapelt

**Ist:** Punktestand, Viertel-Leiste, Teamfouls und „Viertel beenden" liegen untereinander und
zentriert. Der Block ist dadurch etwa 380px hoch, links und rechts bleibt alles leer.

**Soll:** eine einzige Zeile über die volle Breite, Höhe rund 90px, von links nach rechts:

1. **Punktestand** — `TBW 24 : 27 HSV`, Zahlen 34px Archivo Condensed 800, Kürzel darüber in
   Geist Mono 9px. Feste Breite, nicht mitwachsend.
2. **Viertel-Leiste** — Q1…OT nebeneinander, das laufende Viertel volt gefüllt, beendete zeigen
   ihren Endstand. Dieser Block darf wachsen (`flex: 1 1 auto`), maximal 430px.
3. **Teamfouls** — Label und die fünf Punkte untereinander, darunter „2 BIS BONUS". Feste Breite.
4. **„Viertel beenden"** — Umriss-Knopf, 44px hoch, automatische Breite.
5. **„Spiel beenden"** — rot umrandet, gleiche Größe. **Zieht aus der rechten Spalte hier hoch.**

Die beiden Knöpfe stehen nur im Querformat im Kopf; am Handy bleiben sie unten im Stapel.

## 2 · Aktion und Mannschaft werden ein Feld

**Ist:** zwei Panels nebeneinander („Aktion" links, „Mannschaft" mitte). Beide gleichzeitig
sichtbar, eines davon immer ohne Funktion.

**Soll:** **ein** großes Panel links, das den Platz beider bekommt. Rechts bleibt die Spalte mit
Verlauf und Box-Score (300px breit).

Dieses eine Panel hat zwei Zustände:

**Zustand A — Aktion wählen** (8-ipad-quer.png)
- Überschrift `WÜLFRATH · WAS IST PASSIERT?`
- Vier Spalten, aber **in zwei Blöcken gedacht**: links die Würfe, rechts alles andere.
  So stehen 2er, 3er und FW untereinander und Treffer/Fehlwurf immer nebeneinander:

  | Spalte 1 | Spalte 2 | Spalte 3 | Spalte 4 |
  |---|---|---|---|
  | `2er ✓` | `2er ✗` | `Reb DEF` | `Reb OFF` |
  | `3er ✓` | `3er ✗` | `Assist` | `Steal` |
  | `FW ✓`  | `FW ✗`  | `Block` | `Turnover` |
  | `Foul` (über 2 Spalten) || `Wechseln` (über 2 Spalten) ||
  | `GEGNER TRIFFT +1 +2 +3` (über alle vier Spalten) ||||

- Die vier Knopfreihen teilen sich die verfügbare Höhe gleichmäßig
  (`grid-template-rows: auto repeat(4, minmax(56px, 1fr)) auto`), die Knöpfe haben **keine feste
  Höhe** mehr, sondern füllen ihre Zeile.
- Darunter die Reihe „AUF DEM FELD" mit den fünf Nummern und Foulständen (ohne eigenen Rahmen).
- Ganz unten im Panel die Bestätigungszeile mit „Zurück" (`margin-top: auto`).

**Zustand B — Spieler wählen** (9-ipad-aktion.png)
- Sobald eine Aktion getippt wird, **ersetzt die Spielerauswahl das Tastenfeld im selben Panel**.
  Nichts wird daneben angezeigt, nichts springt.
- Überschrift `WER WAR ES? · 2ER ✓`, Panelrahmen wechselt auf --to-accent-frame.
- Spielerkacheln in **drei Spalten**, feste 124px hoch — sie wachsen **nicht** mit der
  Panelhöhe mit. Bild links, Nummer groß, Name, Foulstand. Die sechste Kachel ist „Abbrechen"
  (gestrichelt, rot).
- Die Bestätigungszeile mit „Zurück" bleibt unten am Panelrand stehen, der Platz dazwischen
  bleibt leer.
- Nach der Auswahl springt das Panel sofort zurück in Zustand A.

**Wechseln** nutzt dasselbe Panel: erst `WER GEHT RAUS?` (Spieler auf dem Feld), dann
`WER KOMMT REIN?` (Bank), Kacheln identisch (11-ipad-wechseln.png).

## 3 · Was damit entfällt
- Das separate Panel „MANNSCHAFT · IMMER ANTIPPBAR" gibt es nicht mehr.
- Damit fällt auch weg, dass man im Querformat erst den Spieler und dann die Aktion tippen kann.
  **Es gilt überall dieselbe Reihenfolge: erst Aktion, dann Spieler.** Das war vorher ein
  Unterschied zwischen Handy und iPad – bitte vereinheitlichen.
- „Spiel beenden" steht nicht mehr unter dem Box-Score.

## 4 · Beide Spalten gleich hoch
Das linke Panel ist **immer genauso hoch wie die beiden rechten Felder zusammen**:
`.cols { display: flex; align-items: stretch }`, keine `align-items: flex-start` mehr.
Die Höhe gibt der Inhalt der höheren Spalte vor, beide enden auf derselben Linie.

Rechte Spalte (300px breit): oben `VERLAUF`, darunter der Box-Score mit den fünf Spielern auf dem
Feld und der Zeile „Team". Der **Verlauf** bekommt den freien Platz (`flex: 1 1 auto`) und zeigt
entsprechend mehr Einträge; der Box-Score behält seine natürliche Höhe. Kein Knopf mehr darunter.

## Rückfrage
Die Umstellung nimmt dem Querformat die Möglichkeit, zuerst den Spieler zu wählen. Falls ihr das
beim Testen als schneller empfunden habt, bitte melden – dann bauen wir statt der Entweder-oder-
Lösung eine Dauerauswahl (Spieler bleibt markiert, Aktionen darauf gebucht).

Zum Schluss: Screenshots bei 1024px Breite für beide Zustände und einen kurzen Hinweis, ob die
Aufteilung im Kopf auf eurem echten iPad (auch 1180px breit) passt.
