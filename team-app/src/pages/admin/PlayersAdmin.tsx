import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import type { Player } from '../../types/database';

export function PlayersAdmin() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<{ name: string; code: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase
      .from('players')
      .select('*')
      .order('is_active', { ascending: false })
      .order('name');
    if (loadError) {
      setError('Fehler beim Laden der Spielerliste.');
      return;
    }
    setPlayers((data as Player[]) ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Spielerliste.'));
  }, [load]);

  async function addPlayer(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('create_player', { p_name: name.trim() });
      if (rpcError) throw rpcError;
      setNewCode({ name: name.trim(), code: (data as Player).access_code });
      setName('');
      await load();
    } catch {
      setError('Spieler konnte nicht angelegt werden.');
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(playerId: string, playerName: string) {
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('regenerate_access_code', { p_player_id: playerId });
      if (rpcError) throw rpcError;
      setNewCode({ name: playerName, code: data as string });
      await load();
    } catch {
      setError('Code konnte nicht neu generiert werden.');
    }
  }

  async function toggleActive(p: Player) {
    setError(null);
    try {
      const { error: updError } = await supabase
        .from('players')
        .update({ is_active: !p.is_active })
        .eq('id', p.id);
      if (updError) throw updError;
      await load();
    } catch {
      setError('Status konnte nicht geändert werden.');
    }
  }

  if (error) return <ErrorNote message={error} />;
  if (!players) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <form onSubmit={addPlayer} className="card flex gap-2">
        <input
          className="input"
          placeholder="Name des Spielers"
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
          <p className="mt-1 text-xs text-tbw-ink/50">Bitte per WhatsApp/SMS an den Spieler weitergeben.</p>
          <button className="mt-2 text-xs font-semibold text-tbw-ink/50" onClick={() => setNewCode(null)}>
            Schließen
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {players.map((p) => (
          <li key={p.id} className={`card ${!p.is_active ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-tbw-navyDark">{p.name}</p>
                <p className="text-xs text-tbw-ink/50">Code: {p.access_code}</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => regenerate(p.id, p.name)}>
                  Code neu
                </button>
                <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => toggleActive(p)}>
                  {p.is_active ? 'Deaktivieren' : 'Aktivieren'}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
