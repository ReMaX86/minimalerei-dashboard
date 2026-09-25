import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { ErrorNote } from '../../components/ErrorNote';
import { useTipoffLoader } from '../../hooks/useTipoffLoader';
import { fmtDateShort, fmtDateTimeShort } from '../../lib/format';
import { isAnnouncementOpen } from '../../lib/announcements';
import { useFeatureFlags } from '../../context/FeatureFlagsContext';
import {
  FEATURE_LABELS,
  type Announcement,
  type FeatureKey,
  type Player,
  type ReminderArea,
  type ReminderOffset,
  type StandingsSyncStatus
} from '../../types/database';

// Element 23 "Admin · Funktionen": aus großen Karten mit Fließtext werden
// kompakte Zeilen in drei Gruppen. Verbindliche Vorlage:
// docs/design/tipoff-design/elements/23-funktionen/funktionen.html
// ("F"/"AREAS"/"subFor"/"blocked" dort — hier 1:1 in TSX übertragen, nur um
// echte Daten statt Demo-Arrays ergänzt).

type DetailView = 'list' | 'push' | 'reminders' | 'liga';

interface FeatureRow {
  id: FeatureKey;
  group: 0 | 1 | 2;
  name: string;
  // Statischer Statustext, nur während die Funktion an ist (dynamische
  // Zeilen — Meldungen/Push/Erinnerungen/Liga — werden separat berechnet,
  // siehe subTextFor()).
  staticSub?: string;
  // Was beim Ausschalten erhalten bleibt (Blatt-Text) — fehlt bei
  // Funktionen ohne eigene Daten (Liga-Tabelle, Push, Teamstatistik,
  // Mitfahrgelegenheit, Erinnerungen), genau wie in der Vorlage.
  keep?: string;
  needs?: FeatureKey;
  needsLabel?: string;
  detail?: Exclude<DetailView, 'list'>;
}

const GROUP_LABELS = ['SPIELBETRIEB', 'TEAM', 'KOMMUNIKATION'] as const;

const FEATURES: FeatureRow[] = [
  { id: 'officiating', group: 0, name: FEATURE_LABELS.officiating.label, staticSub: 'EINSTELLUNGEN IM REITER KAMPFGERICHT', keep: 'Die Einteilungen dieser Saison und die Einsatz-Zähler' },
  { id: 'stats', group: 0, name: FEATURE_LABELS.stats.label, staticSub: 'LIVE-TRACKING UND BOX-SCORE', keep: 'Alle getrackten Spiele mit Box-Score' },
  { id: 'standings', group: 0, name: FEATURE_LABELS.standings.label, detail: 'liga' },
  { id: 'player_profiles', group: 1, name: FEATURE_LABELS.player_profiles.label, staticSub: 'FOTO, POSITION, GRÖSSE, STÄRKEN', keep: 'Fotos, Positionen und Stärken' },
  { id: 'team_stats', group: 1, name: FEATURE_LABELS.team_stats.label, needs: 'stats', needsLabel: 'BRAUCHT PUNKTE & ERGEBNISSE' },
  { id: 'kits', group: 1, name: FEATURE_LABELS.kits.label, staticSub: 'ROTATION UND WASCHZÄHLER', keep: 'Waschzähler und die Reihenfolge' },
  { id: 'absences', group: 1, name: FEATURE_LABELS.absences.label, staticSub: 'SPIELER TRAGEN SELBST EIN', keep: 'Eingetragene Abwesenheiten' },
  { id: 'carpool', group: 1, name: FEATURE_LABELS.carpool.label },
  { id: 'announcements', group: 2, name: FEATURE_LABELS.announcements.label, keep: 'Laufende und beendete Meldungen' },
  { id: 'push_notifications', group: 2, name: FEATURE_LABELS.push_notifications.label, detail: 'push' },
  { id: 'reminders', group: 2, name: FEATURE_LABELS.reminders.label, needs: 'push_notifications', needsLabel: 'BRAUCHT PUSH', detail: 'reminders' }
];

interface ReminderAreaConfig {
  id: ReminderArea;
  name: string;
  hint: string;
  // Feste Vorschläge (Stunden vor dem Termin) — wie in der Vorlage keine
  // freie Zeiteingabe, siehe funktionen.html AREAS[].picks.
  picks: { hours: number; label: string }[];
}

const REMINDER_AREAS: ReminderAreaConfig[] = [
  {
    id: 'training',
    name: 'Training',
    hint: 'Spieler ohne Zu- oder Absage werden erinnert.',
    picks: [
      { hours: 72, label: '3 Tage vorher' },
      { hours: 24, label: '1 Tag vorher' },
      { hours: 12, label: '12 Std vorher' },
      { hours: 2, label: '2 Std vorher' },
      { hours: 1, label: '1 Std vorher' },
      { hours: 0.5, label: '30 Min vorher' }
    ]
  },
  {
    id: 'officiating',
    name: 'Kampfgericht',
    hint: 'Keine Zu-/Absage – reine Gedächtnisstütze für Eingeteilte.',
    picks: [
      { hours: 120, label: '5 Tage vorher' },
      { hours: 72, label: '3 Tage vorher' },
      { hours: 24, label: '1 Tag vorher' },
      { hours: 2, label: '2 Std vorher' },
      { hours: 1, label: '1 Std vorher' }
    ]
  },
  {
    id: 'squad',
    name: 'Kader-Zusage',
    hint: 'Nur Spieler im Kader, die noch nicht geantwortet haben.',
    picks: [
      { hours: 120, label: '5 Tage vorher' },
      { hours: 72, label: '3 Tage vorher' },
      { hours: 24, label: '1 Tag vorher' },
      { hours: 2, label: '2 Std vorher' }
    ]
  }
];

function offsetLabel(area: ReminderAreaConfig, hours: number): string {
  const pick = area.picks.find((p) => p.hours === hours);
  return pick ? pick.label : `${hours} Std vorher`;
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function ChevIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-textDisabled" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function Switch({ on, disabled, onClick, label }: { on: boolean; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled}
      aria-label={`${label} ein- oder ausschalten`}
      onClick={disabled ? undefined : onClick}
      className={`relative h-[26px] w-11 shrink-0 rounded-to-pill border transition ${
        on ? 'border-to-accent bg-to-accent' : 'border-to-line bg-to-surface2'
      } ${disabled ? 'opacity-45' : ''}`}
    >
      <span className={`absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full transition ${on ? 'left-[23px] bg-to-onAccent' : 'left-1 bg-to-textDisabled'}`} />
    </button>
  );
}

function DetailHeader({ name, meta, onBack }: { name: string; meta: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Zurück"
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md border border-to-border bg-to-surface text-to-text2"
      >
        <BackIcon />
      </button>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="to-display-sm text-to-text">{name}</span>
        <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">{meta}</span>
      </span>
    </div>
  );
}

interface PersonRow {
  name: string;
  since: string | null;
}

export function FeatureFlagsAdmin() {
  const { flags, loading, refresh } = useFeatureFlags();
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<FeatureKey | null>(null);
  const [confirmKey, setConfirmKey] = useState<FeatureKey | null>(null);
  const [view, setView] = useState<DetailView>('list');

  // Liga-Tabelle: "eingerichtet" heißt hier "hat schon mindestens einmal
  // erfolgreich synchronisiert" — eine gesetzte Liga-ID allein reicht nicht,
  // weil der Sync trotzdem dauerhaft fehlschlagen kann (siehe §4 "SYNC
  // FEHLT").
  const [ligaStatus, setLigaStatus] = useState<StandingsSyncStatus | null>(null);
  const [ligaId, setLigaId] = useState('');
  const [ligaSaving, setLigaSaving] = useState(false);
  const [ligaSyncing, setLigaSyncing] = useState(false);
  const [ligaMessage, setLigaMessage] = useState<string | null>(null);

  const [openAnnouncementCount, setOpenAnnouncementCount] = useState<number | null>(null);

  const [offsets, setOffsets] = useState<ReminderOffset[] | null>(null);
  const [addSheetArea, setAddSheetArea] = useState<ReminderArea | null>(null);

  const [pushWithout, setPushWithout] = useState<PersonRow[] | null>(null);
  const [pushWith, setPushWith] = useState<PersonRow[] | null>(null);

  const loadLiga = useCallback(async () => {
    const { data } = await supabase.from('standings_sync_status').select('*').eq('id', 1).maybeSingle();
    const row = data as StandingsSyncStatus | null;
    setLigaStatus(row);
    if (row) setLigaId(row.liga_id);
  }, []);

  const loadAnnouncementCount = useCallback(async () => {
    const [{ data: items }, { data: reads }] = await Promise.all([
      supabase.from('announcements').select('id, kind, expires_at, ended_at'),
      supabase.from('announcement_reads').select('announcement_id')
    ]);
    const { count: activeCount } = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('is_active', true);
    const readCountFor = (id: string) => ((reads as { announcement_id: string }[] | null) ?? []).filter((r) => r.announcement_id === id).length;
    const open = ((items as Announcement[] | null) ?? []).filter((a) => isAnnouncementOpen(a, readCountFor(a.id), activeCount ?? 0));
    setOpenAnnouncementCount(open.length);
  }, []);

  const loadOffsets = useCallback(async () => {
    const { data } = await supabase.from('reminder_offsets').select('*').order('minutes_before', { ascending: false });
    setOffsets((data as ReminderOffset[] | null) ?? []);
  }, []);

  const loadPush = useCallback(async () => {
    const [{ data: activePlayers }, { data: subs }, { data: identities }] = await Promise.all([
      supabase.from('players').select('id, name').eq('is_active', true).order('name'),
      supabase.from('push_subscriptions').select('user_id, created_at'),
      supabase.rpc('admin_push_subscribers')
    ]);
    const identityRows = (identities as { auth_user_id: string; name: string; role: string }[] | null) ?? [];
    const playerAuthUserIds = new Set(identityRows.filter((i) => i.role === 'Spieler').map((i) => i.auth_user_id));
    const earliestByAuthUser = new Map<string, string>();
    for (const sub of (subs as { user_id: string; created_at: string }[] | null) ?? []) {
      if (!playerAuthUserIds.has(sub.user_id)) continue;
      const prev = earliestByAuthUser.get(sub.user_id);
      if (!prev || sub.created_at < prev) earliestByAuthUser.set(sub.user_id, sub.created_at);
    }
    const sinceByName = new Map<string, string>();
    for (const identity of identityRows) {
      const since = earliestByAuthUser.get(identity.auth_user_id);
      if (since) sinceByName.set(identity.name, since);
    }
    const without: PersonRow[] = [];
    const withPush: PersonRow[] = [];
    for (const p of (activePlayers as Player[] | null) ?? []) {
      const since = sinceByName.get(p.name);
      if (since) withPush.push({ name: p.name, since });
      else without.push({ name: p.name, since: null });
    }
    setPushWithout(without);
    setPushWith(withPush);
  }, []);

  useEffect(() => {
    loadLiga();
    loadAnnouncementCount();
    loadOffsets();
    loadPush();
  }, [loadLiga, loadAnnouncementCount, loadOffsets, loadPush]);

  async function setFlag(key: FeatureKey, enabled: boolean) {
    setSavingKey(key);
    setError(null);
    try {
      const { error: upsertError } = await supabase.from('feature_flags').upsert({ key, enabled }, { onConflict: 'key' });
      if (upsertError) throw upsertError;
      await refresh();
    } catch {
      setError('Einstellung konnte nicht gespeichert werden.');
    } finally {
      setSavingKey(null);
    }
  }

  function isBlocked(f: FeatureRow): boolean {
    if (f.id === 'standings') return !ligaStatus?.last_success_at;
    if (f.needs) return !flags[f.needs];
    return false;
  }

  // Statuszeile je Zeile — Reihenfolge/Fälle wie subFor() in der Vorlage:
  // erst die Sonderfälle mit dynamischem Inhalt, dann der statische Sub,
  // zuletzt (außerhalb dieser Funktion) "AUS"/"AUS · DATEN BLEIBEN
  // GESPEICHERT".
  function statusFor(f: FeatureRow, isOn: boolean): { text: string; tone: 'volt' | 'warn' | '' } | null {
    if (f.id === 'standings') {
      if (!ligaStatus?.last_success_at) return { text: 'NICHT EINGERICHTET · SYNC FEHLT', tone: 'warn' };
      return isOn ? { text: `SYNC LÄUFT · ZULETZT ${fmtDateTimeShort(ligaStatus.last_success_at).replace(' Uhr', '')}`, tone: 'volt' } : null;
    }
    if (f.id === 'push_notifications') {
      if (!isOn || pushWith === null || pushWithout === null) return null;
      const total = pushWith.length + pushWithout.length;
      return { text: `${pushWith.length} VON ${total} SPIELERN AKTIV`, tone: 'volt' };
    }
    if (f.id === 'reminders') {
      if (!flags.push_notifications) return { text: 'BRAUCHT PUSH · ZURZEIT OHNE WIRKUNG', tone: 'warn' };
      if (isOn) return { text: `${offsets?.length ?? 0} ERINNERUNGEN AKTIV`, tone: 'volt' };
      return null;
    }
    if (f.id === 'team_stats') {
      if (!flags.stats) return { text: 'BRAUCHT PUNKTE & ERGEBNISSE', tone: 'warn' };
      return isOn ? { text: 'BESTENLISTE AUS DEN GETRACKTEN SPIELEN', tone: '' } : null;
    }
    if (f.id === 'announcements') {
      if (isOn && openAnnouncementCount !== null && openAnnouncementCount > 0) {
        return { text: `${openAnnouncementCount} LAUFEN GERADE`, tone: 'volt' };
      }
      return null;
    }
    return isOn && f.staticSub ? { text: f.staticSub, tone: '' } : null;
  }

  function handleSwitchClick(f: FeatureRow) {
    if (flags[f.id]) setConfirmKey(f.id);
    else setFlag(f.id, true);
  }

  const showLoader = useTipoffLoader(loading);

  if (error) return <ErrorNote message={error} />;

  // ============ DETAILSEITE PUSH ============
  if (view === 'push') {
    const total = (pushWith?.length ?? 0) + (pushWithout?.length ?? 0);
    return (
      <div className="flex flex-col gap-4">
        <DetailHeader name="Push" meta={`${pushWith?.length ?? 0} VON ${total} HABEN ES AKTIVIERT`} onBack={() => setView('list')} />
        <p className="text-[13px] leading-relaxed text-to-text3">
          Spieler aktivieren Push selbst auf ihrem Gerät. Hier siehst du nur, bei wem es ankommt – ändern kannst du
          es nicht für sie.
        </p>

        <div className="card space-y-3">
          <div className="flex gap-2.5">
            <div className={`flex flex-1 flex-col gap-0.5 rounded-to-lg border p-3.5 ${pushWith && pushWith.length > 0 ? 'border-to-borderMatchday bg-to-accentWash' : 'border-to-divider bg-to-surface2'}`}>
              <span className={`to-number text-2xl leading-none ${pushWith && pushWith.length > 0 ? 'text-to-accent' : 'text-to-text3'}`}>{pushWith?.length ?? 0}</span>
              <span className="to-data text-[8px] tracking-[0.1em] text-to-textDisabled">HABEN PUSH AN</span>
            </div>
            <div className="flex flex-1 flex-col gap-0.5 rounded-to-lg border border-to-divider bg-to-surface2 p-3.5">
              <span className="to-number text-2xl leading-none text-to-text3">{pushWithout?.length ?? 0}</span>
              <span className="to-data text-[8px] tracking-[0.1em] text-to-textDisabled">NOCH NICHT</span>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-to-textDisabled">
            Ohne Push sieht der Spieler alles trotzdem – nur eben erst, wenn er die App öffnet.
          </p>
        </div>

        <div className="card space-y-2.5">
          <span className="text-[15px] font-semibold text-to-text">Ohne Push</span>
          <div className="flex flex-col gap-2.5">
            {(pushWithout ?? []).length === 0 && <span className="text-[13px] text-to-text3">Alle haben Push aktiviert.</span>}
            {(pushWithout ?? []).map((p) => (
              <div key={p.name} className="flex items-center gap-2.5">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-to-surface2 text-[9px] text-to-text3">
                  {initialsOf(p.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-to-text2">{p.name}</span>
                <span className="to-data shrink-0 text-[9px] text-to-textDisabled">NIE AKTIVIERT</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card space-y-2.5">
          <span className="text-[15px] font-semibold text-to-text">Mit Push</span>
          <div className="flex flex-col gap-2.5">
            {(pushWith ?? []).length === 0 && <span className="text-[13px] text-to-text3">Noch niemand.</span>}
            {(pushWith ?? []).map((p) => (
              <div key={p.name} className="flex items-center gap-2.5">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-to-accentSoft text-[9px] text-to-accent">
                  {initialsOf(p.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-to-text2">{p.name}</span>
                <span className="to-data shrink-0 text-[9px] text-to-textDisabled">SEIT {p.since ? fmtDateShort(p.since.slice(0, 10)) : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ============ DETAILSEITE ERINNERUNGEN ============
  if (view === 'reminders') {
    const total = offsets?.length ?? 0;
    return (
      <div className="flex flex-col gap-4">
        <DetailHeader name="Erinnerungen" meta={`${total} ERINNERUNGEN AKTIV`} onBack={() => setView('list')} />
        <p className="text-[13px] leading-relaxed text-to-text3">
          Pro Bereich bis zu drei Push-Erinnerungen. Du entscheidest, wie viele und wann – keine ist auch eine
          Antwort.
        </p>

        <div className="card space-y-3.5">
          {REMINDER_AREAS.map((area) => {
            const areaOffsets = (offsets ?? []).filter((o) => o.area === area.id).sort((a, b) => b.minutes_before - a.minutes_before);
            return (
              <div key={area.id} className="flex flex-col gap-2.5 rounded-to-lg border border-to-divider bg-to-surface2 p-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex-1 text-[13px] font-semibold text-to-text2">{area.name}</span>
                  <span className={`to-data text-[9px] tracking-[0.1em] ${areaOffsets.length > 0 ? 'text-to-accent' : 'text-to-textDisabled'}`}>
                    {areaOffsets.length} VON 3
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-to-textDisabled">{area.hint}</p>
                <div className="flex flex-wrap gap-1.5">
                  {areaOffsets.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => deleteOffset(o.id)}
                      className="flex h-[30px] items-center gap-1.5 rounded-to-pill border border-to-borderMatchday bg-to-accentSoft px-3 text-[12px] font-semibold text-to-accent"
                    >
                      {offsetLabel(area, o.minutes_before / 60)}
                      <XIcon />
                    </button>
                  ))}
                  {areaOffsets.length < 3 ? (
                    <button
                      type="button"
                      onClick={() => setAddSheetArea(area.id)}
                      className="flex h-[30px] items-center gap-1.5 rounded-to-pill border border-dashed border-to-line px-3 text-[13px] text-to-text2"
                    >
                      <PlusIcon />
                      Erinnerung
                    </button>
                  ) : (
                    <span className="flex h-[30px] cursor-default items-center rounded-to-pill border border-to-divider px-3 text-[13px] text-to-textDisabled">
                      Mehr als drei gehen nicht
                    </span>
                  )}
                </div>
                {areaOffsets.length === 0 && <span className="text-[11px] text-to-textDisabled">Keine Erinnerung – hier geht nichts raus.</span>}
              </div>
            );
          })}
        </div>

        {addSheetArea &&
          (() => {
            const area = REMINDER_AREAS.find((a) => a.id === addSheetArea)!;
            const usedHours = new Set((offsets ?? []).filter((o) => o.area === area.id).map((o) => o.minutes_before / 60));
            const remaining = 3 - usedHours.size;
            return createPortal(
              <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setAddSheetArea(null)}>
                <div
                  className="flex w-full max-w-lg flex-col gap-3.5 rounded-t-[24px] border border-to-border bg-to-surface p-5 sm:rounded-b-[24px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
                  <span className="to-display-sm text-to-text">Wann erinnern?</span>
                  <p className="text-[12px] leading-relaxed text-to-textDisabled">
                    {area.name} · noch {remaining} von 3 möglich. Die Push geht zu diesem Zeitpunkt an alle, die noch
                    nicht geantwortet haben.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {area.picks.map((p) => {
                      const used = usedHours.has(p.hours);
                      return (
                        <button
                          key={p.hours}
                          type="button"
                          disabled={used}
                          onClick={() => addOffset(area.id, p.hours)}
                          className={`h-10 rounded-to-pill border px-3.5 text-[13px] font-semibold ${
                            used ? 'cursor-default border-to-line text-to-textDisabled opacity-40' : 'border-to-line bg-to-surface2 text-to-text2'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddSheetArea(null)}
                    className="btn-secondary h-[46px] w-full rounded-to-pill text-[15px]"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>,
              document.body
            );
          })()}
      </div>
    );
  }

  // ============ DETAILSEITE LIGA-TABELLE ============
  if (view === 'liga') {
    const ready = !!ligaStatus?.last_success_at;
    return (
      <div className="flex flex-col gap-4">
        <DetailHeader name="Liga-Tabelle" meta={ready ? 'SYNC LÄUFT' : 'NICHT EINGERICHTET'} onBack={() => setView('list')} />

        <div className="card space-y-3">
          <span className="text-[15px] font-semibold text-to-text">Liga-ID</span>
          <div className="flex gap-2.5">
            <input
              type="text"
              inputMode="numeric"
              className="input flex-1"
              value={ligaId}
              onChange={(e) => setLigaId(e.target.value)}
            />
            <button
              type="button"
              disabled={ligaSaving || !ligaId.trim()}
              onClick={saveLigaId}
              className="h-[44px] shrink-0 rounded-to-md bg-to-accent px-4 text-sm font-semibold text-to-onAccent disabled:opacity-60"
            >
              {ligaSaving ? 'Speichere…' : 'Speichern'}
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-to-textDisabled">
            Steht in der URL der DBB-Tabellenseite: …&amp;liga_id=<strong>12345</strong>
          </p>
        </div>

        <div className="card space-y-3">
          <span className="text-[15px] font-semibold text-to-text">Abgleich</span>
          <div className={`flex items-center gap-2.5 rounded-to-lg border p-3.5 ${ready ? 'border-to-borderMatchday bg-to-accentWash' : 'border-to-vacationFrame bg-to-vacationSoft'}`}>
            <CheckIcon className={ready ? 'text-to-accent' : 'text-to-vacation'} />
            <span className="to-data flex-1 text-[9px] tracking-[0.1em] text-to-text2">
              {ready
                ? `SYNC LÄUFT · ZULETZT ${fmtDateTimeShort(ligaStatus!.last_success_at!).replace(' Uhr', '')}`
                : 'NOCH KEIN ABGLEICH GELAUFEN'}
            </span>
            <button type="button" disabled={ligaSyncing} onClick={syncNow} className="shrink-0 text-[12px] font-semibold text-to-accent disabled:opacity-50">
              {ligaSyncing ? 'Holt…' : 'Jetzt holen'}
            </button>
          </div>
          {ligaMessage && <p className="text-[11px] text-to-text3">{ligaMessage}</p>}
          <p className="text-[11px] leading-relaxed text-to-textDisabled">
            Die Tabelle wird einmal täglich geholt und unter „Spiele" angezeigt.
          </p>
        </div>
      </div>
    );
  }

  // ============ LISTE ============
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-to-text3">
        Was dein Team nicht braucht, schaltest du hier aus – die Funktion verschwindet überall in der App.
        Vorhandene Daten bleiben erhalten und sind beim Einschalten wieder da.
      </p>

      {!ligaStatus?.last_success_at && (
        <div className="rounded-to-xl border border-to-vacationFrame bg-to-vacationSoft p-3.5">
          <span className="to-data block text-[9px] tracking-[0.12em] text-to-vacation">BRAUCHT EINRICHTUNG · 1</span>
          <p className="mt-1.5 text-[12px] leading-relaxed text-to-text2">
            Die Liga-Tabelle holt ihre Daten täglich vom DBB. Solange der Abgleich nicht läuft, lässt sie sich nicht
            einschalten.
          </p>
        </div>
      )}

      {showLoader && <div className="py-6 text-center text-sm text-to-text3">Lädt…</div>}

      {!showLoader &&
        GROUP_LABELS.map((groupLabel, groupIndex) => (
          <div key={groupLabel} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">{groupLabel}</span>
              <span className="h-px flex-1 bg-to-divider" />
            </div>
            <div className="overflow-hidden rounded-to-xl border border-to-border bg-to-surface">
              {groupIndex === 0 && (
                <>
                  <FixedRow name="Spiele & Kader" />
                  <FixedRow name="Training" />
                </>
              )}
              {FEATURES.filter((f) => f.group === groupIndex).map((f) => {
                const blocked = isBlocked(f);
                const isOn = flags[f.id] && !blocked;
                const status = statusFor(f, isOn) ?? (isOn ? null : { text: f.keep ? 'AUS · DATEN BLEIBEN GESPEICHERT' : 'AUS', tone: '' as const });
                const toneClass = status?.tone === 'volt' ? 'text-to-accent' : status?.tone === 'warn' ? 'text-to-vacation' : 'text-to-textDisabled';
                const clickable = f.detail && isOn;
                const Row = (
                  <span className={`flex flex-1 flex-col gap-0.5 ${isOn ? '' : 'opacity-70'}`}>
                    <span className={`text-[14px] font-medium ${isOn ? 'text-to-text' : 'text-to-text3'}`}>{f.name}</span>
                    {status && <span className={`to-data text-[9px] tracking-[0.1em] ${toneClass}`}>{status.text}</span>}
                  </span>
                );
                return (
                  <div key={f.id} className="flex min-h-[62px] items-center gap-3 border-t border-to-surface2 px-4 py-2.5 first:border-t-0">
                    {clickable ? (
                      <button type="button" onClick={() => setView(f.detail!)} className="flex flex-1 items-center gap-2.5 text-left">
                        {Row}
                        <ChevIcon />
                      </button>
                    ) : (
                      Row
                    )}
                    <Switch on={isOn} disabled={blocked || savingKey === f.id} onClick={() => handleSwitchClick(f)} label={f.name} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      {confirmKey &&
        (() => {
          const f = FEATURES.find((x) => x.id === confirmKey)!;
          return createPortal(
            <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setConfirmKey(null)}>
              <div
                className="flex w-full max-w-lg flex-col gap-3.5 rounded-t-[24px] border border-to-border bg-to-surface p-5 sm:rounded-b-[24px]"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
                <span className="to-display-sm text-to-text">{f.name} ausschalten?</span>
                <p className="text-[12px] leading-relaxed text-to-textDisabled">
                  Die Funktion verschwindet überall: aus der Menüleiste, von der Startseite und aus dem
                  Adminbereich. Nur hier kannst du sie wieder einschalten.
                </p>
                {f.keep && (
                  <div className="flex items-start gap-2.5 rounded-to-lg border border-to-divider bg-to-surface2 p-3.5 text-[12px] leading-relaxed text-to-text2">
                    <CheckIcon className="mt-0.5 shrink-0 text-to-accent" />
                    <span>{f.keep} bleiben gespeichert und sind beim Einschalten wieder da.</span>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={savingKey === f.id}
                    onClick={async () => {
                      await setFlag(f.id, false);
                      setConfirmKey(null);
                    }}
                    className="btn-primary h-[46px] rounded-to-pill text-[15px] disabled:opacity-60"
                  >
                    Ausschalten
                  </button>
                  <button type="button" onClick={() => setConfirmKey(null)} className="btn-secondary h-[46px] rounded-to-pill text-[15px]">
                    Abbrechen
                  </button>
                </div>
              </div>
            </div>,
            document.body
          );
        })()}
    </div>
  );

  async function addOffset(area: ReminderArea, hours: number) {
    const { error: insertError } = await supabase.from('reminder_offsets').insert({ area, minutes_before: Math.round(hours * 60) });
    if (insertError) {
      setError('Erinnerung konnte nicht gespeichert werden.');
      return;
    }
    setAddSheetArea(null);
    await loadOffsets();
  }

  async function deleteOffset(id: string) {
    const { error: deleteError } = await supabase.from('reminder_offsets').delete().eq('id', id);
    if (deleteError) {
      setError('Erinnerung konnte nicht entfernt werden.');
      return;
    }
    await loadOffsets();
  }

  async function saveLigaId() {
    const trimmed = ligaId.trim();
    if (!trimmed) return;
    setLigaSaving(true);
    try {
      const { error: updError } = await supabase.from('standings_sync_status').update({ liga_id: trimmed }).eq('id', 1);
      if (updError) throw updError;
      await loadLiga();
    } catch {
      setError('Liga-ID konnte nicht gespeichert werden.');
    } finally {
      setLigaSaving(false);
    }
  }

  async function syncNow() {
    setLigaSyncing(true);
    setLigaMessage(null);
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const response = await fetch('/api/sync-league-standings', {
        method: 'POST',
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {}
      });
      const body = await response.json();
      if (!response.ok) {
        setLigaMessage(`Fehlgeschlagen: ${body.error ?? response.statusText}`);
      } else if (body.skipped) {
        setLigaMessage('Sync lief durch, aber die DBB-Seite lieferte keine erkennbaren Tabellenzeilen.');
      } else {
        setLigaMessage(`Aktualisiert: ${body.updated} Teams (Liga ${body.ligaId}).`);
      }
      await loadLiga();
    } catch {
      setLigaMessage('Sync konnte nicht gestartet werden.');
    } finally {
      setLigaSyncing(false);
    }
  }
}

function FixedRow({ name }: { name: string }) {
  return (
    <div className="flex min-h-[62px] items-center gap-3 border-t border-to-surface2 px-4 py-2.5 first:border-t-0">
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-[14px] font-medium text-to-text">{name}</span>
        <span className="to-data text-[9px] tracking-[0.1em] text-to-textDisabled">GRUNDFUNKTION · IMMER AN</span>
      </span>
      <span className="to-data shrink-0 text-[9px] tracking-[0.1em] text-to-textDisabled">FEST</span>
      <Switch on disabled onClick={() => {}} label={name} />
    </div>
  );
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
