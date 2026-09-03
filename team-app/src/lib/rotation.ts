import type { Game, GameSquadRow, Player } from '../types/database';

/**
 * Port of the "naechsterSpieler" pseudocode from the spec (§5): a single
 * shared alphabetical queue serves both trikot sets. Starting right after
 * the last-assigned player, walk the alphabetically sorted roster and
 * return the first one who is selected for this game's squad. Players who
 * get skipped (not in the squad) keep their place in line — they're first
 * in line again the next time they *are* in the squad.
 */
export function naechsterSpieler(
  game: Pick<Game, 'squad_published'>,
  activePlayers: Pick<Player, 'id' | 'name'>[],
  squad: Pick<GameSquadRow, 'player_id' | 'is_selected'>[],
  lastAssignedPlayerId: string | null
): Pick<Player, 'id' | 'name'> | null {
  if (!game.squad_published) return null;
  if (activePlayers.length === 0) return null;

  const sorted = [...activePlayers].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const selectedIds = new Set(
    squad.filter((row) => row.is_selected).map((row) => row.player_id)
  );

  const startIndex =
    lastAssignedPlayerId === null
      ? 0
      : (sorted.findIndex((p) => p.id === lastAssignedPlayerId) + 1) % sorted.length;
  // findIndex returns -1 if the last-assigned player is no longer active;
  // (-1 + 1) % length === 0, i.e. we simply start from the top — a
  // reasonable fallback for a player who has since left the team.

  for (let i = 0; i < sorted.length; i++) {
    const candidate = sorted[(startIndex + i) % sorted.length];
    if (selectedIds.has(candidate.id)) return candidate;
  }
  return null;
}
