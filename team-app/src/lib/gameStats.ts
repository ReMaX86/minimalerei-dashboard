import { STAT_POINT_VALUES, type GameStatEvent, type StatType } from '../types/database';

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

// Für Q1-Q4 "Q1".."Q4", danach "OT", "2. OT", ...
export function quarterLabel(quarter: number): string {
  if (quarter <= 4) return `Q${quarter}`;
  const ot = quarter - 4;
  return ot === 1 ? 'OT' : `${ot}. OT`;
}
