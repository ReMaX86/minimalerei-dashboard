Adminreiter „Meldungen" und den Meldungs-Block auf der Startseite neu gestalten.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/22-meldungen/

- meldungen.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  list · wichtig · dringend · published · edit · end · delete · ended · empty ·
  home · homeread · homeplain
- 1-reiter.png · 2-sorte-wichtig.png · 3-sorte-dringend.png · 4-veroeffentlicht.png ·
  5-bearbeiten.png · 6-beenden.png · 7-loeschen.png · 8-beendet-liste.png ·
  9-keine-meldung.png · 10-startseite.png · 11-startseite-bestaetigt.png ·
  12-startseite-ohne-meldung.png

## WICHTIG – Rahmen für diese Aufgabe
**An der Logik erstmal nichts ändern. Nur die neuen Designs übernehmen. Ansonsten nachfragen.**
Ausnahme sind die unter „NEU ZU BAUEN" ausdrücklich markierten Punkte – Ablaufdatum, Sorten,
Lesestatus, Bearbeiten und Push. Alles davon bitte erst umsetzen, wenn die zugehörigen Rückfragen
am Ende geklärt sind.

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten
Werte. Emojis fallen weg.

## 1 · Was sich ändert
Heute bleibt eine Meldung stehen, bis der Trainer sie löscht, und niemand sieht, ob sie jemand
gelesen hat. Neu:
- jede Meldung hat eine **Sorte**, und die Sorte bestimmt Aussehen, Laufzeit und Push,
- der Trainer sieht in der Liste, **wie viele gelesen haben**,
- der Spieler **bestätigt** eine Meldung mit dem Haken, danach ist sie für ihn weg,
- auf der Startseite wird der Block **„FÜR DICH" mit Volt-Kopf** hervorgehoben, solange eine
  Meldung offen ist.

## 2 · Die drei Sorten (NEU ZU BAUEN)
Ein Feld `kind` mit drei Werten. Die Sorte legt alles Weitere fest – es gibt **keine** zusätzliche
Laufzeit-Auswahl im Formular:

| Sorte | Laufzeit | Aussehen | Push |
|---|---|---|---|
| Hinweis | 7 Tage, oder früher, sobald alle gelesen haben | neutral, grauer Balken | wahlweise, Standard aus |
| Wichtig | 14 Tage oder bis der Trainer beendet – **nicht** automatisch, wenn alle gelesen haben | Volt-Balken, volt getönte Zeile | Standard an, abschaltbar |
| Dringend | bis der Trainer beendet | roter Balken, rot getönte Zeile | fest an, Schalter nicht bedienbar |

Der Erklärsatz unter dem Umschalter wechselt mit der Sorte – Texte siehe 1-reiter.png,
2-sorte-wichtig.png, 3-sorte-dringend.png.

## 3 · Formular „Neue Meldung"
Segmented Control (Hinweis / Wichtig / Dringend, bei „Dringend" ist der aktive Knopf rot mit
Textfarbe #120507), Erklärsatz, Textfeld, Push-Zeile, „Veröffentlichen".
- „Veröffentlichen" ist deaktiviert, solange kein Text drinsteht.
- Push-Zeile zeigt die echte Anzahl erreichbarer Spieler („Push an 12 Spieler") und darunter
  den Zustand: NUR IN DER APP / MITTEILUNG AUFS HANDY / BEI DRINGEND IMMER AN.
- Nach dem Veröffentlichen erscheint das Blatt aus 4-veroeffentlicht.png: Titel, Push-Bestätigung
  in Volt (oder grau, wenn ohne Push), der Sorten-Erklärsatz und „Fertig".

## 4 · Liste „Läuft gerade"
Eine kompakte Zeile pro Meldung: farbiger Balken links, Sorte, Restlaufzeit rechts
(LÄUFT IN 11 TAGEN AB / LÄUFT MORGEN AB / BIS DU SIE BEENDEST), Text, darunter der
**Lesefortschritt** als Balken plus „5 VON 12", dann die drei Knöpfe Bearbeiten · Beenden · Löschen.
Sortierung: Dringend, dann Wichtig, dann Hinweis, innerhalb der Sorte das Neueste zuerst.
Leerzustand siehe 9-keine-meldung.png.

**NEU ZU BAUEN:** der Lesestatus pro Spieler (wer hat welche Meldung bestätigt). „12" ist die Zahl
der aktiven Spieler – Trainer und Betrachter zählen nicht mit (siehe Rückfrage 3).

## 5 · Bearbeiten, Beenden, Löschen
- **Bearbeiten** (NEU) lädt die Meldung ins Formular oben: Überschrift wird „MELDUNG BEARBEITEN",
  der Knopf „Änderungen speichern", darunter „Bearbeiten abbrechen". Die betroffene Zeile in der
  Liste bekommt einen volt Rahmen und den Hinweis WIRD OBEN BEARBEITET (5-bearbeiten.png).
  Beim Bearbeiten geht **kein** neuer Push raus.
- **Beenden** (NEU) öffnet das Blatt aus 6-beenden.png. Die Meldung verschwindet sofort von allen
  Startseiten und rutscht in den Abschnitt „Beendet". Der Lesestatus bleibt erhalten.
- **Löschen** öffnet das Blatt aus 7-loeschen.png – roter Knopf „Endgültig löschen", Meldung und
  Lesestatus sind danach weg. Im Text steht ausdrücklich, dass „Beenden" zum Ausblenden reicht.

## 6 · Abschnitt „Beendet"
Zugeklappt mit Anzahl und Chevron, aufgeklappt siehe 8-beendet-liste.png: gedimmte Zeilen mit
Text, „BEENDET AM 18.09. · 12 VON 12 GELESEN" bzw. „ABGELAUFEN AM …" und nur noch „Löschen".
Automatisch abgelaufene Meldungen landen ebenfalls hier.

## 7 · Startseite – Block „FÜR DICH" mit Volt-Kopf
Das ist der neue Auftritt des Meldungs-Bereichs (10-startseite.png):
- Der Kopfbalken ist **voll Volt gefüllt** (#C8FF2E) mit dunkler Schrift, Glocken-Icon, „FÜR DICH"
  und rechts einem dunklen Zähler mit volt Zahl. Der Panel-Rahmen ist --to-accent-frame.
- **Regel:** Der Volt-Kopf erscheint nur, solange mindestens eine Meldung offen ist. Ist keine
  Meldung offen, bleibt derselbe Block mit normalem dunklem Kopf stehen (12-startseite-ohne-meldung.png).
- Der Zähler zählt **alle offenen Punkte** im Block, also Meldungen und offene Aufgaben zusammen.
- Reihenfolge im Block: Meldungen zuerst (Dringend → Wichtig → Hinweis), danach offene Aufgaben
  wie die Trainings-Zu-/Absage.
- Meldungszeilen: Punkt in der Sortenfarbe, Sorten-Label, Text halbfett, darunter Verfasser und
  Zeit, rechts der Haken-Knopf (volt bzw. rot gerahmt). Aufgabenzeilen bleiben wie heute mit Pfeil.
- Ein Tipp auf den Haken blendet die Meldung **nur für diesen Spieler** aus und zählt sie beim
  Trainer als gelesen (11-startseite-bestaetigt.png). Der Zähler geht um eins runter.

## 8 · Zugriff
Der Reiter ist **nur für Trainer und Admins** sichtbar. Captain und Co-Captain kommen nicht hinein –
bitte so lassen und prüfen, dass die Sichtbarkeit wirklich an der Trainer-/Admin-Rolle hängt.

## 9 · Push (NEU ZU BAUEN)
Der Schalter gehört ins Design und soll funktionieren: beim Veröffentlichen geht eine Mitteilung an
alle aktiven Spieler, bei „Dringend" immer. Wenn die dafür nötige Infrastruktur (Service Worker,
VAPID-Schlüssel, Tabelle für die Push-Abos, Versand über eine Edge Function) noch nicht steht,
bitte **nicht raten**: melden, was gebraucht wird, und den Schalter bis dahin im Design lassen,
aber sichtbar ohne Funktion.

## Rückfragen (bitte beantworten, nicht selbst entscheiden)
1. **Ablauf:** Reicht es, das Ablaufdatum (`expires_at`) beim Laden zu filtern, oder soll ein
   geplanter Job die Meldungen aktiv beenden? Vorschlag: nur filtern, kein Job.
2. **Bearbeiten und Lesestatus:** Soll eine bearbeitete Meldung bei allen wieder auftauchen
   (Lesestatus zurücksetzen) oder bestätigt bleiben? Vorschlag: bestätigt bleiben, weil Bearbeiten
   meist ein Tippfehler ist. Falls beides gebraucht wird, bitte melden.
3. **Wer zählt zu „alle"?** Für „12 VON 12" und für das vorzeitige Ausblenden eines Hinweises:
   nur aktive Spieler, oder auch Trainer und Betrachter? Bitte im Code prüfen, was dort vorhanden
   ist, und die Zahl entsprechend definieren.
4. **Lesestatus-Speicherung:** Gibt es schon eine Tabelle für „Spieler hat X gesehen"? Falls nicht,
   bitte vorschlagen, wie sie aussehen soll, bevor du sie anlegst.
5. **Archiv für Spieler:** Soll ein Spieler eine bestätigte Meldung irgendwo nachlesen können
   (z. B. unter Teaminformationen), oder ist sie endgültig weg? Vorschlag: endgültig weg.
6. **Dringend:** Die Sorte ist neu. Falls im Code schon ein Feld für „wichtig" existiert, bitte
   melden, wie du es auf die drei Sorten erweiterst, statt es zu ersetzen.

Zum Schluss: Screenshots bei 390px Breite für den Reiter, die Startseite mit und ohne Meldung und
das Bearbeiten, dazu eine kurze Liste, was du geändert hast, was du neu gebaut hast und welche
Rückfragen offen sind.
