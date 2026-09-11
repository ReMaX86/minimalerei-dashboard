import { describe, expect, it } from 'vitest';
import { applyTrainingOverride, nextTrainingOccurrences, type TrainingOccurrence } from './trainingSchedule';
import type { Training } from '../types/database';

const dienstag: Training = {
  id: 't-di',
  weekday: 'Dienstag',
  start_time: '18:00',
  end_time: '20:00',
  location: 'Halle A'
};
const donnerstag: Training = {
  id: 't-do',
  weekday: 'Donnerstag',
  start_time: '18:00',
  end_time: '20:00',
  location: 'Halle A'
};

describe('nextTrainingOccurrences', () => {
  it('returns an empty list when there are no trainings', () => {
    expect(nextTrainingOccurrences([], 2, new Date('2026-09-01'))).toEqual([]);
  });

  it('gives two consecutive weekly dates for a single training', () => {
    // Monday 2026-09-07
    const result = nextTrainingOccurrences([dienstag], 2, new Date('2026-09-07T10:00:00'));
    expect(result.map((r) => r.date)).toEqual(['2026-09-08', '2026-09-15']);
  });

  it('interleaves two weekly trainings by date instead of jumping ahead', () => {
    // Monday 2026-09-07: next Tuesday then next Thursday, not two Tuesdays
    const result = nextTrainingOccurrences([dienstag, donnerstag], 2, new Date('2026-09-07T10:00:00'));
    expect(result.map((r) => [r.training.id, r.date])).toEqual([
      ['t-di', '2026-09-08'],
      ['t-do', '2026-09-10']
    ]);
  });

  it('rolls over to the following week once the session has already started today', () => {
    // Tuesday 2026-09-08, 19:00 — the 18:00 session already started
    const result = nextTrainingOccurrences([dienstag], 1, new Date('2026-09-08T19:00:00'));
    expect(result[0].date).toBe('2026-09-15');
  });

  it('picks today if the session has not started yet', () => {
    // Tuesday 2026-09-08, 09:00 — before the 18:00 start
    const result = nextTrainingOccurrences([dienstag], 1, new Date('2026-09-08T09:00:00'));
    expect(result[0].date).toBe('2026-09-08');
  });

  describe('with overrides', () => {
    it('skips an occurrence cancelled by a matching override', () => {
      const overrides = [
        { start_date: '2026-09-08', end_date: '2026-09-08', weekday: null, status: 'cancelled' as const, start_time: null, end_time: null, location: null, note: 'Ferien' }
      ];
      const result = nextTrainingOccurrences([dienstag], 2, new Date('2026-09-07T10:00:00'), overrides);
      expect(result.map((r) => r.date)).toEqual(['2026-09-15', '2026-09-22']);
    });

    it('overrides time/location for a special occurrence and carries the note', () => {
      const overrides = [
        {
          start_date: '2026-09-08',
          end_date: '2026-09-08',
          weekday: null,
          status: 'special' as const,
          start_time: '17:00',
          end_time: '18:00',
          location: 'Halle B',
          note: 'Ferien-Sonderzeit'
        }
      ];
      const result = nextTrainingOccurrences([dienstag], 1, new Date('2026-09-07T10:00:00'), overrides);
      expect(result[0].training.start_time).toBe('17:00');
      expect(result[0].training.end_time).toBe('18:00');
      expect(result[0].training.location).toBe('Halle B');
      expect(result[0].note).toBe('Ferien-Sonderzeit');
    });

    it('only applies to the matching weekday when one is set', () => {
      const overrides = [
        {
          start_date: '2026-09-07',
          end_date: '2026-09-11',
          weekday: 'Donnerstag',
          status: 'cancelled' as const,
          start_time: null,
          end_time: null,
          location: null,
          note: null
        }
      ];
      const result = nextTrainingOccurrences([dienstag, donnerstag], 2, new Date('2026-09-07T10:00:00'), overrides);
      expect(result.map((r) => [r.training.id, r.date])).toEqual([
        ['t-di', '2026-09-08'],
        ['t-di', '2026-09-15']
      ]);
    });

    it('leaves occurrences outside the override range untouched', () => {
      const overrides = [
        {
          start_date: '2026-10-01',
          end_date: '2026-10-10',
          weekday: null,
          status: 'cancelled' as const,
          start_time: null,
          end_time: null,
          location: null,
          note: null
        }
      ];
      const result = nextTrainingOccurrences([dienstag], 2, new Date('2026-09-07T10:00:00'), overrides);
      expect(result.map((r) => r.date)).toEqual(['2026-09-08', '2026-09-15']);
    });
  });
});

describe('applyTrainingOverride', () => {
  const occ: TrainingOccurrence = { training: dienstag, date: '2026-09-08' };

  it('returns the occurrence unchanged when nothing matches', () => {
    expect(applyTrainingOverride(occ, [])).toEqual(occ);
  });

  it('returns null for a cancelled override covering the date', () => {
    const overrides = [
      { start_date: '2026-09-01', end_date: '2026-09-30', weekday: null, status: 'cancelled' as const, start_time: null, end_time: null, location: null, note: null }
    ];
    expect(applyTrainingOverride(occ, overrides)).toBeNull();
  });

  it('ignores an override for a different weekday', () => {
    const overrides = [
      { start_date: '2026-09-01', end_date: '2026-09-30', weekday: 'Donnerstag', status: 'cancelled' as const, start_time: null, end_time: null, location: null, note: null }
    ];
    expect(applyTrainingOverride(occ, overrides)).toEqual(occ);
  });
});
