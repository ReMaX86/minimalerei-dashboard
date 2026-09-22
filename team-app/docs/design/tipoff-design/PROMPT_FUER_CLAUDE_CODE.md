# Prompt für Claude Code

Den Ordner `tipoff-design/` ins Repo der App kopieren (z. B. nach `docs/design/tipoff-design/`), Claude Code im Projekt starten und diesen Text einfügen:

---

Ich möchte das Design unserer App TipOff komplett überarbeiten. Die neue Design-Spezifikation liegt in `docs/design/tipoff-design/`:

- `DESIGN.md` – verbindliche Spezifikation (Farben, Schrift, Komponenten, Screens, fachliche Abweichungen)
- `tokens.css` – alle Design-Tokens als CSS-Variablen
- `assets/` – Logo, App-Icon, Favicon, PWA-Icons
- `reference-screens/*.dc.html` – Mockups der Screens (nur als optische Referenz, Template-Syntax ignorieren)

Vorgehen:
1. Lies zuerst `DESIGN.md` komplett und schau dir die Referenz-Screens an. Verschaff dir dann einen Überblick über die bestehende App (Stack, Styling-Ansatz, Komponenten, Routen).
2. Schreib mir einen kurzen Plan: wie du die Tokens einbindest (passend zu unserem Styling, z. B. als CSS-Variablen/Tailwind-Theme), welche gemeinsamen Komponenten du anlegst oder umbaust und in welcher Reihenfolge du die Screens umstellst. Warte auf mein OK.
3. Setz danach um, in dieser Reihenfolge: Tokens + Fonts + Icons/Manifest → Basis-Komponenten (Button, Karte, Listenzeile, Badge, Fortschritts-Segmente, Tab-Leiste) → Login/Zugangscode → Spielübersicht → Kader + Trainer-Modus → restliche Screens.
4. **Funktionen und Datenlogik nicht verändern** – nur Darstellung. Wo Mockup und App fachlich abweichen, gilt die App (siehe Abschnitt 7 in `DESIGN.md`).
5. Alle Farben, Radien, Abstände und Schriften ausschließlich über die Tokens – keine hart codierten Werte in Screens, damit wir später einzelne Elemente leicht nachjustieren können.
6. Nach jedem Schritt: kurz zusammenfassen, was sich geändert hat, und prüfen, dass die App baut und auf 390 px Breite ohne horizontales Scrollen läuft.
