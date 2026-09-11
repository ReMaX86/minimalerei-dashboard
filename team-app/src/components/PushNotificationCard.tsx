import { useState } from 'react';
import { subscribeToPush, unsubscribeFromPush, type PushStatus } from '../lib/push';

interface PushNotificationCardProps {
  status: PushStatus | 'loading';
  onChange: () => void;
}

export function PushNotificationCard({ status, onChange }: PushNotificationCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      await subscribeToPush();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aktivieren fehlgeschlagen.');
    } finally {
      onChange();
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await unsubscribeFromPush();
    } catch {
      setError('Deaktivieren fehlgeschlagen.');
    } finally {
      onChange();
      setBusy(false);
    }
  }

  // 'unsupported' deckt auch iOS-Safari im Browser-Tab statt als
  // installierte PWA ab (Push geht dort technisch nicht) — dafür extra
  // erklären statt einfach nichts anzuzeigen wäre mehr Verwirrung als Nutzen.
  if (status === 'loading' || status === 'unsupported') return null;

  return (
    <section className="card">
      <p className="text-sm font-bold text-tbw-navyDark">🔔 Benachrichtigungen</p>

      {status === 'subscribed' && (
        <>
          <p className="mt-1 text-xs text-tbw-ink/50">
            Aktiviert — du bekommst z. B. bei neuen Meldungen eine Benachrichtigung.
          </p>
          <button className="btn-secondary mt-3 w-full text-sm" disabled={busy} onClick={disable}>
            {busy ? 'Deaktiviere…' : 'Deaktivieren'}
          </button>
        </>
      )}

      {status === 'unsubscribed' && (
        <>
          <p className="mt-1 text-xs text-tbw-ink/50">
            Verpasse keine Meldung vom Trainer mehr — direkt auf dein Gerät.
          </p>
          <button className="btn-primary mt-3 w-full text-sm" disabled={busy} onClick={enable}>
            {busy ? 'Aktiviere…' : 'Benachrichtigungen aktivieren'}
          </button>
        </>
      )}

      {status === 'denied' && (
        <p className="mt-1 text-xs text-tbw-ink/50">
          Benachrichtigungen sind für diese App in den Geräteeinstellungen blockiert. Um sie zu
          aktivieren, müssen sie dort erst wieder erlaubt werden.
        </p>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-tbw-red">{error}</p>}
    </section>
  );
}
