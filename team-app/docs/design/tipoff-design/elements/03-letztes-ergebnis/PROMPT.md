Karte „Letztes Ergebnis" (Startseite, unter der Karte „Nächstes Spiel") neu bauen.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/03-letztes-ergebnis/

- letztes-ergebnis.html → Referenz-Umsetzung. Im Browser öffnen, Zustand über ?state=…
  win · loss · streak · untracked · noresult · notinsquad
- 1-sieg.png · 2-niederlage.png · 3-serie.png · 4-nicht-getrackt.png · 5-endstand-fehlt.png · 6-nicht-im-kader.png

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Ergebnis-Erfassung (auch das Nachtragen ohne Tracking), Box-Score, Spieler-Statistiken, Kader.
Bestehende Logik NICHT ändern, nur die Darstellung.

## Welches Spiel die Karte zeigt
Immer das zuletzt gespielte Spiel des Teams, bis das nächste Spiel angepfiffen ist bzw. dessen Ergebnis vorliegt.
Danach rückt automatisch das neue Spiel nach. Gibt es noch kein gespieltes Spiel, wird die ganze Karte ausgeblendet.

## Inhalt (immer)
- Kopfzeile links „LETZTES SPIEL · HEIM" bzw. „· AUSWÄRTS" (einzeilig, bei Platzmangel abschneiden).
- Kopfzeile rechts eine Marke: „SIEG" (Akzentfläche), „NIEDERLAGE" (rote Fläche, roter Text)
  oder „OFFEN" (graue Fläche), wenn der Endstand fehlt.
- Links Gegner „vs. {Gegner}" 17px/600 und darunter das Datum in Mono.
- Rechts der Endstand in Mono 34px: bei Sieg unsere Punkte in Akzentfarbe, bei Niederlage die des Gegners gedimmt.
  Fehlt der Endstand: „–  :  –" in 26px grau.

## Zeile „Letzte 5" / Serie
Direkt unter dem Ergebnis, mit Trennlinie darüber:
- Standard: Label „LETZTE 5" (Mono, grau), fünf Kästchen (26×26, Radius 8) für die letzten fünf Spiele –
  Sieg = Akzentfläche mit „S" auf Dunkel, Niederlage = graue Fläche mit rotem „N".
  Das jüngste Spiel steht LINKS. Rechts die Bilanz dieser fünf Spiele, z. B. „4 S · 1 N".
- Läuft eine Serie von mindestens DREI gleichen Ergebnissen in Folge, ersetzt das Label die Bilanz:
  „3 SIEGE IN FOLGE" in Akzentfarbe bzw. „3 NIEDERLAGEN IN FOLGE" in Rot, die Bilanz rechts entfällt dann.
  Die Zahl wächst mit der Serie (4, 5, …). Ein Spiel ohne eingetragenen Endstand zählt für die Serie nicht mit
  und bekommt auch kein Kästchen.
- Gibt es weniger als fünf gespielte Spiele, nur so viele Kästchen zeigen, wie es Spiele gibt.

## Bereiche je nach Zustand
1. win / loss (getrackt, du warst im Kader): drei Kacheln mit DEINEN Werten aus dem Spiel –
   „DEINE PUNKTE" (Akzentfarbe), „REBOUNDS", „ASSISTS". Darunter die Zeile „Box-Score ansehen" mit Balken-Icon.
   Wir tracken zwar auch Steals, Turnover und Fouls – die bleiben dem Box-Score vorbehalten, auf der Karte stehen nur diese drei.
2. streak: wie 1, nur mit dem Serien-Label aus dem Abschnitt oben.
3. untracked (Endstand nachgetragen, niemand hat getrackt): keine Kacheln, kein Box-Score-Link,
   stattdessen die Zeile „Nicht getrackt – nur Endstand" mit grauem Punkt.
4. noresult (Spiel vorbei, Endstand fehlt): Marke „OFFEN", Ergebnis „– : –",
   darunter der Knopf „Endstand eintragen" (führt in die bestehende Eingabe) und die Zeile
   „Jede·r mit Zugang kann das Ergebnis nachtragen."
5. notinsquad (du warst nicht im Kader): KEINE eigenen Werte, keine Ersatzzeile, kein Hinweis –
   die drei Kacheln entfallen ersatzlos. Wurde getrackt, bleibt der Box-Score-Link erhalten.

Zum Schluss: Screenshots bei 390px Breite für Sieg (getrackt), Serie und „Endstand fehlt",
dazu eine kurze Liste, was du geändert hast und wo die App anders funktioniert als hier beschrieben.
