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
// user_id (auth.uid()) — die Zuordnung zu Spieler/Trainer/Betrachter lief
// früher über eine direkte Client-Abfrage auf player_auth_links/
// viewer_auth_links, lieferte aber immer "Unbekannt": diese beiden Tabellen
// haben laut Migration 0001 bewusst KEINE client-seitige RLS-Policy (Zugriff
// nur über die security-definer current_player_id()/current_viewer_id()-
// Funktionen, siehe AuthContext.tsx) und geben bei einer direkten Abfrage
// immer eine leere Liste zurück. Migration 0047 löst das stattdessen über
// eine eigene security-definer RPC (admin_push_subscribers, nur für
// Trainer/Admins aufrufbar), die genau diese Zuordnung serverseitig auflöst.
export function PushSubscribersList() {
  const [subscribers, setSubscribers] = useState<Subscriber[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [subsRes, identitiesRes] = await Promise.all([
        supabase.from('push_subscriptions').select('user_id, created_at'),
        supabase.rpc('admin_push_subscribers')
      ]);

      if (cancelled) return;
      if (subsRes.error || identitiesRes.error) {
        setError('Konnte Push-Anmeldungen nicht laden.');
        return;
      }

      const identityByAuthUser = new Map(
        (
          (identitiesRes.data as { auth_user_id: string; name: string; role: Subscriber['role'] }[] | null) ?? []
        ).map((i) => [i.auth_user_id, { name: i.name, role: i.role }])
      );

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
        const identity = identityByAuthUser.get(authUserId);
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

  if (error) return <p className="text-xs text-to-dangerText">{error}</p>;
  if (!subscribers) return <LoadingSpinner />;

  return (
    <div className="space-y-2 border-t border-to-divider pt-3">
      <p className="text-sm font-semibold text-to-text">
        Wer hat Push aktiviert? ({subscribers.length})
      </p>
      {subscribers.length === 0 ? (
        <p className="text-xs text-to-text3">Noch niemand.</p>
      ) : (
        <ul className="space-y-1">
          {subscribers.map((s) => (
            <li key={`${s.role}-${s.name}`} className="flex items-center justify-between text-sm">
              <span className="text-to-text">
                {s.name} <span className="text-xs text-to-text3">({s.role})</span>
              </span>
              <span className="text-xs text-to-text3">
                {s.devices > 1 ? `${s.devices} Geräte · ` : ''}seit {fmtDate(s.since.slice(0, 10))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
