import type { Game, GameSquadRow, Player } from '../types/database';

/**
 * Who should hand over the trikots next: among this game's squad, whoever
 * has washed the fewest times in total across both sets so far (tie-break
 * alphabetically). No separate "pointer" is tracked — a player who gets
 * declined (someone else confirms in their place) simply keeps their wash
 * count unchanged, so they stay at (or near) the front of the queue and
 * come up again automatically until they actually take a turn.
 */
export function naechsterSpieler(
  game: Pick<Game, 'squad_published'>,
  activePlayers: Pick<Player, 'id' | 'name'>[],
  squad: Pick<GameSquadRow, 'player_id' | 'is_selected'>[],
  washCounts: Record<string, number>
): Pick<Player, 'id' | 'name'> | null {
  if (!game.squad_published) return null;

  const selectedIds = new Set(squad.filter((row) => row.is_selected).map((row) => row.player_id));
  const candidates = activePlayers.filter((p) => selectedIds.has(p.id));
  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => {
    const countDiff = (washCounts[a.id] ?? 0) - (washCounts[b.id] ?? 0);
    return countDiff !== 0 ? countDiff : a.name.localeCompare(b.name, 'de');
  })[0];
}

export interface WashOrderRow {
  player: Pick<Player, 'id' | 'name'>;
  inSquad: boolean;
  washCount: number;
}

// Volle Reihenfolge fürs "REIHENFOLGE"-Blatt (Element 13, Trikots.tsx) —
// naechsterSpieler() oben liefert nur den EINEN nächsten Kandidaten aus dem
// Kader; hier die komplette, sichtbare Liste: erst alle im Kader (gleiche
// Regel wie oben — wenigste Wäschen, dann alphabetisch), danach alle
// NICHT im Kader (dieselbe Regel, rein informativ, kommt nie als
// Vorschlag infrage). Bewusst eigenständig statt naechsterSpieler()
// umzubauen, um dessen bestehendes, getestetes Verhalten nicht anzufassen
// — beide teilen sich absichtlich dieselbe Sortierregel.
export function washRotationOrder(
  activePlayers: Pick<Player, 'id' | 'name'>[],
  squad: Pick<GameSquadRow, 'player_id' | 'is_selected'>[],
  washCounts: Record<string, number>
): WashOrderRow[] {
  const selectedIds = new Set(squad.filter((row) => row.is_selected).map((row) => row.player_id));
  const byRule = (a: Pick<Player, 'id' | 'name'>, b: Pick<Player, 'id' | 'name'>) => {
    const countDiff = (washCounts[a.id] ?? 0) - (washCounts[b.id] ?? 0);
    return countDiff !== 0 ? countDiff : a.name.localeCompare(b.name, 'de');
  };
  const inSquad = activePlayers.filter((p) => selectedIds.has(p.id)).sort(byRule);
  const outSquad = activePlayers.filter((p) => !selectedIds.has(p.id)).sort(byRule);
  return [
    ...inSquad.map((player) => ({ player, inSquad: true, washCount: washCounts[player.id] ?? 0 })),
    ...outSquad.map((player) => ({ player, inSquad: false, washCount: washCounts[player.id] ?? 0 }))
  ];
}
