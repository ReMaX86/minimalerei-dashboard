Adminbereich, Reiter „Betrachter" neu gestalten.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/21-admin-betrachter/

- admin-betrachter.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  list · copied · created · detail · inactive · empty
- 1-liste.png · 2-code-kopiert.png · 3-detailseite.png · 4-deaktiviert.png · 5-noch-keiner.png ·
  6-blatt-angelegt.png

## WICHTIG – Rahmen für diese Aufgabe
**An der Logik nichts ändern. Nur die neuen Designs übernehmen. Ansonsten nachfragen.**
Anlegen, Code erzeugen und Deaktivieren funktionieren weiter wie heute; die Rechte eines Betrachters
sind fest und werden hier nur angezeigt, nicht eingestellt.

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Emojis fallen weg.

## 1 · Baugleich zum Reiter „Spieler"
Dieser Reiter ist **derselbe Baustein wie Element 15 (Admin – Spieler)**, nur ohne Rollen und ohne
Profil. Bitte dieselben Komponenten wiederverwenden, nicht neu bauen:
- dieselbe Zeile (Avatar 34px, Name, Code-Chip als eigener Knopf, Chevron),
- dasselbe Verhalten beim Kopieren („KOPIERT" mit Häkchen, volt getönt, öffnet **nicht** die Detailseite),
- dieselbe Detailseite mit Code-Karte, „Kopieren", „Neuen Code erzeugen" samt Datum,
- derselbe Abschnitt „INAKTIV" mit „Aktivieren",
- dasselbe Blatt nach dem Anlegen mit dem Code groß in Volt (6-blatt-angelegt.png).
Unterschiede: kein Segmented Control für Rollen, keine Trainerrechte, keine U18-Befreiung, kein
„Profil bearbeiten". Es bleibt **ein** Schalter: „Zugang aktiv".

## 2 · Rechte sichtbar machen statt beschreiben
Der heutige Fließtext („Betrachter sehen Spielplan und Kampfgericht rein lesend — z. B. für einen
Abteilungsleiter …") wird zu einer **zweispaltigen Übersicht**:
- linke Spalte „SIEHT" in --to-accent mit Häkchen: **Spielplan · Tabelle · Kampfgericht**
- rechte Spalte „SIEHT NICHT" in --to-text-4 mit Kreuzen: **Kader · Trikots · Admin**
Darüber eine kurze Zeile: „Betrachter schauen nur zu – z. B. ein Abteilungsleiter, der weder Spieler
noch Trainer ist."
Dieselbe Übersicht steht noch einmal auf der Detailseite unter der Überschrift „WAS DIESE PERSON
SIEHT", mit dem Zusatz „Feste Rechte – für Betrachter gibt es nichts einzustellen."

**Rückfrage:** Die Listen in den beiden Spalten müssen zu den tatsächlichen Rechten im Code passen.
Bitte prüfen, was ein Betrachter heute wirklich sieht (z. B. ob die Tabelle dazugehört oder ob auch
Trainingszeiten sichtbar sind), die Einträge entsprechend korrigieren und melden.

## 3 · Deaktiviert
Ist der Zugang aus, steht oben auf der Detailseite der rote Hinweis:
„DEAKTIVIERT · Der Code funktioniert nicht mehr. Beim Aktivieren gilt derselbe Code wieder – oder du
erzeugst einen neuen." In der Liste rutscht die Person in den Abschnitt „INAKTIV" mit „Aktivieren".
**Rückfrage:** Ob der alte Code beim Reaktivieren wirklich weitergilt, bitte im Code prüfen und den
Satz sonst anpassen.

## 4 · Leerzustand
Noch kein Betrachter angelegt: gestrichelte Karte „Noch kein Betrachter · Leg jemanden an, der
Spielplan und Kampfgericht mitlesen soll, ohne Spieler oder Trainer zu sein."

Zum Schluss: Screenshots bei 390px Breite für Liste, Detailseite und den deaktivierten Zustand, dazu
eine kurze Liste, was du geändert hast, welche Rechte-Einträge du korrigieren musstest und welche
Punkte du nachfragen musst.
