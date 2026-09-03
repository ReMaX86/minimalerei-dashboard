import { describe, expect, it } from 'vitest';
import { naechsterSpieler } from './rotation';

const players = [
  { id: 'p-anna', name: 'Anna' },
  { id: 'p-ben', name: 'Ben' },
  { id: 'p-clara', name: 'Clara' },
  { id: 'p-david', name: 'David' }
];

const published = { squad_published: true };

describe('naechsterSpieler', () => {
  it('returns null when the squad is not published', () => {
    const squad = players.map((p) => ({ player_id: p.id, is_selected: true }));
    expect(naechsterSpieler({ squad_published: false }, players, squad, null)).toBeNull();
  });

  it('starts from the top alphabetically when nobody was assigned yet', () => {
    const squad = players.map((p) => ({ player_id: p.id, is_selected: true }));
    const result = naechsterSpieler(published, players, squad, null);
    expect(result?.name).toBe('Anna');
  });

  it('picks the next alphabetical player after the last assignee', () => {
    const squad = players.map((p) => ({ player_id: p.id, is_selected: true }));
    const result = naechsterSpieler(published, players, squad, 'p-ben');
    expect(result?.name).toBe('Clara');
  });

  it('wraps around to the start of the alphabet', () => {
    const squad = players.map((p) => ({ player_id: p.id, is_selected: true }));
    const result = naechsterSpieler(published, players, squad, 'p-david');
    expect(result?.name).toBe('Anna');
  });

  it('skips players who are not in the squad, leaving their place intact', () => {
    const squad = [
      { player_id: 'p-anna', is_selected: true },
      { player_id: 'p-ben', is_selected: false },
      { player_id: 'p-clara', is_selected: true },
      { player_id: 'p-david', is_selected: true }
    ];
    // last assigned = Anna -> Ben is skipped (not selected) -> Clara
    const result = naechsterSpieler(published, players, squad, 'p-anna');
    expect(result?.name).toBe('Clara');
  });

  it('returns null when nobody in the squad is selected', () => {
    const squad = players.map((p) => ({ player_id: p.id, is_selected: false }));
    expect(naechsterSpieler(published, players, squad, null)).toBeNull();
  });

  it('falls back to the top of the list if the last assignee is no longer active', () => {
    const squad = players.map((p) => ({ player_id: p.id, is_selected: true }));
    const result = naechsterSpieler(published, players, squad, 'p-left-the-team');
    expect(result?.name).toBe('Anna');
  });
});
