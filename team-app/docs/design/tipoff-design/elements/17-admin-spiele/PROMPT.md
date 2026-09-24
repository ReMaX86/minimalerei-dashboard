Adminbereich, Reiter „Spiele" neu gestalten.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/17-admin-spiele/

- admin-spiele.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  list · past · detail · played · edit · new · score · reset
- 1-spielplan.png · 2-gespielt-aufgeklappt.png · 3-detail-kommend.png · 4-detail-gespielt.png ·
  5-bearbeiten.png · 6-neues-spiel.png · 7-endstand.png · 8-tracking-zuruecksetzen.png

## WICHTIG – Rahmen für diese Aufgabe
**An der Logik erstmal nichts ändern. Nur die neuen Designs übernehmen. Ansonsten nachfragen.**
Anlegen, Bearbeiten, Tracking, Endstand und Löschen funktionieren weiter wie heute. Wo die Vorlage
etwas zeigt, das es so nicht gibt: **nicht bauen, sondern nachfragen** und am Ende auflisten.

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Spiele-Datensatz, Treffpunkt-Felder, Trikot-Auswahl, Tracking,
Endstand. Emojis fallen weg.

## Der Umbau in einem Satz
Aus vier gleich aussehenden Knöpfen pro Spielkarte wird **eine Zeile pro Spiel** mit Status-Chips,
und alle Aktionen liegen auf einer Detailseite. Reihenfolge neu: **nächstes Spiel zuerst**,
die gespielten Spiele unten in einem aufklappbaren Abschnitt.

## 1 · Kein Kader in diesem Reiter
**Der Kader wird hier nicht angezeigt und nicht bearbeitet.** Das passiert ausschließlich beim
nächsten Spiel über den Reiter „Spiele & Kader" im Hauptmenü. Bitte auch keine Kader-Status-Zeile,
keinen Kader-Chip und keinen Knopf „Kader öffnen" einbauen.

## 2 · Spielplan (1-spielplan.png)
Kopf: Abschnittstitel „Kommende Spiele", rechts der volte Knopf „+ Neu" (34px hoch, Radius 999).

Pro Spiel eine Zeile (min-height 74) in einem Panel:
- links ein Datumsblock: Mono-Wochentag, Tag in Archivo condensed (62 %) 20px, Mono-Monat,
- Mitte: Gegner (14px/600) und dahinter die Pille „HEIM" (gefüllt --to-surface-2) bzw. „AUSWÄRTS"
  (nur Umriss --to-line),
- darunter die **Status-Chips**: „TREFFPUNKT 19:00" grau, wenn gepflegt – „TREFFPUNKT FEHLT" rot
  (--to-danger-soft/--to-danger-frame), wenn nicht. Dazu „TRIKOT WEISS" bzw. „TRIKOT AUTOMATISCH".
- rechts das Chevron. Die ganze Zeile öffnet die Detailseite.
**Das nächste Spiel** ist leicht volt hinterlegt (rgba(200,255,46,.04)) und hat die Tageszahl in
--to-accent.

Darunter der Abschnitt **„Gespielt"** als Knopf mit Chevron, **Standard eingeklappt** (2-…png):
ruhigere Zeilen, Gegner in --to-text-2, Mono-Zeile „STATS ABGESCHLOSSEN" bzw. „NICHT GETRACKT",
rechts der Endstand in Archivo condensed und darunter „SIEG" (volt) oder „NIEDERLAGE" (rot).

## 3 · Detailseite (3-detail-kommend.png, 4-detail-gespielt.png)
Kopf: Zurück-Pfeil, Gegner in Archivo expanded italic 20px, Mono-Zeile „DO 01.10. · 20:30 · AUSWÄRTS".

**Statusliste** (Punkt + Label + Wert), je nach Spielzustand:
- kommend: Treffpunkt (rot „fehlt", wenn leer) · Trikot · Endstand („noch offen")
- gespielt: Endstand · Tracking („abgeschlossen") · Trikot

**Aktionsliste** als Zeilen mit Untertitel und Chevron:
- „Spiel bearbeiten" – *Datum, Uhrzeit, Gegner, Ort, Trikot, Treffpunkt*
- „Stats tracken" – *Live-Erfassung jetzt starten* (bei gespielten Spielen mit Tracking stattdessen
  „Stats ansehen" – *Boxscore dieses Spiels*)
- „Endstand nachtragen" – *Ohne Tracking gespielt? Ergebnis eintragen*
Tracking kann der Trainer hier **jederzeit** starten, nicht nur am Spieltag – so ist es heute schon.

**Gefährlicher Block** ganz unten, optisch abgesetzt: Mono-Überschrift „NICHT RÜCKGÄNGIG ZU MACHEN",
darunter ein Kasten in --to-danger-soft mit --to-danger-frame:
„Tracking zurücksetzen" (nur wenn getrackt wurde) und „Spiel löschen", beide in --to-danger-text.

## 4 · Tracking zurücksetzen (8-…png)
Erst eine Rückfrage als Blatt, und die **benennt das Spiel und die Folgen**:
Titel „Tracking zurücksetzen?" in --to-danger-text, Mono-Unterzeile mit Datum und Gegner, darunter
ein Kasten mit drei Zeilen:
- Alle **Spielerstatistiken** dieses Spiels werden gelöscht.
- Die Werte verschwinden aus der **Bestenliste** und den Profilen.
- Der **Endstand 63:82** bleibt erhalten.
Knöpfe: „Ja, Tracking zurücksetzen" (gefüllt --to-danger, Text #120507) und „Abbrechen" als Textknopf.
Ob der Endstand wirklich erhalten bleibt, bitte im Code prüfen – wenn nicht, den Satz anpassen und
melden.

## 5 · Bearbeiten und Neu (5-bearbeiten.png, 6-neues-spiel.png)
Eigene Seite, dieselben Felder wie heute, nur gruppiert:
- **SPIEL**: Datum und Uhrzeit nebeneinander, darunter Gegner und Ort.
- **HEIM ODER AUSWÄRTS**: statt der Checkbox ein Segmented Control „Heimspiel | Auswärts" –
  man sieht den Ist-Zustand, ohne die Checkbox zu deuten.
- **TRIKOTSATZ**: Auswahl „Automatisch (Heim weiß, auswärts schwarz) · Immer weiß · Immer schwarz".
  Die Wortlaute bitte an die bestehenden Werte anpassen, falls sie abweichen.
- **TREFFPUNKT**: hängt an der Auswahl oben.
  *Heimspiel* → nur „Halle — Zeit".
  *Auswärts* → „Fahrgemeinschaft — Zeit", „Direkt an der Halle — Zeit" (nebeneinander) und
  „Fahrgemeinschaft — Ort".
  Heute stehen immer alle Felder da; das Ausblenden ist der einzige inhaltliche Eingriff und soll
  nur die Anzeige betreffen – gespeicherte Werte nicht löschen.
- Unten „Speichern" (volt, volle Breite) und „Abbrechen".
„Neu" ist dieselbe Seite mit leeren Feldern und der Überschrift „Neues Spiel".

## 6 · Endstand nachtragen (7-endstand.png)
Zwei große Zahlenfelder nebeneinander (64px hoch, Archivo condensed 28px) mit Mono-Labels
„TB WÜLFRATH" und dem Gegnernamen, dazwischen ein Doppelpunkt.
Darunter ein Schalter **„Viertel eintragen"** – *Optional, nur wenn du sie zur Hand hast*. Erst wenn
er an ist, erscheinen vier Zeilen Q1–Q4 mit je zwei kleinen Feldern.
Hinweiszeile: „Wurde das Spiel getrackt, steht der Endstand schon; ein hier eingetragener Wert
überschreibt ihn und die Spielerstatistiken bleiben unberührt."
**Rückfrage:** Ob ein nachgetragener Endstand den getrackten wirklich überschreibt, steht so noch
nicht fest – bitte prüfen, wie der Code es heute macht, und den Satz danach richtigstellen.

## 7 · Später, nicht jetzt
Ein **Import der Spiele von der DBB-Seite** ist angedacht, aber noch nicht besprochen. Bitte dafür
nichts vorbereiten und keinen Knopf einbauen; „+ Neu" bleibt der einzige Weg, ein Spiel anzulegen.

Zum Schluss: Screenshots bei 390px Breite für Spielplan, Detailseite eines kommenden und eines
gespielten Spiels und das Bearbeiten-Formular, dazu eine kurze Liste, was du geändert hast, wo die
App anders funktioniert als hier beschrieben und welche Punkte du nachfragen musst.
