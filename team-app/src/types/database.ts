export type TrikotSetId = 'weiss' | 'schwarz';
export type OfficiatingTaskType = 'uhr' | 'anschreiber' | 'zeit';

export const OFFICIATING_TASK_LABELS: Record<OfficiatingTaskType, string> = {
  uhr: '24-Sekunden-Uhr',
  anschreiber: 'Anschreiben',
  zeit: 'Zeit & Punkte'
};

export interface Player {
  id: string;
  name: string;
  access_code: string;
  auth_user_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Trainer {
  id: string;
  name: string;
  email: string;
}

export interface Game {
  id: string;
  game_date: string;
  game_time: string;
  opponent: string;
  is_home: boolean;
  trikot_override: TrikotSetId | null;
  location: string;
  squad_published: boolean;
  created_at: string;
}

export interface GameSquadRow {
  game_id: string;
  player_id: string;
  is_selected: boolean;
}

export interface TrikotSet {
  id: TrikotSetId;
  label: string;
  current_holder_id: string | null;
  since: string | null;
}

export interface TrikotWashLogRow {
  id: string;
  set_id: TrikotSetId;
  player_id: string;
  game_id: string | null;
  created_at: string;
}

export interface TrikotRotationState {
  id: number;
  last_assigned_player_id: string | null;
}

export interface OfficiatingGame {
  id: string;
  game_date: string;
  opponent_teams: string;
  location: string;
}

export interface OfficiatingTask {
  id: string;
  officiating_game_id: string;
  task_type: OfficiatingTaskType;
  assigned_player_id: string | null;
}

export interface Training {
  id: string;
  weekday: string;
  start_time: string;
  end_time: string;
  location: string;
}

export function benoetigterSatz(game: Pick<Game, 'is_home' | 'trikot_override'>): TrikotSetId {
  return game.trikot_override ?? (game.is_home ? 'weiss' : 'schwarz');
}
