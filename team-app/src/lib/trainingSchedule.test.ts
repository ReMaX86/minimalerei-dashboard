import { describe, expect, it } from 'vitest';
import { nextTrainingOccurrences } from './trainingSchedule';
import type { Training } from '../types/database';

const dienstag: Training = {
  id: 't-di',
  weekday: 'Dienstag',
  start_time: '18:00',
  end_time: '20:00',
  location: 'Halle A',
  specific_date: null,
  override_id: null
};
const donnerstag: Training = {
  id: 't-do',
  weekday: 'Donnerstag',
  start_time: '18:00',
  end_time: '20:00',
  location: 'Halle A',
  specific_date: null,
  override_id: null
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

  describe('with Ferienzeiten (training_overrides)', () => {
    it('cancels all regular occurrences within a special-mode range', () => {
      const overrides = [{ id: 'ov-1', start_date: '2026-09-08', end_date: '2026-09-08', mode: 'special' as const, note: 'Ferien' }];
      const result = nextTrainingOccurrences([dienstag], 2, new Date('2026-09-07T10:00:00'), overrides);
      expect(result.map((r) => r.date)).toEqual(['2026-09-15', '2026-09-22']);
    });

    it('does not cancel anything for a regular-mode Ferienzeit', () => {
      const overrides = [{ id: 'ov-1', start_date: '2026-09-08', end_date: '2026-09-08', mode: 'regular' as const, note: null }];
      const result = nextTrainingOccurrences([dienstag], 1, new Date('2026-09-07T10:00:00'), overrides);
      expect(result[0].date).toBe('2026-09-08');
    });

    it('leaves occurrences outside the range untouched', () => {
      const overrides = [{ id: 'ov-1', start_date: '2026-10-01', end_date: '2026-10-10', mode: 'special' as const, note: null }];
      const result = nextTrainingOccurrences([dienstag], 2, new Date('2026-09-07T10:00:00'), overrides);
      expect(result.map((r) => r.date)).toEqual(['2026-09-08', '2026-09-15']);
    });

    it('includes a one-off Sondertermin on its specific date, with a note from its Ferienzeit', () => {
      const overrides = [
        { id: 'ov-1', start_date: '2026-09-08', end_date: '2026-09-08', mode: 'special' as const, note: 'Herbstferien-Sondertermin' }
      ];
      const sonder: Training = {
        id: 't-sonder',
        weekday: null,
        start_time: '17:00',
        end_time: '18:30',
        location: 'Halle C',
        specific_date: '2026-09-08',
        override_id: 'ov-1'
      };
      const result = nextTrainingOccurrences([dienstag, sonder], 1, new Date('2026-09-07T10:00:00'), overrides);
      expect(result[0].training.id).toBe('t-sonder');
      expect(result[0].date).toBe('2026-09-08');
      expect(result[0].note).toBe('Herbstferien-Sondertermin');
    });

    it('falls back to a default note for a Sondertermin without a matching Ferienzeit', () => {
      const sonder: Training = {
        id: 't-sonder',
        weekday: null,
        start_time: '17:00',
        end_time: '18:30',
        location: 'Halle C',
        specific_date: '2026-09-08',
        override_id: null
      };
      const result = nextTrainingOccurrences([sonder], 1, new Date('2026-09-07T10:00:00'));
      expect(result[0].note).toBe('Sondertermin (Ferien)');
    });

    it('drops a Sondertermin once its date has passed', () => {
      const sonder: Training = {
        id: 't-sonder',
        weekday: null,
        start_time: '17:00',
        end_time: '18:30',
        location: 'Halle C',
        specific_date: '2026-09-01',
        override_id: null
      };
      expect(nextTrainingOccurrences([sonder], 1, new Date('2026-09-07T10:00:00'))).toEqual([]);
    });

    it('interleaves a Sondertermin with the regular weekly schedule by date', () => {
      const sonder: Training = {
        id: 't-sonder',
        weekday: null,
        start_time: '12:00',
        end_time: '13:00',
        location: 'Halle C',
        specific_date: '2026-09-09',
        override_id: null
      };
      const result = nextTrainingOccurrences([dienstag, sonder], 3, new Date('2026-09-07T10:00:00'));
      expect(result.map((r) => [r.training.id, r.date])).toEqual([
        ['t-di', '2026-09-08'],
        ['t-sonder', '2026-09-09'],
        ['t-di', '2026-09-15']
      ]);
    });
  });
});
