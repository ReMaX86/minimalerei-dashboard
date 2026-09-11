import { daysUntil, fmtDate } from './format';
import type { ReminderSettings, SquadConfirmation } from '../types/database';

export interface ReminderItem {
  key: 'squad' | 'training' | 'officiating';
  icon: string;
  text: string;
  to: string;
}

export interface SquadReminderInput {
  published: boolean;
  inSquad: boolean;
  confirmation: SquadConfirmation | null;
  gameDate: string;
  opponent: string;
}

export interface TrainingReminderInput {
  date: string;
  hasResponded: boolean;
  onAbsence: boolean;
}

export interface OfficiatingReminderInput {
  exempt: boolean;
  count: number;
  hasOpenFutureSlot: boolean;
}

/**
 * Was gehört in die "Für dich zu erledigen"-Karte auf der Spieler-
 * Startseite? Jede der drei Quellen ist optional (null = Funktion nicht
 * relevant/aktiv für diesen Spieler) und wird unabhängig geprüft; die
 * Fristen kommen aus den trainer-konfigurierbaren `reminder_settings`.
 */
export function computeReminders(
  today: Date,
  settings: ReminderSettings,
  squad: SquadReminderInput | null,
  training: TrainingReminderInput | null,
  officiating: OfficiatingReminderInput | null
): ReminderItem[] {
  if (!settings.enabled) return [];
  const items: ReminderItem[] = [];

  if (
    squad &&
    squad.published &&
    squad.inSquad &&
    squad.confirmation === 'pending' &&
    daysUntil(squad.gameDate, today) <= settings.squad_reminder_days_before
  ) {
    items.push({
      key: 'squad',
      icon: '🏀',
      text: `Kader-Zusage für Spiel gegen ${squad.opponent} noch offen`,
      to: '/spiele?kader=1'
    });
  }

  if (
    training &&
    !training.hasResponded &&
    !training.onAbsence &&
    daysUntil(training.date, today) <= settings.training_reminder_days_before
  ) {
    items.push({
      key: 'training',
      icon: '🕒',
      // Nennt bewusst das genaue Datum statt nur "nächstes Training" — sonst
      // wirkt die Erinnerung so, als ginge es nochmal um ein bereits
      // beantwortetes Training, wenn in Wirklichkeit schon der übernächste
      // Termin gemeint ist (z. B. weil die Startzeit des heutigen Trainings
      // schon vorbei ist und der Termin danach zum "nächsten" wird).
      text: `Training am ${fmtDate(training.date)} noch nicht beantwortet`,
      to: '#training'
    });
  }

  if (
    officiating &&
    !officiating.exempt &&
    officiating.count < settings.officiating_season_min &&
    officiating.hasOpenFutureSlot
  ) {
    items.push({
      key: 'officiating',
      icon: '📋',
      text: `Kampfgericht: erst ${officiating.count} von ${settings.officiating_season_min} Einsätzen diese Saison — es gibt offene Termine`,
      to: '/kampfgericht'
    });
  }

  return items;
}
