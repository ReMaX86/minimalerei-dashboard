import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import type { Viewer } from '../../types/database';

export function ViewersAdmin() {
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<{ name: string; code: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase
      .from('viewers')
      .select('*')
      .order('is_active', { ascending: false })
      .order('name');
    if (loadError) {
      setError('Fehler beim Laden der Betrachter-Liste.');
      return;
    }
    setViewers((data as Viewer[]) ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Betrachter-Liste.'));
  }, [load]);

  async function addViewer(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('create_viewer', { p_name: name.trim() });
      if (rpcError) throw rpcError;
      setNewCode({ name: name.trim(), code: (data as Viewer).access_code });
      setName('');
      await load();
    } catch {
      setError('Betrachter konnte nicht angelegt werden.');
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(viewerId: string, viewerName: string) {
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('regenerate_viewer_access_code', {
        p_viewer_id: viewerId
      });
      if (rpcError) throw rpcError;
      setNewCode({ name: viewerName, code: data as string });
      await load();
    } catch {
      setError('Code konnte nicht neu generiert werden.');
    }
  }

  async function toggleActive(v: Viewer) {
    setError(null);
    try {
      const { error: updError } = await supabase
        .from('viewers')
        .update({ is_active: !v.is_active })
        .eq('id', v.id);
      if (updError) throw updError;
      await load();
    } catch {
      setError('Status konnte nicht geändert werden.');
    }
  }

  if (error) return <ErrorNote message={error} />;
  if (!viewers) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-tbw-ink/60">
        Betrachter sehen Spielplan und Kampfgericht rein lesend — z. B. für einen Abteilungsleiter, der weder
        Spieler noch Trainer ist. Kein Zugriff auf Kader, Trikots oder Admin-Funktionen.
      </p>

      <form onSubmit={addViewer} className="card flex gap-2">
        <input
          className="input"
          placeholder="Name des Betrachters"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={busy || !name.trim()}>
          Anlegen
        </button>
      </form>

      {newCode && (
        <div className="card border-l-4 border-tbw-gold">
          <p className="text-sm text-tbw-ink/70">
            Zugangscode für <span className="font-semibold text-tbw-navyDark">{newCode.name}</span>:
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-widest text-tbw-navyDark">{newCode.code}</p>
          <p className="mt-1 text-xs text-tbw-ink/50">Bitte per WhatsApp/SMS weitergeben.</p>
          <button className="mt-2 text-xs font-semibold text-tbw-ink/50" onClick={() => setNewCode(null)}>
            Schließen
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {viewers.map((v) => (
          <li key={v.id} className={`card space-y-3 ${!v.is_active ? 'opacity-50' : ''}`}>
            <div>
              <p className="font-semibold text-tbw-navyDark">{v.name}</p>
              <p className="text-xs text-tbw-ink/50">Code: {v.access_code}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => regenerate(v.id, v.name)}>
                Code neu
              </button>
              <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => toggleActive(v)}>
                {v.is_active ? 'Deaktivieren' : 'Aktivieren'}
              </button>
            </div>
          </li>
        ))}
        {viewers.length === 0 && <p className="text-sm text-tbw-ink/50">Noch keine Betrachter eingetragen.</p>}
      </ul>
    </div>
  );
}
