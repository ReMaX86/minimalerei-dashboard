import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { POSITION_LABELS, SKILL_OPTIONS, type Player, type PlayerPosition } from '../../types/database';

const EMPTY_DETAILS = {
  position: '' as '' | PlayerPosition,
  height_cm: '',
  birth_date: '',
  skills: [] as string[]
};

export function PlayersAdmin() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<{ name: string; code: string } | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsForm, setDetailsForm] = useState(EMPTY_DETAILS);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);

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

  async function toggleAdmin(p: Player) {
    setError(null);
    try {
      const { error: updError } = await supabase
        .from('players')
        .update({ is_admin: !p.is_admin })
        .eq('id', p.id);
      if (updError) throw updError;
      await load();
    } catch {
      setError('Trainer-Rechte konnten nicht geändert werden.');
    }
  }

  function openDetails(p: Player) {
    setDetailsId(p.id);
    setPhotoFile(null);
    setDetailsForm({
      position: p.position ?? '',
      height_cm: p.height_cm?.toString() ?? '',
      birth_date: p.birth_date ?? '',
      skills: p.skills
    });
  }

  function toggleSkill(skill: string) {
    setDetailsForm((f) => ({
      ...f,
      skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill]
    }));
  }

  async function saveDetails(p: Player) {
    setSavingDetails(true);
    setError(null);
    try {
      let photo_url = p.photo_url;
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() ?? 'jpg';
        const path = `${p.id}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('player-photos').upload(path, photoFile, {
          upsert: true
        });
        if (uploadError) throw uploadError;
        photo_url = supabase.storage.from('player-photos').getPublicUrl(path).data.publicUrl;
      }
      const { error: updError } = await supabase
        .from('players')
        .update({
          position: detailsForm.position || null,
          height_cm: detailsForm.height_cm ? Number(detailsForm.height_cm) : null,
          birth_date: detailsForm.birth_date || null,
          skills: detailsForm.skills,
          photo_url
        })
        .eq('id', p.id);
      if (updError) throw updError;
      setDetailsId(null);
      await load();
    } catch {
      setError('Profil konnte nicht gespeichert werden.');
    } finally {
      setSavingDetails(false);
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
          <li key={p.id} className={`card space-y-3 ${!p.is_active ? 'opacity-50' : ''}`}>
            <div>
              <p className="flex flex-wrap items-center gap-1.5 font-semibold text-tbw-navyDark">
                {p.name}
                {p.is_admin && <span className="pill pill-warn">Trainer</span>}
              </p>
              <p className="text-xs text-tbw-ink/50">Code: {p.access_code}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => regenerate(p.id, p.name)}>
                Code neu
              </button>
              <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => toggleActive(p)}>
                {p.is_active ? 'Deaktivieren' : 'Aktivieren'}
              </button>
              <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => toggleAdmin(p)}>
                {p.is_admin ? 'Trainer-Rechte entziehen' : 'Zu Trainer machen'}
              </button>
              <button
                className="btn-secondary !px-2 !py-1 text-xs"
                onClick={() => (detailsId === p.id ? setDetailsId(null) : openDetails(p))}
              >
                {detailsId === p.id ? 'Profil schließen' : 'Profil bearbeiten'}
              </button>
            </div>

            {detailsId === p.id && (
              <div className="space-y-2 border-t border-black/5 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="input min-w-0"
                    value={detailsForm.position}
                    onChange={(e) =>
                      setDetailsForm((f) => ({ ...f, position: e.target.value as '' | PlayerPosition }))
                    }
                  >
                    <option value="">Position wählen</option>
                    {(Object.keys(POSITION_LABELS) as PlayerPosition[]).map((pos) => (
                      <option key={pos} value={pos}>
                        {POSITION_LABELS[pos]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Größe (cm)"
                    className="input min-w-0"
                    value={detailsForm.height_cm}
                    onChange={(e) => setDetailsForm((f) => ({ ...f, height_cm: e.target.value }))}
                  />
                </div>
                <label className="block text-xs">
                  <span className="font-semibold text-tbw-ink/50">Geburtsdatum</span>
                  <input
                    type="date"
                    className="input mt-1"
                    value={detailsForm.birth_date}
                    onChange={(e) => setDetailsForm((f) => ({ ...f, birth_date: e.target.value }))}
                  />
                </label>
                <label className="block text-xs">
                  <span className="font-semibold text-tbw-ink/50">Foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="input mt-1 !py-1.5"
                    onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <div>
                  <p className="text-xs font-semibold text-tbw-ink/50">Stärken</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {SKILL_OPTIONS.map((skill) => (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => toggleSkill(skill)}
                        className={`pill ${detailsForm.skills.includes(skill) ? 'pill-ok' : 'pill-open'}`}
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  className="btn-primary w-full"
                  disabled={savingDetails}
                  onClick={() => saveDetails(p)}
                >
                  {savingDetails ? 'Speichere…' : 'Profil speichern'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
