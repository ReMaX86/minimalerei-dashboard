App-Icon austauschen. Neue Dateien liegen in docs/design/tipoff-design/app-icon/
(ersetzen die bisherigen Icons in docs/design/tipoff-design/assets/).

Neues Standard-Icon: schwarzer Grund (#0A0C0F), Zeichen in Neongrün (#C8FF2E).
Grund: iOS dunkelt Home-Screen-Icons im Dunkelmodus automatisch ab. Beim bisherigen Icon
(grüner Grund, schwarzes Zeichen) wurde dadurch alles dunkel und das Zeichen war kaum sichtbar.

Bitte umsetzen:

1. Diese Dateien als App-Icons einbinden – ALLE ohne Transparenz, der schwarze Grund ist Teil des Bildes:
   - app-icon-dark-180.png          → <link rel="apple-touch-icon" sizes="180x180" href="...">
   - app-icon-dark-192.png          → Manifest, 192x192, "purpose": "any"
   - app-icon-dark-512.png          → Manifest, 512x512, "purpose": "any"
   - app-icon-dark-maskable-512.png → Manifest, 512x512, "purpose": "maskable"
   - app-icon-dark-1024.png         → Reserve für Stores/Marketing
   - favicon.svg + favicon-32.png   → Favicon
   - app-icon-volt-*.png / app-icon-volt.svg → Alternative (grüner Grund), NICHT einbinden, nur aufbewahren.

2. Alte Icon-Dateien aus dem Projekt entfernen bzw. ersetzen, damit keine alten Pfade mehr im
   Manifest oder im <head> stehen. Danach prüfen: kein Icon-Eintrag verweist noch auf eine Datei mit
   transparentem Hintergrund.

3. Im Manifest: "theme_color": "#0A0C0F" und "background_color": "#0A0C0F".

4. Achtung Caching: iOS merkt sich das Icon. Bitte den Dateinamen der Icons versionieren
   (z. B. ?v=2 oder Dateiname mit Hash), damit das neue Icon auch wirklich geladen wird.

Danach kurz melden, welche Dateien und Einträge du geändert hast.
