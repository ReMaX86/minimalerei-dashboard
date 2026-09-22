Karte „Nächstes Spiel" (Startseite, direkt unter der Begrüßung) neu bauen.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/02-naechstes-spiel/

- naechstes-spiel.html → Referenz-Umsetzung. Im Browser öffnen, Zustand über ?state=…
  pending · notinsquad · nominated · declinesheet · accepted · declined · matchday · live
- 1-kader-offen.png · 7-nicht-im-kader.png · 2-im-kader.png · 8-absage-grund.png · 3-zugesagt.png ·
  4-abgesagt.png · 5-spieltag.png · 6-live.png → so soll jeder Zustand aussehen

Pixelgenau an der Vorlage orientieren, alle Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Spiel-Daten, Kader-Veröffentlichung, Zu-/Absage samt Trainer-Benachrichtigung,
Trikotsätze, Tracking und Live-Ticker, Erinnerungen. Bestehende Logik NICHT ändern, nur die Darstellung.

## Inhalt der Karte (immer)
- Oben links „HEIM" (Akzentfarbe) oder „AUSWÄRTS" (weiße Kontur).
- Oben rechts Countdown: > 1 Tag „IN 3 TAGEN" · < 24 Std „IN 4 STD 12 MIN" · letzte Stunde „IN 12 MIN" ·
  während des Spiels roter Punkt + „LÄUFT".
- Datum groß (--to-display-md, 34px): „FR 25.09.", am Spieltag „HEUTE", am Vortag „MORGEN".
- Darunter „20:00 Uhr · Treffpunkt 19:15" (Treffpunkt nur, wenn gepflegt).
- Gegner „vs. {Gegner}" 18px/600, Umbruch auf zwei Zeilen erlaubt.
- Adresse mit Pin-Icon, rechts „Route ↗". Tippen öffnet die Navigation direkt über geo:- bzw. maps:-Link,
  iOS öffnet Apple Karten, Android Google Maps. Keine eigene Auswahl-Abfrage.
- Trikot-Zeile: „Trikotsatz" + Pille mit Farbpunkt und Name des Satzes (Weiß heller Punkt,
  Schwarz dunkler Punkt mit hellem Rand), aus der bestehenden Trikot-Logik.
- Spielfeldlinien als Hintergrund wie in der Vorlage, nie über Text.
- Am Spieltag und während des Spiels Kartenrahmen #3A4A12 statt --to-border.

## Fußbereich je nach Zustand
1. pending – Kader noch nicht veröffentlicht: grauer Punkt + „Kader noch nicht veröffentlicht",
   darunter „Du bekommst eine Nachricht, sobald er steht." Keine Knöpfe, kein Kader-Link.
2. notinsquad – Kader steht, nicht nominiert: „Diesmal nicht im Kader" + Link „Kader ansehen".
3. nominated – nominiert, noch keine Rückmeldung: „Du bist im Kader" + Link „Kader ansehen",
   darunter „Zusagen" (Akzent) und „Absagen" (Kontur), gleich breit.
4. accepted – zugesagt: Pille „Zugesagt" + Kader-Link, darunter Textlink „Doch nicht dabei?".
5. declined – abgesagt: rote Pille „Abgesagt" + Textlink „Doch dabei?", darunter „Der Trainer wurde informiert."
6. matchday – Spieltag, zugesagt, vor dem Sprungball: Pille „Zugesagt" + Kader-Link,
   darunter breiter Knopf „Statistiken tracken" + Hinweis „Eine Person trackt – alle anderen sehen den Live-Ticker."
7. live – Spiel läuft: Anzeigetafel (Kürzel + Punkte, mittig roter LIVE-Punkt, Viertel und Spielzeit),
   darunter „Live-Ticker öffnen". Trackt niemand: Tafel zeigt „– : –" und der Knopf heißt „Statistiken tracken".

## Absagen (Grund optional)
„Absagen" öffnet ein Blatt (auf dem Handy als Bottom-Sheet, Aufbau siehe 8-absage-grund.png):
- Titel „Für dieses Spiel absagen?", darunter „Der Trainer bekommt eine Nachricht. Ein Grund hilft ihm beim
  Planen, ist aber freiwillig."
- Grund-Chips zum Antippen, höchstens einer aktiv, Abwählen möglich: Krank · Arbeit / Schule · Urlaub · Anderer Grund.
- Freitextfeld „Notiz für den Trainer (optional)".
- Knöpfe „Absage senden" (Akzent) und „Abbrechen".
- „Absage senden" funktioniert AUCH ohne Grund und ohne Notiz – nichts davon ist Pflicht.
- Danach steht die Karte auf „Abgesagt"; der gewählte Grund erscheint dort als Zusatz,
  z. B. „Abgesagt · Arbeit / Schule". Die Trainer-Benachrichtigung ist die bestehende Funktion.

## Tracking
Der Knopf „Statistiken tracken" ist für ALLE sichtbar und antippbar, die einen Zugang haben, Spieler wie Trainer.
Keine Rollenprüfung. Trackt bereits jemand, zeigt die Karte stattdessen die Anzeigetafel und „Live-Ticker öffnen".

## Erinnerungen
Es gibt keine Frist für die Rückmeldung. Die bestehenden Erinnerungen (Hinweis auf der Startseite und Push)
bleiben unverändert. Steht die Rückmeldung noch aus und ist das Spiel weniger als 24 Stunden entfernt,
bekommt der Countdown in der Karte die Akzentfarbe, damit die offene Rückmeldung auffällt. Kein zusätzlicher Hinweiskasten.

Zum Schluss: Screenshots bei 390px Breite für die Zustände 3, 5 und 7 sowie für das Absage-Blatt,
dazu eine kurze Liste, was du geändert hast und wo die App anders funktioniert als hier beschrieben.
