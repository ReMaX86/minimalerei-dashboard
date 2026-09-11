import { describe, expect, it } from 'vitest';
import { pendingWasherFor } from './trikots';

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
});
