import { describe, expect, it } from 'vitest';
import { latestTransferFrom, pendingWasherFor, washCountsFor } from './trikots';

const players = [
  { id: 'p-anna', name: 'Anna' },
  { id: 'p-ben', name: 'Ben' }
];

const homeGame = { id: 'g1', squad_published: true, is_home: true, trikot_override: null };

function squadOf(...ids: string[]) {
  return players.map((p) => ({ player_id: p.id, is_selected: ids.includes(p.id) }));
}

describe('pendingWasherFor', () => {
  it('returns null when the squad is not published', () => {
    const game = { ...homeGame, squad_published: false };
    expect(pendingWasherFor(game, squadOf('p-anna'), players, [])).toBeNull();
  });

  it('returns null once a wash log entry for that game+set already exists', () => {
    const washLog = [{ game_id: 'g1', set_id: 'weiss' as const, player_id: 'p-anna' }];
    expect(pendingWasherFor(homeGame, squadOf('p-anna'), players, washLog)).toBeNull();
  });

  it('ignores wash log entries for a different game or set', () => {
    const washLog = [
      { game_id: 'g2', set_id: 'weiss' as const, player_id: 'p-anna' },
      { game_id: 'g1', set_id: 'schwarz' as const, player_id: 'p-anna' }
    ];
    const result = pendingWasherFor(homeGame, squadOf('p-anna'), players, washLog);
    expect(result?.setId).toBe('weiss');
    expect(result?.player.name).toBe('Anna');
  });

  it('returns null when nobody in the squad is selected', () => {
    expect(pendingWasherFor(homeGame, squadOf(), players, [])).toBeNull();
  });

  it('picks whoever has washed the fewest times, matching naechsterSpieler', () => {
    const washLog = [
      { game_id: 'g0', set_id: 'weiss' as const, player_id: 'p-anna' },
      { game_id: 'g0', set_id: 'weiss' as const, player_id: 'p-anna' }
    ];
    const result = pendingWasherFor(homeGame, squadOf('p-anna', 'p-ben'), players, washLog);
    expect(result?.player.name).toBe('Ben');
  });

  it('respects trikot_override for the set id', () => {
    const overriddenGame = { ...homeGame, trikot_override: 'schwarz' as const };
    const result = pendingWasherFor(overriddenGame, squadOf('p-anna'), players, []);
    expect(result?.setId).toBe('schwarz');
  });

  it('counts manual adjustments towards the rotation, not just real washes', () => {
    const adjustmentLog = [{ player_id: 'p-ben', delta: 3 }];
    const result = pendingWasherFor(homeGame, squadOf('p-anna', 'p-ben'), players, [], adjustmentLog);
    expect(result?.player.name).toBe('Anna');
  });
});

describe('washCountsFor', () => {
  it('sums real washes and adjustment deltas per player', () => {
    const washLog = [{ player_id: 'p-anna' }, { player_id: 'p-anna' }, { player_id: 'p-ben' }];
    const adjustmentLog = [
      { player_id: 'p-anna', delta: -1 },
      { player_id: 'p-ben', delta: 2 }
    ];
    expect(washCountsFor(washLog, adjustmentLog)).toEqual({ 'p-anna': 1, 'p-ben': 3 });
  });

  it('works with no adjustments at all', () => {
    const washLog = [{ player_id: 'p-anna' }];
    expect(washCountsFor(washLog)).toEqual({ 'p-anna': 1 });
  });

  it('lets a player start purely from an adjustment with no real washes', () => {
    expect(washCountsFor([], [{ player_id: 'p-anna', delta: 5 }])).toEqual({ 'p-anna': 5 });
  });
});

describe('latestTransferFrom', () => {
  it('returns null when there is no transfer log entry for the set', () => {
    expect(latestTransferFrom('weiss', [], [])).toBeNull();
  });

  it('returns the previous holder when the latest event for the set was a transfer', () => {
    const transferLog = [
      { set_id: 'weiss' as const, from_player_id: 'p-anna', created_at: '2026-09-10T10:00:00Z' }
    ];
    expect(latestTransferFrom('weiss', [], transferLog)).toBe('p-anna');
  });

  it('returns null once a wash log entry supersedes the transfer', () => {
    const transferLog = [
      { set_id: 'weiss' as const, from_player_id: 'p-anna', created_at: '2026-09-10T10:00:00Z' }
    ];
    const washLog = [{ set_id: 'weiss' as const, created_at: '2026-09-12T10:00:00Z' }];
    expect(latestTransferFrom('weiss', washLog, transferLog)).toBeNull();
  });

  it('returns the previous holder again if a newer transfer follows an older wash', () => {
    const washLog = [{ set_id: 'weiss' as const, created_at: '2026-09-10T10:00:00Z' }];
    const transferLog = [
      { set_id: 'weiss' as const, from_player_id: 'p-ben', created_at: '2026-09-12T10:00:00Z' }
    ];
    expect(latestTransferFrom('weiss', washLog, transferLog)).toBe('p-ben');
  });

  it('ignores entries for a different set', () => {
    const transferLog = [
      { set_id: 'schwarz' as const, from_player_id: 'p-anna', created_at: '2026-09-10T10:00:00Z' }
    ];
    expect(latestTransferFrom('weiss', [], transferLog)).toBeNull();
  });

  it('picks the most recent of multiple transfers for the same set', () => {
    const transferLog = [
      { set_id: 'weiss' as const, from_player_id: 'p-anna', created_at: '2026-09-10T10:00:00Z' },
      { set_id: 'weiss' as const, from_player_id: 'p-ben', created_at: '2026-09-11T10:00:00Z' }
    ];
    expect(latestTransferFrom('weiss', [], transferLog)).toBe('p-ben');
  });
});
