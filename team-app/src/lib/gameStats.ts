import { STAT_POINT_VALUES, type GameLineupLogRow, type GameStatEvent, type StatType } from '../types/database';

export interface PlayerBoxScore {
  playerId: string;
  points: number;
  fg2m: number;
  fg2a: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
}

function emptyBoxScore(playerId: string): PlayerBoxScore {
  return {
    playerId,
    points: 0,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    ftm: 0,
    fta: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fouls: 0
  };
}

function applyStat(row: PlayerBoxScore, statType: StatType) {
  switch (statType) {
    case 'fg2_made':
      row.fg2m++;
      row.fg2a++;
      row.points += 2;
      break;
    case 'fg2_miss':
      row.fg2a++;
      break;
    case 'fg3_made':
      row.fg3m++;
      row.fg3a++;
      row.points += 3;
      break;
    case 'fg3_miss':
      row.fg3a++;
      break;
    case 'ft_made':
      row.ftm++;
      row.fta++;
      row.points += 1;
      break;
    case 'ft_miss':
      row.fta++;
      break;
    case 'rebound':
      row.rebounds++;
      break;
    case 'assist':
      row.assists++;
      break;
    case 'steal':
      row.steals++;
      break;
    case 'block':
      row.blocks++;
      break;
    case 'turnover':
      row.turnovers++;
      break;
    case 'foul':
      row.fouls++;
      break;
  }
}

// Nur eigene Spieler bekommen einen Box-Score-Eintrag — für den Gegner wird
// laut Schema nur der Punktestand getrackt (siehe computeTeamScore).
export function computeBoxScore(events: GameStatEvent[]): PlayerBoxScore[] {
  const byPlayer = new Map<string, PlayerBoxScore>();
  for (const e of events) {
    if (e.team !== 'us' || !e.player_id) continue;
    const row = byPlayer.get(e.player_id) ?? emptyBoxScore(e.player_id);
    applyStat(row, e.stat_type);
    byPlayer.set(e.player_id, row);
  }
  return [...byPlayer.values()].sort((a, b) => b.points - a.points);
}

export interface TeamScore {
  us: number;
  opponent: number;
}

export function computeTeamScore(events: GameStatEvent[]): TeamScore {
  let us = 0;
  let opponent = 0;
  for (const e of events) {
    const value = STAT_POINT_VALUES[e.stat_type] ?? 0;
    if (value === 0) continue;
    if (e.team === 'us') us += value;
    else opponent += value;
  }
  return { us, opponent };
}

// +/- pro Spieler: für jeden wurfrelevanten Treffer (eigener wie gegnerischer)
// die zu diesem Zeitpunkt laut game_lineup_log auf dem Feld stehenden
// Spieler ermitteln und ihnen den Punktewert gutschreiben (eigener Treffer)
// bzw. abziehen (Gegentreffer). lineupLog muss dafür NICHT sortiert
// übergeben werden, wird hier selbst sortiert.
//
// fallbackOnCourtIds greift nur, wenn zu einem Event noch gar kein
// Log-Eintrag existiert — planmäßig der Fall bei einem Kader mit höchstens
// COURT_SIZE trackbaren Spielern (GameStatsTracker.tsx blendet die
// Aufstellungs-Auswahl dann komplett aus, da ohnehin alle die ganze Zeit
// spielen — siehe useCourtSplit) sowie defensiv für den Sonderfall, dass ein
// altes Spiel vor Einführung dieses Features getrackt wurde und daher gar
// keine Historie hat.
export function computePlusMinus(
  events: GameStatEvent[],
  lineupLog: GameLineupLogRow[],
  fallbackOnCourtIds: string[]
): Record<string, number> {
  const sortedLog = [...lineupLog].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const result: Record<string, number> = {};
  for (const e of events) {
    const value = STAT_POINT_VALUES[e.stat_type] ?? 0;
    if (value === 0) continue;

    let onCourt = fallbackOnCourtIds;
    for (const log of sortedLog) {
      if (log.created_at > e.created_at) break;
      onCourt = log.on_court_player_ids;
    }

    const delta = e.team === 'us' ? value : -value;
    for (const playerId of onCourt) {
      result[playerId] = (result[playerId] ?? 0) + delta;
    }
  }
  return result;
}

export interface QuarterScore {
  quarter: number;
  us: number;
  opponent: number;
}

export function computeQuarterScores(events: GameStatEvent[]): QuarterScore[] {
  const byQuarter = new Map<number, { us: number; opponent: number }>();
  for (const e of events) {
    const value = STAT_POINT_VALUES[e.stat_type] ?? 0;
    if (value === 0) continue;
    const row = byQuarter.get(e.quarter) ?? { us: 0, opponent: 0 };
    if (e.team === 'us') row.us += value;
    else row.opponent += value;
    byQuarter.set(e.quarter, row);
  }
  return [...byQuarter.entries()]
    .sort(([a], [b]) => a - b)
    .map(([quarter, score]) => ({ quarter, ...score }));
}

// "+8" / "−3" / "0" — Minus bewusst als echtes Minuszeichen (U+2212) statt
// Bindestrich, damit es in der schmalen, rechtsbündigen Spalte optisch mit
// dem "+" der positiven Werte mithält.
export function fmtPlusMinus(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return '0';
}

// Trefferquote für eine Wurfart, z. B. "50%" — "–" statt "0%" ohne jeden
// Versuch, damit ein noch torloser Spieler nicht wie 0% Trefferquote
// aussieht.
export function fgPct(made: number, attempted: number): string {
  if (attempted === 0) return '–';
  return `${Math.round((made / attempted) * 100)}%`;
}

// Für Q1-Q4 "Q1".."Q4", danach "OT", "2. OT", ...
export function quarterLabel(quarter: number): string {
  if (quarter <= 4) return `Q${quarter}`;
  const ot = quarter - 4;
  return ot === 1 ? 'OT' : `${ot}. OT`;
}
