Live-Tracking neu gestalten (Handy hochkant **und** Querformat).
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/24-tracking/

- tracking.html → Referenz-Umsetzung, anklickbar. **Eine Datei, zwei Layouts:** unter 900px
  Breite der Handy-Stapel, ab 900px das Querformat mit drei Spalten. Zustände über ?state=…
  track · who · sub · foulout · box · quarter · finish · pad · padaction
- 1-tracking.png · 2-wer-war-es.png · 3-wechseln.png · 4-fuenftes-foul.png · 5-box-score.png ·
  6-viertel-beenden.png · 7-spiel-beenden.png · 8-ipad-quer.png · 9-ipad-aktion.png

## WICHTIG – Rahmen für diese Aufgabe
**An der Logik erstmal nichts ändern. Nur die neuen Designs übernehmen. Ansonsten nachfragen.**
Ausnahmen sind die unten als **NEU** markierten Punkte (Fouls pro Spieler, Teamfouls, getrennte
Rebounds, Viertel-Ende mit Push, Bestätigungszeile) und der Bugfix im Box-Score. Auch die bitte
erst nach den Rückfragen am Ende umsetzen.

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten
Werte. Emojis fallen weg. **Es gibt weiterhin keine Spieluhr** – weder sichtbar noch im Hintergrund.

Tracken dürfen wie bisher Spieler und Trainer am Spieltag über die Startseite, der Trainer
zusätzlich jederzeit über den Adminreiter „Spiele".

## 1 · Zwei Layouts, ein Bildschirm
**Handy hochkant** (1-tracking.png): Kopf mit Punktestand, darunter das Tastenfeld, darunter die
Bestätigungszeile, dann „Auf dem Feld", Verlauf und die drei großen Knöpfe.
**Ab 900px Breite** (8-ipad-quer.png): drei Spalten – links das Tastenfeld, in der Mitte die
Mannschaft, rechts Verlauf und Box-Score. Der Umbruch passiert per Media Query, es ist **dieselbe
Seite**, keine zweite Route. Beim iPad quer ist das die vorgesehene Nutzung.

Maße, die eingehalten werden müssen: Wurfknöpfe 62px hoch (Querformat 52), alle übrigen Aktionen
58px (Querformat 44), nichts ist schmaler als die halbe Bildschirmbreite, Seitenrand 16px.

## 2 · Reihenfolge der Eingabe
**Handy:** erst die Aktion, dann der Spieler – wie heute. Nach dem Tipp auf eine Aktion **ersetzt
die Spielerauswahl das Tastenfeld** (2-wer-war-es.png), damit nichts gescrollt werden muss. Nach
der Auswahl ist das Tastenfeld sofort wieder da.

**Querformat:** beide Spalten bleiben gleichzeitig bedienbar. Erst Aktion, dann Spieler – **oder
erst Spieler, dann Aktion** (9-ipad-aktion.png). Die Buchung passiert, sobald beides gewählt ist.
Kein Umschalten, keine Overlays.

## 3 · Spielerauswahl mit Bild (NEU im Design)
Kachel: rundes Profilbild links (56px, im Querformat 48px), daneben die **Trikotnummer groß** in
Archivo, darunter Name und Foulstand. Zwei Kacheln pro Reihe, 116px hoch (Querformat 100px).
Kein Bild hinterlegt → Initialen wie im Rest der App. Die sechste Kachel ist **„Abbrechen"** und
erscheint nur, solange eine Auswahl offen ist.

Nur die fünf auf dem Feld stehen zur Auswahl. Wer von der Bank kommt, kommt über „Wechseln" rein.

## 4 · Fouls (NEU)
- **Pro Spieler:** Foulstand an jeder Kachel und in der Reihe „Auf dem Feld". Ab dem 4. Foul in
  --to-vacation, ab dem 5. in --to-danger-text mit rotem Rahmen.
- Beim 5. Foul erscheint das Blatt aus 4-fuenftes-foul.png und bietet direkt „Jetzt wechseln" an.
  Der Spieler bleibt sichtbar rot markiert, bis gewechselt wurde – **gesperrt wird nichts
  automatisch** (siehe Rückfrage 2).
- **Teamfouls pro Viertel:** fünf Punkte im Kopf, gefüllt in --to-vacation, daneben „2 BIS BONUS".
  Beim Viertelwechsel zurück auf null.

## 5 · Rebounds getrennt (NEU)
Zwei Knöpfe statt einem: **Reb DEF** (links, der häufigere) und **Reb OFF** (rechts). Beide zählen
auf dasselbe Rebound-Total im Box-Score, werden aber getrennt gespeichert.

## 6 · Gegner
Eigene Zeile unten im Tastenfeld: „GEGNER TRIFFT" mit **+1 / +2 / +3**. Ein Tipp, keine
Spielerauswahl. Beim Gegner werden **nur Punkte** erfasst, sonst nichts – die Kachel „Gegner" in
der Spielerauswahl entfällt damit.

## 7 · Bestätigung und Rückgängig (NEU)
Direkt unter dem Tastenfeld steht, was zuletzt gebucht wurde: Nummer, Name, Aktion, Punkte.
Daneben **„Zurück" als echter Knopf** (46px, rot gerahmt) – nicht mehr als Textlink. Er nimmt den
letzten Eintrag zurück **inklusive Punkte, Fouls und Rebounds**. Ohne Einträge ist er ausgegraut.
Der vollständige Verlauf steht darunter (Handy) bzw. rechts (Querformat).

## 8 · Viertel beenden (NEU)
Manuell über den Knopf, nie automatisch. Es erscheint das Blatt aus 6-viertel-beenden.png mit dem
Zwischenstand und **zwei Wegen**:
- „Viertel beenden und Push senden" → alle bekommen „Ende Q2 · 24:27",
- „Beenden ohne Push" → für den Fall, dass ein Viertel nur nachgetragen wurde.
Danach läuft das nächste Viertel, die Teamfouls fangen bei null an, das beendete Viertel zeigt in
der Leiste seinen Endstand (z. B. „18:20"). Zurückspringen geht über die Viertel-Leiste.

## 9 · Box-Score – Bugfix
Heute ist die Spalte „Team" leer und die Spielernamen fehlen. Richtig ist (5-box-score.png):
**eine Zeile pro Spieler mit vollem Namen**, und **nur die letzte Zeile heißt „Team"** mit den
Summen in Volt. Im Querformat stehen rechts nur die fünf auf dem Feld, am Handy alle mit Einsatz.

## 10 · Spiel beenden
Knopf ganz unten (Handy) bzw. rechts (Querformat), rot gerahmt statt volt gefüllt – er ist
endgültig und soll nicht der auffälligste Knopf auf dem Schirm sein. Bestätigung siehe
7-spiel-beenden.png.

## 11 · Was **nicht** Teil dieser Aufgabe ist
Die beiden Schritte vor dem Tracking – **Trikotnummern** und **Startaufstellung** – bleiben in
Logik und Ablauf unverändert. Bitte dort nur die Knopfgrößen und Abstände aus dieser Vorlage
übernehmen (volle Breite, mindestens 56px hoch, Spielerkacheln mit Bild und großer Nummer), damit
der Einstieg zum Rest passt.

## Rückfragen (bitte beantworten, nicht selbst entscheiden)
1. **Mehrere Tracker gleichzeitig:** Was passiert, wenn zwei Leute dasselbe Spiel tracken oder die
   Seite neu geladen wird? Bitte prüfen, ob der Stand serverseitig liegt und ob es eine Sperre
   braucht („wird bereits von Marc getrackt").
2. **5. Foul:** Soll der Spieler danach **hart gesperrt** werden (nicht mehr wählbar) oder nur rot
   markiert bleiben? Vorschlag: nur markieren, weil ein Fehltipp sonst nicht mehr korrigierbar ist.
3. **Rückgängig:** Wie viele Schritte sollen zurück gehen – nur der letzte oder mehrere? Vorschlag:
   beliebig viele, solange das Viertel noch läuft.
4. **+/-:** Es hängt an den Körben, die fallen, während jemand auf dem Feld steht. Bitte prüfen, ob
   das heute schon so gerechnet wird, und melden, wie Wechsel dabei behandelt werden.
5. **Push beim Viertel-Ende:** Geht die an alle Spieler oder nur an die, die nicht in der Halle
   sind? Das können wir nicht wissen – Vorschlag: an alle mit aktivem Push, Text „Ende Q2 · 24:27".
6. **Freiwurf-Serie:** Bei zwei oder drei Freiwürfen hintereinander tippt man heute jedes Mal neu
   Aktion + Spieler. Soll der Spieler nach einem FW kurz gewählt bleiben? Bitte sagen, ob das
   gewünscht ist – gebaut ist es noch nicht.

Zum Schluss: Screenshots bei 390px und bei 1024px Breite für Tracking, Spielerauswahl, Wechseln und
Viertel-Ende, dazu eine kurze Liste, was du geändert hast, was neu ist und welche Rückfragen offen
sind.
