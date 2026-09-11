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
