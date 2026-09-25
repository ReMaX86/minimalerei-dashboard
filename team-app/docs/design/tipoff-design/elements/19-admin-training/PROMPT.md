Adminbereich, Reiter „Training" neu gestalten.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/19-admin-training/

- admin-training.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  list · cancel · cancelled · newtime · edittime · rule · special · empty
- 1-uebersicht.png · 2-abgesagt.png · 3-neue-trainingszeit.png · 4-trainingszeit-aendern.png ·
  5-neue-ferienzeit.png · 6-sonderzeiten.png · 7-keine-ferienzeiten.png · 8-absagen.png

## WICHTIG – Rahmen für diese Aufgabe
**An der Logik erstmal nichts ändern. Nur die neuen Designs übernehmen. Ansonsten nachfragen.**
Trainingszeiten, Terminerzeugung, Absagen und Ferienregeln funktionieren weiter wie heute. Neu und
gewollt sind nur: das **Bearbeiten** von Trainingszeiten und Ferienregeln, der **Pflichtgrund beim
Absagen** und das **Zurücknehmen** einer Absage. Alles andere, was die Vorlage zeigt und im Code
anders läuft: **nachfragen**, nicht selbst umbauen, und am Ende auflisten.

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: wöchentliche Zeiten, erzeugte Termine, Absage, Ferienzeiten mit
den drei Modi. Emojis fallen weg.

## Der Umbau in einem Satz
**Die anstehenden Termine zeigen, welche Regel auf sie wirkt.** Heute stehen Trainingszeiten, Termine
und Ferienzeiten unverbunden untereinander, und an jedem Termin hängt derselbe rote „Absagen"-Knopf.
Neu steht jeder Termin mit seinem Zustand da: findet statt, fällt aus (mit Grund) oder Sonderzeit.

## 1 · Reihenfolge der Seite
1. „Nächste Trainings" – **die nächsten 6 Termine**, vergangene werden nicht mehr angezeigt
2. „Wöchentliche Zeiten" mit Wochenleiste
3. „Ferien & Sonderregeln"

## 2 · Nächste Trainings (1-uebersicht.png)
Pro Termin eine Zeile (min-height 70) mit Datumsblock (Mono-Wochentag, Tag in Archivo condensed 62 %,
Mono-Monat), Uhrzeit als Hauptzeile und darunter der Mono-Unterzeile:
| Zustand | Darstellung |
|---|---|
| findet statt | normal, Unterzeile = Halle, Knopf „Absagen" (roter Umriss) |
| fällt aus | Zeile leicht rot hinterlegt, Uhrzeit **durchgestrichen** und gedimmt, Unterzeile „FÄLLT AUS · GRUND" in --to-danger-text, Tageszahl gedimmt, Knopf **„Zurücknehmen"** (grauer Umriss) |
| Sonderzeit | Tageszahl und Unterzeile in --to-vacation, Unterzeile „SONDERZEIT · HERBSTFERIEN" |

## 3 · Absagen mit Grund (8-absagen.png)
„Absagen" öffnet ein Blatt, es wird nicht sofort abgesagt:
- Titel „Training absagen?" in --to-danger-text, Mono-Unterzeile mit Datum, Uhrzeit und Halle.
- Feld **„Grund (wird allen angezeigt)"**, darunter vier Schnellgründe als Chips:
  **Spiel · Halle belegt · Feiertag · Trainer fehlt**. Ein angetippter Chip füllt das Feld und wird
  in --to-danger-soft getönt; frei tippen geht weiterhin.
- Hinweiszeile: „Die Zu- und Absagen der Spieler bleiben gespeichert, falls du die Absage
  zurücknimmst." Das ist so gewollt – beim Zurücknehmen stehen die alten Antworten wieder da.
- Knöpfe „Absagen und Team informieren" (gefüllt --to-danger, Text #120507) und „Abbrechen".
Der abgesagte Termin **bleibt in der Liste stehen** und wird über „Zurücknehmen" wieder aktiv.
Dieselbe Absage ist auch auf der Startseite möglich – beide Wege müssen denselben Zustand schreiben.

## 4 · Wöchentliche Zeiten (3-…, 4-…png)
Über der Liste eine **Wochenleiste MO–SO**: sieben gleich breite Felder, Trainingstage in
--to-accent-soft mit --to-accent-frame, Kürzel und Punkt in --to-accent; die übrigen ruhig.
Darunter je Zeit eine Zeile mit Tageskürzel-Kachel, Wochentag, Mono „20:00–21:30 · GOETHESTRASSE"
und Chevron. Die Zeile öffnet das Formular – bisher konnte man nur löschen und neu anlegen:
Wochentag (Auswahl), Beginn und Ende nebeneinander, Halle/Adresse, „Speichern"/„Abbrechen" und beim
Bearbeiten unten „Trainingszeit löschen" (roter Umriss).

## 5 · Ferien & Sonderregeln (5-…, 6-…, 7-…png)
Je Regel eine Karte mit Icon, Zeitraum und Mono-Zeile „MODUS · NOTIZ".
Rahmen und Farbe nach Modus: **fällt aus** rot, **Sonderzeiten** gelb (--to-vacation), **regulär** neutral.
Bei „Sonderzeiten" stehen die hinterlegten Sondertermine direkt in der Karte, mit gelbem Punkt.

Formular: Von und Bis nebeneinander, Notiz, darunter **„WAS PASSIERT IN DIESEM ZEITRAUM?"** als
Segmented Control (Regulär | Fällt aus | Sonderzeiten) statt drei gleich aussehender Knöpfe. Der
aktive Zustand färbt sich passend (volt / rot / gelb), und der Erklärsatz darunter wechselt mit:
- Regulär: „Reguläres Training findet wie gewohnt statt – der Eintrag ist nur eine Notiz."
- Fällt aus: „Alle Trainings in diesem Zeitraum fallen aus. Das Team sieht die Notiz als Grund."
- Sonderzeiten: „Die regulären Termine entfallen; stattdessen gelten die Sondertermine unten."
Erst bei „Sonderzeiten" erscheint die Liste der Sondertermine mit „+ Sondertermin hinzufügen"
(Datum, Beginn, Ende, Halle, „Hinzufügen"/„Fertig") – genau wie heute.
Unten „Speichern"/„Abbrechen", beim Bearbeiten zusätzlich „Ferienzeit löschen".

**Rückfrage:** Ersetzen die Sondertermine die regulären Termine im Zeitraum, oder kommen sie dazu?
Die Vorlage zeigt sie als **Ersatz** (die regulären Mo/Fr tauchen im Ferienzeitraum nicht auf) – bitte
im Code prüfen und melden, falls es anders ist. Den Erklärsatz dann entsprechend anpassen.

Leerzustand: gestrichelte Karte „Keine Ferienzeiten eingetragen · Trag Ferien oder Feiertage ein –
die App passt die anstehenden Termine dann automatisch an."

Zum Schluss: Screenshots bei 390px Breite für die Übersicht, einen abgesagten Termin, das
Absagen-Blatt und eine Ferienzeit mit Sonderzeiten, dazu eine kurze Liste, was du geändert hast, wo
die App anders funktioniert als hier beschrieben und welche Punkte du nachfragen musst.
