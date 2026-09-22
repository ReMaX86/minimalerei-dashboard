Karte „Dein Kampfgericht-Einsatz" (Startseite) neu bauen – kompakt, aufklappbar.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/05-kampfgericht/

- kampfgericht.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  default · open · today · todayopen · partial · solo · soon · empty
- 1-kompakt.png · 2-aufgeklappt.png · 3-einsatztag-kompakt.png · 4-einsatztag-aufgeklappt.png ·
  5-nur-eine-rolle.png · 6-kein-tisch-block.png · 7-morgen.png · 8-kein-einsatz.png

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Kampfgericht-Einteilung, Rollen, Spieltermine, Hallenadressen.
Bestehende Logik nicht ändern, nur die Darstellung – außer wo unten ausdrücklich etwas Neues beschrieben ist.
Neue Tokens sind nicht nötig.

## Was die Karte zeigt
Nur der EINE nächste eigene Einsatz (kein Listenaufbau, keine weiteren Termine).
Ist er vorbei, rückt der nächste nach. Gibt es keinen, siehe „Kein Einsatz".

## Zugeklappt – der Standard
Eine Zeile, ca. 78 px hoch, die ganze Zeile ist der Knopf zum Aufklappen
(button, aria-expanded, aria-controls auf den Detailbereich):

- links eine 46×46-Kachel, Radius 14, Hintergrund --to-surface-2, darin das Stoppuhr-Symbol in --to-accent
- mittig drei Zeilen: Mono 10px `KAMPFGERICHT` (--to-text-3) · 16px/600 die eigene Rolle
  („24-Sek.-Uhr", „Anschreiben", „Zeit/Punkte") · Mono 13px Datum und Uhrzeit in Großbuchstaben,
  tabular-nums: `SO 20.12. · 13:00 UHR` (kein Jahr)
- rechts untereinander: Countdown-Pille und der Chevron (zeigt nach unten, aufgeklappt gedreht)

Mehr steht zugeklappt NICHT drin – nur was und wann.
Beim Laden der Startseite ist die Karte immer zugeklappt, auch am Einsatztag; der Zustand wird nicht gespeichert.

Countdown-Pille (Mono 10px/600):
- mehr als 14 Tage → `IN 3 WO.` (aufgerundete Wochen)
- 2 bis 14 Tage → `IN 5 TAGEN`
- morgen → `MORGEN`
- heute, mehr als 1 Stunde → `IN 2 STD`
- heute, weniger als 1 Stunde → `IN 40 MIN`
- Startzeit erreicht → `LÄUFT`

Datumszeile: heute `HEUTE · 13:00 UHR`, sonst immer Wochentag + Datum (auch wenn die Pille „MORGEN" sagt).

## Einsatztag
Am Tag des Einsatzes: Rahmen der Karte #3A4A12, Icon-Kachel gefüllt in --to-accent mit Symbol in
--to-on-accent, Pille in --to-accent-soft mit Text in --to-accent. Sonst ändert sich nichts,
die Karte bleibt zugeklappt bis man sie antippt.

## Aufgeklappt
Kopfzeile bleibt stehen (Hintergrund #14181E), darunter:

1. Zeile mit Personen-Symbol: Spielpaarung, z. B. „TBW U16 gegen BG Monheim".
2. Zeile mit Pin-Symbol: vollständige Adresse, rechts „Route" in --to-accent.
   Öffnet die Navigation über denselben geo:-Link wie beim nächsten Spiel (Element 02).
3. Block „MIT DIR AM TISCH" (Fläche --to-surface-2, Radius 16): pro Rolle eine Zeile,
   links das Mono-Label (Breite 88px, --to-text-3), rechts der Name.
4. Knopf „In Kalender" über die volle Breite (Umriss, 46px hoch).
   Erzeugt den Termin wie bisher: Titel „Kampfgericht · {Rolle}", Ort = Adresse, Beginn = Einsatzzeit.

Datum und Uhrzeit werden im Detailbereich NICHT wiederholt.

## „MIT DIR AM TISCH" – wichtig
Wir kennen nur die Rollen, die unser Team stellt. Es kommt vor, dass wir nur ein oder zwei Plätze
besetzen und der Rest von einem anderen Team kommt – diese Namen haben wir nicht.

- Angezeigt werden ausschließlich die weiteren Rollen, die unser Team stellt.
- Rolle unseres Teams noch nicht vergeben → Name „Noch offen" in --to-text-3.
- Stellen wir außer deiner Rolle noch mindestens eine weitere, aber nicht alle:
  unter der Liste die Zeile „Den dritten Platz stellt ein anderes Team."
  (bei zwei fehlenden Plätzen „Die übrigen Plätze stellt ein anderes Team.")
- Stellen wir NUR deine Rolle: der ganze Block entfällt ersatzlos (siehe 6-kein-tisch-block.png).
  Keine leere Fläche, kein Platzhalter.

## Kein Einsatz
Statt der Karte dieselbe kompakte Zeile als Link: Kachel mit gedimmtem Symbol (--to-text-4),
`KAMPFGERICHT` / „Kein Einsatz geplant" (--to-text-2) / „Offene Einsätze ansehen" (--to-text-3),
rechts ein Chevron nach rechts. Führt auf die Vereins-Übersicht der Einsätze.
Gibt es diese Seite noch nicht, entfällt die dritte Zeile und der Chevron und die Zeile ist nicht klickbar –
dann bitte in der Rückmeldung vermerken.

## Bewusst nicht dabei
- „Tauschen" kommt später, jetzt NICHT einbauen.
- Anleitungen zu den Aufgaben gibt es noch nicht, also kein Link darauf.
- Ein eigener Einsatz am eigenen Spieltag kommt nicht vor, dafür ist kein Sonderfall nötig.

Zum Schluss: Screenshots bei 390px Breite für „zugeklappt", „aufgeklappt", „Einsatztag" und „kein Einsatz",
dazu eine kurze Liste, was du geändert hast und wo die App anders funktioniert als hier beschrieben.
