export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

export function fmtTime(time: string): string {
  return time.slice(0, 5);
}

// Apple-Maps-Link statt Google Maps (auf Nutzeranfrage — Team nutzt
// durchgehend iPhones, siehe README). https://maps.apple.com/?q=... ist ein
// echter https-Universal-Link (kein maps://-Schema, das auf anderen
// Plattformen/Browsern als ungültiges Protokoll fehlschlagen könnte) — auf
// iOS öffnet ein Klick darauf direkt die "Karten"-App, akzeptiert wie bei
// Google Maps reinen Freitext als Suchbegriff (Hallenname oder komplette
// Adresse aus dem "Halle / Adresse"-Feld) und geocodiert selbst.
export function mapsUrl(location: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(location)}`;
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
