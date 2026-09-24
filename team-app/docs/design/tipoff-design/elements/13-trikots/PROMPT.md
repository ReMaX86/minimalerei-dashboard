Reiter „Trikots" neu bauen – Waschrotation, Übergabe, Nachfrage und Verlauf.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/13-trikots/

- trikots.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  open · live · confirmed · nosquad · ask · handover · decline · whohas
- 1-vor-spielbeginn.png · 2-ab-spielbeginn.png · 3-bestaetigt.png · 4-kein-kader.png ·
  5-nachfrage.png · 6-blatt-wer-hat-ihn.png · 7-blatt-wer-waescht.png · 8-blatt-nach-nein.png

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Trikotsätze, Waschzähler, Rotationsvorschlag, Kaderveröffentlichung,
Verlauf. Die bestehende Logik bleibt – es geht um Darstellung und Wortwahl.
Emojis fallen weg.

## Reihenfolge der Seite
1. Nachfrage zum letzten Spiel (nur wenn offen)
2. Auftragskarte für das nächste Spiel
3. „WO SIND DIE SÄTZE GERADE" – zwei Kacheln
4. „REIHENFOLGE" – wer als nächstes dran ist
5. „VERLAUF"

## 1 · Auftragskarte
Kopf: Farbfeld des benötigten Satzes (44×44, Radius 14), daneben Mono „FÜR FR 25.09. BENÖTIGT" und
„Weißes Set · Heim". Rahmen der Karte in --to-accent-frame.

- **Kader noch nicht veröffentlicht:** Rahmen normal (--to-border), im Körper nur der Satz
  „Kader für dieses Spiel noch nicht veröffentlicht – sobald er steht, schlägt die App den nächsten
  Wäscher vor." Kein Vorschlag, keine Knöpfe.
- **Kader steht, vor Spielbeginn:** „NÄCHSTER WÄSCHER" in --to-accent, Avatar im volt Ring,
  Name in Archivo expanded italic 20px, darunter „nimmt das Set nach dem Spiel mit".
  Darunter die graue Hinweiszeile „Bestätigen ab Spielbeginn, 20:00 Uhr".
  Ganz unten eine Trainerzeile: Label „TRAINER" und der Textknopf „Anderen bestimmen"
  (öffnet dasselbe Blatt wie „Kann nicht"). Nur für Trainer sichtbar.
- **Ab Spielbeginn, eigene Sicht:** Fläche rgba(200,255,46,.06), „DU BIST DRAN",
  Frage „Nimmst du das weiße Set heute mit nach Hause?" und die beiden Knöpfe
  „Nehme ich mit" (volt) und „Kann nicht" (Umriss).
  Alle anderen sehen weiterhin die Ansicht „vor Spielbeginn" ohne Knöpfe.
- **Bestätigt:** „ERLEDIGT", Wäscher-Zeile und die volt Fläche
  „Übernahme bestätigt · Waschzähler steht jetzt bei 1×".

## 2 · „Kann nicht" → Ersatz wählen
Blatt „Wer übernimmt das Waschen?" (7-blatt-wer-waescht.png).
- Untertitel: „Vorschläge in der Reihenfolge: im Kader, wenigste Wäschen, alphabetisch.
  Der Waschzähler zählt bei der Person hoch."
- Liste der Spieler im Kader in genau dieser Reihenfolge, je Zeile Avatar, Name, „1× GEWASCHEN"
  und rechts ein Auswahlring.
- **Der nächste laut Liste ist vorausgewählt** (volt Ring) und trägt die Pille „VORSCHLAG".
  Man kann jeden anderen antippen.
- Knopf „Weitergeben", darunter „Abbrechen".
Nach dem Weitergeben ist die neue Person der Wäscher und muss selbst bestätigen; der Zähler zählt
erst bei der tatsächlichen Übernahme hoch.

## 3 · Wo sind die Sätze gerade
Zwei Kacheln (schwarz/auswärts, weiß/heim): Farbfeld, Mono-Label, aktueller Besitzer und
„SEIT 22.09.". Liegt er in der Halle: „In der Halle" in --to-text-2 und „ABGEGEBEN 20.09.".

Der Knopf darunter heißt NICHT mehr „Übergeben", sondern:
- hat man den Satz selbst: **„Jemandem geben"**
- liegt er woanders/in der Halle: **„Ich hab ihn"**
Darunter in 11px (--to-text-4) die Klarstellung: **„zählt nicht als Wäsche"**.

Das öffnet das Blatt „Wer hat den Satz jetzt?" (6-blatt-wer-hat-ihn.png) mit dem Untertitel
„Nur wer ihn gerade zu Hause oder dabei hat. Der Waschzähler ändert sich dadurch NICHT –
gewaschen hat weiterhin, wer ihn mitgenommen hat."
Auswahl aus allen Teammitgliedern (Trainer eingeschlossen) plus „In der Halle abgelegt".
**Wichtig: dieser Vorgang verändert KEINEN Waschzähler** – er ändert nur, wer den Satz gerade hat.

## 4 · Reihenfolge
Liste ohne Erklärtext darüber. Pro Zeile: Platz, Name, Status-Pille und rechts der Waschzähler
(vier Punkte als Anzeige plus `2×`).
- Spieler IM Kader: Pille „IM KADER" in --to-accent-soft/--to-accent, durchnummeriert ab 1.
- Spieler NICHT im Kader: Pille „NICHT IM KADER" grau, Platz als „—", Name und Zahl gedimmt,
  einsortiert ganz unten.
- Die erste Zeile (der Vorschlag) ist volt getönt, Name fett in --to-accent.
Sortierung genau nach der Regel: im Kader zuerst, dann wenigste Wäschen, dann alphabetisch.

## 5 · Nachfrage zum letzten Spiel
Solange für ein vergangenes Spiel keine Übernahme bestätigt wurde, steht ganz oben die rote Karte:
Label „BITTE NACHTRAGEN", Avatar, Frage „Hat Axel die Trikots mitgenommen?", darunter Mono
„SO 20.09. · GEGEN BG MONHEIM" und die Knöpfe „Ja, hat er" (volt) und „Nein" (roter Umriss).
- „Ja" → Übernahme wird nachgetragen, Waschzähler zählt hoch, Karte verschwindet.
- „Nein" → Blatt „Wer hat das Set dann?" (8-blatt-nach-nein.png): „Liegt noch in der Halle" steht
  oben und ist vorausgewählt, darunter alle Teammitglieder. Das setzt nur den Besitz,
  **kein Waschzähler zählt hoch**, und der Wäscher-Vorschlag für das nächste Spiel bleibt unberührt.
Die Karte bleibt stehen, bis die Frage beantwortet ist.

## 6 · Verlauf
Liste der letzten Vorgänge, jüngster zuerst. Pro Zeile: Farbfeld des Satzes, dann eine Pille
„WÄSCHE" (volt) oder „ÜBERGABE" (grau), der Name, rechts das Datum in Mono, darunter eine Zeile
Kontext, z. B.:
- „Vorschlag war Axel Flaujac · Axel konnte nicht"
- „von Marc Rewald weitergegeben · keine Wäsche"
- „Vorschlag bestätigt"
Fünf Einträge, darunter „Ganzen Verlauf anzeigen".
Die Unterscheidung WÄSCHE/ÜBERGABE ist wichtig, weil nur die Wäsche den Zähler bewegt.

Zum Schluss: Screenshots bei 390px Breite für „vor Spielbeginn", „ab Spielbeginn", die offene Nachfrage
und das Blatt „Wer übernimmt das Waschen?", dazu eine kurze Liste, was du geändert hast und wo die App
anders funktioniert als hier beschrieben.
