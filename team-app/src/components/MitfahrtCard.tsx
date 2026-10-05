import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { mapsUrl } from '../lib/format';
import type { CarpoolClaim, CarpoolOffer, CarpoolSeeker, Game, Player } from '../types/database';

// Element 27 "Mitfahrgelegenheit — neues Design": siehe PROMPT.md im
// Übergabe-Ordner. Rückfragen beantwortet: (1) ein Eintrag deckt Hin- UND
// Rückfahrt ab, "ZURÜCK AUCH"-Schalter statt zweitem Eintrag; (2) Treffpunkt
// bleibt Freitext; (3) Team + manuell eingetragene Begleitpersonen dürfen
// mitfahren; (4) Fahrt löschen ist auch mit Mitfahrern erlaubt, mit Warnung
// + Meldung an sie; (5) eine Spiel-Absage wirft automatisch aus dem Auto
// (serverseitig, siehe carpool_leave_on_squad_decline in Migration 0078).

// "seats" auf carpool_offers zählt nur die angebotenen BEIFAHRER-Plätze
// (PROMPT.md §5: "Fahrersitz + gewählte Zahl") — die Leiste hat also immer
// 1 + seats Balken, nie seats allein.
const MAX_OFFERED_SEATS = 6;

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function fmtDepartureTime(t: string | null): string {
  return t ? t.slice(0, 5) : '';
}

// ---------- Icons ----------
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-vacation" aria-hidden="true">
      <path d="M12 3a7 7 0 0 0-7 7c0 5 7 11 7 11s7-6 7-11a7 7 0 0 0-7-7z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}
function CarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-to-text3" aria-hidden="true">
      <path d="M4 16v-3.2l1.9-4.3A2 2 0 0 1 7.7 7h8.6a2 2 0 0 1 1.8 1.5L20 12.8V16" />
      <path d="M3 16h18v2.4a.6.6 0 0 1-.6.6h-2.3a.6.6 0 0 1-.6-.6V16M6.5 19v-3" />
      <circle cx="7.6" cy="13.4" r="1" />
      <circle cx="16.4" cy="13.4" r="1" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-text3" aria-hidden="true">
      <path d="M4 12h15M14 7l5 5-5 5" />
    </svg>
  );
}
function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

type Seat = { kind: 'driver' | 'taken' | 'free' | 'you' };

function seatsFor(offer: CarpoolOffer, claims: CarpoolClaim[], myPlayerId: string | undefined): Seat[] {
  const seats: Seat[] = [{ kind: 'driver' }];
  for (const c of claims) {
    seats.push({ kind: myPlayerId && c.player_id === myPlayerId ? 'you' : 'taken' });
  }
  const freeCount = Math.max(0, offer.seats - claims.length);
  for (let i = 0; i < freeCount; i++) seats.push({ kind: 'free' });
  return seats;
}

function SeatBar({ offer, claims, myPlayerId }: { offer: CarpoolOffer; claims: CarpoolClaim[]; myPlayerId: string | undefined }) {
  const seats = seatsFor(offer, claims, myPlayerId);
  return (
    <span className="flex items-center gap-1 pt-0.5">
      {seats.map((s, i) => (
        <span
          key={i}
          className={`h-[7px] flex-1 rounded-[4px] border ${
            s.kind === 'driver'
              ? 'border-to-line bg-to-line'
              : s.kind === 'taken'
                ? 'border-to-line bg-to-surface2'
                : s.kind === 'you'
                  ? 'border-to-accent bg-to-accent'
                  : 'border-to-borderMatchday bg-to-accentSoft'
          }`}
          style={{ maxWidth: 26 }}
        />
      ))}
    </span>
  );
}

export interface MitfahrtCardProps {
  game: Game;
  player: Player | null;
  playersById: Record<string, Player>;
}

interface MitfahrtState {
  offers: CarpoolOffer[];
  claims: CarpoolClaim[];
  seekers: CarpoolSeeker[];
}

export interface OfferFormValue {
  meeting_point: string;
  departure_time: string;
  return_trip: boolean;
  seats: number;
}

const EMPTY_OFFER_FORM: OfferFormValue = { meeting_point: '', departure_time: '', return_trip: false, seats: 3 };

export function MitfahrtCard({ game, player, playersById }: MitfahrtCardProps) {
  const [state, setState] = useState<MitfahrtState>({ offers: [], claims: [], seekers: [] });
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<'new' | 'edit' | null>(null);
  const [form, setForm] = useState<OfferFormValue>(EMPTY_OFFER_FORM);
  const [companionDraft, setCompanionDraft] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [leftToast, setLeftToast] = useState<{ driverName: string; undo: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [offersRes, claimsRes, seekersRes] = await Promise.all([
      supabase.from('carpool_offers').select('*').eq('game_id', game.id).order('created_at'),
      supabase.from('carpool_claims').select('*').eq('game_id', game.id),
      supabase.from('carpool_seekers').select('*').eq('game_id', game.id)
    ]);
    if (offersRes.error || claimsRes.error || seekersRes.error) {
      setError('Mitfahrgelegenheit konnte nicht geladen werden.');
      return;
    }
    setState({
      offers: (offersRes.data as CarpoolOffer[]) ?? [],
      claims: (claimsRes.data as CarpoolClaim[]) ?? [],
      seekers: (seekersRes.data as CarpoolSeeker[]) ?? []
    });
  }, [game.id]);

  useEffect(() => {
    load().catch(() => setError('Mitfahrgelegenheit konnte nicht geladen werden.'));
  }, [load]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const myOffer = player ? state.offers.find((o) => o.driver_player_id === player.id) : undefined;
  const myClaim = player ? state.claims.find((c) => c.player_id === player.id) : undefined;
  const amSeeking = player ? state.seekers.some((s) => s.player_id === player.id) : false;
  const otherSeekerNames = state.seekers
    .filter((s) => s.player_id !== player?.id)
    .map((s) => playersById[s.player_id]?.name)
    .filter((n): n is string => !!n);

  const claimsByOffer = (offerId: string) => state.claims.filter((c) => c.offer_id === offerId);
  const totalFree = state.offers.reduce((sum, o) => sum + Math.max(0, o.seats - claimsByOffer(o.id).length), 0);

  const sortedOffers = [...state.offers].sort((a, b) => {
    if (myOffer && a.id === myOffer.id) return -1;
    if (myOffer && b.id === myOffer.id) return 1;
    return 0;
  });

  function openNewOfferSheet() {
    setForm(EMPTY_OFFER_FORM);
    setSheetMode('new');
  }

  function openEditOfferSheet(offer: CarpoolOffer) {
    setForm({
      meeting_point: offer.meeting_point ?? '',
      departure_time: fmtDepartureTime(offer.departure_time),
      return_trip: offer.return_trip,
      seats: offer.seats
    });
    setCompanionDraft('');
    setSheetMode('edit');
  }

  async function submitOfferForm(e: FormEvent) {
    e.preventDefault();
    if (!player) return;
    setBusyKey('sheet');
    setError(null);
    try {
      if (sheetMode === 'edit' && myOffer) {
        const { error: updError } = await supabase
          .from('carpool_offers')
          .update({
            meeting_point: form.meeting_point.trim() || null,
            departure_time: form.departure_time || null,
            return_trip: form.return_trip,
            seats: form.seats
          })
          .eq('id', myOffer.id);
        if (updError) throw updError;
      } else {
        const { error: insError } = await supabase.from('carpool_offers').insert({
          game_id: game.id,
          driver_player_id: player.id,
          seats: form.seats,
          meeting_point: form.meeting_point.trim() || null,
          departure_time: form.departure_time || null,
          return_trip: form.return_trip
        });
        if (insError) throw insError;
      }
      setSheetMode(null);
      await load();
    } catch {
      setError('Fahrt konnte nicht gespeichert werden.');
    } finally {
      setBusyKey(null);
    }
  }

  async function confirmDeleteOffer() {
    if (!myOffer) return;
    setBusyKey('delete-offer');
    setError(null);
    try {
      const passengerIds = claimsByOffer(myOffer.id)
        .map((c) => c.player_id)
        .filter((id): id is string => !!id);
      if (passengerIds.length > 0) {
        const { error: logError } = await supabase.from('carpool_offer_cancellations').insert({
          game_id: game.id,
          driver_player_id: myOffer.driver_player_id,
          passenger_player_ids: passengerIds
        });
        if (logError) throw logError;
      }
      const { error: delError } = await supabase.from('carpool_offers').delete().eq('id', myOffer.id);
      if (delError) throw delError;
      setDeleteConfirmOpen(false);
      setSheetMode(null);
      await load();
    } catch {
      setError('Fahrt konnte nicht gelöscht werden.');
    } finally {
      setBusyKey(null);
    }
  }

  async function addCompanion() {
    if (!myOffer || !companionDraft.trim()) return;
    setBusyKey('companion');
    setError(null);
    try {
      const { error: insError } = await supabase
        .from('carpool_claims')
        .insert({ offer_id: myOffer.id, game_id: game.id, companion_name: companionDraft.trim() });
      if (insError) throw insError;
      setCompanionDraft('');
      await load();
    } catch {
      setError('Begleitperson konnte nicht eingetragen werden.');
    } finally {
      setBusyKey(null);
    }
  }

  async function removeCompanion(claimId: string) {
    setBusyKey(claimId);
    setError(null);
    try {
      const { error: delError } = await supabase.from('carpool_claims').delete().eq('id', claimId);
      if (delError) throw delError;
      await load();
    } catch {
      setError('Begleitperson konnte nicht entfernt werden.');
    } finally {
      setBusyKey(null);
    }
  }

  async function claimSeat(offer: CarpoolOffer) {
    if (!player) return;
    setBusyKey(offer.id);
    setError(null);
    try {
      const { error: insError } = await supabase.from('carpool_claims').insert({ offer_id: offer.id, game_id: game.id, player_id: player.id });
      if (insError) throw insError;
      await load();
    } catch {
      setError('Platz konnte nicht reserviert werden.');
    } finally {
      setBusyKey(null);
    }
  }

  // Kein Bestätigungsblatt (PROMPT.md §6): sofort raus, Hinweis mit
  // Rückgängig 8 Sekunden lang. "Rückgängig" legt den exakt selben Platz
  // wieder an, außer ihn hat in der Zwischenzeit jemand anders genommen.
  async function leaveSeat(offer: CarpoolOffer) {
    if (!player || !myClaim) return;
    setBusyKey(offer.id);
    setError(null);
    try {
      const { error: delError } = await supabase.from('carpool_claims').delete().eq('id', myClaim.id);
      if (delError) throw delError;
      await load();
      const driverName = playersById[offer.driver_player_id]?.name ?? 'der Fahrer';
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setLeftToast({
        driverName,
        undo: async () => {
          setLeftToast(null);
          if (toastTimer.current) clearTimeout(toastTimer.current);
          const { error: reinsError } = await supabase
            .from('carpool_claims')
            .insert({ offer_id: offer.id, game_id: game.id, player_id: player.id });
          if (reinsError) {
            setError('Der Platz ist weg.');
          }
          await load();
        }
      });
      toastTimer.current = setTimeout(() => setLeftToast(null), 8000);
    } catch {
      setError('Konnte nicht aussteigen.');
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleSeeking() {
    if (!player) return;
    setBusyKey('seek');
    setError(null);
    try {
      if (amSeeking) {
        const { error: delError } = await supabase
          .from('carpool_seekers')
          .delete()
          .eq('game_id', game.id)
          .eq('player_id', player.id);
        if (delError) throw delError;
      } else {
        const { error: insError } = await supabase.from('carpool_seekers').insert({ game_id: game.id, player_id: player.id });
        if (insError) throw insError;
      }
      await load();
    } catch {
      setError('Konnte nicht gespeichert werden.');
    } finally {
      setBusyKey(null);
    }
  }

  const hasAnyOffers = state.offers.length > 0;
  const showSeekRow = otherSeekerNames.length > 0 || amSeeking;

  return (
    <div className="flex flex-col gap-3 border-t border-to-divider bg-to-surface2 px-5 pb-5 pt-4">
      <div className="flex items-center gap-2.5">
        <span className="to-label flex-1">MITFAHRGELEGENHEIT</span>
        {hasAnyOffers && (
          <span className={`to-data text-[9px] tracking-[0.1em] ${totalFree > 0 ? 'text-to-accent' : 'text-to-textDisabled'}`}>
            {totalFree > 0 ? `${totalFree} ${totalFree === 1 ? 'PLATZ' : 'PLÄTZE'} FREI` : 'ALLE AUTOS VOLL'}
          </span>
        )}
      </div>

      {error && <p className="text-xs text-to-dangerText">{error}</p>}

      {leftToast && (
        <div className="flex items-center gap-2.5 rounded-to-lg border border-to-line bg-to-surface px-3 py-3">
          <span className="flex-1 text-[13px] text-to-text2">
            Du bist bei {leftToast.driverName} ausgestiegen. {leftToast.driverName} wurde informiert.
          </span>
          <button
            type="button"
            onClick={leftToast.undo}
            className="inline-flex h-8 shrink-0 items-center rounded-to-pill border border-to-line px-3.5 text-xs font-semibold text-to-accent"
          >
            Rückgängig
          </button>
        </div>
      )}

      {!hasAnyOffers ? (
        <>
          <div className="flex flex-col items-center gap-2.5 rounded-to-xl border border-dashed border-to-line bg-to-surface px-4.5 py-6 text-center">
            <CarIcon />
            <p className="text-[15px] font-semibold text-to-text">Noch keine Fahrt eingetragen</p>
            <p className="text-xs leading-relaxed text-to-text3">
              Wer mit dem Auto kommt und Platz hat, trägt sich hier ein. Die anderen steigen mit einem Tipp zu.
            </p>
          </div>
          {player && (
            <div className="flex gap-2.5">
              <button type="button" onClick={openNewOfferSheet} className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-to-pill bg-to-surface2 text-[15px] font-semibold text-to-text">
                <span className="text-to-accent">
                  <PlusIcon />
                </span>
                Plätze anbieten
              </button>
              <button
                type="button"
                onClick={toggleSeeking}
                disabled={busyKey === 'seek'}
                className="h-[50px] flex-1 rounded-to-pill text-[15px] font-semibold text-to-text2 disabled:opacity-40"
              >
                {amSeeking ? 'Suche zurückziehen' : 'Platz suchen'}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col overflow-hidden rounded-to-xl border border-to-border bg-to-surface">
            {sortedOffers.map((offer, i) => {
              const offerClaims = claimsByOffer(offer.id);
              const free = Math.max(0, offer.seats - offerClaims.length);
              const isMine = myOffer?.id === offer.id;
              const iAmIn = !isMine && !!myClaim && myClaim.offer_id === offer.id;
              const expanded = expandedOfferId === offer.id;
              const driverName = playersById[offer.driver_player_id]?.name ?? '?';

              return (
                <div key={offer.id} className={i > 0 ? 'border-t border-to-surface2' : ''}>
                  <div className={`flex items-center gap-2.5 px-3.5 py-2.5 ${isMine ? 'bg-to-accentWash' : ''}`}>
                    <button type="button" onClick={() => setExpandedOfferId(expanded ? null : offer.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      <span className={`to-data flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[10px] ${isMine ? 'bg-to-accentSoft text-to-accent' : 'bg-to-surface2 text-to-text3'}`}>
                        {initialsOf(driverName)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-[14px] font-semibold text-to-text">{isMine ? `${driverName} (Du)` : driverName}</span>
                        {offer.meeting_point && (
                          <span className="to-data truncate text-[9px] tracking-[0.05em] text-to-text3">
                            {offer.meeting_point.toUpperCase()}
                            {offer.departure_time ? ` · ${fmtDepartureTime(offer.departure_time)}` : ''}
                          </span>
                        )}
                        <SeatBar offer={offer} claims={offerClaims} myPlayerId={player?.id} />
                      </span>
                    </button>
                    {isMine ? (
                      <span className="flex flex-col items-end gap-0.5">
                        <span className={`to-data text-[10px] ${free > 0 ? 'text-to-accent' : 'text-to-textDisabled'}`}>{free > 0 ? `${free} FREI` : 'BESETZT'}</span>
                      </span>
                    ) : null}
                    {isMine ? (
                      <button type="button" onClick={() => openEditOfferSheet(offer)} className="inline-flex h-[38px] shrink-0 items-center rounded-to-pill border border-to-line px-3.5 text-[13px] font-semibold text-to-text2">
                        Bearbeiten
                      </button>
                    ) : iAmIn ? (
                      <button
                        type="button"
                        disabled={busyKey === offer.id}
                        onClick={() => leaveSeat(offer)}
                        className="inline-flex h-[38px] shrink-0 items-center rounded-to-pill border border-to-dangerFrame px-3.5 text-[13px] font-semibold text-to-dangerText disabled:opacity-40"
                      >
                        Aussteigen
                      </button>
                    ) : free > 0 ? (
                      <button
                        type="button"
                        disabled={busyKey === offer.id || !!myClaim || !!myOffer}
                        onClick={() => claimSeat(offer)}
                        className="inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-to-pill border border-to-borderMatchday bg-to-accentSoft px-3.5 text-[13px] font-semibold text-to-accent disabled:opacity-40"
                      >
                        <PlusIcon />
                        Einsteigen
                      </button>
                    ) : null}
                  </div>

                  {expanded && (
                    <div className="flex flex-col gap-2.5 bg-[rgba(255,255,255,0.012)] py-2.5 pl-[57px] pr-3.5">
                      <span className="to-data text-[8px] tracking-[0.12em] text-to-textDisabled">WER MITFÄHRT</span>
                      <div className="flex flex-col gap-1.5">
                        {offerClaims.map((c) => {
                          const name = c.player_id ? playersById[c.player_id]?.name ?? '?' : (c.companion_name ?? '?');
                          return (
                            <div key={c.id} className="flex items-center gap-2 text-[13px] text-to-text2">
                              <span className="to-data flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-to-surface2 text-[8px] text-to-text3">
                                {initialsOf(name)}
                              </span>
                              <span className="flex-1 truncate">
                                {name}
                                {c.player_id === player?.id ? ' (Du)' : ''}
                                {!c.player_id ? ' · Begleitperson' : ''}
                              </span>
                              {isMine && (
                                <button
                                  type="button"
                                  disabled={busyKey === c.id}
                                  onClick={() => (c.player_id ? leaveSeat(offer) : removeCompanion(c.id))}
                                  className="shrink-0 text-to-textDisabled disabled:opacity-40"
                                  aria-label={`${name} entfernen`}
                                >
                                  <XIcon />
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {Array.from({ length: free }).map((_, i2) => (
                          <button
                            key={`free-${i2}`}
                            type="button"
                            disabled={busyKey === offer.id || !!myClaim || !!myOffer || isMine}
                            onClick={() => claimSeat(offer)}
                            className="flex items-center gap-2 text-left text-[13px] text-to-textDisabled disabled:opacity-60"
                          >
                            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-to-borderMatchday text-to-accent">
                              <PlusIcon />
                            </span>
                            Platz frei
                          </button>
                        ))}
                        {isMine && (
                          <div className="flex items-center gap-1.5 pt-1">
                            <input
                              type="text"
                              value={companionDraft}
                              onChange={(e) => setCompanionDraft(e.target.value)}
                              placeholder="Begleitperson eintragen"
                              className="input h-9 flex-1 !py-1.5 text-[13px]"
                            />
                            <button
                              type="button"
                              disabled={busyKey === 'companion' || !companionDraft.trim() || free === 0}
                              onClick={addCompanion}
                              className="inline-flex h-9 shrink-0 items-center rounded-to-pill border border-to-line px-3 text-xs font-semibold text-to-text2 disabled:opacity-40"
                            >
                              Hinzufügen
                            </button>
                          </div>
                        )}
                      </div>
                      {offer.meeting_point && (
                        <div className="flex items-center gap-1.5 text-xs text-to-text2">
                          <span className="truncate">{offer.meeting_point}</span>
                          <ArrowIcon />
                          <span className="truncate">{game.location}</span>
                          <a href={mapsUrl(game.location)} target="_blank" rel="noreferrer" className="ml-auto shrink-0 font-semibold text-to-accent">
                            Route
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {showSeekRow && (
            <div className={`flex items-center gap-2.5 rounded-to-lg border px-3.5 py-3 ${amSeeking ? 'border-to-vacationFrame bg-to-vacationSoft' : 'border-dashed border-to-line bg-to-surface'}`}>
              <PinIcon />
              <span className="flex-1 text-[13px] text-to-text2">
                {amSeeking
                  ? 'Du suchst einen Platz. Fahrer sehen das.'
                  : otherSeekerNames.length === 1
                    ? `${otherSeekerNames[0]} sucht noch`
                    : `${otherSeekerNames.slice(0, -1).join(', ')} und ${otherSeekerNames[otherSeekerNames.length - 1]} suchen noch`}
              </span>
              {player && !myOffer && (
                <button
                  type="button"
                  disabled={busyKey === 'seek'}
                  onClick={toggleSeeking}
                  className="inline-flex h-8 shrink-0 items-center rounded-to-pill border border-to-line px-3 text-xs font-semibold text-to-text2 disabled:opacity-40"
                >
                  {amSeeking ? 'Zurückziehen' : 'Ich auch'}
                </button>
              )}
            </div>
          )}

          {player && !myOffer && (
            <button type="button" onClick={openNewOfferSheet} className="flex h-[50px] items-center justify-center gap-2 rounded-to-pill bg-to-surface2 text-[15px] font-semibold text-to-text">
              <span className="text-to-accent">
                <PlusIcon />
              </span>
              Ich biete Plätze an
            </button>
          )}
        </>
      )}

      {sheetMode &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setSheetMode(null)}>
            <form
              onSubmit={submitOfferForm}
              className="w-full max-w-lg rounded-t-[24px] border border-to-line bg-to-surface2 p-5 sm:rounded-b-[24px]"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-[19px] font-semibold -tracking-[0.01em] text-to-text">Plätze anbieten</h2>

              <div className="mt-4 flex flex-col gap-3.5">
                <label className="flex flex-col gap-1.5">
                  <span className="to-label">TREFFPUNKT</span>
                  <input
                    type="text"
                    value={form.meeting_point}
                    onChange={(e) => setForm((prev) => ({ ...prev, meeting_point: e.target.value }))}
                    placeholder="z. B. Marktplatz Wülfrath"
                    className="input"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="to-label">ABFAHRT</span>
                  <span className="relative block overflow-hidden rounded-to-md">
                    <input
                      type="time"
                      className="absolute inset-0 h-full w-full opacity-0"
                      value={form.departure_time}
                      onChange={(e) => setForm((prev) => ({ ...prev, departure_time: e.target.value }))}
                    />
                    <span className={`to-data input pointer-events-none block ${form.departure_time ? '' : 'text-to-text3'}`}>
                      {form.departure_time ? `${form.departure_time} Uhr` : 'Uhrzeit wählen'}
                    </span>
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, return_trip: !prev.return_trip }))}
                  className="flex items-center gap-3 rounded-to-lg border border-to-line bg-to-surface2 px-3.5 py-3 text-left"
                >
                  <span className="flex-1">
                    <span className="block text-[14px] font-medium text-to-text">Zurück auch</span>
                    <span className="block text-xs text-to-text3">Derselbe Platz gilt dann auch für die Rückfahrt.</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-[26px] w-11 shrink-0 items-center rounded-to-pill p-[3px] transition-colors ${form.return_trip ? 'bg-to-accent' : 'bg-to-line'}`}
                  >
                    <span className={`h-5 w-5 rounded-full transition-transform ${form.return_trip ? 'translate-x-[18px] bg-to-onAccent' : 'translate-x-0 bg-to-text3'}`} />
                  </span>
                </button>

                <div className="flex flex-col gap-1.5">
                  <span className="to-label">FREIE PLÄTZE</span>
                  <div className="grid grid-cols-6 gap-1.5">
                    {Array.from({ length: MAX_OFFERED_SEATS }).map((_, i) => {
                      const n = i + 1;
                      const on = form.seats === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, seats: n }))}
                          className={`flex h-12 items-center justify-center rounded-to-md border text-lg font-extrabold ${
                            on ? 'border-to-accent bg-to-accentSoft text-to-accent' : 'border-to-border bg-to-surface2 text-to-text2'
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <button type="submit" disabled={busyKey === 'sheet'} className="btn-primary !h-[52px] text-[15px] disabled:opacity-60">
                  {busyKey === 'sheet' ? 'Speichere…' : sheetMode === 'edit' ? 'Änderungen speichern' : 'Fahrt eintragen'}
                </button>
                <button type="button" disabled={busyKey === 'sheet'} onClick={() => setSheetMode(null)} className="btn-secondary !h-[48px] text-[15px]">
                  Abbrechen
                </button>
                {sheetMode === 'edit' && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="h-11 text-sm font-semibold text-to-dangerText"
                  >
                    Fahrt löschen
                  </button>
                )}
              </div>
            </form>
          </div>,
          document.body
        )}

      {deleteConfirmOpen &&
        myOffer &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setDeleteConfirmOpen(false)}>
            <div className="w-full max-w-lg rounded-t-[24px] border border-to-line bg-to-surface2 p-5 sm:rounded-b-[24px]" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-[19px] font-semibold -tracking-[0.01em] text-to-text">Fahrt wirklich löschen?</h2>
              {(() => {
                const offerClaims = claimsByOffer(myOffer.id);
                // Begleitpersonen haben keinen Account — sie lassen sich
                // technisch gar nicht benachrichtigen (api/notify.ts
                // bekommt für sie keine push_subscriptions), deshalb hier
                // getrennt von echten Mitfahrern formuliert statt fälschlich
                // "wird benachrichtigt" für beide zu versprechen.
                const playerNames = offerClaims.filter((c) => c.player_id).map((c) => playersById[c.player_id as string]?.name ?? '?');
                const companionNames = offerClaims.filter((c) => !c.player_id).map((c) => c.companion_name ?? '?');
                if (playerNames.length === 0 && companionNames.length === 0) {
                  return <p className="mt-2 text-sm text-to-text2">Die Fahrt ist noch leer, niemand muss benachrichtigt werden.</p>;
                }
                return (
                  <p className="mt-2 text-sm text-to-text2">
                    {playerNames.length > 0 && (
                      <>
                        {playerNames.join(', ')} {playerNames.length === 1 ? 'sitzt' : 'sitzen'} noch bei dir im Auto und{' '}
                        {playerNames.length === 1 ? 'wird' : 'werden'} benachrichtigt, dass die Fahrt entfällt.{' '}
                      </>
                    )}
                    {companionNames.length > 0 && <>Sag {companionNames.join(', ')} persönlich Bescheid, die Fahrt lässt sich dort nicht automatisch melden.</>}
                  </p>
                );
              })()}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={busyKey === 'delete-offer'}
                  onClick={confirmDeleteOffer}
                  className="h-[48px] rounded-to-pill bg-to-danger text-[15px] font-semibold text-[#120507] disabled:opacity-60"
                >
                  {busyKey === 'delete-offer' ? 'Lösche…' : 'Fahrt löschen'}
                </button>
                <button type="button" disabled={busyKey === 'delete-offer'} onClick={() => setDeleteConfirmOpen(false)} className="btn-secondary !h-[48px] text-[15px]">
                  Abbrechen
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
