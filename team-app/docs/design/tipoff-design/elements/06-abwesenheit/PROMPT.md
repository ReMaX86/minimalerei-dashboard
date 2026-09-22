Karte „Abwesenheit" (Startseite, direkt unter dem Kampfgericht-Element) neu bauen – kompakt, aufklappbar.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/06-abwesenheit/

- abwesenheit.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  default · open · active · activeopen · single · empty · sheet · edit
- 1-kompakt.png · 2-aufgeklappt.png · 3-laeuft-kompakt.png · 4-laeuft-aufgeklappt.png ·
  5-einzelner-tag.png · 6-nichts-eingetragen.png · 7-blatt-eintragen.png · 8-blatt-aendern.png

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Urlaubszeiträume, automatische Trainingsabsage, Kader-Ansicht des Trainers.
Die bestehende Logik bleibt, es geht um die Darstellung – außer wo unten ausdrücklich etwas Neues steht.
Die alte Karte („🌴 Dein Urlaub / Abwesenheit" mit Emoji) wird dadurch ersetzt.

## Wirkung – unverändert
Ein Zeitraum sagt nur TRAININGS automatisch ab. Spiele und Kampfgericht-Einsätze bleiben unberührt;
der Trainer sieht beim Kader lediglich den Hinweis, dass der Spieler in dem Zeitraum abwesend ist.
Bitte im Text nirgends behaupten, dass Spiele abgesagt werden.

## Zugeklappt – der Standard
Eine Zeile, ca. 78 px hoch, die ganze Zeile ist der Knopf zum Aufklappen
(button, aria-expanded, aria-controls auf den Detailbereich):

- links eine 46×46-Kachel, Radius 14, Hintergrund --to-surface-2, darin das Koffer-Symbol in --to-vacation
- mittig: Mono 10px `ABWESENHEIT` · 16px/600 Status · Mono 13px Zusatz
- rechts der Chevron (aufgeklappt gedreht)

Statuszeilen:
- mehrere Zeiträume → „2 Zeiträume eingetragen" / `NÄCHSTER: 17.10. – 24.10.`
- genau einer → „1 Zeitraum eingetragen" / `NÄCHSTER: 30.10.`
- läuft gerade → siehe unten
- keiner → „Kein Zeitraum eingetragen" / „Antippen zum Eintragen" (zweite Zeile in Geist, nicht Mono,
  Kachel-Symbol in --to-text-4). Ein Tipp öffnet hier direkt das Blatt zum Eintragen, klappt nichts auf.

Beim Laden der Startseite ist die Karte immer zugeklappt, der Zustand wird nicht gespeichert.

## Läuft gerade
Liegt heute in einem Zeitraum: Rahmen --to-vacation-frame (#4A3C12), Kachel gefüllt in --to-vacation mit
Symbol in --to-on-accent, Statuszeile „Du bist abwesend" / `NOCH BIS 24.10.`, dazu rechts über dem Chevron
eine Pille in --to-vacation-soft mit `5 TAGE` (verbleibende Tage inkl. heute, bei einem Tag `1 TAG`).

## Aufgeklappt
Kopfzeile bleibt stehen (Hintergrund #14181E), darunter:

1. Erklärzeile: „Trainings in diesen Zeiträumen werden automatisch abgesagt. Beim Kader sieht der Trainer,
   dass du nicht da bist."
2. Pro Zeitraum eine Zeile (Fläche --to-surface-2, Radius 16): links ein 4 px breiter Balken in
   --to-vacation, dann Datum 16px/600 und darunter Mono 11px `8 TAGE · 3 TRAININGS`,
   rechts ein 36×36-Knopf mit Mülleimer in --to-danger-text.
   Der laufende Zeitraum bekommt die Fläche rgba(233,185,73,.10) und die Angabe `LÄUFT · NOCH 5 TAGE`.
   Ein einzelner Tag steht als „30.10." mit `1 TAG · 1 TRAINING`.
   Sortierung: nach Startdatum aufsteigend, der laufende zuerst.
3. Knopf „Zeitraum eintragen" über die volle Breite, gefüllt in --to-accent.

Der Datums-Text der Zeile ist ein eigener Knopf und öffnet das Blatt „Zeitraum ändern".
Der Mülleimer löscht direkt (mit der üblichen Rückfrage).

## Blatt zum Eintragen (neu)
Bottom-Sheet, siehe 7-blatt-eintragen.png:
- Titel „Abwesenheit eintragen" (Archivo expanded italic 22px), darunter „Trainings in diesem Zeitraum
  werden automatisch abgesagt."
- zwei Felder nebeneinander, `VON` und `BIS`, jeweils Mono-Label und Datum 17px/600.
  Antippen öffnet den üblichen Datumswähler. Das gerade bearbeitete Feld hat den Rahmen --to-vacation.
- Schnellauswahl als Chips: „Nur heute", „Diese Woche", „Eine Woche", „Zwei Wochen".
  Höchstens einer aktiv (Rahmen und Text in --to-vacation, Fläche --to-vacation-soft), abwählbar.
  Sie setzen nur die beiden Datumsfelder, die man danach frei ändern kann.
- Hinweisfläche in --to-vacation-soft: „3 Trainings werden für dich abgesagt." – die Zahl live aus den
  Terminen im gewählten Zeitraum. Sind es null, steht dort „In diesem Zeitraum liegt kein Training."
- Knöpfe „Eintragen" (gefüllt) und „Abbrechen".

Regeln: ganze Tage, keine Uhrzeiten. BIS darf nicht vor VON liegen; gleiches Datum = ein Tag.
Zeiträume dürfen sich nicht überschneiden – beim Speichern zusammenführen oder mit einem Hinweis ablehnen,
bitte in der Rückmeldung schreiben, welchen Weg du gewählt hast.

## Blatt zum Ändern
Gleiches Blatt mit Titel „Zeitraum ändern", Hauptknopf heißt „Speichern", darunter zusätzlich der rote
Textknopf „Zeitraum löschen" (siehe 8-blatt-aendern.png), dann „Abbrechen".
Ändert man einen Zeitraum, gelten die Trainingsabsagen entsprechend neu: Termine, die herausfallen,
stehen wieder auf „keine Rückmeldung"; neu hinzukommende werden abgesagt.

## Vergangenes
Abgelaufene Zeiträume verschwinden aus der Liste, sobald der letzte Tag vorbei ist. Keine Historie.

## Bewusst nicht dabei
Kein Notiz- oder Grundfeld, keine halben Tage, keine Eingabe durch den Trainer für andere Spieler.

Zum Schluss: Screenshots bei 390px Breite für „zugeklappt", „aufgeklappt", „läuft gerade" und das
Eintragen-Blatt, dazu eine kurze Liste, was du geändert hast und wo die App anders funktioniert als hier
beschrieben.
