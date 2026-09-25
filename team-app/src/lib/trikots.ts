import { naechsterSpieler } from './rotation';
import {
  benoetigterSatz,
  type Game,
  type GameSquadRow,
  type Player,
  type TrikotSetId,
  type TrikotTransferLogRow,
  type TrikotWashAdjustmentLogRow,
  type TrikotWashLogRow
} from '../types/database';

export interface PendingWasher {
  setId: TrikotSetId;
  player: Pick<Player, 'id' | 'name'>;
}

/**
 * Der tatsächliche Waschzähler pro Spieler: echte Wäschen (trikot_wash_log,
 * eine Zeile je Wäsche) plus manuelle Korrekturen (trikot_wash_adjustment_log,
 * Migration 0069 — Element 20 "Admin · Trikots", ein Delta je Anpassung).
 * Zentrale Stelle, damit Rotation (naechsterSpieler/washRotationOrder),
 * Vorschlag (pendingWasherFor) und Anzeige überall denselben Stand sehen.
 */
export function washCountsFor(
  washLog: Pick<TrikotWashLogRow, 'player_id'>[],
  adjustmentLog: Pick<TrikotWashAdjustmentLogRow, 'player_id' | 'delta'>[] = []
): Record<string, number> {
  const counts: Record<string, number> = {};
  washLog.forEach((w) => {
    counts[w.player_id] = (counts[w.player_id] ?? 0) + 1;
  });
  adjustmentLog.forEach((a) => {
    counts[a.player_id] = (counts[a.player_id] ?? 0) + a.delta;
  });
  return counts;
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
  washLog: Pick<TrikotWashLogRow, 'game_id' | 'set_id' | 'player_id'>[],
  adjustmentLog: Pick<TrikotWashAdjustmentLogRow, 'player_id' | 'delta'>[] = []
): PendingWasher | null {
  if (!game.squad_published) return null;
  const setId = benoetigterSatz(game);
  const alreadyConfirmed = washLog.some((w) => w.game_id === game.id && w.set_id === setId);
  if (alreadyConfirmed) return null;

  const washCount = washCountsFor(washLog, adjustmentLog);
  const player = naechsterSpieler(game, players, squad, washCount);
  if (!player) return null;
  return { setId, player };
}

/**
 * Hat der aktuelle Halter eines Sets es per direkter Übergabe bekommen
 * (statt über den normalen Wasch-Rhythmus)? Ein Set wechselt entweder über
 * confirm_trikot_handover() (Eintrag in trikot_wash_log) oder über
 * transfer_trikot_set() (Eintrag in trikot_transfer_log) den Besitzer —
 * welcher der beiden Vorgänge zuletzt für dieses Set passiert ist, bestimmt
 * die player_id des Vorbesitzers, die in der "Übergeben von"-Anzeige
 * auftaucht. Kommt seit dem letzten Wasch-Eintrag keine Übergabe vor
 * (oder gab's noch nie eine), liefert die Funktion null.
 */
export function latestTransferFrom(
  setId: TrikotSetId,
  washLog: Pick<TrikotWashLogRow, 'set_id' | 'created_at'>[],
  transferLog: Pick<TrikotTransferLogRow, 'set_id' | 'from_player_id' | 'created_at'>[]
): string | null {
  const latestWashAt = washLog
    .filter((w) => w.set_id === setId)
    .reduce((max, w) => (w.created_at > max ? w.created_at : max), '');
  const latestTransfer = transferLog
    .filter((t) => t.set_id === setId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!latestTransfer || latestTransfer.created_at <= latestWashAt) return null;
  return latestTransfer.from_player_id;
}
