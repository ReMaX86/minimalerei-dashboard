import { describe, expect, it } from 'vitest';
import {
  announcementEndInfo,
  computeExpiresAt,
  isAnnouncementOpen,
  pushSubLabel,
  remainingTimeLabel,
  sortAnnouncements
} from './announcements';

describe('computeExpiresAt', () => {
  it('adds 7 days for hinweis', () => {
    expect(computeExpiresAt('hinweis', '2026-09-01T10:00:00.000Z')).toBe('2026-09-08T10:00:00.000Z');
  });
  it('adds 14 days for wichtig', () => {
    expect(computeExpiresAt('wichtig', '2026-09-01T10:00:00.000Z')).toBe('2026-09-15T10:00:00.000Z');
  });
  it('never expires for dringend', () => {
    expect(computeExpiresAt('dringend', '2026-09-01T10:00:00.000Z')).toBeNull();
  });
});

describe('isAnnouncementOpen', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');

  it('is closed once ended_at is set, regardless of kind', () => {
    expect(isAnnouncementOpen({ kind: 'dringend', expires_at: null, ended_at: '2026-09-09T00:00:00.000Z' }, 0, 12, now)).toBe(false);
  });

  it('is closed once expires_at is in the past', () => {
    expect(isAnnouncementOpen({ kind: 'hinweis', expires_at: '2026-09-09T00:00:00.000Z', ended_at: null }, 0, 12, now)).toBe(false);
  });

  it('hinweis closes early once every active player has read it', () => {
    expect(isAnnouncementOpen({ kind: 'hinweis', expires_at: '2026-09-20T00:00:00.000Z', ended_at: null }, 12, 12, now)).toBe(false);
    expect(isAnnouncementOpen({ kind: 'hinweis', expires_at: '2026-09-20T00:00:00.000Z', ended_at: null }, 11, 12, now)).toBe(true);
  });

  it('wichtig/dringend do NOT close early even if everyone has read it', () => {
    expect(isAnnouncementOpen({ kind: 'wichtig', expires_at: '2026-09-20T00:00:00.000Z', ended_at: null }, 12, 12, now)).toBe(true);
    expect(isAnnouncementOpen({ kind: 'dringend', expires_at: null, ended_at: null }, 12, 12, now)).toBe(true);
  });
});

describe('announcementEndInfo', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');

  it('returns null while still open', () => {
    expect(announcementEndInfo({ kind: 'wichtig', expires_at: '2026-09-20T00:00:00.000Z', ended_at: null }, [], 12, now)).toBeNull();
  });

  it('reports "ended" with ended_at when manually ended', () => {
    expect(
      announcementEndInfo({ kind: 'dringend', expires_at: null, ended_at: '2026-09-09T08:00:00.000Z' }, [], 12, now)
    ).toEqual({ reason: 'ended', at: '2026-09-09T08:00:00.000Z' });
  });

  it('reports "expired" once past expires_at', () => {
    expect(
      announcementEndInfo({ kind: 'hinweis', expires_at: '2026-09-09T00:00:00.000Z', ended_at: null }, [], 12, now)
    ).toEqual({ reason: 'expired', at: '2026-09-09T00:00:00.000Z' });
  });

  it('reports "all-read" with the last confirmation time once every active player confirmed a hinweis', () => {
    const reads = [{ created_at: '2026-09-08T09:00:00.000Z' }, { created_at: '2026-09-09T15:00:00.000Z' }];
    expect(
      announcementEndInfo({ kind: 'hinweis', expires_at: '2026-09-20T00:00:00.000Z', ended_at: null }, reads, 2, now)
    ).toEqual({ reason: 'all-read', at: '2026-09-09T15:00:00.000Z' });
  });
});

describe('sortAnnouncements', () => {
  it('orders dringend, then wichtig, then hinweis, newest first within a kind', () => {
    const list = [
      { kind: 'hinweis' as const, created_at: '2026-09-05T00:00:00.000Z' },
      { kind: 'dringend' as const, created_at: '2026-09-01T00:00:00.000Z' },
      { kind: 'wichtig' as const, created_at: '2026-09-03T00:00:00.000Z' },
      { kind: 'wichtig' as const, created_at: '2026-09-07T00:00:00.000Z' }
    ];
    expect(sortAnnouncements(list).map((a) => `${a.kind}:${a.created_at}`)).toEqual([
      'dringend:2026-09-01T00:00:00.000Z',
      'wichtig:2026-09-07T00:00:00.000Z',
      'wichtig:2026-09-03T00:00:00.000Z',
      'hinweis:2026-09-05T00:00:00.000Z'
    ]);
  });
});

describe('remainingTimeLabel', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');

  it('shows "BIS DU SIE BEENDEST" when there is no expiry', () => {
    expect(remainingTimeLabel({ expires_at: null }, now)).toBe('BIS DU SIE BEENDEST');
  });

  it('shows "LÄUFT MORGEN AB" within a day of expiry', () => {
    expect(remainingTimeLabel({ expires_at: '2026-09-11T10:00:00.000Z' }, now)).toBe('LÄUFT MORGEN AB');
  });

  it('shows the number of days remaining otherwise', () => {
    expect(remainingTimeLabel({ expires_at: '2026-09-21T12:00:00.000Z' }, now)).toBe('LÄUFT IN 11 TAGEN AB');
  });
});

describe('pushSubLabel', () => {
  it('is always "BEI DRINGEND IMMER AN" for dringend', () => {
    expect(pushSubLabel('dringend', true)).toBe('BEI DRINGEND IMMER AN');
    expect(pushSubLabel('dringend', false)).toBe('BEI DRINGEND IMMER AN');
  });

  it('reflects the toggle for hinweis/wichtig', () => {
    expect(pushSubLabel('hinweis', false)).toBe('NUR IN DER APP');
    expect(pushSubLabel('wichtig', true)).toBe('MITTEILUNG AUFS HANDY');
  });
});
