Adminbereich, Reiter „Funktionen" neu gestalten.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/23-funktionen/

- funktionen.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  list · confirm · switched · setup · push · reminders · addreminder · liga
- 1-reiter.png · 2-ausschalten.png · 3-ausgeschaltet.png · 4-nicht-eingerichtet.png ·
  5-push.png · 6-erinnerungen.png · 7-erinnerung-waehlen.png · 8-liga-tabelle.png

## WICHTIG – Rahmen für diese Aufgabe
**An der Logik erstmal nichts ändern. Nur die neuen Designs übernehmen. Ansonsten nachfragen.**
Ausnahmen sind die unten als **NEU** markierten Punkte (Erinnerungen als Liste statt fester Felder,
Abhängigkeits-Status, Umzug der Kampfgericht-Einstellungen). Auch die bitte erst nach den
Rückfragen am Ende umsetzen.

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten
Werte. Emojis fallen weg. Zugriff wie bisher: **Trainer und Admins**.

## 1 · Aus Karten werden Zeilen in drei Gruppen
Heute ist jede Funktion eine große Karte mit Fließtext. Neu: eine kompakte Zeile pro Funktion,
gebündelt in drei Abschnitten – **SPIELBETRIEB**, **TEAM**, **KOMMUNIKATION** (Reihenfolge und
Zuordnung wie in 1-reiter.png). Jede Zeile hat:
- den Namen,
- darunter eine Statuszeile in Geist Mono (9px, letter-spacing .1em),
- optional ein Chevron, wenn es eine Detailseite gibt,
- rechts den Schalter.

Die Statuszeile sagt, was die Funktion **gerade tut**, nicht was sie könnte:
`SYNC LÄUFT · ZULETZT 23.09. 21:52` · `14 VON 16 SPIELERN AKTIV` · `5 ERINNERUNGEN AKTIV` ·
`3 LAUFEN GERADE`. Volt (--to-accent), wenn die Funktion aktiv etwas tut, sonst --to-text-4.

## 2 · Welche Funktionen in der Liste stehen
SPIELBETRIEB: Spiele & Kader · Training · Kampfgericht · Punkte & Ergebnisse · Liga-Tabelle
TEAM: Spielerprofile · Teamstatistik · Trikots · Urlaub & Abwesenheit · Mitfahrgelegenheit
KOMMUNIKATION: Meldungen · Push-Benachrichtigungen · Erinnerungen

„Spiele & Kader" und „Training" sind in der Vorlage als Grundfunktion mit dem Vermerk **FEST**
und gesperrtem Schalter gezeichnet (siehe Rückfrage 1). Alle anderen sind schaltbar.

## 3 · Ausschalten (3-ausgeschaltet.png, 2-ausschalten.png)
Beim Ausschalten einer Funktion, zu der schon Daten existieren, kommt das Blatt aus
2-ausschalten.png:
- Titel „<Funktion> ausschalten?",
- Erklärung, dass sie aus Menüleiste, Startseite und Adminbereich verschwindet,
- eine volt getönte Zeile mit Häkchen: **welche Daten erhalten bleiben** (z. B. „Waschzähler und
  die Reihenfolge bleiben gespeichert und sind beim Einschalten wieder da"),
- „Ausschalten" und „Abbrechen".
Einschalten passiert ohne Nachfrage. Eine ausgeschaltete Zeile wird grau, die Statuszeile lautet
`AUS · DATEN BLEIBEN GESPEICHERT`, das Chevron verschwindet.
**Nichts löschen** – Ausschalten blendet nur aus, wie besprochen.

## 4 · Abhängigkeiten sichtbar machen (NEU)
Der heutige Hinweis „siehe README" fällt weg. Stattdessen erkennt die App den Zustand selbst:
- **Erinnerungen** ohne aktives Push: Statuszeile `BRAUCHT PUSH · ZURZEIT OHNE WIRKUNG` in
  --to-vacation, Schalter gesperrt.
- **Teamstatistik** ohne „Punkte & Ergebnisse": `BRAUCHT PUNKTE & ERGEBNISSE`, ebenso gesperrt.
- **Liga-Tabelle** ohne eingerichteten Sync (4-nicht-eingerichtet.png): Statuszeile
  `NICHT EINGERICHTET · SYNC FEHLT`, Schalter gesperrt, und oben über der ersten Gruppe steht ein
  gelber Kasten „BRAUCHT EINRICHTUNG · 1" mit einem Satz, woran es liegt. Läuft der Sync, ist der
  Kasten weg.

## 5 · Detailseiten
Nur drei Funktionen haben eigene Seiten – alles andere ist nur ein Schalter.

**Push (5-push.png):** zwei Zahlenkacheln (14 haben Push an / 2 noch nicht), darunter zuerst die
Liste **„Ohne Push"**, dann „Mit Push". Reine Information – der Trainer kann nichts für den Spieler
aktivieren, das steht auch so auf der Seite.

**Erinnerungen (6-erinnerungen.png) – NEU:** aus den neun festen Zahlenfeldern werden drei
Bereiche (Training · Kampfgericht · Kader-Zusage) mit **bis zu drei Erinnerungen als Chips**:
- vorhandene Erinnerung = volt Chip mit × zum Entfernen („1 Tag vorher ×"),
- dazu ein gestrichelter Chip „+ Erinnerung"; bei drei Stück steht dort „Mehr als drei gehen nicht",
- Zähler rechts oben je Bereich: `2 VON 3`,
- keine Erinnerung ist erlaubt: „Keine Erinnerung – hier geht nichts raus."
Der Zeitpunkt wird über das Blatt aus 7-erinnerung-waehlen.png gewählt (feste Vorschläge, schon
belegte sind ausgegraut). Intern bleiben es Stunden vor dem Termin, wie heute – nur eben eine
Liste statt drei Pflichtfelder, und 0 heißt nicht mehr „aus", sondern der Eintrag fehlt einfach.

**Liga-Tabelle (8-liga-tabelle.png):** Liga-ID mit „Speichern", darunter der Abgleich-Status als
farbige Zeile plus „Jetzt holen". Bei nicht eingerichtetem Sync ist die Zeile gelb
(`NOCH KEIN ABGLEICH GELAUFEN`).

## 6 · Umzug: Kampfgericht-Einstellungen (NEU)
„Mindesteinsätze pro Saison" und die U18-Regel gehören **nicht mehr hierher**. Bitte in das
Einstellungsfenster des Reiters „Kampfgericht" (Element 18) verschieben, zusammen mit der
Eintragefrist. Hier bleibt nur der Schalter, mit der Statuszeile
`EINSTELLUNGEN IM REITER KAMPFGERICHT` und ohne Chevron.

## Rückfragen (bitte beantworten, nicht selbst entscheiden)
1. **Grundfunktionen:** In der Vorlage sind „Spiele & Kader" und „Training" fest an. Sollen auch
   die abschaltbar sein? Wenn ja, bitte melden, was dann auf der Startseite und in der Menüleiste
   überhaupt übrig bleibt, bevor du es umsetzt.
2. **Ausschalten mitten im Betrieb:** Was passiert mit offenen Dingen – z. B. Kampfgericht
   ausschalten, während für Sonntag schon eingeteilt ist? Vorschlag: nur ausblenden, beim
   Einschalten steht alles wieder da. Bitte prüfen, ob irgendwo ein Job oder eine Push daran hängt,
   die dann ins Leere läuft.
3. **Erinnerungen umstellen:** Wie sind die Zeiten heute gespeichert (drei feste Spalten?)? Bitte
   den Weg zu einer Liste vorschlagen, bevor du migrierst – vorhandene Werte sollen erhalten
   bleiben, `0` fällt dabei weg.
4. **Push-Liste:** Woher kommt „14 von 16"? Zählen nur aktive Spieler, oder auch Trainer und
   Betrachter? Im Live-Stand stand ein Spieler einmal doppelt in der Liste – bitte prüfen, ob pro
   Spieler mehrere Geräte-Abos gespeichert werden, und in der Liste dann nach Person
   zusammenfassen.
5. **„Was fehlt?"** im gelben Kasten: Was soll dahinter passieren – eine kurze Erklärseite, oder
   reicht der Satz im Kasten? Vorschlag: erstmal nur der Satz, den Knopf weglassen.
6. **Sichtbarkeit beim Spieler:** Wenn eine Funktion aus ist, verschwindet sie überall. Bitte
   prüfen, dass auch Direktlinks und alte Push-Nachrichten dann nicht auf eine leere Seite führen,
   und melden, wo das abgefangen werden muss.

Zum Schluss: Screenshots bei 390px Breite für die Liste, eine ausgeschaltete Funktion, den Zustand
„nicht eingerichtet" und die Seite Erinnerungen, dazu eine kurze Liste, was du geändert hast, was
umgezogen ist und welche Rückfragen offen sind.
