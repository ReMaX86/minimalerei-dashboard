import { useCallback, useEffect, useState } from 'react';
import { getPushStatus, type PushStatus } from '../lib/push';

// Ausgelagert aus PushNotificationCard, damit die Startseite den Status schon
// kennt, bevor sie entscheidet, wo die Karte angezeigt wird (oben als
// Aufforderung zum Aktivieren, unten als reine Verwalten-Option, sobald schon
// aktiviert — siehe Dashboard.tsx).
export function usePushStatus() {
  const [status, setStatus] = useState<PushStatus | 'loading'>('loading');

  const refresh = useCallback(() => {
    getPushStatus()
      .then(setStatus)
      .catch(() => setStatus('unsupported'));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, refresh };
}
