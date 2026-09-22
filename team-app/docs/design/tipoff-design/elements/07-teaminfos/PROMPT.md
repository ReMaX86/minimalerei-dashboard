Abschnitt „Team" auf der Startseite neu bauen – ein Board mit vier Abschnitten.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/07-teaminfos/

- teaminfos.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  coach · player · absentopen · noduty · nobody · nokit
- 1-trainer-captain.png · 2-spieler.png · 3-kommende-abwesenheiten.png ·
  4-kein-einsatz.png · 5-niemand-abwesend.png · 6-trikot-ohne-halter.png

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Kampfgericht-Einteilung, Abwesenheiten, Trikot-Reiter, Team-Einstellungen,
Rollen (Trainer, Captain).
Das ersetzt den bisherigen Block „TEAMINFORMATIONEN" mit den vier weißen Karten und den Emojis.
Keine neuen Daten, keine neue Logik – dieser Abschnitt zeigt nur an.

## Platzierung
Ganz unten auf der Startseite, unter allen persönlichen Karten.
Darüber ein Abschnittskopf: „Team" (Archivo expanded italic 20px), daneben eine Haarlinie über die
Restbreite und rechts der Teamname in Mono 10px (--to-text-4).
Darunter EIN Board (Radius 24, --to-surface, Rand --to-border), in dem die vier Abschnitte
durch 1 px Haarlinien (#1F242C) getrennt sind. Jeder Abschnitt hat 18px/20px Innenabstand
und beginnt mit einem Mono-Label.

Reihenfolge: Kampfgericht → Abwesend → Trikotsätze → Trainingszeiten.

## Sichtbarkeit
- Kampfgericht und Abwesend sehen NUR Trainer und Captains (beide Rollen gibt es schon).
  Beide tragen rechts im Kopf die Pille mit Schloss-Symbol „TRAINER & CAPTAINS".
- Trikotsätze und Trainingszeiten sehen alle.
- Für Spieler beginnt das Board also mit den Trikotsätzen (siehe 2-spieler.png); der Abschnittskopf
  „Team" bleibt stehen.

## 1 · Kampfgericht
Gezeigt wird der nächste Termin, bei dem MINDESTENS EIN Spieler unseres Teams eine Rolle übernimmt –
egal welche. Nur dieser eine Termin, auch wenn am selben Tag mehrere anstehen.

- Zeile 1: Datum und Uhrzeit, 16px/600: „Fr 25.09. · 20:00 Uhr"
- Zeile 2: Begegnung und Halle in 13px (--to-text-3): „TBW Herren 1 · Goethestraße"
- darunter für JEDE Rolle, die unser Team besetzt, eine Pille: Mono-Kürzel der Rolle (ANSCHR. · 24 SEK. ·
  ZEIT) und der Name in 13px/600. Rollen, die ein anderes Team stellt, tauchen nicht auf.
  Eine unserer Rollen ohne Namen: Pille ohne Füllung, Rand #3A414C, Text „Offen" in --to-text-3.
- Kein Termin in Sicht: statt allem die Zeile „Kein Einsatz für das Team geplant." (--to-text-3).

## 2 · Abwesend
- Oben die AKTUELL laufenden Abwesenheiten: goldener Punkt, Name, rechts der Zeitraum in Mono 12px.
- Niemand aktuell abwesend: „Aktuell ist niemand abwesend." (--to-text-3).
- Darunter die Zeile „{n} kommende anzeigen" (aria-expanded, Chevron dreht sich). Aufgeklappt erscheint
  das Mono-Label „KOMMEND" und darunter ALLE künftigen Abwesenheiten – ohne Begrenzung auf Wochen,
  sortiert nach Startdatum. Deren Punkt ist grau (#3A414C), der Name in --to-text-2.
  Gibt es keine künftigen, entfällt die Zeile ersatzlos.
- Zeitraum immer als „14.09. – 14.10." (ohne Jahr, auch bei Jahreswechsel).

## 3 · Trikotsätze
Reine Anzeige aus der bestehenden Trikot-Logik – hier wird nichts übergeben oder geändert.
Pro Satz eine Zeile: 22×22-Farbfeld (schwarz #0A0C0F mit Rand #3A414C, weiß #F2F4F7),
Mono-Label (AUSWÄRTS / HEIM) in fester Breite, rechtsbündig der Name des aktuellen Halters.
Niemandem zugeordnet: „Nicht zugeordnet" in --to-text-3.
Darunter die Zeile „Trikots verwalten" mit Chevron – führt auf den bestehenden Trikot-Reiter.
Sollte es mehr als zwei Sätze geben, einfach weitere Zeilen im selben Muster.

## 4 · Trainingszeiten
Reine Info aus den Admin-Einstellungen, hier NICHT änderbar, kein Link.
Pro Termin eine Zeile: Wochentag 15px/600 (feste Breite 70px), Zeitraum in Mono mit tabular-nums,
rechts der Ort in 13px (--to-text-3). Reihenfolge wie im Admin gepflegt.
Nichts hinterlegt: „Noch keine Zeiten hinterlegt." (--to-text-3).

Zum Schluss: Screenshots bei 390px Breite für die Trainer-Ansicht, die Spieler-Ansicht und die
aufgeklappten kommenden Abwesenheiten, dazu eine kurze Liste, was du geändert hast und wo die App
anders funktioniert als hier beschrieben.
