import { describe, expect, it } from 'vitest';
import { naechsterSpieler } from './rotation';

const players = [
  { id: 'p-anna', name: 'Anna' },
  { id: 'p-ben', name: 'Ben' },
  { id: 'p-clara', name: 'Clara' },
  { id: 'p-david', name: 'David' }
];

const published = { squad_published: true };

function squadOf(...ids: string[]) {
  return players.map((p) => ({ player_id: p.id, is_selected: ids.includes(p.id) }));
}

describe('naechsterSpieler', () => {
  it('returns null when the squad is not published', () => {
    expect(naechsterSpieler({ squad_published: false }, players, squadOf(...players.map((p) => p.id)), {})).toBeNull();
  });

  it('picks alphabetically first when nobody has washed yet', () => {
    const squad = squadOf('p-anna', 'p-ben', 'p-clara', 'p-david');
    const result = naechsterSpieler(published, players, squad, {});
    expect(result?.name).toBe('Anna');
  });

  it('picks whoever has washed the fewest times, ignoring alphabet', () => {
    const squad = squadOf('p-anna', 'p-ben', 'p-clara', 'p-david');
    const washCounts = { 'p-anna': 2, 'p-ben': 1, 'p-clara': 0, 'p-david': 3 };
    const result = naechsterSpieler(published, players, squad, washCounts);
    expect(result?.name).toBe('Clara');
  });

  it('breaks ties between equal counts alphabetically', () => {
    const squad = squadOf('p-anna', 'p-ben', 'p-clara');
    const washCounts = { 'p-anna': 1, 'p-ben': 0, 'p-clara': 0 };
    const result = naechsterSpieler(published, players, squad, washCounts);
    expect(result?.name).toBe('Ben');
  });

  it('ignores players who are not in this game squad', () => {
    const squad = squadOf('p-ben', 'p-clara');
    const washCounts = { 'p-anna': 0, 'p-ben': 1, 'p-clara': 1 };
    const result = naechsterSpieler(published, players, squad, washCounts);
    expect(result?.name).toBe('Ben');
  });

  it('returns null when nobody in the squad is selected', () => {
    const squad = squadOf();
    expect(naechsterSpieler(published, players, squad, {})).toBeNull();
  });

  it('keeps suggesting a declined player until they actually take a turn', () => {
    const squad = squadOf('p-anna', 'p-ben', 'p-clara', 'p-david');
    // Anna was suggested but declined; Ben confirmed in her place instead.
    // Anna's count is untouched, so she should still be the top pick.
    const washCounts = { 'p-ben': 1 };
    const result = naechsterSpieler(published, players, squad, washCounts);
    expect(result?.name).toBe('Anna');

    // If Clara fills in for Anna a second time, Anna is still up front.
    const washCounts2 = { 'p-ben': 1, 'p-clara': 1 };
    const result2 = naechsterSpieler(published, players, squad, washCounts2);
    expect(result2?.name).toBe('Anna');
  });
});
