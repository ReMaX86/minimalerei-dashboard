Karte „Training" (Startseite) neu bauen – zwei Termine, Zu- und Absage.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/04-training/

- training.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  open · yes · no · second · names · vacation · empty · locked · cancelled · coach · declinesheet
- 1-standard.png · 2-zugesagt.png · 3-abgesagt.png · 4-zweiter-offen.png · 5-namen.png · 6-urlaub.png ·
  7-keine-termine.png · 8-gesperrt.png · 9-vom-trainer-abgesagt.png · 10-trainer-ansicht.png · 11-absage-grund.png

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Trainingstermine, Zu-/Absage, Urlaubszeiträume, Benachrichtigungen, Trainer-Rechte.
Bestehende Logik nicht ändern, nur die Darstellung – außer wo unten ausdrücklich etwas Neues beschrieben ist.

## Neuer Token
--to-vacation: #E9B949 und --to-vacation-soft: rgba(233,185,73,.12) in tokens.css ergänzen,
ausschließlich für „Urlaub". Auch in DESIGN.md (Abschnitt 2) nachtragen.

## Aufbau
Kopfzeile: „TRAINING" links, rechts der Link „Alle Termine".

Termin 1 (immer offen):
- Datum groß (Archivo expanded italic, 26px), darunter Zeitraum in Mono und der Ort.
- Rechts eine Pille mit dem Abstand: „IN 2 TAGEN", „MORGEN", „HEUTE", unter einer Stunde „IN 40 MIN".
- Verteilungsleiste: grün zugesagt, rot abgesagt, gelb Urlaub, grau offen; Breite nach Anzahl, Nullwerte entfallen.
- Zahlenzeile: „3 dabei · 2 abgesagt · 2 Urlaub · 15 offen", „dabei" in Akzentfarbe.
  Die ganze Zeile ist ein Knopf und klappt die Namen auf.
- Namen: vier Gruppen (Zusagen, Absagen, Urlaub, Noch offen) als farbige Pillen.
  Bei „Noch offen" nur die ersten SECHS, darunter „Alle 15 anzeigen".
- Antwort: zwei gleich breite Knöpfe „Bin dabei" und „Kann nicht".
  Zugesagt: linker Knopf gefüllt, Beschriftung „Dabei". Abgesagt: rechter Knopf rot hinterlegt.

Termin 2: volle Zeile mit „Mo 28.09. · 20:30–22:00 Uhr" und Unterzeile
(„Antippen zum Zu- oder Absagen" / „Du bist dabei" / „Du hast abgesagt" / beim Aufklappen „Noch keine Rückmeldung von dir").
Antippen klappt dieselbe Darstellung auf: Leiste, Zahlenzeile (mit Namen) und beide Knöpfe – ohne zweiten Datumsblock.
Gibt es nur einen Termin, entfällt die Zeile ersatzlos.

## Absagen mit freiwilligem Grund
„Kann nicht" öffnet ein Blatt (Bottom-Sheet, siehe 11-absage-grund.png):
Titel „Für dieses Training absagen?", Hinweis „Ein Grund hilft dem Trainer beim Planen, ist aber freiwillig.",
Grund-Chips (Krank · Arbeit / Schule · Termin · Anderer Grund, höchstens einer aktiv, abwählbar),
Freitextfeld „Notiz für den Trainer (optional)", Knöpfe „Absage senden" und „Abbrechen".
Absenden geht AUCH ohne Grund und ohne Notiz. Danach steht der Termin auf „abgesagt";
der Grund erscheint in der Namensliste beim eigenen Eintrag als Zusatz.
Zusagen bleibt ein einfacher Tipp ohne Blatt.

## Frist: bis 1 Stunde vor Beginn
Bis eine Stunde vor Trainingsbeginn kann man zu- und absagen und die Antwort beliebig ändern
(nochmal auf den gedrückten Knopf tippen nimmt sie zurück).
Danach: beide Knöpfe deaktiviert (aria-disabled, 45 % Deckkraft), die eigene Antwort bleibt sichtbar,
darunter die Zeile „Rückmeldung war bis 1 Stunde vorher möglich". Nichts ausblenden.

## Urlaub
Urlaub kommt aus den vom Spieler hinterlegten Urlaubszeiträumen. Liegt ein Termin darin,
gilt er automatisch als abgesagt und der Spieler kann für diesen Termin NICHT zu- oder absagen:
Statt der beiden Knöpfe erscheint die gelbe Fläche „Du bist im Urlaub" mit dem Textknopf „Zeitraum ändern",
der in die bestehende Urlaubsverwaltung führt. In der Namensliste stehen diese Spieler in der Gruppe „Urlaub",
nicht bei den Absagen, und sie zählen in der Leiste zum gelben Abschnitt.

## Trainer
Trainer sehen unter den Knöpfen eine zusätzliche Zeile: links das Label „TRAINER", rechts der rote
Textknopf „Training absagen" (siehe 10-trainer-ansicht.png). Für Spieler ist diese Zeile nicht sichtbar.
Nach dem Absagen (Rückfrage mit optionalem Grund, gleiche Chips wie oben):
Datum und Uhrzeit durchgestrichen und gedimmt, Pille rechts wird rot und heißt „ABGESAGT",
Leiste, Zahlenzeile und Knöpfe entfallen, stattdessen die rote Fläche „Training abgesagt · {Grund}"
(ohne Grund nur „Training abgesagt"). Das Team wird über die bestehende Benachrichtigung informiert.
Der Termin bleibt bis zum Ende des Tages stehen und verschwindet dann wie jeder vergangene Termin.

## Keine Termine
Beide Blöcke entfallen, stattdessen „Keine Trainings geplant" mit
„Sobald der Trainer Termine einträgt, stehen sie hier."

Zum Schluss: Screenshots bei 390px Breite für Standard, „zweiter Termin offen", „gesperrt" und „vom Trainer abgesagt",
dazu eine kurze Liste, was du geändert hast und wo die App anders funktioniert als hier beschrieben.
