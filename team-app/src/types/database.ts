export type TrikotSetId = 'weiss' | 'schwarz';
export type OfficiatingTaskType = 'uhr' | 'anschreiber' | 'zeit';

// Optionale Zusatzfunktionen, die ein Trainer pro Team an-/ausschalten kann
// (Admin -> Funktionen). Neuer Key hier + eine Zeile in Migration/Seed, dann
// ist eine neue Funktion schaltbar.
export type FeatureKey = 'announcements' | 'carpool' | 'player_profiles' | 'absences' | 'stats';

export const FEATURE_LABELS: Record<FeatureKey, { label: string; description: string }> = {
  announcements: {
    label: 'Meldungen',
    description: 'Schwarzes Brett auf der Startseite für kurze Hinweise vom Trainer.'
  },
  carpool: {
    label: 'Mitfahrgelegenheit',
    description: 'Fahrgemeinschaften für Auswärtsspiele organisieren.'
  },
  player_profiles: {
    label: 'Spielerprofile',
    description: 'Team-Übersicht mit Foto, Position, Größe, Alter und Skills pro Spieler.'
  },
  absences: {
    label: 'Urlaub/Abwesenheit',
    description:
      'Spieler tragen eigene Abwesenheiten ein — Training wird automatisch abgesagt, beim Kader wird ein Hinweis angezeigt.'
  },
  stats: {
    label: 'Punkte & Ergebnisse',
    description: 'Endstand pro Spiel und Punkte pro Spieler, manuell vom Trainer eingetragen.'
  }
};

export type PlayerPosition = 'aufbau' | 'fluegel' | 'center';

export const POSITION_LABELS: Record<PlayerPosition, string> = {
  aufbau: 'Aufbau',
  fluegel: 'Flügel',
  center: 'Center'
};

export const SKILL_OPTIONS = ['Distanzwurf', 'Verteidigung', 'Athletik', 'Passspiel', 'Rebound'] as const;
export type Skill = (typeof SKILL_OPTIONS)[number];

export interface Announcement {
  id: string;
  message: string;
  pinned: boolean;
  author_name: string;
  created_at: string;
}

export interface CarpoolOffer {
  id: string;
  game_id: string;
  driver_player_id: string;
  seats: number;
  note: string | null;
  created_at: string;
}

export interface CarpoolClaim {
  offer_id: string;
  game_id: string;
  player_id: string;
  created_at: string;
}

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
  is_admin: boolean;
  position: PlayerPosition | null;
  height_cm: number | null;
  birth_date: string | null;
  photo_url: string | null;
  skills: string[];
  created_at: string;
}

export interface Trainer {
  id: string;
  name: string;
  email: string;
}

export interface Viewer {
  id: string;
  name: string;
  access_code: string;
  is_active: boolean;
  created_at: string;
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
  meeting_time_hall: string | null;
  meeting_time_carpool: string | null;
  meeting_point_carpool: string | null;
  final_score_us: number | null;
  final_score_opponent: number | null;
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

export interface OfficiatingGame {
  id: string;
  game_date: string;
  game_time: string | null;
  opponent_teams: string;
  opponent: string | null;
  location: string;
}

export function officiatingGameLabel(game: Pick<OfficiatingGame, 'opponent_teams' | 'opponent'>): string {
  return game.opponent ? `${game.opponent_teams} vs. ${game.opponent}` : game.opponent_teams;
}

export interface OfficiatingTeam {
  id: string;
  name: string;
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

export interface TrainingRsvpRow {
  training_id: string;
  session_date: string;
  player_id: string;
  is_attending: boolean;
  created_at: string;
}

export function benoetigterSatz(game: Pick<Game, 'is_home' | 'trikot_override'>): TrikotSetId {
  return game.trikot_override ?? (game.is_home ? 'weiss' : 'schwarz');
}

export interface MeetingPoint {
  label: string;
  time: string | null;
  place: string | null;
}

// Heimspiele haben nur einen Treffpunkt (die Halle). Auswärtsspiele können
// zusätzlich einen Fahrgemeinschaft-Treffpunkt haben, für alle die nicht
// direkt zur gegnerischen Halle fahren.
export function meetingPoints(
  game: Pick<Game, 'is_home' | 'meeting_time_hall' | 'meeting_time_carpool' | 'meeting_point_carpool'>
): MeetingPoint[] {
  const points: MeetingPoint[] = [];
  if (game.meeting_time_carpool || game.meeting_point_carpool) {
    points.push({
      label: 'Fahrgemeinschaft',
      time: game.meeting_time_carpool,
      place: game.meeting_point_carpool
    });
  }
  if (game.meeting_time_hall) {
    points.push({
      label: game.is_home ? 'Halle' : 'direkt an der Halle',
      time: game.meeting_time_hall,
      place: null
    });
  }
  return points;
}

export interface PlayerAbsence {
  id: string;
  player_id: string;
  start_date: string;
  end_date: string;
  note: string | null;
  created_at: string;
}

// Zeitraum statt einzelner Absage-Zeilen: ein Termin/Spiel "fällt in" einen
// Urlaub, wenn sein Datum im [start_date, end_date]-Bereich liegt.
export function playerAbsenceOn(
  absences: Pick<PlayerAbsence, 'player_id' | 'start_date' | 'end_date'>[],
  playerId: string,
  dateIso: string
): boolean {
  return absences.some((a) => a.player_id === playerId && dateIso >= a.start_date && dateIso <= a.end_date);
}

export interface GamePlayerPoints {
  game_id: string;
  player_id: string;
  points: number;
}

export type GameResult = 'sieg' | 'niederlage' | 'unentschieden';

// "us" vs. "opponent" statt "home"/"away", damit Sieg/Niederlage unabhängig
// vom Heimrecht direkt aus dem Vergleich der beiden Endstände folgt.
export function gameResult(game: Pick<Game, 'final_score_us' | 'final_score_opponent'>): GameResult | null {
  if (game.final_score_us == null || game.final_score_opponent == null) return null;
  if (game.final_score_us > game.final_score_opponent) return 'sieg';
  if (game.final_score_us < game.final_score_opponent) return 'niederlage';
  return 'unentschieden';
}
