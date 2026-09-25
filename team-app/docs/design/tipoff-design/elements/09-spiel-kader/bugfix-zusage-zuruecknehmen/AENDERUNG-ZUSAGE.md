# Bugfix · Zusage lässt sich nicht mehr zurücknehmen

In der alten Ansicht gab es „Du hast zugesagt · **Doch nicht?**". Im neuen Design ist daraus ein
reines Etikett geworden: `✓ Zugesagt` sieht aus wie ein Knopf, macht aber nichts. Damit fehlt der
Weg zurück **komplett** – weder auf der Startseite noch unter „Spiele & Kader".

Vorlage: `zusage.html` (?state=card · sheet · off · late · row · rowoff)
Bilder: `1-zugesagt.png` · `2-absagen.png` · `3-abgesagt.png` · `4-kader-steht.png` ·
`5-kaderzeile.png` · `6-kaderzeile-abgesagt.png`

**An der Logik nichts ändern, außer an den hier beschriebenen Stellen. Ansonsten nachfragen.**
Die Funktion „absagen nach Zusage" hat es in der App schon gegeben – sie muss nur wieder
erreichbar werden und im neuen Design aussehen.

---

## 1 · Startseite: aus dem Etikett wird ein Knopf

**Ist:** `✓ Zugesagt` ist eine statische Fläche.

**Soll (1-zugesagt.png):** derselbe Chip, aber als **Knopf**, 46px hoch, mit dem Zusatz `ÄNDERN`
in Geist Mono 8px dahinter. Ein Tipp öffnet das Blatt aus Punkt 3.
Farben bleiben: volt getönt, --to-accent-frame, Text --to-accent.

Für die anderen beiden Zustände gilt dasselbe Muster:
- **Noch nicht geantwortet:** Umriss-Knopf „Noch nicht geantwortet", führt auf Zu-/Absage.
- **Abgesagt (3-abgesagt.png):** roter Chip `✗ Abgesagt` mit Zusatz `DOCH DABEI?`, öffnet das
  Blatt aus Punkt 4. Zusätzlich sitzt über der Trennlinie ein roter Hinweis: „**Du bist
  abgesagt.** Dein Trainer wurde informiert. Solange der Kader noch offen ist, kannst du jederzeit
  wieder zusagen." Der Kartenrahmen wechselt auf --to-danger-frame.

## 2 · Spiele & Kader: Änderungs-Zeile in der eigenen Zeile

**Ist:** die eigene Zeile sieht aus wie jede andere, ohne Möglichkeit zu ändern.

**Soll (5-kaderzeile.png):** **nur die eigene Zeile** bekommt darunter eine schmale Zeile mit
einem Knopf, 34px hoch, eingerückt auf Höhe des Namens:
- zugesagt → `✎ Zusage ändern` (Umriss, --to-text-2)
- abgesagt → `✓ Doch dabei` (volt umrandet), Statuszeile lautet dann
  `ABGESAGT · TRAINER INFORMIERT` in --to-danger-text, der Haken rechts wird grau
  (6-kaderzeile-abgesagt.png)
Die Zeilen aller anderen Spieler bleiben **unverändert**.

## 3 · Blatt „Doch nicht dabei?" (2-absagen.png)
- Titel „Doch nicht dabei?"
- Hinweis: „Dein Trainer bekommt sofort eine Meldung. Solange der Kader offen ist, kannst du
  danach wieder zusagen."
- **Freitextfeld** „Grund (optional) – z. B. krank, Arbeit, Verletzung". Der Grund geht mit der
  Meldung an den Trainer.
- Knöpfe: `Absagen und Trainer informieren` (rot gefüllt, Textfarbe #120507) und
  `Doch, ich bin dabei` (Umriss, schließt das Blatt).

## 4 · Sonderfall: Kader steht schon (4-kader-steht.png)
Wenn der Kader bereits veröffentlicht ist und der Spieler darin steht, bekommt dasselbe Blatt
zusätzlich einen gelben Hinweis (--to-vacation-frame):
„**Der Kader steht schon.** Dein Trainer muss jemanden nachnominieren – schreib kurz dazu, warum
es nicht klappt."
Abgesagt werden kann trotzdem – es wird nur nicht stillschweigend gemacht.

## 5 · Wieder zusagen
Eigenes Blatt: „Doch wieder dabei?" mit dem Satz „Du stehst danach wieder als zugesagt in der
Liste, dein Trainer wird informiert. Ob du im Kader landest, entscheidet weiterhin er."
Knopf `Wieder zusagen` (volt) und `Abbrechen`.

## 6 · Meldung an den Trainer
Bei jeder Absage **nach** einer Zusage geht eine Meldung an Trainer und Admins – wie bisher.
Enthalten: Name, Spiel, Zeitpunkt und der optionale Grund. Ob zusätzlich eine Push rausgeht,
richtet sich nach den Einstellungen unter „Funktionen".

---

## Rückfragen (bitte beantworten, nicht selbst entscheiden)
1. **Bis wann?** Kann bis zum Anpfiff abgesagt werden, oder gibt es eine Grenze (z. B. ab
   Treffpunkt nicht mehr)? Vorschlag: immer möglich, aber ab veröffentlichtem Kader mit dem
   gelben Hinweis aus Punkt 4.
2. **Kaderplatz:** Wenn jemand aus dem veröffentlichten Kader absagt – rutscht er automatisch
   raus, oder bleibt er drin, bis der Trainer reagiert? Vorschlag: er bleibt sichtbar, aber rot
   markiert, damit der Trainer es bemerkt und selbst tauscht.
3. **Ping-Pong:** Soll die Anzahl der Wechsel begrenzt oder protokolliert werden (dreimal hin und
   her am Spieltag)? Vorschlag: kein Limit, aber jeder Wechsel steht mit Zeitstempel im Verlauf
   des Spiels für den Trainer.
4. Gibt es dieselbe Rücknahme auch beim **Training**? Dort funktioniert sie laut Marc noch – bitte
   prüfen, ob beide Stellen dieselbe Komponente benutzen können, statt zwei Wege zu pflegen.

Zum Schluss: Screenshots von Startseite (zugesagt / abgesagt), dem Blatt und der eigenen Zeile in
„Spiele & Kader", dazu die Antwort, ob beide Stellen jetzt dieselbe Komponente verwenden.
