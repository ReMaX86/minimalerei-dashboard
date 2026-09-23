import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { fmtDateBadge, fmtDateShort, fmtTime, mapsUrl } from '../lib/format';
import { EMPTY_MEETING_POINT, type MeetingPointFormValue } from './MeetingPointFields';
import {
  meetingPoints,
  playerAbsenceOn,
  type CarpoolClaim,
  type CarpoolOffer,
  type Game,
  type GameSquadRow,
  type Player,
  type PlayerAbsence
} from '../types/database';

const MAX_SQUAD_SIZE = 12;
// Kein exakter Vorgabewert in PROMPT.md ("die Vorlage zeigt nur den
// Anfang") — bewusst so gewählt, dass alle bereits nominierten Spieler
// immer sichtbar sind, auch wenn das über diese Zahl hinausgeht.
const SQUAD_PREVIEW_MIN = 8;

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-text3" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}
function RouteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-text3" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-textDisabled" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-to-text3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}
function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M6 12h12" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 6v12" />
      <path d="M6 12h12" />
    </svg>
  );
}

interface State {
  squad: GameSquadRow[];
  players: Player[];
  absences: PlayerAbsence[];
  offers: CarpoolOffer[];
  claims: CarpoolClaim[];
}

type Tone = 'ok' | 'idle' | 'bad' | 'away';
const TONE_CLASS: Record<Tone, string> = {
  ok: 'text-to-accent',
  idle: 'text-to-text3',
  bad: 'text-to-dangerText',
  away: 'text-to-vacation'
};

function statusFor(
  row: GameSquadRow | undefined,
  published: boolean,
  absence: PlayerAbsence | undefined
): { text: string; tone: Tone } {
  if (absence) {
    return { text: `URLAUB · ${fmtDateShort(absence.start_date)} – ${fmtDateShort(absence.end_date)}`, tone: 'away' };
  }
  const confirmation = row?.confirmation ?? 'pending';
  if (confirmation === 'confirmed') return { text: published ? 'ZUGESAGT' : 'KANN', tone: 'ok' };
  if (confirmation === 'declined') return { text: published ? 'ABGESAGT' : 'KANN NICHT', tone: 'bad' };
  return { text: 'KEINE ANTWORT', tone: 'idle' };
}

// `label` ist konfigurierbar, weil dieselbe Karte auch für ein beliebiges
// Spiel aus dem Spielplan-Reiter (Element 10) geöffnet wird, nicht nur für
// den wirklich nächsten Spieltag — "NÄCHSTER SPIELTAG" wäre dort falsch.
export function NextGameSquadCard({ game, label = 'NÄCHSTER SPIELTAG' }: { game: Game; label?: string }) {
  const { role, isAdmin, player } = useAuth();
  const { flags } = useFeatureFlags();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [squadExpanded, setSquadExpanded] = useState(false);
  const [squadViewOpen, setSquadViewOpen] = useState(false);
  const [meetingSheetOpen, setMeetingSheetOpen] = useState(false);
  const [meetingForm, setMeetingForm] = useState<MeetingPointFormValue>(EMPTY_MEETING_POINT);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [rideOfferOpen, setRideOfferOpen] = useState(false);
  const [rideSeats, setRideSeats] = useState(3);
  const [rideNote, setRideNote] = useState('');
  const [ridesBusyKey, setRidesBusyKey] = useState<string | null>(null);

  const showCarpool = flags.carpool && !game.is_home && role !== 'viewer';

  const load = useCallback(async () => {
    setError(null);
    const [squadRes, playersRes, absencesRes, offersRes, claimsRes] = await Promise.all([
      supabase.from('game_squad').select('*').eq('game_id', game.id),
      supabase.from('players').select('*').eq('is_active', true),
      flags.absences
        ? supabase.from('player_absences').select('*').lte('start_date', game.game_date).gte('end_date', game.game_date)
        : Promise.resolve({ data: [] as PlayerAbsence[], error: null }),
      showCarpool
        ? supabase.from('carpool_offers').select('*').eq('game_id', game.id)
        : Promise.resolve({ data: [] as CarpoolOffer[], error: null }),
      showCarpool
        ? supabase.from('carpool_claims').select('*').eq('game_id', game.id)
        : Promise.resolve({ data: [] as CarpoolClaim[], error: null })
    ]);
    if (squadRes.error || playersRes.error || absencesRes.error || offersRes.error || claimsRes.error) {
      setError('Fehler beim Laden des Kaders.');
      return;
    }
    setState({
      squad: (squadRes.data as GameSquadRow[]) ?? [],
      players: ((playersRes.data as Player[]) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'de')),
      absences: (absencesRes.data as PlayerAbsence[]) ?? [],
      offers: (offersRes.data as CarpoolOffer[]) ?? [],
      claims: (claimsRes.data as CarpoolClaim[]) ?? []
    });
  }, [game.id, game.game_date, flags.absences, showCarpool]);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden des Kaders.'));
  }, [load]);

  useEffect(() => {
    setMeetingForm({
      meeting_time_hall: game.meeting_time_hall?.slice(0, 5) ?? '',
      meeting_time_carpool: game.meeting_time_carpool?.slice(0, 5) ?? '',
      meeting_point_carpool: game.meeting_point_carpool ?? ''
    });
  }, [game.id, game.meeting_time_hall, game.meeting_time_carpool, game.meeting_point_carpool]);

  useEffect(() => {
    if (searchParams.get('kader') !== '1') return;
    setSquadViewOpen(true);
  }, [searchParams]);

  // Ersetzt die vorherige, an "Kader-Bearbeitung öffnen" gekoppelte Logik:
  // der Kaderblock ist jetzt (wie in der Vorlage) immer sichtbar statt
  // ein-/ausklappbar, daher gilt eine offene Absage-Meldung als gesehen,
  // sobald der Trainer diese Karte einmal sieht.
  useEffect(() => {
    if (!isAdmin || !game.squad_decline_pending) return;
    supabase.from('games').update({ squad_decline_pending: false }).eq('id', game.id);
  }, [isAdmin, game.id, game.squad_decline_pending]);

  if (error) return <p className="card text-sm text-to-dangerText">{error}</p>;
  if (!state) return <div className="card h-[260px] animate-pulse !p-0" />;

  const playersById: Record<string, Player> = {};
  state.players.forEach((p) => (playersById[p.id] = p));
  const squadByPlayer: Record<string, GameSquadRow> = {};
  state.squad.forEach((row) => (squadByPlayer[row.player_id] = row));
  const absenceByPlayer: Record<string, PlayerAbsence> = {};
  state.absences.forEach((a) => (absenceByPlayer[a.player_id] = a));

  const selectedIds = state.squad.filter((s) => s.is_selected).map((s) => s.player_id);
  const selectedCount = selectedIds.length;
  const atCap = selectedCount >= MAX_SQUAD_SIZE;
  const declinedNames = state.squad
    .filter((s) => s.confirmation === 'declined')
    .map((s) => playersById[s.player_id]?.name)
    .filter((n): n is string => !!n);

  const points = meetingPoints(game);
  const isPlayerOnly = role === 'player' && !isAdmin;

  async function toggle(playerId: string) {
    const selected = squadByPlayer[playerId]?.is_selected ?? false;
    const willSelect = !selected;
    if (willSelect && selectedCount >= MAX_SQUAD_SIZE) return;
    if (willSelect && absenceByPlayer[playerId]) return;
    setTogglingId(playerId);
    setError(null);
    try {
      const { error: upsertError } = await supabase
        .from('game_squad')
        .upsert(
          { game_id: game.id, player_id: playerId, is_selected: willSelect, confirmation: 'pending' },
          { onConflict: 'game_id,player_id' }
        );
      if (upsertError) throw upsertError;
      await load();
    } catch {
      setError('Änderung konnte nicht gespeichert werden.');
    } finally {
      setTogglingId(null);
    }
  }

  async function respond(confirmed: boolean) {
    setResponding(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('respond_to_squad', {
        p_game_id: game.id,
        p_confirmed: confirmed
      });
      if (rpcError) throw rpcError;
      await load();
    } catch {
      setError('Rückmeldung konnte nicht gespeichert werden.');
    } finally {
      setResponding(false);
    }
  }

  async function saveMeetingPoint() {
    setSavingMeeting(true);
    setError(null);
    try {
      const { error: updError } = await supabase
        .from('games')
        .update({
          meeting_time_hall: meetingForm.meeting_time_hall || null,
          meeting_time_carpool: game.is_home ? null : meetingForm.meeting_time_carpool || null,
          meeting_point_carpool: game.is_home ? null : meetingForm.meeting_point_carpool.trim() || null
        })
        .eq('id', game.id);
      if (updError) throw updError;
      setMeetingSheetOpen(false);
      await load();
    } catch {
      setError('Treffpunkt konnte nicht gespeichert werden.');
    } finally {
      setSavingMeeting(false);
    }
  }

  async function togglePublish() {
    setPublishing(true);
    setError(null);
    try {
      const { error: updError } = await supabase
        .from('games')
        .update({ squad_published: !game.squad_published })
        .eq('id', game.id);
      if (updError) throw updError;
      await load();
    } catch {
      setError('Status konnte nicht geändert werden.');
    } finally {
      setPublishing(false);
    }
  }

  async function createRideOffer(e: FormEvent) {
    e.preventDefault();
    if (!player) return;
    setRidesBusyKey('new-offer');
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('carpool_offers')
        .insert({ game_id: game.id, driver_player_id: player.id, seats: rideSeats, note: rideNote.trim() || null });
      if (insertError) throw insertError;
      setRideOfferOpen(false);
      setRideSeats(3);
      setRideNote('');
      await load();
    } catch {
      setError('Angebot konnte nicht gespeichert werden.');
    } finally {
      setRidesBusyKey(null);
    }
  }

  async function cancelRideOffer(offerId: string) {
    setRidesBusyKey(offerId);
    setError(null);
    try {
      const { error: delError } = await supabase.from('carpool_offers').delete().eq('id', offerId);
      if (delError) throw delError;
      await load();
    } catch {
      setError('Angebot konnte nicht zurückgezogen werden.');
    } finally {
      setRidesBusyKey(null);
    }
  }

  async function claimRideSeat(offer: CarpoolOffer) {
    if (!player) return;
    setRidesBusyKey(offer.id);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('carpool_claims')
        .insert({ offer_id: offer.id, game_id: game.id, player_id: player.id });
      if (insertError) throw insertError;
      await load();
    } catch {
      setError('Platz konnte nicht reserviert werden.');
    } finally {
      setRidesBusyKey(null);
    }
  }

  async function cancelRideClaim(offerId: string) {
    if (!player) return;
    setRidesBusyKey(offerId);
    setError(null);
    try {
      const { error: delError } = await supabase
        .from('carpool_claims')
        .delete()
        .eq('offer_id', offerId)
        .eq('player_id', player.id);
      if (delError) throw delError;
      await load();
    } catch {
      setError('Absage konnte nicht gespeichert werden.');
    } finally {
      setRidesBusyKey(null);
    }
  }

  // Reihenfolge PROMPT.md "Kader": zuerst im Kader, dann verfügbar ohne
  // Antwort, dann abgesagt (ohne Kaderplatz — durch die neue
  // respond_to_squad()-Logik praktisch nicht mehr erreichbar, da eine
  // Absage den Kaderplatz nicht mehr räumt; hier trotzdem defensiv
  // behandelt), zuletzt abwesend. Innerhalb jeder Gruppe alphabetisch
  // (state.players ist das schon).
  const groupIm: Player[] = [];
  const groupAvailable: Player[] = [];
  const groupDeclined: Player[] = [];
  const groupAway: Player[] = [];
  state.players.forEach((p) => {
    const row = squadByPlayer[p.id];
    if (row?.is_selected) groupIm.push(p);
    else if (absenceByPlayer[p.id]) groupAway.push(p);
    else if (row?.confirmation === 'declined') groupDeclined.push(p);
    else groupAvailable.push(p);
  });
  const orderedPlayers = [...groupIm, ...groupAvailable, ...groupDeclined, ...groupAway];
  const previewCount = Math.max(SQUAD_PREVIEW_MIN, groupIm.length);
  const visiblePlayers = squadExpanded ? orderedPlayers : orderedPlayers.slice(0, previewCount);
  const hiddenCount = orderedPlayers.length - visiblePlayers.length;

  const myRow = player ? squadByPlayer[player.id] : undefined;
  const myConfirmation = myRow?.confirmation ?? 'pending';
  const isNominated = !!myRow?.is_selected;
  const nomination: 'in' | 'out' = isNominated ? 'in' : 'out';

  const squadFaces = selectedIds.slice(0, 3).map((id) => initialsOf(playersById[id]?.name ?? '?'));
  const squadFaceExtra = selectedCount - squadFaces.length;

  const seatFree = state.offers.reduce((sum, o) => sum + (o.seats - state.claims.filter((c) => c.offer_id === o.id).length), 0);
  const myOffer = player ? state.offers.find((o) => o.driver_player_id === player.id) : undefined;
  const myClaim = player ? state.claims.find((c) => c.player_id === player.id) : undefined;

  return (
    <section className="card overflow-hidden !p-0">
      {/* Kopf */}
      <div className="flex flex-col gap-3.5 p-5">
        <div className="flex items-center justify-between gap-2.5">
          <span className="to-label">{label}</span>
          <span
            className={`to-data inline-flex h-6 shrink-0 items-center gap-1.5 rounded-to-pill px-2.5 text-[10px] font-semibold ${
              game.squad_published ? 'bg-to-accentSoft text-to-accent' : 'bg-to-dangerSoft text-to-dangerText'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {game.squad_published ? 'KADER STEHT' : 'KADER AUSSTEHEND'}
          </span>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="to-display-lg truncate text-to-text">{game.opponent}</p>
            <p className="to-data text-[13px] text-to-text2">
              {fmtDateBadge(game.game_date)} · {fmtTime(game.game_time)} UHR
            </p>
          </div>
          <span
            className={`to-data inline-flex h-6 shrink-0 items-center rounded-to-sm px-2.5 text-[10px] font-semibold ${
              game.is_home ? 'bg-to-accentSoft text-to-accent' : 'bg-to-surface2 text-to-text2'
            }`}
          >
            {game.is_home ? 'HEIM' : 'AUSWÄRTS'}
          </span>
        </div>

        <a href={mapsUrl(game.location)} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-3">
          <PinIcon />
          <span className="flex-1 truncate text-[15px] text-to-text">{game.location}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-to-accent">
            Route
            <RouteIcon />
          </span>
        </a>

        {points.length > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-to-lg bg-to-surface2 p-3.5">
            <div className="flex items-center gap-2">
              <span className="to-label flex-1">TREFFPUNKT</span>
              {isAdmin && (
                <button type="button" className="text-[13px] font-semibold text-to-accent" onClick={() => setMeetingSheetOpen(true)}>
                  Ändern
                </button>
              )}
            </div>
            {points.map((m) => (
              <div key={m.label} className="flex items-baseline justify-between gap-2.5">
                <span className="text-sm text-to-text">
                  {m.label === 'Fahrgemeinschaft' ? 'Fahrgemeinschaft' : m.label === 'Halle' ? 'An der Halle' : 'Direkt an der Halle'}
                  {m.place && (
                    <>
                      <br />
                      <span className="text-xs text-to-text3">{m.place}</span>
                    </>
                  )}
                </span>
                {m.time && <span className="to-data shrink-0 text-sm text-to-accent">{fmtTime(m.time)}</span>}
              </div>
            ))}
          </div>
        ) : (
          isAdmin && (
            <button type="button" className="flex min-h-10 items-center gap-3" onClick={() => setMeetingSheetOpen(true)}>
              <ClockIcon />
              <span className="flex-1 text-left text-[15px] text-to-text3">Treffpunkt hinterlegen</span>
              <ChevronRightIcon />
            </button>
          )
        )}
      </div>

      {/* Kaderblock — Trainer */}
      {isAdmin && (
        <div className="flex flex-col gap-3 border-t border-to-divider bg-to-surface2 px-5 pb-5 pt-4">
          <div className="flex items-baseline justify-between gap-2.5">
            <span className="to-label">KADER</span>
            <span className="to-number text-[20px] leading-none text-to-accent">
              {selectedCount}
              <span className="text-to-textDisabled">/{MAX_SQUAD_SIZE}</span>
            </span>
          </div>
          <div className="to-segment-track">
            {Array.from({ length: MAX_SQUAD_SIZE }).map((_, i) => (
              <span key={i} className={`to-segment ${i < selectedCount ? 'to-segment-filled' : ''}`} />
            ))}
          </div>

          {atCap && (
            <div className="flex items-center gap-2.5 rounded-to-lg bg-to-accentSoft px-3.5 py-3 text-[13px] text-to-accent">
              <CheckIcon />
              <span>Kader ist voll. Zum Tauschen erst einen Haken entfernen.</span>
            </div>
          )}
          {game.squad_published && declinedNames.length > 0 && (
            <div className="flex items-center gap-2.5 rounded-to-lg bg-to-dangerSoft px-3.5 py-3 text-[13px] text-to-dangerText">
              <WarnIcon />
              <span>{declinedNames.join(', ')} {declinedNames.length === 1 ? 'hat' : 'haben'} abgesagt – du kannst jemanden nachnominieren.</span>
            </div>
          )}

          <ul className="flex flex-col">
            {visiblePlayers.map((p) => {
              const row = squadByPlayer[p.id];
              const selected = !!row?.is_selected;
              const absence = absenceByPlayer[p.id];
              const blocked = !selected && !!absence;
              const locked = !selected && atCap;
              const status = statusFor(row, game.squad_published, absence);
              const isMe = player?.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={blocked || locked || togglingId === p.id}
                    aria-disabled={blocked}
                    onClick={() => toggle(p.id)}
                    className="flex min-h-[52px] w-full items-center gap-2.5 text-left disabled:cursor-not-allowed"
                  >
                    <span className="to-data flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-to-surface text-[11px] text-to-text2">
                      {initialsOf(p.name)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={`truncate text-[15px] font-semibold -tracking-[0.01em] ${blocked ? 'text-to-text3' : 'text-to-text'}`}>
                        {p.name}
                        {isMe && ' (Du)'}
                      </span>
                      <span className={`to-data text-[10px] tracking-[0.08em] ${TONE_CLASS[status.tone]}`}>{status.text}</span>
                    </span>
                    <span
                      className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                        selected ? 'border-to-accent bg-to-accent' : 'border-to-line bg-transparent'
                      } ${blocked || locked ? 'opacity-45' : ''}`}
                    >
                      {selected && <CheckIcon className="text-to-onAccent" />}
                    </span>
                  </button>
                  {isMe && selected && myConfirmation === 'pending' && (
                    <div className="mb-2 flex items-center gap-2 pl-[44px]">
                      <span className="text-xs text-to-text3">Kannst du selbst?</span>
                      <button
                        type="button"
                        disabled={responding}
                        onClick={() => respond(true)}
                        className="pill pill-ok disabled:opacity-40"
                      >
                        ✓ Kann
                      </button>
                      <button
                        type="button"
                        disabled={responding}
                        onClick={() => respond(false)}
                        className="pill pill-open disabled:opacity-40"
                      >
                        ✗ Kann nicht
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {hiddenCount > 0 && !squadExpanded && (
            <button
              type="button"
              className="flex min-h-10 items-center gap-2 text-[13px] text-to-text2"
              onClick={() => setSquadExpanded(true)}
            >
              <span className="flex-1 text-left">Alle {orderedPlayers.length} Spieler anzeigen</span>
              <ChevronDownIcon open={false} />
            </button>
          )}

          <button type="button" onClick={togglePublish} disabled={publishing} className="btn-primary !h-[52px] w-full text-[15px]">
            {publishing ? 'Speichere…' : game.squad_published ? 'Kader aktualisieren' : 'Kader veröffentlichen'}
          </button>
        </div>
      )}

      {/* Spielerband */}
      {isPlayerOnly && (
        <div
          className={`flex flex-col gap-3 border-t border-to-divider px-5 pb-5 pt-4 ${
            game.squad_published && nomination === 'in' ? 'bg-to-accentWash' : 'bg-to-surface2'
          }`}
        >
          {!game.squad_published ? (
            <>
              <span className="to-label">KADER</span>
              <span className="text-[15px] text-to-text2">Der Kader für dieses Spiel steht noch nicht.</span>
            </>
          ) : nomination === 'out' ? (
            <>
              <span className="to-label">KADER</span>
              <span className="text-[15px] text-to-text2">Du bist diesmal nicht im Kader.</span>
            </>
          ) : (
            <>
              <span className="to-data text-[11px] tracking-[0.12em] text-to-accent">DU BIST IM KADER</span>
              <span className="text-[15px] text-to-text2">
                {myConfirmation === 'confirmed'
                  ? 'Du hast zugesagt.'
                  : myConfirmation === 'declined'
                  ? 'Du hast abgesagt. Der Trainer ist informiert.'
                  : 'Sag kurz Bescheid, ob du dabei bist.'}
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={responding}
                  onClick={() => respond(true)}
                  className={
                    myConfirmation === 'confirmed'
                      ? 'btn-primary !h-[50px] text-[15px]'
                      : 'btn-secondary !h-[50px] text-[15px]'
                  }
                >
                  {myConfirmation === 'confirmed' ? 'Dabei' : 'Bin dabei'}
                </button>
                <button
                  type="button"
                  disabled={responding}
                  onClick={() => respond(false)}
                  className={
                    myConfirmation === 'declined'
                      ? 'inline-flex h-[50px] items-center justify-center rounded-to-md bg-to-dangerSoft text-[15px] font-medium text-to-dangerText'
                      : 'btn-secondary !h-[50px] text-[15px]'
                  }
                >
                  Kann nicht
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Kader ansehen — Spieler */}
      {isPlayerOnly && game.squad_published && (
        <>
          <button
            type="button"
            onClick={() => setSquadViewOpen((v) => !v)}
            className="flex min-h-[60px] w-full items-center gap-3 border-t border-to-divider px-5"
          >
            <span className="flex">
              {squadFaces.map((f, i) => (
                <span
                  key={i}
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-to-surface bg-to-surface2 text-[9px] text-to-text2 ${
                    i === 0 ? '' : '-ml-2'
                  }`}
                >
                  {f}
                </span>
              ))}
              {squadFaceExtra > 0 && (
                <span className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-to-surface bg-to-surface2 text-[9px] text-to-text2">
                  +{squadFaceExtra}
                </span>
              )}
            </span>
            <span className="flex-1 text-left text-sm font-semibold text-to-text">Kader ansehen</span>
            <span className="to-data text-[11px] text-to-text3">
              {selectedCount} SPIELER
            </span>
            <ChevronDownIcon open={squadViewOpen} />
          </button>
          {squadViewOpen && (
            <ul className="flex flex-col gap-2 border-t border-to-divider px-5 py-4">
              {selectedCount === 0 ? (
                <p className="text-sm text-to-text3">Niemand im Kader.</p>
              ) : (
                state.players
                  .filter((p) => squadByPlayer[p.id]?.is_selected)
                  .map((p) => {
                    const status = statusFor(squadByPlayer[p.id], true, undefined);
                    const isMe = player?.id === p.id;
                    return (
                      <li key={p.id} className="flex items-center gap-2.5">
                        <span className="to-data flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-to-surface text-[11px] text-to-text2">
                          {initialsOf(p.name)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[15px] font-semibold -tracking-[0.01em] text-to-text">
                            {p.name}
                            {isMe && ' (Du)'}
                          </span>
                          <span className={`to-data text-[10px] tracking-[0.08em] ${TONE_CLASS[status.tone]}`}>{status.text}</span>
                        </span>
                      </li>
                    );
                  })
              )}
            </ul>
          )}
        </>
      )}

      {/* Mitfahrgelegenheit */}
      {showCarpool && (
        <div className="flex flex-col gap-3 border-t border-to-divider px-5 pb-5 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="to-label flex-1">MITFAHRGELEGENHEIT</span>
            {state.offers.length > 0 && (
              <span className="to-data text-[11px] text-to-text3">{seatFree === 1 ? '1 PLATZ FREI' : `${seatFree} PLÄTZE FREI`}</span>
            )}
          </div>

          {state.offers.length === 0 ? (
            <p className="text-[14px] text-to-text2">Noch keine Fahrer eingetragen.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {state.offers.map((o) => {
                const takenBy = state.claims.filter((c) => c.offer_id === o.id);
                const free = o.seats - takenBy.length;
                const isMyOffer = o.driver_player_id === player?.id;
                const isMyClaim = myClaim?.offer_id === o.id;
                return (
                  <div key={o.id} className="flex flex-col gap-2">
                    <div className={`flex flex-col gap-2.5 rounded-to-lg p-3.5 ${isMyOffer ? 'bg-to-accentSoft' : 'bg-to-surface2'}`}>
                      <div className="flex items-center gap-3">
                        <span className="to-data flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-to-surface text-[11px] text-to-text2">
                          {initialsOf(playersById[o.driver_player_id]?.name ?? '?')}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[15px] font-semibold -tracking-[0.01em] text-to-text">
                            {playersById[o.driver_player_id]?.name ?? '?'}
                          </span>
                          {o.note && <span className="truncate text-xs text-to-text3">{o.note}</span>}
                        </span>
                        {!isMyOffer &&
                          (isMyClaim ? (
                            <button
                              type="button"
                              disabled={ridesBusyKey === o.id}
                              onClick={() => cancelRideClaim(o.id)}
                              className="h-[34px] shrink-0 rounded-to-pill border border-to-line px-3.5 text-[13px] font-semibold text-to-text disabled:opacity-40"
                            >
                              Aussteigen
                            </button>
                          ) : free > 0 ? (
                            <button
                              type="button"
                              disabled={ridesBusyKey === o.id || (!!myClaim && myClaim.offer_id !== o.id) || !!myOffer}
                              onClick={() => claimRideSeat(o)}
                              className="h-[34px] shrink-0 rounded-to-pill border border-to-line px-3.5 text-[13px] font-semibold text-to-text disabled:opacity-40"
                            >
                              {free} frei
                            </button>
                          ) : (
                            <span className="h-[34px] shrink-0 rounded-to-pill border border-to-line px-3.5 text-[13px] font-semibold leading-[34px] text-to-text opacity-45">
                              Voll
                            </span>
                          ))}
                      </div>
                      {/* "Angebot zurückziehen" ist als Text zu breit, um bei
                          390px neben Name/Notiz in eine Zeile zu passen —
                          anders als "frei"/"Voll"/"Aussteigen" (kurz genug)
                          bekommt der Knopf für das eigene Angebot deshalb
                          eine eigene, volle Zeile statt wie in der
                          Vorlage-Struktur inline zu stehen. */}
                      {isMyOffer && (
                        <button
                          type="button"
                          disabled={ridesBusyKey === o.id}
                          onClick={() => cancelRideOffer(o.id)}
                          className="h-[38px] w-full rounded-to-pill bg-to-accent text-[13px] font-semibold text-to-onAccent disabled:opacity-40"
                        >
                          Angebot zurückziehen
                        </button>
                      )}
                    </div>
                    {takenBy.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pl-11">
                        {takenBy.map((c) => (
                          <span key={c.player_id} className="inline-flex h-[26px] items-center rounded-to-pill bg-to-surface px-2.5 text-xs text-to-text2">
                            {playersById[c.player_id]?.name ?? '?'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {player && !myOffer && (
            <button type="button" className="btn-secondary !h-[46px] w-full text-sm" onClick={() => setRideOfferOpen(true)}>
              Ich biete Plätze an
            </button>
          )}
        </div>
      )}

      {error && <p className="border-t border-to-divider px-5 py-3 text-xs text-to-dangerText">{error}</p>}

      {meetingSheetOpen && (
        <MeetingSheet
          isHome={game.is_home}
          value={meetingForm}
          onChange={setMeetingForm}
          busy={savingMeeting}
          onSave={saveMeetingPoint}
          onCancel={() => setMeetingSheetOpen(false)}
        />
      )}

      {rideOfferOpen && (
        <RideOfferSheet
          seats={rideSeats}
          onSeatsChange={setRideSeats}
          note={rideNote}
          onNoteChange={setRideNote}
          busy={ridesBusyKey === 'new-offer'}
          onSubmit={createRideOffer}
          onCancel={() => setRideOfferOpen(false)}
        />
      )}
    </section>
  );
}

function MeetingSheet({
  isHome,
  value,
  onChange,
  busy,
  onSave,
  onCancel
}: {
  isHome: boolean;
  value: MeetingPointFormValue;
  onChange: (v: MeetingPointFormValue) => void;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-t-[24px] border border-to-line bg-to-surface2 p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <h2 className="to-display-sm text-to-text">Treffpunkt</h2>
          <p className="text-[13px] text-to-text3">
            {isHome ? 'Heimspiel · alle treffen sich an der Halle.' : 'Auswärtsspiel · Fahrgemeinschaft und Halle getrennt.'}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-3.5">
          {!isHome && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="to-label">FAHRGEMEINSCHAFT — ZEIT</span>
                <input
                  type="time"
                  className="to-data input"
                  value={value.meeting_time_carpool}
                  onChange={(e) => onChange({ ...value, meeting_time_carpool: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="to-label">FAHRGEMEINSCHAFT — ORT</span>
                <input
                  type="text"
                  placeholder="z. B. Parkplatz Schulzentrum"
                  className="input"
                  value={value.meeting_point_carpool}
                  onChange={(e) => onChange({ ...value, meeting_point_carpool: e.target.value })}
                />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="to-label">{isHome ? 'AN DER HALLE — ZEIT' : 'DIREKT AN DER HALLE — ZEIT'}</span>
            <input
              type="time"
              className="to-data input"
              value={value.meeting_time_hall}
              onChange={(e) => onChange({ ...value, meeting_time_hall: e.target.value })}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <button type="button" disabled={busy} onClick={onSave} className="btn-primary !h-[52px] text-[15px]">
            {busy ? 'Speichere…' : 'Treffpunkt speichern'}
          </button>
          <button type="button" disabled={busy} onClick={onCancel} className="h-11 text-sm font-medium text-to-text2">
            Abbrechen
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function RideOfferSheet({
  seats,
  onSeatsChange,
  note,
  onNoteChange,
  busy,
  onSubmit,
  onCancel
}: {
  seats: number;
  onSeatsChange: (n: number) => void;
  note: string;
  onNoteChange: (n: string) => void;
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-lg rounded-t-[24px] border border-to-line bg-to-surface2 p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <h2 className="to-display-sm text-to-text">Plätze anbieten</h2>
          <p className="text-[13px] text-to-text3">Du fährst und nimmst andere mit.</p>
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <span className="to-label">FREIE PLÄTZE</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={seats <= 1}
              onClick={() => onSeatsChange(Math.max(1, seats - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-to-lg border border-to-line text-to-text disabled:opacity-40"
              aria-label="Weniger"
            >
              <MinusIcon />
            </button>
            <span className="to-number min-w-11 text-center text-2xl text-to-text">{seats}</span>
            <button
              type="button"
              disabled={seats >= 8}
              onClick={() => onSeatsChange(Math.min(8, seats + 1))}
              className="flex h-11 w-11 items-center justify-center rounded-to-lg border border-to-line text-to-text disabled:opacity-40"
              aria-label="Mehr"
            >
              <PlusIcon />
            </button>
          </div>
        </div>

        <label className="mt-3.5 flex flex-col gap-1.5">
          <span className="to-label">ABFAHRT (OPTIONAL)</span>
          <input
            type="text"
            placeholder="z. B. 18:30 ab Bahnhof Wülfrath"
            className="input"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
          />
        </label>

        <div className="mt-4 flex flex-col gap-2">
          <button type="submit" disabled={busy} className="btn-primary !h-[52px] text-[15px]">
            {busy ? 'Speichere…' : 'Plätze anbieten'}
          </button>
          <button type="button" disabled={busy} onClick={onCancel} className="h-11 text-sm font-medium text-to-text2">
            Abbrechen
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
