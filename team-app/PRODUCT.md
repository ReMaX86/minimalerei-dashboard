# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mitglieder der Herrenmannschaft von TB Wülfrath (Basketball, deutscher Amateurverein) in drei
Rollen:
- **Trainer** — verwalten Kader, Trikot-Rotation, Kampfgericht-Einteilung, Training, Live-Stats
  während echter Spiele, Admin-Funktionen. Loggen sich per E-Mail/Passwort ein.
- **Spieler** — sehen/bestätigen Kader-Nominierung, Trikot-Übernahme, Kampfgericht-Einsätze,
  Trainings-Zusagen; können selbst live mittracken. Login per kurzem Zugangscode (kein Passwort).
- **Betrachter** (z. B. Abteilungsleiter) — rein lesender Zugriff auf Spielplan/Kampfgericht, kein
  Kader-/Trikot-Zugriff. Gleicher Zugangscode-Login wie Spieler, eigene Rolle.

Genutzt auf dem Handy (überwiegend iPhones), sowohl im Alltag (Zu-/Absagen, Nachrichten lesen) als
auch courtside während echter Spiele (Live-Stats-Tracking). Bereits täglich im produktiven Einsatz
bei einer realen Mannschaft — kein Prototyp.

## Product Purpose

Zentrale App, die die komplette organisatorische Vereinsarbeit einer Amateur-Basketballmannschaft
bündelt, die vorher über WhatsApp, Zuruf und Gedächtnis lief: wer spielt mit, wer wäscht die
Trikots, wer sitzt beim Kampfgericht, wer kommt zum Training, wie steht das Spiel gerade. Erfolg
bedeutet: die Mannschaft nutzt die App tatsächlich anstelle der alten Ad-hoc-Kommunikation, ohne
dass jemand technisch versiert sein muss.

## Positioning

Keine generische "Team-Management-App von der Stange", sondern exakt auf die real beobachteten
Abläufe dieser einen Mannschaft zugeschnitten — z. B. Trikot-Rotation nach Wasch-Anzahl statt
starrem Turnus, Kampfgericht-Selbstverwaltung mit Meldefrist, Live-Box-Score courtside während des
Spiels mit +/- -Statistik. Wird iterativ mit echtem Nutzerfeedback aus dem laufenden Betrieb
weiterentwickelt statt aus einer Spezifikation im Voraus gebaut.

## Operating Context

- Läuft als PWA (kein nativer App-Store-Eintrag — bewusst zurückgestellt, siehe unten) auf
  Vercel (Hobby-Tarif) + Supabase (Free-Tier).
- Live-Stats-Tracking passiert während echter Spiele in der Halle — schnelle,
  Daumen-bedienbare Eingabe unter Zeitdruck muss zuverlässig funktionieren, nicht nur in Ruhe am
  Schreibtisch.
- Web-Push-Benachrichtigungen für Live-Ticker, Erinnerungen und Kader-Ereignisse.
- Sprache durchgängig Deutsch.

## Capabilities and Constraints

- **Muss dauerhaft komplett kostenlos betreibbar bleiben** — harte Vorgabe, unabhängig vom
  Funktionsumfang (Vercel Hobby + Supabase Free-Tier, keine kostenpflichtigen Zusatzdienste).
- **Bereits produktiv im täglichen Einsatz** — Änderungen dürfen laufenden Betrieb nicht brechen;
  eine getrennte Staging-Umgebung existiert inzwischen zum Testen vor dem Go-Live.
- **Mandantenfähigkeit ist beschlossene, aber noch nicht gebaute Zukunft**: aus einem
  Einzelteam-Produkt soll perspektivisch "ein Verein verwaltet mehrere Teams" werden (z. B.
  Herren/U18/U16 unter einem Vereins-Account). Dieses Redesign soll Layout/Komponenten so anlegen,
  dass diese Erweiterung später ohne kompletten visuellen Neu-Umbau möglich ist — ohne die
  Mandantenfähigkeit selbst schon zu bauen.
- **App-Store-Vertrieb (iOS/Android) ist ein späteres, bewusst zurückgestelltes Ziel** — erst nach
  Mandantenfähigkeit und dieser Design-Überarbeitung relevant, nicht Teil des aktuellen Scopes.
- Zugangscode-Login für Spieler/Betrachter (kein Passwort) ist ein bewusstes, beizubehaltendes
  Produktmerkmal, kein technisches Provisorium.

## Brand Commitments

- Name/Identität: TB Wülfrath (Herrenmannschaft).
- Ein Vereinslogo/-wappen existiert und soll eingebaut werden (wird vom Nutzer bereitgestellt).
- **Keine verbindliche Farbvorgabe** — die im Code aktuell hinterlegten Farben sind ausdrücklich
  als Platzhalter markiert ("SpielerPlus/TeamPlus-Stil", nicht die echten Vereinsfarben). Der
  Nutzer hat freie Farbwahl für dieses Redesign ausdrücklich autorisiert statt auf reale
  Vereinsfarben zu bestehen.

## Evidence on Hand

- Vollständige, seit Monaten gewachsene Produktivanwendung mit echten Nutzungsdaten und
  -mustern (kein Konzept/Mockup).
- Vereinslogo: existiert, wird noch als Datei bereitgestellt.
- Keine weiteren Marketing-/Beweis-Assets (Testimonials, Presse) vorhanden oder nötig — reines
  internes Werkzeug, kein nach außen gerichtetes Produkt.

## Product Principles

1. Für die real beobachteten Abläufe dieser Mannschaft gebaut, nicht für ein generisches
   Team-Sport-Schema.
2. Bleibt unter allen Umständen kostenlos zu betreiben, unabhängig vom Funktionswachstum.
3. Bleibt courtside unter Zeitdruck zuverlässig bedienbar — schnelle, robuste Eingabe schlägt
   visuelle Verspieltheit an neuralgischen Stellen (Live-Tracking).
4. Bedienbar ohne technische Vorkenntnisse — die Zielgruppe sind Basketballspieler, keine
   Early-Adopter-Nutzer von Team-Tools.
5. So gestaltet, dass der Sprung von einem Team auf "Verein mit mehreren Teams" später keinen
   kompletten visuellen Neuanfang erfordert.
