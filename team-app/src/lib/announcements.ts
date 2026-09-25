import type { Announcement, AnnouncementKind, AnnouncementReadRow } from '../types/database';

// Element 22 "Meldungen" — reine Business-Logik rund um die drei Sorten
// (Laufzeit, Sortierung, wann eine Meldung als "beendet" gilt). UI-Code
// (AnnouncementsAdmin.tsx/Dashboard.tsx/PlayerProfiles.tsx) verwendet nur
// diese Funktionen, damit "läuft noch?"/"warum beendet?" überall gleich
// berechnet wird.

export const ANNOUNCEMENT_KIND_LABELS: Record<AnnouncementKind, string> = {
  hinweis: 'Hinweis',
  wichtig: 'Wichtig',
  dringend: 'Dringend'
};

export const ANNOUNCEMENT_KIND_EXPLANATION: Record<AnnouncementKind, string> = {
  hinweis: 'Steht 7 Tage oben – oder verschwindet früher, sobald alle sie gelesen haben.',
  wichtig: 'Volt hervorgehoben, bleibt 14 Tage oder bis du sie beendest – auch wenn schon alle gelesen haben.',
  dringend: 'Rot hervorgehoben, bleibt bis du sie beendest. Push geht immer raus.'
};

// Laufzeit ab created_at — null bei 'dringend' (läuft nie automatisch ab,
// nur über ended_at). PROMPT.md Rückfrage 1: nur beim Laden filtern, kein
// geplanter Job.
const ANNOUNCEMENT_DURATION_DAYS: Record<AnnouncementKind, number | null> = {
  hinweis: 7,
  wichtig: 14,
  dringend: null
};

export function computeExpiresAt(kind: AnnouncementKind, fromIso: string): string | null {
  const days = ANNOUNCEMENT_DURATION_DAYS[kind];
  if (days === null) return null;
  const d = new Date(fromIso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Läuft die Meldung noch (gehört in "Läuft gerade" bzw. bei Spielern in
 * "FÜR DICH")? false sobald: aktiv beendet, zeitlich abgelaufen, oder bei
 * kind==='hinweis' bereits von allen aktiven Spielern gelesen — Letzteres
 * nur eine reguläre Sorte, siehe PROMPT.md §2 ("nicht automatisch" bei
 * 'wichtig'/'dringend', selbst wenn schon alle gelesen haben).
 */
export function isAnnouncementOpen(
  a: Pick<Announcement, 'kind' | 'expires_at' | 'ended_at'>,
  readCount: number,
  activeCount: number,
  now: Date = new Date()
): boolean {
  if (a.ended_at) return false;
  if (a.expires_at && new Date(a.expires_at) <= now) return false;
  if (a.kind === 'hinweis' && activeCount > 0 && readCount >= activeCount) return false;
  return true;
}

export interface AnnouncementEndInfo {
  reason: 'ended' | 'expired' | 'all-read';
  at: string; // ISO
}

/**
 * Für den "Beendet"-Abschnitt: wann und warum eine Meldung dort gelandet
 * ist. null, solange sie noch läuft. Bei 'all-read' ist `at` der Zeitpunkt
 * der letzten Bestätigung (aus den reads), nicht "jetzt" — reines
 * Nachrechnen aus vorhandenen Daten, kein zusätzlich gespeichertes Feld
 * nötig (siehe Rückfrage 1: kein Job, der das aktiv festhält).
 */
export function announcementEndInfo(
  a: Pick<Announcement, 'kind' | 'expires_at' | 'ended_at'>,
  reads: Pick<AnnouncementReadRow, 'created_at'>[],
  activeCount: number,
  now: Date = new Date()
): AnnouncementEndInfo | null {
  if (a.ended_at) return { reason: 'ended', at: a.ended_at };
  if (a.kind === 'hinweis' && activeCount > 0 && reads.length >= activeCount) {
    const lastReadAt = [...reads].map((r) => r.created_at).sort().slice(-1)[0];
    if (a.expires_at && lastReadAt && new Date(a.expires_at) < new Date(lastReadAt)) {
      return { reason: 'expired', at: a.expires_at };
    }
    return { reason: 'all-read', at: lastReadAt ?? now.toISOString() };
  }
  if (a.expires_at && new Date(a.expires_at) <= now) return { reason: 'expired', at: a.expires_at };
  return null;
}

// "Läuft gerade": Dringend -> Wichtig -> Hinweis, innerhalb der Sorte neueste zuerst.
const KIND_ORDER: Record<AnnouncementKind, number> = { dringend: 0, wichtig: 1, hinweis: 2 };

export function sortAnnouncements<T extends Pick<Announcement, 'kind' | 'created_at'>>(list: T[]): T[] {
  return [...list].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.created_at.localeCompare(a.created_at));
}

// "LÄUFT IN 11 TAGEN AB" / "LÄUFT MORGEN AB" / "BIS DU SIE BEENDEST"
export function remainingTimeLabel(a: Pick<Announcement, 'expires_at'>, now: Date = new Date()): string {
  if (!a.expires_at) return 'BIS DU SIE BEENDEST';
  const days = Math.ceil((new Date(a.expires_at).getTime() - now.getTime()) / 86_400_000);
  if (days <= 1) return 'LÄUFT MORGEN AB';
  return `LÄUFT IN ${days} TAGEN AB`;
}

// Sub-Label unter dem Push-Schalter im Formular.
export function pushSubLabel(kind: AnnouncementKind, pushOn: boolean): string {
  if (kind === 'dringend') return 'BEI DRINGEND IMMER AN';
  return pushOn ? 'MITTEILUNG AUFS HANDY' : 'NUR IN DER APP';
}
