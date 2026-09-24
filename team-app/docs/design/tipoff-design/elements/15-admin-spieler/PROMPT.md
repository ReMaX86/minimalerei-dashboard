Adminbereich, Reiter „Spieler" neu gestalten.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/15-admin-spieler/

- admin-spieler.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  list · copied · created · detail · coach · inactive · profile
- 1-liste.png · 2-code-kopiert.png · 3-detailseite.png · 4-trainer.png · 5-deaktiviert.png ·
  6-profil-bearbeiten.png · 7-blatt-angelegt.png

## WICHTIG – Rahmen für diese Aufgabe
**An der Logik erstmal nichts ändern. Nur die neuen Designs übernehmen. Ansonsten nachfragen.**
Codeerzeugung, Rollenmodell, Deaktivierung, Kampfgericht-Befreiung und Profilfelder bleiben exakt so,
wie sie heute im Code sind. Es geht um Darstellung, Anordnung und Wortwahl. Wo die Vorlage etwas
zeigt, das es so noch nicht gibt oder anders funktioniert: **nicht selbst bauen, sondern nachfragen**
und am Ende auflisten.

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Admin-Code lesen: Anlegen, Code, Rollen, Deaktivieren, Befreiung, Profil.
Emojis fallen weg – auch bei den Stärken (heute mit Emoji, künftig nur Text).

## Die wichtigste Änderung
Heute hat jede Spielerkarte bis zu sieben gleich aussehende Knöpfe; bei 20 Spielern ist die Liste
unbenutzbar lang. Neu:
**Liste = eine Zeile pro Spieler. Alle Aktionen liegen auf einer Detailseite.**
Der einzige Knopf, der in der Liste bleibt, ist der Code – weil das der häufigste Handgriff ist.

## 1 · Kopf und Reiterleiste
„Admin" in Archivo expanded italic 26px, rechts die Rollen-Pille „TRAINER".
Darunter die bestehende, seitlich scrollbare Reiterleiste als Pills, Reihenfolge wie heute:
Spieler · Spiele · Kampfgericht · Training · Trikots · Betrachter · Meldungen · Funktionen.
Aktiver Reiter volt gefüllt, Rest --to-surface mit --to-border. Am rechten Rand ein Verlauf nach
--to-bg, damit man sieht, dass es weitergeht. Kein fixes Raster – `flex:0 0 auto` plus
`scroll-snap-align:start`.

## 2 · Spieler anlegen
Karte mit Mono-Label „NEUEN SPIELER ANLEGEN", Eingabefeld und voltem Knopf „Anlegen",
darunter der graue Satz „Der Anmeldecode wird sofort erzeugt und kann danach kopiert werden."

Nach dem Anlegen öffnet sich ein Blatt (7-blatt-angelegt.png):
Titel „Spieler angelegt", Mono-Unterzeile mit dem Namen, dann der Code **groß und mittig**
(Geist Mono 30px, letter-spacing .16em, volt, Kasten mit --to-accent-frame), darunter
„Schick den Code an den Spieler – damit meldet er sich das erste Mal an.",
Knopf „Code kopieren" (volt) und Textknopf „Fertig".
Das ersetzt den heutigen Ablauf nicht, es macht ihn nur sichtbar: der Code darf nicht in einer Liste
untergehen, er ist das Ergebnis der Aktion.

## 3 · Suche und Liste
Suchfeld als Pille mit Lupe, rechts daneben Mono „18 AKTIV".
Liste in einem Panel, je Zeile (min-height 60):
- Avatar 34px mit Initialen; bei Trainern volt getönt mit --to-accent-frame,
- Name (14px/600), darunter die Rollen-Pillen,
- rechts der **Code-Chip als eigener Knopf**: Mono-Code plus Kopier-Icon. Nach dem Tippen wird er
  volt getönt und zeigt „KOPIERT" mit Häkchen (2-code-kopiert.png). Er öffnet NICHT die Detailseite.
- ganz rechts das Chevron; die restliche Zeile öffnet die Detailseite.

Die Pillen:
| Pille | Fläche | Rahmen | Text |
|---|---|---|---|
| TRAINER | --to-accent-soft | --to-accent-frame | --to-accent |
| CAPTAIN | --to-surface-2 | – | --to-text |
| CO-CAPTAIN | transparent | --to-line | --to-text-2 |
| U18 BEFREIT | --to-vacation-soft | rgba(233,185,73,.32) | --to-vacation |
| INAKTIV | transparent | --to-line | --to-text-4 |
Mehrere Pillen nebeneinander sind möglich (Trainer + Captain).

Darunter der Abschnitt „INAKTIV · 2": eigenes Panel, gestrichelter Rahmen, gedimmt, je Zeile nur
Name und der Knopf „Aktivieren". Gibt es keine inaktiven Spieler, fällt der Abschnitt weg.

## 4 · Detailseite statt Knopf-Teppich
Kopf: Zurück-Pfeil, Name in Archivo expanded italic 22px, Mono-Unterzeile mit dem Ist-Zustand
(„TRAINER · CAPTAIN · AKTIV"), rechts der Avatar.

**Code-Karte:** Mono-Label „ANMELDECODE", der Code in Mono 18px, rechts der volte Knopf „Kopieren"
(nach dem Tippen „Kopiert" mit Häkchen, volt getönt). Darunter eine Zeile: links grau
„Code wurde am 04.09. erzeugt", rechts der volte Textknopf „Neuen Code erzeugen".

**Rolle im Team:** ein Segmented Control mit *Spieler · Co-Captain · Captain* statt vier Knöpfen –
man sieht den Ist-Zustand, statt ihn aus Knopfbeschriftungen zu erschließen.

**Drei Schalter** (je mit erklärender Unterzeile):
1. „Trainerrechte" – *Sieht den Adminbereich und kann Kader veröffentlichen.*
   Bewusst getrennt von der Rolle, weil es mehrere Trainer gibt und jemand Captain **und** Trainer
   sein kann. Kein Limit.
2. „Aktiv im Team" – *Aus: verschwindet aus Kader, Trikotliste und Kampfgericht.*
   Ist er aus, steht oben zusätzlich der rote Hinweis „DEAKTIVIERT … Statistiken und Einsätze bleiben
   gespeichert." (5-deaktiviert.png)
3. „Vom Kampfgericht befreit" – *Spielt bereits in der U18 und wird dort eingeteilt.*
   Schalter in --to-vacation statt volt, damit er sich von den anderen absetzt.
   **Rückfrage:** Gilt die Befreiung pro Mannschaft (U18, U16 …), dann wird daraus eine
   Mehrfachauswahl statt eines Schalters – bitte nachfragen, bevor du das umbaust, und bis dahin
   die bestehende Logik unverändert lassen.

Zum Schluss die Zeile „Profil bearbeiten" mit Untertitel „Bild, Größe, Geburtsdatum, Position, Stärken".

## 5 · Profil bearbeiten
Eigene Seite (6-profil-bearbeiten.png), Kopf „Profil" mit dem Namen als Mono-Unterzeile.
- Profilbild: runder Platzhalter 58px, Titel „Profilbild", Hinweis „Der Spieler kann es selbst
  ändern – du kannst es ersetzen oder entfernen.", Knopf „Ändern".
- Abschnitt „PFLEGT AUCH DER SPIELER SELBST": Zeilen „Größe" und „Geburtsdatum" mit Wert rechts
  und Chevron.
- Abschnitt „POSITION · NUR TRAINER": Chips, eine Auswahl, keine Pflicht.
  Point Guard · Shooting Guard · Small Forward · Power Forward · Center
- Abschnitt „STÄRKEN · NUR TRAINER · KEINE PFLICHT": Chips, Mehrfachauswahl, ausgewählte Chips in
  --to-accent-soft/--to-accent-frame/--to-accent. Genau diese elf, ohne Emojis:
  3-Point (Sniper) · Rebound (Glas-Cleaner) · Blocks (Blockmaschine) · Verteidigung (Defense Monster) ·
  Passspiel (Playmaker) · Ballhandling (Crossover-King) · Athletik (Highflyer) · Freiwurf (Mr. Automatik) ·
  Fastbreak (Turbo) · Motor (Energizer) · Post-Play (Tank)
- Unten „Speichern" (volt) und „Abbrechen".
Wenn die Liste der Stärken im Code anders lautet, gilt der Code – melden, nicht überschreiben.

## 6 · Was dieser Umbau NICHT anfasst
Die anderen Reiter (Spiele, Kampfgericht, Training, Trikots, Betrachter, Meldungen, Funktionen)
bleiben unverändert – hier geht es nur um „Spieler". Die Reiterleiste selbst wird aber schon jetzt
im neuen Stil gebaut, weil sie über allen Reitern steht.

Zum Schluss: Screenshots bei 390px Breite für Liste, Detailseite, Detailseite eines deaktivierten
Spielers und „Profil bearbeiten", dazu eine kurze Liste, was du geändert hast, wo die App anders
funktioniert als hier beschrieben, und welche Punkte du nachfragen musst.
