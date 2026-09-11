import { describe, expect, it } from 'vitest';
import { daysUntil, shortPlayerName } from './format';

describe('shortPlayerName', () => {
  it('shortens a two-part name to first name + last initial', () => {
    expect(shortPlayerName('Marc Rewald')).toBe('Marc R.');
  });

  it('uses only the first and last part of a multi-part name', () => {
    expect(shortPlayerName('Anna Maria Schmidt')).toBe('Anna S.');
  });

  it('leaves a single-word name unchanged', () => {
    expect(shortPlayerName('Cristiano')).toBe('Cristiano');
  });
});

describe('daysUntil', () => {
  const today = new Date('2026-09-10T15:30:00');

  it('returns 0 for today', () => {
    expect(daysUntil('2026-09-10', today)).toBe(0);
  });

  it('returns a positive count for a future date', () => {
    expect(daysUntil('2026-09-13', today)).toBe(3);
  });

  it('returns a negative count for a past date', () => {
    expect(daysUntil('2026-09-08', today)).toBe(-2);
  });

  it('ignores the time-of-day portion of `today`', () => {
    expect(daysUntil('2026-09-11', new Date('2026-09-10T23:59:00'))).toBe(1);
  });
});
