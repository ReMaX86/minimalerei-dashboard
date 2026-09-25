Adminbereich, Reiter „Kampfgericht" neu gestalten.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/18-admin-kampfgericht/

- admin-kampfgericht.html → Referenz-Umsetzung, anklickbar. Zustände über ?state=…
  list · before · done · past · detail · settings · edit · new · assign
- 1-zuteilen.png · 2-vor-der-frist.png · 3-alles-zugeteilt.png · 4-vergangene.png · 5-detail.png ·
  6-einstellungen.png · 7-bearbeiten.png · 8-neuer-termin.png · 9-blatt-wer-uebernimmt.png

## WICHTIG – Rahmen für diese Aufgabe
**An der Logik erstmal nichts ändern. Nur die neuen Designs übernehmen. Ansonsten nachfragen.**
Meldefrist, Jahrgänge, Termine, Zuteilung und Rechte funktionieren weiter wie heute. Zwei Dinge sind
neu und ausdrücklich gewollt: das **Bearbeiten** eines Termins (Abschnitt 6) und die **Zuteil-Liste**
oben (Abschnitt 3). Alles andere, was die Vorlage zeigt und im Code anders läuft: **nachfragen**,
nicht selbst umbauen, und am Ende auflisten.

Pixelgenau an der Vorlage orientieren, Werte über unsere Tokens (tokens.css), keine neuen harten Werte.
Vorher den bestehenden Code lesen: Meldefrist, Teams, Termine, Aufgaben-Auswahl, Zuteilung.
Emojis fallen weg.

## 1 · Einheitliche Wortwahl
Eine Position, die ein anderer Verein stellt, heißt ab jetzt überall **„anderes Team"** –
nicht mehr „nicht unsere Aufgabe". Genauso im Spieler-Reiter (Element 14). Diese Zeilen sind
**gedimmt und nicht antippbar**; heute sind sie als rote Pille genauso auffällig wie ein echtes
Problem, obwohl es gar keine Aufgabe ist.

## 2 · Aufbau der Seite
1. Meldungsblock zur Meldefrist
2. Offene Positionen zum Zuteilen (nur nach der Frist)
3. Zeile „Einstellungen"
4. „Termine" mit „+ Neu"
5. „Vergangene Termine", aufklappbar, **Standard eingeklappt**

## 3 · Meldungsblock und Zuteilen (1-zuteilen.png)
Der Block richtet sich nach dem Stand der globalen Meldefrist:
- **Vor der Frist** (2-vor-der-frist.png): neutraler Block, --to-surface/--to-border, Mono-Zeile
  „MELDEFRIST LÄUFT BIS 10.10.", rechts die Zahl der offenen Positionen, darunter
  „… Bis zur Frist tragen sich die Spieler selbst ein." **Keine Zuteil-Liste.**
- **Nach der Frist, noch offen**: roter Block (--to-danger-soft/--to-danger-frame),
  „MELDEFRIST ABGELAUFEN · 10.10.", Zahl in --to-danger-text, Text „Die Spieler können sich nicht
  mehr selbst eintragen. 3 Positionen musst du noch zuteilen." (Singular beachten.)
  Darunter **jede offene Position einzeln, terminübergreifend**: Datumsblock, Rolle, darunter Mono
  „Team · Uhrzeit · Gegner", rechts der volte Knopf „Zuteilen".
- **Nach der Frist, nichts offen** (3-alles-zugeteilt.png): volter Block mit Haken,
  „Alles zugeteilt" und Mono „MELDEFRIST ABGELAUFEN · 10.10."
- **Keine Frist gesetzt**: neutraler Block „KEINE MELDEFRIST GESETZT · Die Spieler können sich
  jederzeit selbst eintragen und wieder abwählen." Keine Zuteil-Liste.

## 4 · Blatt „Wer übernimmt?" (9-blatt-wer-uebernimmt.png)
Öffnet sich über „Zuteilen" und über die Chips auf der Detailseite.
- Titel „Wer übernimmt?", Mono-Unterzeile „ROLLE · TEAM · DATUM",
  darunter grau: „Sortiert nach den wenigsten Einsätzen in dieser Saison."
- Liste **aller Spieler, sortiert nach Einsätzen aufsteigend, bei Gleichstand alphabetisch** –
  dieselbe Zahl wie im Abschnitt „Einsätze pro Spieler" im Kampfgericht-Reiter (Element 14).
  Je Zeile Avatar mit Initialen, Name, rechts die Zähler-Pille. **0× ist volt getönt**, alles andere
  grau – so sieht man sofort, wer noch nie dran war.
- Der eingeloggte Trainer steht als „Du (Marc Rewald)" **an seiner regulären Stelle in der
  Sortierung**, nicht oben – man soll bewusst den nehmen, der wenig hatte.
- Darunter „Offen lassen" (Umriss) und „Abbrechen" (Textknopf). Tippen auf den Hintergrund schließt.
- Falls es für die Zuteilung durch den Trainer heute schon eine Benachrichtigung gibt, bleibt sie;
  bauen sollst du keine neue.

## 5 · Termine und Detailseite (5-detail.png)
Liste: Datumsblock, Team, Mono „Uhrzeit · Gegner", rechts Status-Pille „KOMPLETT" (volt) oder
„1 OFFEN"/„2 OFFEN" (rot). Der **nächste Termin** ist leicht volt hinterlegt.

Detailseite: Kopf mit Team, Mono-Zeile und Status-Pille. Darunter „ZUTEILUNG" mit den drei
Rollenzeilen und je einem Chip:
| Fall | Chip |
|---|---|
| besetzt | Name, --to-surface-2, mit kleinem Chevron |
| offen | „offen", Umriss --to-danger-frame, Text --to-danger-text |
| anderes Team | nur Text --to-text-4, kein Rahmen, **nicht antippbar** |
Darunter die Hinweiszeile, je nach Frist-Stand („Nach der Meldefrist kannst nur noch du oder die
Kapitäne zuteilen …"). Zum Schluss „Termin bearbeiten" und „Termin löschen" (rot).

## 6 · Termin bearbeiten – NEU (7-bearbeiten.png, 8-neuer-termin.png)
Bisher kann man einen Termin nur löschen und neu anlegen. Es gibt jetzt dieselbe Maske auch zum
**Bearbeiten**, mit genau den Feldern von heute:
Datum und Uhrzeit nebeneinander, Team (Auswahl aus den Jahrgängen), Gegner (optional),
Halle/Adresse, und darunter **„WELCHE AUFGABEN MÜSSEN WIR STELLEN?"** als drei Häkchenzeilen
(24-Sek.-Uhr · Anschreiben · Zeit & Punkte) statt der drei kleinen Checkboxen nebeneinander.
Hinweis darunter: „Nicht angehakt heißt: Diese Position stellt ein anderes Team – sie erscheint bei
uns als ‚anderes Team' und ist nicht zuteilbar."
Unten „Speichern" (volt) und „Abbrechen"; beim Anlegen heißt die Seite „Neuer Termin".
**Rückfrage:** Was passiert mit einer bereits zugeteilten Person, wenn man ihre Aufgabe nachträglich
abwählt? Bitte im Code nachsehen und melden – nicht selbst entscheiden.

## 7 · Einstellungen (6-einstellungen.png)
Aus den zwei Blöcken oben auf der Seite wird eine **eigene Unterseite**, erreichbar über eine schmale
Zeile „Einstellungen · MELDEFRIST 10.10. · 7 TEAMS". Das stellt man einmal pro Saison ein und muss
es nicht bei jedem Öffnen sehen.
- **Meldefrist:** Der Erklärtext wird von fünf Zeilen auf zwei gekürzt: „Bis dahin tragen sich die
  Spieler selbst ein. Danach sind die Zuteilungen fix – ändern kannst nur noch du oder die Kapitäne."
  Datumsfeld, „Speichern", darunter „Leer lassen = keine Frist …" und ein Knopf „Frist löschen".
- **Jahrgänge / Teams:** Eingabefeld plus „Hinzufügen", darunter die Liste. Je Zeile der Name,
  daneben in Mono **die Zahl der Termine, die daran hängen** („5 TERMINE"), und ein Papierkorb
  statt des roten Worts „Löschen".
  **Rückfrage:** Was passiert heute beim Löschen eines Teams, an dem noch Termine hängen? Das ist
  ungeklärt. Bitte im Code nachsehen und berichten; wenn die Termine mitgelöscht würden, brauchen
  wir vorher eine Rückfrage, die die Zahl nennt – erst abstimmen, dann bauen.

## 8 · Vergangene Termine
Aufklappbar, **Standard eingeklappt**, gleiche Zeilenstruktur, Team in --to-text-2, Pille „KOMPLETT"
grau ohne Punkt. Keine Aktionen.

Zum Schluss: Screenshots bei 390px Breite für die Hauptansicht nach der Frist, das Blatt
„Wer übernimmt?", die Einstellungen und das Bearbeiten-Formular, dazu eine kurze Liste, was du
geändert hast, wo die App anders funktioniert als hier beschrieben und welche Punkte du nachfragen
musst (mindestens die beiden oben markierten).
