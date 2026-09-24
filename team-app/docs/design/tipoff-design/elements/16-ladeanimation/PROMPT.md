Ladeanimation „Dribbling" einbauen – ersetzt das kleine Logo, das beim Wechsel zwischen den
Menüpunkten kurz erscheint.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/16-ladeanimation/

- ladeanimation.html → Referenz-Umsetzung, läuft live. Zustände über ?state=…
  page · card · inline · sizes · delay
- 1-reiterwechsel.png · 2-karte-laedt.png · 3-zeile-und-knopf.png · 4-groessen.png · dribbling.gif

## WICHTIG – Rahmen für diese Aufgabe
**An der Logik erstmal nichts ändern. Nur das neue Design übernehmen. Ansonsten nachfragen.**
Es geht darum, das bestehende Lade-Symbol gegen diesen Baustein zu tauschen – nicht darum, zu ändern,
*wann* geladen wird oder wie Daten geholt werden. Die einzige Verhaltensregel, die neu dazukommt, ist
die 200-ms-Verzögerung unten; wenn es dafür im Code schon eine Lösung gibt, die behalten und nur den
optischen Teil tauschen.

Reines SVG + CSS. Keine Bibliothek, kein Lottie, keine GIF- oder Videodatei – das GIF im Ordner ist
nur zum Anschauen. Farben über unsere Tokens (tokens.css).

## 1 · Der Baustein
Ein einziges Element, das überall eingehängt wird. In der Referenz heißt es `.tipoff-loader`.
Das Markup (identisch in jeder Größe):

```html
<span class="tipoff-loader tipoff-loader--page" role="status" aria-live="polite" aria-label="Lädt">
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <ellipse class="tl-shadow" cx="50" cy="86" rx="20" ry="5"></ellipse>
    <g class="tl-move"><g class="tl-squash"><g class="tl-spin">
      <circle class="tl-ball" cx="50" cy="40" r="19"></circle>
      <path class="tl-seam" d="M31 40h38"></path>
      <path class="tl-seam" d="M50 21v38"></path>
      <path class="tl-seam tl-curve" d="M37 27c7 8 7 18 0 26"></path>
      <path class="tl-seam tl-curve" d="M63 27c-7 8-7 18 0 26"></path>
    </g></g></g>
  </svg>
</span>
```

Das CSS steht in der Referenz zwischen den Kommentaren „DIE LADEANIMATION" und „Ende des Bausteins" –
bitte von dort übernehmen, nicht nachbauen. Kurz, worauf es ankommt:

- **Drei verschachtelte Gruppen, drei Aufgaben.** `tl-move` springt (620 ms, `alternate`, also
  1240 ms pro Runde), `tl-squash` staucht den Ball **nur im Aufprall** auf 1,14 × 0,86,
  `tl-spin` dreht ihn einmal pro Runde. Ohne die Stauchung wirkt es tot, ohne die Drehung wie
  eine Scheibe.
- **Der Schatten** ist eine Ellipse, die mit demselben Takt zwischen 0,62 und 1,0 skaliert und
  zwischen 8 % und 20 % Deckkraft läuft. Das erzeugt die Höhe.
- **Achtung SVG:** In SVG überschreibt eine CSS-`transform`-Eigenschaft das `transform`-**Attribut**
  desselben Elements. Grundpositionen deshalb immer in eine eigene, nicht animierte Gruppe legen.
- `transform-origin` ist in Nutzerkoordinaten gesetzt (`50px 62px` bzw. `50px 40px`) – das muss so
  bleiben, sonst wandert der Ball beim Stauchen.

## 2 · Genau drei Größen
| Klasse | Größe | Wo |
|---|---|---|
| `--page` | 64 px | Mitte des Inhaltsbereichs beim Reiterwechsel |
| `--card` | 40 px | Eine einzelne Karte lädt nach |
| `--inline` | 22 px | Zeile, Überschrift, Knopf |

Andere Größen nicht erfinden. Bei 22 px werden die beiden gebogenen Nähte (`tl-curve`) ausgeblendet
und die verbleibenden auf 4,4 verstärkt, sonst wird der Ball zu Matsch; der Schatten entfällt dort.
Dauer und relative Sprunghöhe bleiben in allen Größen gleich, damit es überall gleich schnell wirkt.

## 3 · Wo die Animation erscheint
- **Reiterwechsel (1-reiterwechsel.png):** 64er-Ausgabe mittig im Inhaltsbereich, zwischen Kopf und
  Menüleiste. Kopfzeile und Menüleiste bleiben stehen – nur der Inhalt wird ersetzt. Darunter optional
  die Mono-Zeile „LÄDT" in --to-text-4; bei kleinen Bereichen weglassen.
- **Einzelne Karte (2-karte-laedt.png):** Lädt nur ein Teil nach, bleibt der Rest stehen. Entweder die
  40er-Ausgabe im leeren Kartenkörper oder die 22er neben der Überschrift, zusammen mit grauen
  Platzhalterbalken (--to-surface-2, Höhe 11, Radius 6).
- **Zeile und Knopf (3-zeile-und-knopf.png):** 22er vor dem Text. **Im Knopf ersetzt die Animation nie
  die Beschriftung**, sie steht davor; der Knopf behält seine Breite und wird nur gedämpft
  (--to-accent-soft auf --to-accent), damit die Seite nicht springt.

## 4 · Die 200-ms-Regel (zum Ausprobieren: ?state=delay)
- Die Animation wird **erst nach 200 ms** eingeblendet. Ist der Wechsel schneller, sieht man gar
  nichts – das ist ruhiger als ein Aufblitzen.
- Ist sie einmal sichtbar, bleibt sie **mindestens 400 ms** stehen, auch wenn die Daten früher da
  sind. Sonst zuckt sie.
- Beides gehört in den Baustein bzw. in einen kleinen Hook, nicht an jede Aufrufstelle einzeln.

## 5 · Barrierefreiheit
- Das äußere Element trägt `role="status"`, `aria-live="polite"` und `aria-label="Lädt"`.
  Steht daneben ohnehin ein Text („Wird gespeichert"), bekommt der Loader stattdessen
  `aria-hidden="true"`, damit es nicht doppelt vorgelesen wird.
- `@media (prefers-reduced-motion: reduce)`: Sprung, Stauchung und Drehung aus; stattdessen pulsiert
  der ruhende Ball langsam in der Deckkraft (1600 ms). Nicht einfach alles abschalten – sonst steht da
  ein totes Symbol.

## 6 · Aufräumen
Das bisherige kleine Logo als Ladesymbol fällt überall weg. Bitte im Code danach suchen (auch
Spinner aus Fremdkomponenten) und durch diesen Baustein ersetzen, damit es nur noch eine
Ladeanzeige in der App gibt.

Zum Schluss: kurze Liste, an welchen Stellen du das alte Ladesymbol ersetzt hast, wo du eine der drei
Größen gewählt hast und ob es Stellen gab, an denen die 200-ms-Regel nicht sauber unterzubringen war.
