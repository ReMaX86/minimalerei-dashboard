import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../LoadingSpinner';
import type { StandingsSyncStatus } from '../../types/database';

// Element "DBB-Liga-ID konfigurierbar" (Migration 0066, auf Nutzeranfrage):
// die Liga-ID für den Tabellen-Sync (api/sync-league-standings.ts) war
// bisher fest als Vercel-Env-Var DBB_LIGA_ID hinterlegt — jetzt hier änderbar,
// direkt aus der URL der DBB-Tabellenseite ablesbar
// (basketball-bund.net/index.jsp?Action=102&liga_id=...).
export function StandingsSyncSettings() {
  const [status, setStatus] = useState<StandingsSyncStatus | null>(null);
  const [ligaId, setLigaId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.from('standings_sync_status').select('*').eq('id', 1).maybeSingle();
    if (error || !data) {
      setLoadError('Sync-Status konnte nicht geladen werden.');
      return;
    }
    setStatus(data as StandingsSyncStatus);
    setLigaId((data as StandingsSyncStatus).liga_id);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveLigaId() {
    const trimmed = ligaId.trim();
    if (!trimmed) {
      setSaveError('Liga-ID darf nicht leer sein.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const { error } = await supabase.from('standings_sync_status').update({ liga_id: trimmed }).eq('id', 1);
      if (error) throw error;
      setSaved(true);
      await load();
    } catch {
      setSaveError('Liga-ID konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setSyncResult(null);
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
        setSyncResult(`Fehlgeschlagen: ${body.error ?? response.statusText}`);
      } else if (body.skipped) {
        setSyncResult('Sync lief durch, aber die DBB-Seite lieferte keine erkennbaren Tabellenzeilen.');
      } else {
        setSyncResult(`Aktualisiert: ${body.updated} Teams (Liga ${body.ligaId}).`);
      }
      await load();
    } catch {
      setSyncResult('Sync konnte nicht gestartet werden.');
    } finally {
      setSyncing(false);
    }
  }

  if (loadError) return <p className="text-xs text-to-dangerText">{loadError}</p>;
  if (!status) return <LoadingSpinner />;

  return (
    <div className="space-y-3 border-t border-to-divider pt-3">
      <div>
        <p className="text-sm font-semibold text-to-text">DBB Liga-Tabelle</p>
        <p className="text-xs text-to-text3">
          Liga-ID aus der URL der DBB-Tabellenseite (…&amp;liga_id=<em>12345</em>).
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="text-to-text2">Liga-ID</span>
        <input
          type="text"
          inputMode="numeric"
          className="input !w-32 text-center"
          value={ligaId}
          onChange={(e) => setLigaId(e.target.value)}
        />
      </label>
      {saveError && <p className="text-xs text-to-dangerText">{saveError}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary !px-4 !py-2 text-sm" disabled={saving} onClick={saveLigaId}>
          {saving ? 'Speichere…' : 'Liga-ID speichern'}
        </button>
        {saved && <span className="text-xs font-semibold text-to-accent">Gespeichert ✓</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-to-divider pt-3">
        <button type="button" className="btn-secondary !px-4 !py-2 text-sm" disabled={syncing} onClick={syncNow}>
          {syncing ? 'Aktualisiere…' : 'Jetzt aktualisieren'}
        </button>
        {syncResult && <span className="text-xs text-to-text2">{syncResult}</span>}
      </div>

      <p className="text-xs text-to-text3">
        {status.last_success_at
          ? `Letzter erfolgreicher Sync: ${new Date(status.last_success_at).toLocaleString('de-DE')}.`
          : 'Noch nie erfolgreich synchronisiert.'}
        {status.last_error ? ` Letzter Fehler: ${status.last_error}` : ''}
      </p>
    </div>
  );
}
