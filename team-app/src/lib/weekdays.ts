export const WEEKDAY_ORDER = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag'
];

export function weekdayIndex(weekday: string): number {
  const idx = WEEKDAY_ORDER.indexOf(weekday);
  return idx === -1 ? WEEKDAY_ORDER.length : idx;
}
