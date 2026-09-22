Start-Header (Startseite, oben) – finale Vorgabe, Stand 2.
Verbindliche 1:1-Vorlage: docs/design/tipoff-design/elements/01-start-header/
(dieser Ordner ersetzt die vorherige Version)

- start-header.html  → Referenz-Umsetzung. Im Browser öffnen. Zustände per URL:
                        ?open=1 (Menü offen) · &num=0 (ohne Rückennummer) · &push=0 (Push aus)
                        · &role=spieler|trainer|trainer-spieler · ?teams=2 (mehrere Teams)
- 1-geschlossen.png, 2-menue-offen-mit-nummer.png, 3-menue-offen-ohne-nummer-push-aus.png, 4-mehrere-teams.png
                     → so soll es aussehen

Öffne die HTML-Datei und die Bilder und gleiche unsere Umsetzung Pixel für Pixel damit ab.
Werte über unsere Tokens abbilden (gleiche Namen wie tokens.css), keine neuen harten Werte.
Lies zuerst den bestehenden Code zu Profil-Popup, Push-Benachrichtigungen und Rollen, bevor du etwas änderst.

## Funktion – was genau passieren soll

A) Team-Pille (oben links)
   - Nutzer hat genau 1 Team (Normalfall heute): reine Anzeige, kein Button, KEIN Pfeil.
   - Nutzer hat mehrere Teams (später, z. B. Trainer mit mehreren Mannschaften): Button mit Pfeil,
     öffnet eine Team-Auswahl. Die Auswahl selbst gibt es noch nicht → jetzt NICHT bauen.
     Nur die Komponente so anlegen, dass sie anhand der Anzahl Teams automatisch zwischen Anzeige und Button wechselt.

B) Avatar (oben rechts) → öffnet/schließt das Profil-Menü. Schließen auch durch Tipp daneben oder Esc.
   Avatar zeigt das Profilfoto (object-fit: cover), sonst die Initialen exakt zentriert
   (display:grid; place-items:center; line-height:1). Rahmen in Akzentfarbe, solange das Menü offen ist.

C) Menü-Kopf
   - Rückennummer ist OPTIONAL (manche Teams haben feste Nummern, unseres nicht).
     Mit Nummer: Nummer links in Nummern-Schrift (Bild 2). Ohne Nummer: stattdessen der Avatar klein (40px, Bild 3).
     Niemals die Initialen in der Nummern-Schrift anzeigen.
     Falls es im Datenmodell noch kein Feld für die Rückennummer gibt: als optionales Feld anlegen (nullable), ohne Pflege-Oberfläche.
     Wo man sie einträgt, klären wir später beim Profil.
   - Daneben voller Name und Rolle in Versalien, abgeleitet aus unseren bestehenden Rollen:
     reiner Spieler → „SPIELER", reiner Trainer → „TRAINER", Trainer, der auch spielt → „TRAINER · SPIELER".
     Keine Umschaltung zwischen Rollen, nur Anzeige. Rechte/Ansichten bleiben wie sie sind.

D) Menüeinträge (in dieser Reihenfolge, immer sichtbar)
   1. „Mein Profil" mit Unterzeile „Foto, Größe, Geburtsdatum" → öffnet das BESTEHENDE Profil-Popup
      (Profilbild hochladen, Größe, Geburtsdatum → Alter). Popup nur öffnen, nicht umgestalten. Das machen wir als eigenes Element.
   2. „Benachrichtigungen" mit Schalter rechts + Unterzeile „Push ist an" / „Push ist aus".
      Nutzt die BESTEHENDE Push-Logik (aktivieren/deaktivieren), nur die Bedienung zieht ins Menü:
      - Schalter an → gleiche Funktion wie bisher der Aktivieren-Button (inkl. Berechtigungsabfrage des Systems).
      - Schalter aus → gleiche Funktion wie bisher das Deaktivieren.
      - Wenn das System die Berechtigung blockiert hat: Schalter deaktiviert, Unterzeile „In den Einstellungen blockiert".
      - Das Menü bleibt beim Umschalten offen.
      Startseite: Das bisherige Push-Fenster erscheint nur noch, solange Push NICHT aktiviert ist (als Hinweis zum Einschalten).
      Sobald Push an ist, verschwindet es komplett von der Startseite (nicht mehr nach unten rutschen). Aus-/Einschalten dann nur noch im Menü.
   3. „Abmelden" in Rot → bestehende Abmelde-Funktion.

E) Begrüßung
   „Hi {Vorname}!" in --to-display-xl (32px). Darunter „Noch {X Tage} bis zum Sprungball." ({X Tage} in Akzentfarbe),
   „Morgen ist Spieltag." / „Heute ist Spieltag!" bzw. ausblenden, wenn kein Spiel ansteht.

Zum Schluss: Screenshots bei 390px Breite (Menü zu, Menü offen) und kurze Liste, was du geändert hast
und ob es Stellen gab, an denen die bestehende Logik anders funktioniert als hier beschrieben.
