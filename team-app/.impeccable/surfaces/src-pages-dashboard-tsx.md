---
version: 1
slug: "src-pages-dashboard-tsx"
primary_target: "src/pages/Dashboard.tsx"
related_targets: ["src/pages/GameStatsTracker.tsx","src/pages/Spiele.tsx","src/pages/Trikots.tsx","src/pages/Kampfgericht.tsx","src/pages/Onboarding.tsx"]
---

## Direction contract

THESIS: Die App liest sich wie eine echte Hallenanzeige, nicht wie eine weitere generische
Team-Verwaltungs-App mit runden Pastell-Karten und weichen Schatten. Sie verweigert das
Standard-Sport-App-Schema (bunte abgerundete Kacheln, Stock-Athleten-Gradient-Hero,
Ampel-Farben ohne Charakter) und ersetzt es durch die Sprache einer echten Anzeigetafel:
große tabellarische Ziffern, dunkle "Arena"-Flächen für alles Live/Wichtige, restraintvolle
helle "Papier"-Flächen für dichte Datenlisten.

OWN-WORLD: Zwei komplementäre Flächen, ein Akzent. `arena` (sehr dunkles Blau-Schwarz, kein
reines Schwarz) trägt Nav, Live-Ticker, Score-Header, Login/Onboarding — hier lebt der
Scoreboard-Charakter. `paper` (warmes Off-White, kein kaltes Grau/Weiß) trägt dichte
Datenlisten und Formulare (Box-Score, Liga-Tabelle, Admin). Ein Akzent, `led` (warmes,
gesättigtes Bernstein/Orange — echte LED-Anzeigetafel-Farbe, kein SaaS-Blau/Grün), trägt Live-
Zustände, primäre Aktionen, Score-Betonung; 30-60% Flächenanteil auf den Arena-Screens
(Committed-Strategie), zurückhaltender Akzent-Einsatz auf den Paper-Screens. Alle Zahlen
(Punktstände, Statistiken, Trikot-Nummern) durchgehend tabellarisch/monospaced gesetzt statt
proportional. Komponenten eckiger/technischer statt Pill-Buttons und weiche
Schatten-Karten — feine Trennlinien und klare Kanten statt Drop-Shadows. Status-Anzeigen als
LED-Punkt + Label statt weicher Badge-Chip. Anton (bereits im Projekt) bleibt die
Display-Schrift, aber konsequent für Ziffern/große Score-Momente eingesetzt statt nur für
Überschriften; Inter bleibt Fließtext/UI.

STORY: Wer die App öffnet, erkennt sofort "das ist eine ernsthafte, professionelle
Sport-Werkzeug-App", nicht "das ist irgendeine bunte Vereins-App". Ein Spieler sieht auf einen
Blick den Live-Spielstand wie an der echten Hallenanzeige. Ein Trainer erkennt beim
Live-Tracking sofort, dass er ein professionelles Werkzeug bedient, kein Spielzeug.

FIRST VIEWPORT (Dashboard/Start): Oben eine dunkle Arena-Kopfzeile über volle Breite — bei
laufendem Spiel der Live-Ticker im echten Scoreboard-Look (große tabellarische Ziffern,
Team-Kürzel-Labels, pulsierender LED-Punkt bei "LIVE"), sonst die Nächstes-Spiel-Information im
selben dunklen Panel. Darunter auf warmem Paper-Grund die funktionalen Zeilen (Trikot-Status,
nächstes Kampfgericht, Training) als klare horizontale Listen-Einträge mit dünnen
Trennlinien statt bunter Kacheln — Information vor Dekoration. Primäre Aktionen als
kantige, satte led-farbene oder dunkle Arena-Buttons, nie als weiche Pastell-Chips.

FORM: Eigene, ehrlich geordnete Kandidatenliste (7 Systeme aus Basketball-/Vereinskultur,
mind. 3 Materialfamilien: Papier/Formular, physisches Objekt/Signage, Trikot-Typografie,
Broadcast-Grafik, Court-Notation). Zugewiesener Index laut Losentscheid (Seed-Key fe70416c,
degraded/kein Netzwerkzugriff zum Roll-Service): Kandidat 3 ("Amtliches Protokoll" /
Spielberichtsbogen). Der Nutzer hat stattdessen explizit Kandidat 1 gewählt (Hallenanzeige/
Scoreboard, als "IMPECCABLE'S PICK" mit Ehrlichkeits-Risikohinweis präsentiert) — eine
nutzer-gepinnte Entscheidung schlägt laut Regelwerk immer den Losentscheid.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review,
the verdict, DESIGN.md, and every shipping raster carrying its provenance.
