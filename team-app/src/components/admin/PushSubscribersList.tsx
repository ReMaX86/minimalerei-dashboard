import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../LoadingSpinner';
import { fmtDate } from '../../lib/format';

interface Subscriber {
  name: string;
  role: 'Spieler' | 'Trainer' | 'Betrachter';
  devices: number;
  since: string;
}

// Wer hat Push-Benachrichtigungen aktiviert? push_subscriptions kennt nur
// user_id (auth.uid()) — die Zuordnung zu Spieler/Trainer/Betrachter läuft
// über dieselben Link-Tabellen wie in AuthContext (player_auth_links/
// viewer_auth_links; Trainer haben ihre auth.uid() direkt als trainers.id).
// Braucht die "trainer read"-RLS-Policy aus Migration 0040 — ohne die sieht
// ein Trainer hier nur seine eigene Zeile (die bestehende "own"-Policy).
export function PushSubscribersList() {
  const [subscribers, setSubscribers] = useState<Subscriber[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [subsRes, linksRes, playersRes, trainersRes, viewerLinksRes, viewersRes] = await Promise.all([
        supabase.from('push_subscriptions').select('user_id, created_at'),
        supabase.from('player_auth_links').select('player_id, auth_user_id'),
        supabase.from('players').select('id, name'),
        supabase.from('trainers').select('id, name'),
        supabase.from('viewer_auth_links').select('viewer_id, auth_user_id'),
        supabase.from('viewers').select('id, name')
      ]);

      if (cancelled) return;
      if (subsRes.error) {
        setError('Konnte Push-Anmeldungen nicht laden.');
        return;
      }

      const playerNameById = new Map(
        ((playersRes.data as { id: string; name: string }[] | null) ?? []).map((p) => [p.id, p.name])
      );
      const trainerNameById = new Map(
        ((trainersRes.data as { id: string; name: string }[] | null) ?? []).map((t) => [t.id, t.name])
      );
      const viewerNameById = new Map(
        ((viewersRes.data as { id: string; name: string }[] | null) ?? []).map((v) => [v.id, v.name])
      );
      const playerAuthMap = new Map(
        ((linksRes.data as { player_id: string; auth_user_id: string }[] | null) ?? []).map((l) => [
          l.auth_user_id,
          l.player_id
        ])
      );
      const viewerAuthMap = new Map(
        ((viewerLinksRes.data as { viewer_id: string; auth_user_id: string }[] | null) ?? []).map((l) => [
          l.auth_user_id,
          l.viewer_id
        ])
      );

      function resolve(authUserId: string): { name: string; role: Subscriber['role'] } | null {
        const trainerName = trainerNameById.get(authUserId);
        if (trainerName) return { name: trainerName, role: 'Trainer' };
        const playerId = playerAuthMap.get(authUserId);
        const playerName = playerId ? playerNameById.get(playerId) : undefined;
        if (playerName) return { name: playerName, role: 'Spieler' };
        const viewerId = viewerAuthMap.get(authUserId);
        const viewerName = viewerId ? viewerNameById.get(viewerId) : undefined;
        if (viewerName) return { name: viewerName, role: 'Betrachter' };
        return null;
      }

      const byUser = new Map<string, { devices: number; since: string }>();
      for (const sub of (subsRes.data as { user_id: string; created_at: string }[] | null) ?? []) {
        const entry = byUser.get(sub.user_id);
        if (entry) {
          entry.devices += 1;
          if (sub.created_at < entry.since) entry.since = sub.created_at;
        } else {
          byUser.set(sub.user_id, { devices: 1, since: sub.created_at });
        }
      }

      const list: Subscriber[] = [];
      for (const [authUserId, info] of byUser) {
        const identity = resolve(authUserId);
        list.push({
          name: identity?.name ?? 'Unbekannt',
          role: identity?.role ?? 'Spieler',
          devices: info.devices,
          since: info.since
        });
      }
      list.sort((a, b) => a.name.localeCompare(b.name));

      setSubscribers(list);
    }

    load().catch(() => !cancelled && setError('Konnte Push-Anmeldungen nicht laden.'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-xs text-tbw-red">{error}</p>;
  if (!subscribers) return <LoadingSpinner />;

  return (
    <div className="space-y-2 border-t border-black/5 pt-3">
      <p className="text-sm font-semibold text-tbw-navyDark">
        Wer hat Push aktiviert? ({subscribers.length})
      </p>
      {subscribers.length === 0 ? (
        <p className="text-xs text-tbw-ink/50">Noch niemand.</p>
      ) : (
        <ul className="space-y-1">
          {subscribers.map((s) => (
            <li key={`${s.role}-${s.name}`} className="flex items-center justify-between text-sm">
              <span className="text-tbw-navyDark">
                {s.name} <span className="text-xs text-tbw-ink/40">({s.role})</span>
              </span>
              <span className="text-xs text-tbw-ink/50">
                {s.devices > 1 ? `${s.devices} Geräte · ` : ''}seit {fmtDate(s.since.slice(0, 10))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
