Reiter „Kampfgericht" (Vereinsübersicht) neu gestalten.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/14-kampfgericht/

- kampfgericht.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  player · confirm · taken · coach · assign · past · empty
- 1-spieler.png · 2-trainer.png · 3-uebernehmen-rueckfrage.png · 4-uebernommen.png ·
  5-blatt-wer-uebernimmt.png · 6-vergangene-termine.png · 7-keine-termine.png

## WICHTIG – Rahmen für diese Aufgabe
**An der Logik erstmal nichts ändern. Nur die neuen Designs übernehmen. Ansonsten nachfragen.**
Datenmodell, Rechte, Benachrichtigungen, Rotations- und Zuteilungsregeln bleiben exakt so, wie sie
heute im Code sind. Wenn die Vorlage etwas zeigt, das es so noch nicht gibt oder das anders
funktioniert als hier beschrieben: **nicht selbst bauen, sondern nachfragen** und es in der Liste am
Ende aufführen.

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Termine, Positionen/Rollen, Zuteilungen, Rechte, Änderungsprotokoll.
Emojis fallen weg.

## Reihenfolge der Seite
1. Kopf „Kampfgericht" + Mono „SAISON 25/26"
2. Zwei Kennzahlen: „DEINE EINSÄTZE" und „NOCH OFFEN"
3. „Kommende Termine"
4. „Vergangene Termine" (aufklappbar, **Standard: eingeklappt**)
5. „Einsätze pro Spieler"
6. „Letzte Änderungen"

## 1 · Kennzahlen
Zwei Kacheln nebeneinander, Radius 20, --to-surface, Zahl in Archivo condensed (62%) 30px.
- „DEINE EINSÄTZE / DIESE SAISON" in --to-accent.
- „NOCH OFFEN / POSITIONEN" in --to-danger-text, Rahmen --to-danger-frame.
  Sind null Positionen offen: Zahl in --to-accent und Rahmen zurück auf --to-border.
Gezählt wird das, was die App heute schon zählt – keine neue Zählweise erfinden.

## 2 · Kommende Termine
Gelistet werden **nur Termine, bei denen unser Verein mindestens eine Position stellen muss**
(kommt aus dem Adminbereich). Pro Termin eine Karte, Radius 22:
- Kopf: Mannschaft (16px/600), darunter Mono „FR 25.09. · 20:00" und in kleinerem Mono/--to-text-4
  die Zeile „GEGEN SOLINGEN 2". Bewusst zwei Zeilen, damit nichts abgeschnitten wird.
- Rechts oben eine Status-Pille mit Punkt:
  „KOMPLETT" (--to-accent-soft/--to-accent) oder „1 OFFEN" / „2 OFFEN" (rot).
  Singular/Plural beachten.
- Kartenrahmen: rot (--to-danger-frame) sobald etwas offen ist, sonst --to-accent-frame wenn du
  selbst eine Rolle hast, sonst --to-border.
- Darunter je Rolle eine Zeile (min-height 46), getrennt durch 1px --to-surface-2.
  **Unten in der Karte 8px Luft**, damit der letzte Chip nicht am gerundeten Rand klebt.

Die vier Chip-Zustände rechts in der Rollenzeile:
| Fall | Chip | Rollenname links |
|---|---|---|
| besetzt | Name, --to-surface-2, Text --to-text | --to-text-2 |
| du selbst | „Du", --to-accent-soft, Rahmen --to-accent-frame, Text --to-accent | --to-text |
| offen | „Übernehmen", transparent, Rahmen --to-danger-frame, Text --to-danger-text | --to-text |
| anderes Team | „anderes Team", nur Text --to-text-4, kein Rahmen, **nicht antippbar** | --to-text-4 |

„anderes Team" ist die heutige „–"-Bedeutung: diese Position stellt ein anderer Verein/ein anderes
Team, für uns ist da nichts zu tun.

## 3 · Rechte – wer darf was
- **Spieler:** dürfen ausschließlich **offene** Positionen antippen („Übernehmen"). Besetzte Rollen
  sind für sie reine Anzeige.
- **Trainer:** jede Rolle ist antippbar (auch bereits besetzte). Der Chip bekommt dann rechts ein
  kleines Stift-Symbol (12px, currentColor, 55 % Deckkraft). Tippen öffnet das Blatt
  „Wer übernimmt?", aus dem der Trainer jeden Spieler – auch sich selbst – zuordnen kann.
Falls das Rechtemodell im Code anders aussieht: nachfragen, nicht umbauen.

## 4 · Spieler übernimmt → Rückfrage
Tippt ein Spieler auf „Übernehmen", kommt ein Blatt (3-uebernehmen-rueckfrage.png):
Titel „Position übernehmen?", Mono-Unterzeile „DU TRÄGST DICH VERBINDLICH EIN", darunter ein Kasten
(--to-surface-3) mit Rolle, Mannschaft und „SA 10.10. · 15:00 · gegen HILDEN", darunter der graue
Satz „Danach stehst du bei diesem Termin als verantwortlich drin."
Knöpfe: „Ja, ich übernehme" (volt) und „Abbrechen" (Textknopf).
Danach steht in der Zeile der volt Chip „Du", die Status-Pille und die Kennzahlen oben rechnen sich neu
(4-uebernommen.png). Die Rückfrage ist nur UI – sie soll verhindern, dass man sich vertippt.

## 5 · Trainerblatt „Wer übernimmt?"
5-blatt-wer-uebernimmt.png. Kopf: „Wer übernimmt?" und Mono-Unterzeile mit
Rolle · Mannschaft · Datum/Uhrzeit.
Liste in einem Kasten (Radius 18, #0F1216), je Zeile Avatar (30px, Initialen), Name und rechts der
Einsatzzähler in Mono:
- **erste Zeile: „Du (Marc Rewald)"** volt getönt,
- danach alle Teammitglieder alphabetisch.
Darunter „Position frei lassen" (Umriss) und „Abbrechen" (Textknopf).
Tippen auf den Hintergrund schließt das Blatt.

## 6 · Vergangene Termine
Abschnittsüberschrift ist ein Knopf mit Chevron rechts, **Standard eingeklappt**.
Aufgeklappt dieselbe Kartenstruktur, aber ruhiger: Rahmen --to-hairline, Mannschaft in --to-text-2,
Pille „KOMPLETT" grau ohne Punkt, Rollenzeilen kompakter (min-height 38) und ohne Chips – nur Name
rechts als Text. Eigene Einsätze stehen auch hier als „Du" in --to-accent.

## 7 · Einsätze pro Spieler
Ein Panel: Kopfzeile Mono „GANZE SAISON" / rechts „EINSÄTZE", darunter je Spieler eine Zeile mit Name
und einer Zähler-Pille („3×"). Die eigene Zeile ist volt getönt, Name in --to-accent.
Null Einsätze: Pille ohne Fläche, Zahl in --to-text-4.
Abschluss: Textknopf „Alle Spieler anzeigen" in --to-accent.
Sortierung und Zählweise wie heute im Code.

## 8 · Letzte Änderungen
Ein Panel, je Eintrag zwei Zeilen:
- oben Titel „Anschreiben · TBW U16" (14px/600) und rechts das Datum in Mono --to-text-4,
- darunter Mono 10px --to-text-3: „offen → Sven Hasenpusch · geändert von Sven Hasenpusch".
Vier Einträge, jüngster zuerst. Inhalt kommt aus dem bestehenden Protokoll – Format und Wortlaut der
Unterzeile so übernehmen, wie die App es heute speichert.

## 9 · Leerzustand
Keine kommenden Termine: gestrichelte Karte (--to-line) mit „Keine Termine offen" und
„Für die nächsten Wochen muss unser Verein kein Kampfgericht stellen. Neue Termine pflegt der Trainer
im Adminbereich." Die Abschnitte darunter bleiben stehen.

Zum Schluss: Screenshots bei 390px Breite für Spielersicht, Trainersicht, das Blatt „Wer übernimmt?"
und die aufgeklappten vergangenen Termine, dazu eine kurze Liste, was du geändert hast und an welchen
Stellen die App anders funktioniert als hier beschrieben – inklusive der Punkte, bei denen du
nachfragen musst.
