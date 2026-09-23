export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

// "FR 25.09." — großes Datum auf der Karte "Nächstes Spiel" (siehe
// docs/design/tipoff-design/elements/02-naechstes-spiel/): zweistelliges
// Wochentagskürzel in Versalien + fmtDateShort(), ohne Jahr.
export function fmtDateBadge(iso: string): string {
  return `${weekdayBadge(iso)} ${fmtDateShort(iso)}`;
}

// "SA 13.09.2026" — Datumszeile auf der Karte "Letztes Ergebnis" (siehe
// docs/design/tipoff-design/elements/03-letztes-ergebnis/): wie
// fmtDateBadge(), aber mit Jahr statt trennendem Punkt am Ende.
export function fmtDateBadgeWithYear(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const datePart = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${weekdayBadge(iso)} ${datePart}`;
}

export function weekdayBadge(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d
    .toLocaleDateString('de-DE', { weekday: 'short' })
    .replace(/[^a-zA-ZÀ-ÿ]/g, '')
    .slice(0, 2)
    .toUpperCase();
}

export function fmtTime(time: string): string {
  return time.slice(0, 5);
}

// "25" — nur der Tag, für den zweizeiligen Datumsblock in der Spielplan-
// Zeile (Wochentag oben, große Tageszahl darunter). iso ist immer
// 'YYYY-MM-DD', ein reiner String-Ausschnitt reicht.
export function dayOfMonth(iso: string): string {
  return iso.slice(8, 10);
}

// "SEPTEMBER" — Monatsname in Versalien, für die Monats-Gruppenlabel im
// Spielplan-Reiter (Element 10).
export function monthLabel(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { month: 'long' }).toUpperCase();
}

// Für einen vollen Zeitstempel (timestamptz, z. B. league_standings.updated_at)
// — anders als fmtDateShort() (reines Datum ohne Uhrzeit-Anteil) braucht das
// hier ein echtes Date-Objekt, damit new Date() den Zeitzonen-Versatz aus
// dem ISO-String korrekt in die lokale Anzeigezeit umrechnet.
export function fmtDateTimeShort(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  const timePart = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${timePart} Uhr`;
}

// Navigation direkt in die jeweilige Standard-Karten-App, ohne eigene
// Auswahl-Abfrage (Karte "Nächstes Spiel", siehe docs/design/tipoff-design/
// elements/02-naechstes-spiel/PROMPT.md): Android bekommt einen geo:-Link
// (öffnet dort den installierten Standard, üblicherweise Google Maps);
// alles andere (iOS, Desktop) bekommt weiterhin den Apple-Maps-Link von
// vorher — ein echter https-Universal-Link (kein maps://-Schema, das auf
// anderen Plattformen/Browsern als ungültiges Protokoll fehlschlagen
// könnte), der auf iOS die "Karten"-App öffnet und sonst als normale
// Kartenvorschau im Browser funktioniert. Beide Formen akzeptieren reinen
// Freitext als Suchbegriff (Hallenname oder komplette Adresse) und
// geocodieren selbst.
export function mapsUrl(location: string): string {
  const encoded = encodeURIComponent(location);
  if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent ?? '')) {
    return `geo:0,0?q=${encoded}`;
  }
  return `https://maps.apple.com/?q=${encoded}`;
}

// "Marc Rewald" -> "Marc R." — für die großen Spieler-Buttons im
// Live-Stats-Tracker, wo der volle Name zu breit wäre.
export function shortPlayerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function isFuture(iso: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(iso + 'T00:00:00') >= today;
}

// Ist der Anpfiff eines Spiels schon erreicht? Trikots werden laut Verein
// tatsächlich erst NACH dem Spiel in der Kabine geklärt/übergeben, nicht
// schon irgendwann am Spieltag davor — die Bestätigung der Trikot-Übergabe
// ist deshalb erst ab dieser Uhrzeit sinnvoll, nicht schon ab 00:00 Uhr des
// Spieltags. Läuft im Browser (nicht auf dem Vercel-Server), der lokalen
// Zeitzone des Geräts reicht deshalb ein einfacher `new Date()`-Vergleich —
// keine Berlin-Umrechnung wie bei den serverseitigen Push-Funktionen nötig.
// `now` optional für testbare Aufrufe.
export function hasKickedOff(game_date: string, game_time: string, now: Date = new Date()): boolean {
  return new Date(`${game_date}T${game_time}`) <= now;
}

// Ganze Kalendertage zwischen heute und `iso` (negativ, wenn `iso` in der
// Vergangenheit liegt). `today` optional für testbare Aufrufe.
export function daysUntil(iso: string, today: Date = new Date()): number {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(iso + 'T00:00:00');
  return Math.round((target.getTime() - from.getTime()) / 86_400_000);
}

export function ageFromBirthDate(iso: string): number {
  const birth = new Date(iso + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}
