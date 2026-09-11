import { describe, expect, it } from 'vitest';
import { computeReminders } from './reminders';
import type { ReminderSettings } from '../types/database';

const TODAY = new Date('2026-09-10');

const SETTINGS: ReminderSettings = {
  enabled: true,
  squad_reminder_days_before: 3,
  training_reminder_days_before: 1,
  officiating_season_min: 2
};

describe('computeReminders', () => {
  it('returns nothing when reminders are disabled, regardless of pending items', () => {
    const squad = { published: true, inSquad: true, confirmation: 'pending' as const, gameDate: '2026-09-11', opponent: 'BC Test' };
    const result = computeReminders(TODAY, { ...SETTINGS, enabled: false }, squad, null, null);
    expect(result).toEqual([]);
  });

  describe('squad', () => {
    const base = { published: true, inSquad: true, confirmation: 'pending' as const, gameDate: '2026-09-13', opponent: 'BC Test' };

    it('reminds when unconfirmed and within the configured days-before window', () => {
      const result = computeReminders(TODAY, SETTINGS, base, null, null);
      expect(result.map((r) => r.key)).toEqual(['squad']);
      expect(result[0].text).toContain('BC Test');
    });

    it('stays silent outside the window', () => {
      const farAway = { ...base, gameDate: '2026-09-20' };
      expect(computeReminders(TODAY, SETTINGS, farAway, null, null)).toEqual([]);
    });

    it('stays silent once confirmed', () => {
      const confirmed = { ...base, confirmation: 'confirmed' as const };
      expect(computeReminders(TODAY, SETTINGS, confirmed, null, null)).toEqual([]);
    });

    it('stays silent when not in the squad or the squad is not published', () => {
      expect(computeReminders(TODAY, SETTINGS, { ...base, inSquad: false }, null, null)).toEqual([]);
      expect(computeReminders(TODAY, SETTINGS, { ...base, published: false }, null, null)).toEqual([]);
    });
  });

  describe('training', () => {
    const base = { date: '2026-09-11', hasResponded: false, onAbsence: false };

    it('reminds when unanswered and within the window', () => {
      const result = computeReminders(TODAY, SETTINGS, null, base, null);
      expect(result.map((r) => r.key)).toEqual(['training']);
      // Nennt das konkrete Datum, damit klar ist, welches Training gemeint
      // ist — falls "heute" schon läuft/vorbei ist und ein späterer Termin
      // zum "nächsten unbeantworteten" wurde, wäre sonst nicht ersichtlich,
      // dass es sich nicht um ein bereits beantwortetes Training handelt.
      expect(result[0].text).toContain('11.09');
    });

    it('stays silent once answered', () => {
      expect(computeReminders(TODAY, SETTINGS, null, { ...base, hasResponded: true }, null)).toEqual([]);
    });

    it('stays silent while on Urlaub for that date', () => {
      expect(computeReminders(TODAY, SETTINGS, null, { ...base, onAbsence: true }, null)).toEqual([]);
    });

    it('stays silent outside the window', () => {
      expect(computeReminders(TODAY, SETTINGS, null, { ...base, date: '2026-09-14' }, null)).toEqual([]);
    });
  });

  describe('officiating', () => {
    const base = { exempt: false, count: 0, hasOpenFutureSlot: true };

    it('reminds when below the season minimum and slots are open', () => {
      const result = computeReminders(TODAY, SETTINGS, null, null, base);
      expect(result.map((r) => r.key)).toEqual(['officiating']);
      expect(result[0].text).toContain('0 von 2');
    });

    it('stays silent once the season minimum is reached', () => {
      expect(computeReminders(TODAY, SETTINGS, null, null, { ...base, count: 2 })).toEqual([]);
    });

    it('stays silent when no future slots are open', () => {
      expect(computeReminders(TODAY, SETTINGS, null, null, { ...base, hasOpenFutureSlot: false })).toEqual([]);
    });

    it('stays silent for exempt (U18) players', () => {
      expect(computeReminders(TODAY, SETTINGS, null, null, { ...base, exempt: true })).toEqual([]);
    });
  });

  describe('trikot', () => {
    it('reminds when the caller says the handover is pending', () => {
      const result = computeReminders(TODAY, SETTINGS, null, null, null, { pending: true, opponent: 'BC Test' });
      expect(result.map((r) => r.key)).toEqual(['trikot']);
      expect(result[0].text).toContain('BC Test');
    });

    it('stays silent when not pending', () => {
      expect(computeReminders(TODAY, SETTINGS, null, null, null, { pending: false, opponent: 'BC Test' })).toEqual([]);
    });

    it('is not included at all when omitted', () => {
      expect(computeReminders(TODAY, SETTINGS, null, null, null)).toEqual([]);
    });
  });

  it('combines all four independently', () => {
    const squad = { published: true, inSquad: true, confirmation: 'pending' as const, gameDate: '2026-09-11', opponent: 'BC Test' };
    const training = { date: '2026-09-11', hasResponded: false, onAbsence: false };
    const officiating = { exempt: false, count: 0, hasOpenFutureSlot: true };
    const trikot = { pending: true, opponent: 'BC Test' };
    const result = computeReminders(TODAY, SETTINGS, squad, training, officiating, trikot);
    expect(result.map((r) => r.key)).toEqual(['squad', 'training', 'officiating', 'trikot']);
  });
});
