import { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './Avatar';
import { ErrorNote } from './ErrorNote';

export function MyProfileModal({ onClose }: { onClose: () => void }) {
  const { player, refreshPlayer } = useAuth();
  const [heightCm, setHeightCm] = useState(player?.height_cm?.toString() ?? '');
  const [birthDate, setBirthDate] = useState(player?.birth_date ?? '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!player) return null;

  async function save() {
    if (!player) return;
    setSaving(true);
    setError(null);
    try {
      let photo_url = player.photo_url;
      if (photoFile) {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (!session) throw new Error('Nicht angemeldet.');
        const ext = photoFile.name.split('.').pop() ?? 'jpg';
        const path = `${session.user.id}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('player-photos')
          .upload(path, photoFile, { upsert: true });
        if (uploadError) throw uploadError;
        photo_url = supabase.storage.from('player-photos').getPublicUrl(path).data.publicUrl;
      }
      const { error: rpcError } = await supabase.rpc('update_my_profile', {
        p_height_cm: heightCm ? Number(heightCm) : null,
        p_birth_date: birthDate || null,
        p_photo_url: photo_url
      });
      if (rpcError) throw rpcError;
      await refreshPlayer();
      onClose();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(`Profil konnte nicht gespeichert werden. (${detail})`);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="card max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded-b-[26px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="headline text-xl text-tbw-navyDark">Mein Profil</p>
          <button className="text-sm font-semibold text-tbw-ink/50" onClick={onClose}>
            Schließen
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Avatar player={photoFile ? { ...player, photo_url: URL.createObjectURL(photoFile) } : player} size="lg" />
          <label className="btn-secondary cursor-pointer text-xs">
            Foto wählen
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="block text-xs">
            <span className="font-semibold text-tbw-ink/50">Größe (cm)</span>
            <input
              type="number"
              className="input mt-1"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            <span className="font-semibold text-tbw-ink/50">Geburtsdatum</span>
            <input
              type="date"
              className="input mt-1"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </label>
        </div>

        {error && (
          <div className="mt-3">
            <ErrorNote message={error} />
          </div>
        )}

        <button className="btn-primary mt-4 w-full" disabled={saving} onClick={save}>
          {saving ? 'Speichere…' : 'Speichern'}
        </button>
      </div>
    </div>,
    document.body
  );
}
