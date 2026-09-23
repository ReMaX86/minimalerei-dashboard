Karte „Nächster Spieltag" im Reiter „Spiele & Kader" neu bauen – Kaderauswahl, Zu-/Absage,
Treffpunkte und Mitfahrgelegenheit.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/09-spiel-kader/

- spiel-kader.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  coach · coachfull · coachpublished · player · nominated · accepted · notinsquad ·
  away · awayempty · meetinghome · meetingaway · rideoffer
- 01-trainer-auswahl.png · 02-trainer-voll.png · 03-trainer-veroeffentlicht.png ·
  04-spieler-ohne-kader.png · 05-spieler-im-kader.png · 06-spieler-zugesagt.png ·
  07-spieler-nicht-im-kader.png · 08-auswaerts-mitfahren.png · 09-auswaerts-keine-fahrer.png ·
  10-blatt-treffpunkt-heim.png · 11-blatt-treffpunkt-auswaerts.png · 12-blatt-plaetze-anbieten.png

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Spiele, Kaderfestlegung/Veröffentlichung, Zu-/Absage,
Treffpunkt, Mitfahrgelegenheit, Abwesenheiten, Benachrichtigungen.
Bestehende Logik bleibt – es geht um die Darstellung, außer wo unten ausdrücklich etwas Neues steht.
Das ersetzt die bisherige Karte mit den Emoji-Knöpfen.

## Aufbau der Karte (von oben)
1. Kopf: „NÄCHSTER SPIELTAG" und rechts die Status-Pille –
   rot „KADER AUSSTEHEND" oder volt „KADER STEHT", jeweils mit Punkt in derselben Farbe.
2. Gegner in Archivo expanded italic 26px, darunter Mono `MI 23.09. · 20:00 UHR`.
   Rechts daneben die Pille HEIM (volt, leicht hinterlegt) oder AUSWÄRTS (grau).
3. Adresse mit Pin-Symbol, rechts „Route" in --to-accent (geo:-Link wie bei Element 02).
4. Treffpunkt-Block (siehe unten).
5. Trainer: Kaderblock. Spieler: Band mit der eigenen Rückmeldung.
6. Wenn veröffentlicht: Zeile „Kader ansehen" mit Gesichter-Stapel und Anzahl.
7. Nur bei Auswärtsspielen: Mitfahrgelegenheit.

## Treffpunkt – hängt am Spielort
HEIMSPIEL: nur EINE Zeit. Adresse ist die Spieladresse, wird nicht nochmal erfasst.
Anzeige: „An der Halle" + Uhrzeit in Mono/volt.
AUSWÄRTSSPIEL: ZWEI Treffpunkte.
- „Fahrgemeinschaft" mit Uhrzeit UND Ort (z. B. Parkplatz Schulzentrum, als zweite Zeile klein darunter)
- „Direkt an der Halle" mit Uhrzeit
Fehlt der Treffpunkt ganz, sieht der Trainer statt des Blocks die Zeile „Treffpunkt hinterlegen";
für Spieler entfällt der Block dann ersatzlos.
Trainer sehen im Block rechts oben den Textknopf „Ändern".

Blatt „Treffpunkt" (10- und 11-…png): Felder je nach Spielort – Heim nur „AN DER HALLE — ZEIT",
Auswärts „FAHRGEMEINSCHAFT — ZEIT", „FAHRGEMEINSCHAFT — ORT", „DIREKT AN DER HALLE — ZEIT".
Zeiten über den normalen Zeitwähler, Ort als Freitext. Knöpfe „Treffpunkt speichern" und „Abbrechen".
Einzelne Felder dürfen leer bleiben.

## Kader – nur Trainer
- Kopfzeile „KADER" und rechts der Zähler `8/12` (Archivo condensed 20px, die 12 in --to-text-4).
  **Maximum ist fix 12.**
- Darunter eine Leiste aus 12 Segmenten, belegte in --to-accent, freie in --to-border.
- Spielerzeilen: Initialen-Kreis 34px, Name 15/600, darunter der Verfügbarkeits-Status in Mono 10px:
  `KANN` (volt) · `KANN NICHT` (rot) · `KEINE ANTWORT` (grau) · `URLAUB · 21.09. – 27.09.` (gelb).
  Nach Veröffentlichung heißen die Zustände `ZUGESAGT` / `ABGESAGT` / `KEINE ANTWORT`.
  Rechts ein runder Haken: leer mit Rand --to-line, im Kader gefüllt in --to-accent.
- ABWESEND/URLAUB: Zeile ist gesperrt (aria-disabled, Name gedimmt, Haken 45 % Deckkraft),
  der Grund steht in der Statuszeile. Kein Auswählen möglich.
- Sind 12 erreicht: alle nicht gewählten Haken auf 45 % und nicht klickbar, darüber die volt Fläche
  „Kader ist voll. Zum Tauschen erst einen Haken entfernen." (02-trainer-voll.png)
- Darunter „Alle 18 Spieler anzeigen" (klappt die restliche Liste auf; die Vorlage zeigt nur den Anfang).
- Knopf unten: „Kader veröffentlichen", nach dem Veröffentlichen „Kader aktualisieren".

Reihenfolge der Liste: zuerst die im Kader, dann verfügbare ohne Antwort, dann abgesagte,
zuletzt abwesende. Innerhalb der Gruppen alphabetisch.

## Rückmeldungen – erst nach dem Veröffentlichen
Vor der Veröffentlichung kann NIEMAND zu- oder absagen; der Trainer stellt den Kader zusammen.
Nach dem Veröffentlichen bekommen die 12 die bestehende Benachrichtigung und können zu- oder absagen –
hier auf der Karte oder auf der Startseite (Element 02), beides schreibt in dieselbe Antwort.

Spielerband:
- nicht veröffentlicht → graue Fläche, „KADER", Text „Der Kader für dieses Spiel steht noch nicht."
- im Kader, keine Antwort → volt getönte Fläche, „DU BIST IM KADER",
  „Sag kurz Bescheid, ob du dabei bist." plus zwei gleich breite Umriss-Knöpfe „Bin dabei" / „Kann nicht"
- zugesagt → linker Knopf gefüllt volt, Beschriftung „Dabei", Text „Du hast zugesagt."
- abgesagt → rechter Knopf rot hinterlegt, Text „Du hast abgesagt. Der Trainer ist informiert."
- nicht im Kader → graue Fläche, „Du bist diesmal nicht im Kader." Keine Knöpfe.
Die Antwort bleibt änderbar.

Sagt jemand nach der Veröffentlichung ab, bekommt der Trainer wie bisher eine Nachricht; auf seiner Karte
erscheint zusätzlich die rote Fläche „{Name} hat abgesagt – du kannst jemanden nachnominieren."
(03-trainer-veroeffentlicht.png). Der abgesagte Spieler bleibt im Kader stehen, bis der Trainer den
Haken entfernt – der Zähler zählt weiter die nominierten Spieler.

## Mitfahrgelegenheit – nur bei Auswärtsspielen
Bei Heimspielen wird der ganze Block nicht gerendert.
- Kopfzeile „MITFAHRGELEGENHEIT", rechts in Mono die Summe der freien Plätze
  (`1 PLATZ FREI` / `3 PLÄTZE FREI`), bei keinem Fahrer leer.
- Pro Fahrer eine Fläche: Initialen, Name, darunter die optionale Notiz (z. B. „18:30 ab Bahnhof
  Wülfrath"), rechts ein Knopf mit den freien Plätzen („1 frei") bzw. „Voll" auf 45 % Deckkraft.
  Tippen bucht einen Platz; wer schon drin sitzt, sieht statt dessen „Aussteigen".
- Unter jeder Fläche die Mitfahrer als kleine Pillen, eingerückt.
- Eigenes Angebot: Fläche in --to-accent-soft, Knopf „Angebot zurückziehen".
- Keine Fahrer: „Noch keine Fahrer eingetragen."
- Unten immer der Umriss-Knopf „Ich biete Plätze an" → Blatt mit Zähler für freie Plätze
  (1–8, Plus/Minus, Archivo condensed) und optionalem Freitext „z. B. 18:30 ab Bahnhof Wülfrath",
  Knöpfe „Plätze anbieten" / „Abbrechen" (12-blatt-plaetze-anbieten.png).
Anbieten und Einsteigen dürfen alle – Spieler wie Trainer, unabhängig vom Kader.

## Darunter
Unter dieser Karte folgen später weitere Blöcke (weitere Spiele, vergangene Spiele, Tabelle).
Die Karte darf also nicht als einziges Element die Seite füllen – kein „min-height: 100vh" o. ä.

Zum Schluss: Screenshots bei 390px Breite für Trainer-Auswahl, Trainer nach Veröffentlichung,
Spieler im Kader und ein Auswärtsspiel mit Mitfahrgelegenheit, dazu eine kurze Liste, was du geändert
hast und wo die App anders funktioniert als hier beschrieben.
