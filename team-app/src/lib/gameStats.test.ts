import { describe, expect, it } from 'vitest';
import { computeBoxScore, computePlusMinus, computeQuarterScores, computeTeamScore, fgPct, fmtPlusMinus, quarterLabel } from './gameStats';
import type { GameLineupLogRow, GameStatEvent, StatType } from '../types/database';

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

function lineup(onCourtPlayerIds: string[], created_at: string): GameLineupLogRow {
  return { id: `l${nextId++}`, game_id: 'g1', on_court_player_ids: onCourtPlayerIds, created_at };
}

describe('computePlusMinus', () => {
  it('credits/debits only the players on court at the time of each event', () => {
    const events: GameStatEvent[] = [
      ev({ team: 'us', player_id: 'p1', stat_type: 'fg2_made', created_at: '2026-09-08T18:01:00Z' }),
      // Nach Wechsel p1 raus, p3 rein: p3 bekommt den nächsten eigenen Korb
      // gutgeschrieben, p1 nicht mehr.
      ev({ team: 'us', player_id: 'p3', stat_type: 'fg3_made', created_at: '2026-09-08T18:05:00Z' }),
      // Gegentreffer während derselben Aufstellung zieht allen auf dem Feld ab.
      ev({ team: 'opponent', stat_type: 'fg2_made', created_at: '2026-09-08T18:06:00Z' })
    ];
    const lineupLog = [lineup(['p1', 'p2'], '2026-09-08T18:00:00Z'), lineup(['p2', 'p3'], '2026-09-08T18:03:00Z')];
    expect(computePlusMinus(events, lineupLog, [])).toEqual({
      p1: 2,
      p2: 2 + 3 - 2,
      p3: 3 - 2
    });
  });

  it('falls back to the given player ids when no lineup log exists yet', () => {
    const events: GameStatEvent[] = [
      ev({ team: 'us', player_id: 'p1', stat_type: 'fg2_made', created_at: '2026-09-08T18:01:00Z' }),
      ev({ team: 'opponent', stat_type: 'ft_made', created_at: '2026-09-08T18:02:00Z' })
    ];
    expect(computePlusMinus(events, [], ['p1', 'p2'])).toEqual({ p1: 1, p2: 1 });
  });

  it('ignores non-scoring stats', () => {
    const events: GameStatEvent[] = [ev({ team: 'us', player_id: 'p1', stat_type: 'rebound', created_at: '2026-09-08T18:01:00Z' })];
    expect(computePlusMinus(events, [], ['p1'])).toEqual({});
  });
});

describe('fmtPlusMinus', () => {
  it('prefixes positive values with a plus sign', () => {
    expect(fmtPlusMinus(8)).toBe('+8');
  });

  it('uses a real minus sign for negative values', () => {
    expect(fmtPlusMinus(-3)).toBe('−3');
  });

  it('shows a plain 0 without a sign', () => {
    expect(fmtPlusMinus(0)).toBe('0');
  });
});

describe('fgPct', () => {
  it('rounds made/attempted to a percentage', () => {
    expect(fgPct(1, 2)).toBe('50%');
    expect(fgPct(2, 3)).toBe('67%');
    expect(fgPct(0, 3)).toBe('0%');
  });

  it('shows a dash instead of 0% when no attempts were made', () => {
    expect(fgPct(0, 0)).toBe('–');
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
