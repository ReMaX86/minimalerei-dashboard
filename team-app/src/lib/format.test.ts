import { afterEach, describe, expect, it, vi } from 'vitest';
import { daysUntil, fmtDateBadge, fmtDateBadgeWithYear, fmtDateTimeShort, hasKickedOff, mapsUrl, shortPlayerName } from './format';

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

describe('mapsUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds an Apple Maps search link with the location URL-encoded by default (iOS/Desktop)', () => {
    expect(mapsUrl('Halle Wülfrath, Am Diek 22, 42489 Wülfrath')).toBe(
      'https://maps.apple.com/?q=Halle%20W%C3%BClfrath%2C%20Am%20Diek%2022%2C%2042489%20W%C3%BClfrath'
    );
  });

  it('builds a geo: link on Android, for the installed default maps app', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' });
    expect(mapsUrl('Halle Wülfrath')).toBe('geo:0,0?q=Halle%20W%C3%BClfrath');
  });
});

describe('fmtDateBadge', () => {
  it('formats as uppercase two-letter weekday + day.month.', () => {
    expect(fmtDateBadge('2026-09-25')).toBe('FR 25.09.');
  });
});

describe('fmtDateBadgeWithYear', () => {
  it('formats as uppercase two-letter weekday + day.month.year', () => {
    expect(fmtDateBadgeWithYear('2026-09-25')).toBe('FR 25.09.2026');
  });
});

describe('fmtDateTimeShort', () => {
  it('formats a full timestamp as day.month + time', () => {
    expect(fmtDateTimeShort('2026-09-21T08:05:00.000Z')).toBe('21.09. 08:05 Uhr');
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

describe('hasKickedOff', () => {
  it('is false before the game starts, even on game day', () => {
    expect(hasKickedOff('2026-09-20', '16:00', new Date('2026-09-20T10:00:00'))).toBe(false);
  });

  it('is true exactly at kickoff', () => {
    expect(hasKickedOff('2026-09-20', '16:00', new Date('2026-09-20T16:00:00'))).toBe(true);
  });

  it('is true after kickoff', () => {
    expect(hasKickedOff('2026-09-20', '16:00', new Date('2026-09-20T18:00:00'))).toBe(true);
  });

  it('is false on a day before the game', () => {
    expect(hasKickedOff('2026-09-20', '16:00', new Date('2026-09-19T23:00:00'))).toBe(false);
  });

  it('is true on a day after the game', () => {
    expect(hasKickedOff('2026-09-20', '16:00', new Date('2026-09-21T00:00:00'))).toBe(true);
  });
});
