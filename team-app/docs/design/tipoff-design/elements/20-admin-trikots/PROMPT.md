Adminbereich, Reiter „Trikots" neu gestalten – und die Waschzähler manuell änderbar machen.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/20-admin-trikots/

- admin-trikots.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  list · counters · edit · saved · bulk · owner · picker · reset
- 1-hauptseite.png · 2-waschzaehler.png · 3-nach-aenderung.png · 4-staende-uebertragen.png ·
  5-besitz-korrigieren.png · 6-zaehler-aendern.png · 7-wer-hat-den-satz.png · 8-zuruecksetzen.png

## WICHTIG – Rahmen für diese Aufgabe
**An der bestehenden Logik nichts ändern. Nur die neuen Designs übernehmen. Ansonsten nachfragen.**
Rotation, Vorschlagsregel (im Kader → wenigste Wäschen → alphabetisch), Übergabe und Verlauf bleiben
wie sie sind. **Neu gebaut werden nur die drei Funktionen aus Abschnitt 3–5** (Zähler einzeln ändern,
Stände übertragen, Besitz korrigieren). Alles andere, was die Vorlage zeigt und im Code anders läuft:
nachfragen, nicht selbst umbauen, und am Ende auflisten.

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Waschzähler, Besitz je Satz, Verlauf, Zurücksetzen. Emojis fallen weg.

## 1 · Aufbau der Hauptseite (1-hauptseite.png)
1. „Wo sind die Sätze" – zwei Kacheln nebeneinander: Farbfeld (26px, Radius 9), Mono-Label
   „SCHWARZ · AUSWÄRTS" bzw. „WEISS · HEIM", darunter der aktuelle Besitzer (15px/600) und Mono
   „SEIT 22.09." – liegt der Satz in der Halle: „In der Halle" in --to-text-2 und „ABGEGEBEN 20.09."
2. Ein Panel mit drei Einstiegen:
   - **Waschzähler bearbeiten** – *Einzeln korrigieren oder alle Stände übertragen*
   - **Besitz korrigieren** – *Wer hat gerade welchen Satz*
   - **Rotation zurücksetzen** – *Verlauf, Zähler und Besitz auf Anfang* (Beschriftung in --to-danger-text)
Die lange Erklärbox zum Zurücksetzen entfällt auf der Hauptseite; ihr Inhalt steht jetzt in der
Rückfrage (Abschnitt 6).

## 2 · Waschzähler-Liste (2-waschzaehler.png)
Kopf: Zurück-Pfeil, „Waschzähler", rechts der Knopf **„Alle bearbeiten"**.
Darunter ein volter Hinweis „Nächster Vorschlag: <Name>" – der Name ergibt sich aus der bestehenden
Regel und **ändert sich sofort mit**, wenn ein Zähler angepasst wird.
Liste aller Spieler, **sortiert nach Wäschen aufsteigend, bei Gleichstand alphabetisch**. Je Zeile
Name, Zähler-Pille und ein Stift. **0× ist volt getönt** (--to-accent-soft/--to-accent), alles andere
grau. Die oberste Zeile (der Vorschlag) ist leicht volt hinterlegt und der Name in --to-accent.
Unter der Liste: „Jede Änderung steht im Verlauf als ‚Zähler vom Trainer angepasst'."

## 3 · Zähler einzeln ändern – NEU (6-zaehler-aendern.png)
Tippen auf eine Zeile öffnet ein Blatt:
- Name als Titel, Mono-Unterzeile „WASCHZÄHLER ANPASSEN".
- **Stepper**: − / große Zahl (Archivo condensed 40px) / +. Der Wert wird volt, sobald er vom
  Ausgangswert abweicht; darunter steht in Mono „VORHER 3×". Bei 0 ist das Minus deaktiviert
  (Strich in --to-text-4), negative Werte gibt es nicht.
- Feld **„Grund (steht im Verlauf)"** mit drei Chips: *Stand aus der Vorsaison · Korrektur ·
  Hat extra gewaschen*. Ein Chip füllt das Feld; frei tippen geht weiterhin.
- „Speichern" (volt) und „Abbrechen".
Nach dem Speichern sortiert sich die Liste neu und der Vorschlag oben wechselt (3-nach-aenderung.png).

**Rückfrage:** Der Eintrag im Verlauf ist neu – heute kennt er nur WÄSCHE und ÜBERGABE. Bitte prüfen,
ob eine dritte Art („ANPASSUNG", grau, mit Grund als Kontextzeile) sauber ins bestehende Verlaufs-
Modell passt, und melden, bevor du das Modell erweiterst.

## 4 · Stände übertragen – NEU (4-staende-uebertragen.png)
Über „Alle bearbeiten" erreichbar. Eigene Seite „Stände übertragen · ALLE AUF EINMAL" mit dem Satz:
„Wenn ihr mitten in der Saison mit der App startet: Trag ein, wie oft jeder bisher gewaschen hat.
Die Rotation rechnet danach normal weiter."
Alle Spieler **alphabetisch** mit je einem kleinen Zahlenfeld (70px breit, Mono, „×" als Suffix).
Darunter derselbe volte Hinweis „Danach ist <Name> als Nächster dran.", der sich beim Tippen
mitrechnet. Unten „Alle speichern" (volt) und „Abbrechen".
Das ist der Hauptfall: Saisonstart mitten in der Saison – deshalb ein Speichern für alle, nicht
neun einzelne Blätter.

## 5 · Besitz korrigieren – NEU (5-…png, 7-…png)
Eigene Seite, Mono-Unterzeile **„ÄNDERT KEINEN WASCHZÄHLER"**. Zwei Zeilen – je Satz Farbfeld,
aktueller Besitzer und Mono „SCHWARZ · AUSWÄRTS · SEIT 22.09.". Tippen öffnet das Blatt
„Wer hat den Satz?" mit **„In der Halle abgelegt"** zuoberst und darunter allen Spielern
alphabetisch; die aktuelle Auswahl ist volt markiert.
Unter der Liste der Satz: „Nur wer den Satz gerade zu Hause oder dabei hat. Gewaschen hat weiterhin,
wer ihn mitgenommen hat – der Zähler bleibt unverändert."
Das ist dieselbe Bedeutung wie „Ich hab ihn" / „Jemandem geben" im Trikots-Reiter (Element 13) –
bitte dieselbe bestehende Funktion verwenden, nicht neu bauen.

## 6 · Rotation zurücksetzen (8-zuruecksetzen.png)
Erst eine Rückfrage als Blatt, Titel in --to-danger-text, Mono-Unterzeile „BETRIFFT DIE GANZE SAISON",
darunter ein roter Kasten mit drei Zeilen:
- Der komplette **Verlauf** wird gelöscht.
- Alle **Waschzähler** gehen auf 0 zurück.
- Beide Sätze stehen wieder auf **„Niemand"**.
Darunter grau: „Gedacht für den Saisonwechsel – nicht mitten in der Saison. Einzelne Korrekturen gehen
über ‚Waschzähler bearbeiten'." Knöpfe „Ja, alles zurücksetzen" (gefüllt --to-danger, Text #120507)
und „Abbrechen".

**Rückfrage:** Im heutigen Text steht nur „Verlauf löschen und Sets auf Niemand" – ob die **Zähler**
dabei wirklich auf 0 gehen, ist ungeklärt. Bitte im Code nachsehen; wenn sie stehen bleiben, die
zweite Zeile im Kasten entsprechend ändern und melden.

Zum Schluss: Screenshots bei 390px Breite für die Hauptseite, die Waschzähler-Liste, das Blatt
„Zähler ändern" und „Stände übertragen", dazu eine kurze Liste, was du geändert hast, wo die App
anders funktioniert als hier beschrieben und welche Punkte du nachfragen musst (mindestens die
beiden oben markierten).
