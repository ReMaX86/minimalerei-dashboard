import { describe, expect, it } from 'vitest';
import { computeBoxScore, computeQuarterScores, computeTeamScore, quarterLabel } from './gameStats';
import type { GameStatEvent, StatType } from '../types/database';

let nextId = 1;
function ev(
  overrides: Partial<GameStatEvent> & { team: 'us' | 'opponent'; stat_type: StatType }
): GameStatEvent {
  return {
    id: `e${nextId++}`,
    game_id: 'g1',
    player_id: null,
    quarter: 1,
    created_by_name: 'Tester',
    created_at: '2026-09-08T18:00:00Z',
    ...overrides
  };
}

describe('computeBoxScore', () => {
  it('aggregates points, attempts and other stats per player', () => {
    const events: GameStatEvent[] = [
      ev({ team: 'us', player_id: 'p1', stat_type: 'fg2_made' }),
      ev({ team: 'us', player_id: 'p1', stat_type: 'fg2_miss' }),
      ev({ team: 'us', player_id: 'p1', stat_type: 'fg3_made' }),
      ev({ team: 'us', player_id: 'p1', stat_type: 'ft_made' }),
      ev({ team: 'us', player_id: 'p1', stat_type: 'ft_miss' }),
      ev({ team: 'us', player_id: 'p1', stat_type: 'rebound' }),
      ev({ team: 'us', player_id: 'p1', stat_type: 'assist' })
    ];
    const box = computeBoxScore(events);
    expect(box).toHaveLength(1);
    expect(box[0]).toMatchObject({
      playerId: 'p1',
      points: 2 + 3 + 1,
      fg2m: 1,
      fg2a: 2,
      fg3m: 1,
      fg3a: 1,
      ftm: 1,
      fta: 2,
      rebounds: 1,
      assists: 1
    });
  });

  it('ignores opponent events and sorts players by points descending', () => {
    const events: GameStatEvent[] = [
      ev({ team: 'us', player_id: 'p1', stat_type: 'fg2_made' }),
      ev({ team: 'us', player_id: 'p2', stat_type: 'fg3_made' }),
      ev({ team: 'opponent', player_id: null, stat_type: 'fg3_made' })
    ];
    const box = computeBoxScore(events);
    expect(box.map((b) => b.playerId)).toEqual(['p2', 'p1']);
  });
});

describe('computeTeamScore', () => {
  it('sums scoring events per team, ignoring non-scoring stats', () => {
    const events: GameStatEvent[] = [
      ev({ team: 'us', player_id: 'p1', stat_type: 'fg2_made' }),
      ev({ team: 'us', player_id: 'p1', stat_type: 'fg3_made' }),
      ev({ team: 'us', player_id: 'p1', stat_type: 'rebound' }),
      ev({ team: 'opponent', stat_type: 'ft_made' })
    ];
    expect(computeTeamScore(events)).toEqual({ us: 5, opponent: 1 });
  });
});

describe('computeQuarterScores', () => {
  it('splits the running score by quarter, in ascending order', () => {
    const events: GameStatEvent[] = [
      ev({ team: 'us', player_id: 'p1', stat_type: 'fg3_made', quarter: 2 }),
      ev({ team: 'us', player_id: 'p1', stat_type: 'fg2_made', quarter: 1 }),
      ev({ team: 'opponent', stat_type: 'ft_made', quarter: 1 })
    ];
    expect(computeQuarterScores(events)).toEqual([
      { quarter: 1, us: 2, opponent: 1 },
      { quarter: 2, us: 3, opponent: 0 }
    ]);
  });
});

describe('quarterLabel', () => {
  it('labels the first four quarters as Q1-Q4', () => {
    expect([1, 2, 3, 4].map(quarterLabel)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });

  it('labels overtime periods', () => {
    expect(quarterLabel(5)).toBe('OT');
    expect(quarterLabel(6)).toBe('2. OT');
  });
});
