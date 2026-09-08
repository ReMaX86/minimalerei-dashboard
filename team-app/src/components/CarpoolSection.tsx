import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorNote } from './ErrorNote';
import type { CarpoolClaim, CarpoolOffer, Player } from '../types/database';

interface State {
  offers: CarpoolOffer[];
  claims: CarpoolClaim[];
}

export function CarpoolSection({ gameId, players }: { gameId: string; players: Player[] }) {
  const { player } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [seats, setSeats] = useState(3);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setError(null);
    const [offersRes, claimsRes] = await Promise.all([
      supabase.from('carpool_offers').select('*').eq('game_id', gameId),
      supabase.from('carpool_claims').select('*').eq('game_id', gameId)
    ]);
    if (offersRes.error || claimsRes.error) {
      setError('Fehler beim Laden der Mitfahrgelegenheiten.');
      return;
    }
    setState({
      offers: (offersRes.data as CarpoolOffer[]) ?? [],
      claims: (claimsRes.data as CarpoolClaim[]) ?? []
    });
  }, [gameId]);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Mitfahrgelegenheiten.'));
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!state) return <LoadingSpinner />;

  const playersById: Record<string, Player> = {};
  players.forEach((p) => (playersById[p.id] = p));

  const myOffer = player ? state.offers.find((o) => o.driver_player_id === player.id) : undefined;
  const myClaim = player ? state.claims.find((c) => c.player_id === player.id) : undefined;

  async function createOffer(e: FormEvent) {
    e.preventDefault();
    if (!player) return;
    setBusyKey('new-offer');
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('carpool_offers')
        .insert({ game_id: gameId, driver_player_id: player.id, seats, note: note.trim() || null });
      if (insertError) throw insertError;
      setShowOfferForm(false);
      setSeats(3);
      setNote('');
      await load();
    } catch {
      setError('Angebot konnte nicht gespeichert werden.');
    } finally {
      setBusyKey(null);
    }
  }

  async function cancelOffer(offerId: string) {
    setBusyKey(offerId);
    setError(null);
    try {
      const { error: delError } = await supabase.from('carpool_offers').delete().eq('id', offerId);
      if (delError) throw delError;
      await load();
    } catch {
      setError('Angebot konnte nicht zurückgezogen werden.');
    } finally {
      setBusyKey(null);
    }
  }

  async function claimSeat(offer: CarpoolOffer) {
    if (!player) return;
    setBusyKey(offer.id);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('carpool_claims')
        .insert({ offer_id: offer.id, game_id: gameId, player_id: player.id });
      if (insertError) throw insertError;
      await load();
    } catch {
      setError('Platz konnte nicht reserviert werden.');
    } finally {
      setBusyKey(null);
    }
  }

  async function cancelClaim(offerId: string) {
    if (!player) return;
    setBusyKey(offerId);
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
      setBusyKey(null);
    }
  }

  return (
    <section className="card">
      <p className="text-sm font-bold text-tbw-navyDark">🚗 Mitfahrgelegenheit</p>

      {state.offers.length === 0 && <p className="mt-2 text-sm text-tbw-ink/50">Noch keine Fahrer eingetragen.</p>}

      <ul className="mt-2 space-y-2">
        {state.offers.map((o) => {
          const takenBy = state.claims.filter((c) => c.offer_id === o.id);
          const free = o.seats - takenBy.length;
          const isMyOffer = o.driver_player_id === player?.id;
          const isMyClaim = myClaim?.offer_id === o.id;
          return (
            <li key={o.id} className="rounded-xl bg-tbw-bg p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-tbw-navyDark">
                    {playersById[o.driver_player_id]?.name ?? '?'} fährt
                  </p>
                  <p className="text-xs text-tbw-ink/50">
                    {free > 0 ? `${free} von ${o.seats} Plätzen frei` : 'Voll'}
                    {o.note ? ` · ${o.note}` : ''}
                  </p>
                  {takenBy.length > 0 && (
                    <p className="mt-1 text-xs text-tbw-ink/50">
                      Mit dabei: {takenBy.map((c) => playersById[c.player_id]?.name ?? '?').join(', ')}
                    </p>
                  )}
                </div>
                {isMyOffer ? (
                  <button
                    className="btn-secondary shrink-0 !px-2 !py-1 text-xs !text-tbw-red"
                    disabled={busyKey === o.id}
                    onClick={() => cancelOffer(o.id)}
                  >
                    Zurückziehen
                  </button>
                ) : isMyClaim ? (
                  <button
                    className="btn-secondary shrink-0 !px-2 !py-1 text-xs !text-tbw-red"
                    disabled={busyKey === o.id}
                    onClick={() => cancelClaim(o.id)}
                  >
                    Absagen
                  </button>
                ) : player && !myClaim && !myOffer && free > 0 ? (
                  <button
                    className="btn-secondary shrink-0 !px-2 !py-1 text-xs"
                    disabled={busyKey === o.id}
                    onClick={() => claimSeat(o)}
                  >
                    Mitfahren
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {player && !myOffer && (
        <div className="mt-3 border-t border-black/5 pt-3">
          {showOfferForm ? (
            <form onSubmit={createOffer} className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-tbw-ink/50">Freie Plätze</label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  className="input !w-20"
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                />
              </div>
              <input
                type="text"
                placeholder="z. B. Abfahrt ab Wülfrath Bahnhof (optional)"
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-2">
                <button className="btn-primary flex-1" disabled={busyKey === 'new-offer'}>
                  Anbieten
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowOfferForm(false)}>
                  Abbrechen
                </button>
              </div>
            </form>
          ) : (
            <button className="btn-secondary w-full text-sm" onClick={() => setShowOfferForm(true)}>
              Ich biete Plätze an
            </button>
          )}
        </div>
      )}
    </section>
  );
}
