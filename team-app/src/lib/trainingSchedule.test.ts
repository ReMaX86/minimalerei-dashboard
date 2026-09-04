import { describe, expect, it } from 'vitest';
import { nextTrainingOccurrences } from './trainingSchedule';
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
});
