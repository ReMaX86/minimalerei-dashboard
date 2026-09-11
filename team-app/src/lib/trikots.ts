import { naechsterSpieler } from './rotation';
import { benoetigterSatz, type Game, type GameSquadRow, type Player, type TrikotSetId, type TrikotWashLogRow } from '../types/database';

export interface PendingWasher {
  setId: TrikotSetId;
  player: Pick<Player, 'id' | 'name'>;
}

/**
 * Wer soll laut Rotation das Trikot-Set nach `game` zum Waschen mitnehmen,
 * falls das noch nicht bestätigt wurde? null bei nicht veröffentlichtem
 * Kader, bereits bestätigter Übergabe, oder wenn niemand aus dem Kader
 * verfügbar ist.
 */
export function pendingWasherFor(
  game: Pick<Game, 'id' | 'squad_published' | 'is_home' | 'trikot_override'>,
  squad: Pick<GameSquadRow, 'player_id' | 'is_selected'>[],
  players: Pick<Player, 'id' | 'name'>[],
  washLog: Pick<TrikotWashLogRow, 'game_id' | 'set_id' | 'player_id'>[]
): PendingWasher | null {
  if (!game.squad_published) return null;
  const setId = benoetigterSatz(game);
  const alreadyConfirmed = washLog.some((w) => w.game_id === game.id && w.set_id === setId);
  if (alreadyConfirmed) return null;

  const washCount: Record<string, number> = {};
  washLog.forEach((w) => {
    washCount[w.player_id] = (washCount[w.player_id] ?? 0) + 1;
  });
  const player = naechsterSpieler(game, players, squad, washCount);
  if (!player) return null;
  return { setId, player };
}
