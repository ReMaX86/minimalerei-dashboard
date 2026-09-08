import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import type { Announcement } from '../../types/database';

export function AnnouncementsAdmin() {
  const { trainer, player } = useAuth();
  const authorName = trainer?.name ?? player?.name ?? 'Trainer';
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase
      .from('announcements')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (loadError) {
      setError('Fehler beim Laden der Meldungen.');
      return;
    }
    setItems((data as Announcement[]) ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Meldungen.'));
  }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('announcements')
        .insert({ message: message.trim(), pinned, author_name: authorName });
      if (insertError) throw insertError;
      setMessage('');
      setPinned(false);
      await load();
    } catch {
      setError('Meldung konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  }

  async function togglePinned(a: Announcement) {
    setError(null);
    try {
      const { error: updError } = await supabase
        .from('announcements')
        .update({ pinned: !a.pinned })
        .eq('id', a.id);
      if (updError) throw updError;
      await load();
    } catch {
      setError('Status konnte nicht geändert werden.');
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const { error: delError } = await supabase.from('announcements').delete().eq('id', id);
      if (delError) throw delError;
      await load();
    } catch {
      setError('Meldung konnte nicht gelöscht werden.');
    }
  }

  if (error) return <ErrorNote message={error} />;
  if (!items) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card space-y-2">
        <p className="text-sm font-bold text-tbw-navyDark">Neue Meldung</p>
        <textarea
          required
          rows={3}
          placeholder="z. B. Training am Freitag fällt aus."
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Angeheftet (bleibt oben)
        </label>
        <button className="btn-primary w-full" disabled={busy || !message.trim()}>
          Veröffentlichen
        </button>
      </form>

      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="card space-y-2">
            <p className="text-sm text-tbw-navyDark">{a.message}</p>
            <p className="text-xs text-tbw-ink/50">
              {a.author_name} · {new Date(a.created_at).toLocaleDateString('de-DE')}
              {a.pinned && ' · angeheftet'}
            </p>
            <div className="flex gap-2">
              <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => togglePinned(a)}>
                {a.pinned ? 'Lösen' : 'Anheften'}
              </button>
              <button className="btn-secondary !px-2 !py-1 text-xs !text-tbw-red" onClick={() => remove(a.id)}>
                Löschen
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && <p className="text-sm text-tbw-ink/50">Noch keine Meldungen.</p>}
      </ul>
    </div>
  );
}
