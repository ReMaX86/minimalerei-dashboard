import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { useTipoffLoader } from '../../hooks/useTipoffLoader';
import { fmtDateShort } from '../../lib/format';
import { POSITION_LABELS, SKILL_OPTIONS, type Player, type PlayerPosition } from '../../types/database';

// Element 15 "Admin · Spieler" — Neugestaltung nach docs/design/tipoff-
// design/elements/15-admin-spieler/. Codeerzeugung, Rollenmodell,
// Deaktivierung, Kampfgericht-Befreiung und Profilfelder bleiben fachlich
// unverändert; es geht um Darstellung, Anordnung und Wortwahl (siehe §-
// Punkte in der Rückmeldung für die Stellen, an denen dafür Rückfrage
// gehalten wurde: U18-Befreiung weiterhin ein Flag, Stärken-Limit
// aufgehoben, player_access_codes.created_at neu ergänzt).

const EMPTY_DETAILS = {
  position: '' as '' | PlayerPosition,
  height_cm: '',
  birth_date: '',
  skills: [] as string[]
};

type Role = 'Spieler' | 'Co-Captain' | 'Captain';
type View = 'list' | 'detail' | 'profile';

function roleOf(p: Player): Role {
  if (p.is_captain) return 'Captain';
  if (p.is_co_captain) return 'Co-Captain';
  return 'Spieler';
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function fmtHeight(cm: string): string {
  if (!cm) return '—';
  return `${(Number(cm) / 100).toFixed(2).replace('.', ',')} m`;
}
function fmtBirthDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM5 15V6a1 1 0 0 1 1-1h9" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-textDisabled" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function Tag({ children, tone }: { children: string; tone: 'coach' | 'cap' | 'cocap' | 'u18' | 'off' }) {
  const cls: Record<typeof tone, string> = {
    coach: 'border border-to-borderMatchday bg-to-accentSoft text-to-accent',
    cap: 'border border-transparent bg-to-surface2 text-to-text',
    cocap: 'border border-to-line text-to-text2',
    u18: 'border border-to-vacation/30 bg-to-vacationSoft text-to-vacation',
    off: 'border border-to-line text-to-textDisabled'
  };
  return (
    <span className={`to-data inline-flex h-[18px] items-center rounded-to-pill px-1.5 text-[8px] font-semibold tracking-[0.06em] ${cls[tone]}`}>
      {children}
    </span>
  );
}

function Switch({ on, warn }: { on: boolean; warn?: boolean }) {
  return (
    <span
      className={`flex h-[26px] w-11 shrink-0 items-center rounded-to-pill border px-[3px] transition ${
        on
          ? warn
            ? 'border-to-vacation/50 bg-to-vacationSoft'
            : 'border-to-accent bg-to-accent'
          : 'border-to-line bg-to-surface2'
      }`}
    >
      <span
        className={`h-[18px] w-[18px] rounded-full transition ${on ? 'translate-x-[18px]' : 'translate-x-0'} ${
          on ? (warn ? 'bg-to-vacation' : 'bg-to-onAccent') : 'bg-to-textDisabled'
        }`}
      />
    </span>
  );
}

function SwitchRow({
  label,
  sub,
  on,
  warn,
  onToggle
}: {
  label: string;
  sub: string;
  on: boolean;
  warn?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="flex min-h-[58px] items-center gap-3 border-t border-to-surface2 px-3.5 py-2.5 text-left first:border-t-0"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-to-text">{label}</span>
        <span className="text-[11px] leading-snug text-to-textDisabled">{sub}</span>
      </span>
      <Switch on={on} warn={warn} />
    </button>
  );
}

export function PlayersAdmin() {
  const [searchParams] = useSearchParams();
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [codes, setCodes] = useState<Record<string, { code: string; createdAt: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<{ name: string; code: string } | null>(null);
  const [createdCopied, setCreatedCopied] = useState(false);

  const [search, setSearch] = useState('');
  const [copiedListId, setCopiedListId] = useState<string | null>(null);
  const [copiedDetail, setCopiedDetail] = useState(false);

  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsForm, setDetailsForm] = useState(EMPTY_DETAILS);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [{ data, error: loadError }, { data: codeRows, error: codesError }] = await Promise.all([
      supabase.from('players').select('*').order('is_active', { ascending: false }).order('name'),
      supabase.rpc('list_player_access_codes')
    ]);
    if (loadError || codesError) {
      setError('Fehler beim Laden der Spielerliste.');
      return;
    }
    setPlayers((data as Player[]) ?? []);
    setCodes(
      Object.fromEntries(
        ((codeRows as { player_id: string; access_code: string; created_at: string }[] | null) ?? []).map((r) => [
          r.player_id,
          { code: r.access_code, createdAt: r.created_at }
        ])
      )
    );
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Spielerliste.'));
  }, [load]);

  // Sprung von der Team-Profilkarte ("Im Admin bearbeiten", Element 11) —
  // öffnet direkt die Detailseite des betroffenen Spielers.
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  useEffect(() => {
    if (deepLinkHandled || !players) return;
    const id = searchParams.get('player');
    if (id && players.some((p) => p.id === id)) {
      setSelectedId(id);
      setView('detail');
    }
    setDeepLinkHandled(true);
  }, [searchParams, players, deepLinkHandled]);

  const selected = useMemo(() => players?.find((p) => p.id === selectedId) ?? null, [players, selectedId]);

  const showLoader = useTipoffLoader(!players);

  if (error) return <ErrorNote message={error} />;
  if (showLoader) return <LoadingSpinner />;
  if (!players) return null;

  async function addPlayer() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('create_player', { p_name: name.trim() });
      if (rpcError) throw rpcError;
      const row = (data as { player: Player; access_code: string }[])[0];
      setNewCode({ name: name.trim(), code: row.access_code });
      setCreatedCopied(false);
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
      const { error: rpcError } = await supabase.rpc('regenerate_access_code', { p_player_id: playerId });
      if (rpcError) throw rpcError;
      setCopiedDetail(false);
      await load();
    } catch {
      setError(`Code für ${playerName} konnte nicht neu generiert werden.`);
    }
  }

  async function toggleActive(p: Player) {
    setError(null);
    try {
      const { error: updError } = await supabase.from('players').update({ is_active: !p.is_active }).eq('id', p.id);
      if (updError) throw updError;
      await load();
    } catch {
      setError('Status konnte nicht geändert werden.');
    }
  }

  async function toggleFlag(p: Player, field: 'is_admin' | 'officiating_exempt', errorMsg: string) {
    setError(null);
    try {
      const { error: updError } = await supabase.from('players').update({ [field]: !p[field] }).eq('id', p.id);
      if (updError) throw updError;
      await load();
    } catch {
      setError(errorMsg);
    }
  }

  async function setRole(p: Player, role: Role) {
    setError(null);
    try {
      const { error: updError } = await supabase
        .from('players')
        .update({ is_captain: role === 'Captain', is_co_captain: role === 'Co-Captain' })
        .eq('id', p.id);
      if (updError) throw updError;
      await load();
    } catch {
      setError('Rolle konnte nicht geändert werden.');
    }
  }

  function openProfile(p: Player) {
    setDetailsForm({
      position: p.position ?? '',
      height_cm: p.height_cm?.toString() ?? '',
      birth_date: p.birth_date ?? '',
      skills: p.skills
    });
    setPhotoFile(null);
    setView('profile');
  }

  async function saveProfile(p: Player) {
    setSavingDetails(true);
    setError(null);
    try {
      let photo_url = p.photo_url;
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() ?? 'jpg';
        const path = `${p.id}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('player-photos').upload(path, photoFile, { upsert: false });
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
      setView('detail');
      await load();
    } catch {
      setError('Profil konnte nicht gespeichert werden.');
    } finally {
      setSavingDetails(false);
    }
  }

  async function copyCode(text: string, setDone: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Zwischenablage nicht verfügbar (z. B. kein HTTPS) — die Kopier-
      // Rückmeldung fällt in dem Fall einfach weg, kein harter Fehler.
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  const activePlayers = players.filter((p) => p.is_active);
  const inactivePlayers = players.filter((p) => !p.is_active);
  const q = search.trim().toLowerCase();
  const activeFiltered = q ? activePlayers.filter((p) => p.name.toLowerCase().includes(q)) : activePlayers;
  const inactiveFiltered = q ? inactivePlayers.filter((p) => p.name.toLowerCase().includes(q)) : inactivePlayers;

  return (
    <div className="flex flex-col gap-3.5">
      {view === 'list' && (
        <>
          <div className="flex flex-col gap-2.5 rounded-to-xl border border-to-border bg-to-surface p-4">
            <span className="to-data text-[10px] tracking-[0.12em] text-to-text3">NEUEN SPIELER ANLEGEN</span>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addPlayer();
              }}
              className="flex gap-2"
            >
              <input
                className="h-11 min-w-0 flex-1 rounded-to-md border border-to-line bg-to-bg px-3.5 text-sm text-to-text placeholder:text-to-textDisabled"
                placeholder="Name des Spielers"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" disabled={busy || !name.trim()} className="btn-primary h-11 shrink-0 px-4.5 text-sm">
                Anlegen
              </button>
            </form>
            <span className="text-[11px] leading-relaxed text-to-textDisabled">
              Der Anmeldecode wird sofort erzeugt und kann danach kopiert werden.
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex h-10 flex-1 items-center gap-2.5 rounded-to-pill border border-to-border bg-to-surface px-3.5 text-to-textDisabled">
              <SearchIcon />
              <input
                className="min-w-0 flex-1 bg-transparent text-[13px] text-to-text outline-none placeholder:text-to-textDisabled"
                placeholder="Spieler suchen"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <span className="to-data shrink-0 text-[10px] tracking-[0.1em] text-to-textDisabled">{activePlayers.length} AKTIV</span>
          </div>

          <div className="flex flex-col overflow-hidden rounded-to-2xl border border-to-border bg-to-surface">
            {activeFiltered.map((p) => {
              const codeInfo = codes[p.id];
              const done = copiedListId === p.id;
              return (
                <div key={p.id} className="flex min-h-[60px] items-center gap-2.5 border-t border-to-surface2 px-3.5 py-2.5 first:border-t-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(p.id);
                      setView('detail');
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      className={`to-data flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[11px] ${
                        p.is_admin ? 'border border-to-borderMatchday bg-to-accentSoft text-to-accent' : 'bg-to-surface2 text-to-text2'
                      }`}
                    >
                      {initialsOf(p.name)}
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-sm font-semibold -tracking-[0.01em] text-to-text">{p.name}</span>
                      <span className="flex flex-wrap gap-1">
                        {p.is_admin && <Tag tone="coach">TRAINER</Tag>}
                        {p.is_captain && <Tag tone="cap">CAPTAIN</Tag>}
                        {p.is_co_captain && <Tag tone="cocap">CO-CAPTAIN</Tag>}
                        {p.officiating_exempt && <Tag tone="u18">U18 BEFREIT</Tag>}
                      </span>
                    </span>
                  </button>
                  {codeInfo && (
                    <button
                      type="button"
                      onClick={() => copyCode(codeInfo.code, (v) => setCopiedListId(v ? p.id : null))}
                      className={`to-data flex h-[30px] shrink-0 items-center gap-1.5 rounded-to-pill px-2.5 text-[11px] tracking-[0.04em] ${
                        done ? 'bg-to-accent/16 text-to-accent' : 'bg-to-surface2 text-to-text2'
                      }`}
                    >
                      {done ? (
                        <>
                          KOPIERT <CheckIcon />
                        </>
                      ) : (
                        <>
                          {codeInfo.code} <CopyIcon />
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`${p.name} — Details`}
                    onClick={() => {
                      setSelectedId(p.id);
                      setView('detail');
                    }}
                  >
                    <ChevronRightIcon />
                  </button>
                </div>
              );
            })}
            {activeFiltered.length === 0 && <p className="p-4 text-sm text-to-text3">Keine Spieler gefunden.</p>}
          </div>

          {inactiveFiltered.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">INAKTIV · {inactiveFiltered.length}</span>
                <span className="h-px flex-1 bg-to-divider" />
              </div>
              <div className="flex flex-col overflow-hidden rounded-to-2xl border border-dashed border-to-line bg-to-bg opacity-[0.78]">
                {inactiveFiltered.map((p) => (
                  <div key={p.id} className="flex min-h-[52px] items-center gap-2.5 border-t border-to-surface2 px-3.5 py-2 first:border-t-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(p.id);
                        setView('detail');
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span className="to-data flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-to-surface2 text-[11px] text-to-text3">
                        {initialsOf(p.name)}
                      </span>
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-[13px] font-medium text-to-text3">{p.name}</span>
                        <Tag tone="off">INAKTIV</Tag>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(p)}
                      className="flex h-[26px] shrink-0 items-center rounded-to-pill border border-to-line px-2.5 text-xs text-to-text2"
                    >
                      Aktivieren
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {view === 'detail' && selected && (
        <>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setView('list')}
              aria-label="Zurück"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md border border-to-border bg-to-surface text-to-text2"
            >
              <BackIcon />
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="to-display-sm truncate text-to-text">{selected.name}</span>
              <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">
                {(selected.is_admin ? 'TRAINER · ' : '') + roleOf(selected).toUpperCase() + (selected.is_active ? ' · AKTIV' : ' · INAKTIV')}
              </span>
            </div>
            <span
              className={`to-data flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-[13px] ${
                selected.is_admin ? 'border border-to-borderMatchday bg-to-accentSoft text-to-accent' : 'bg-to-surface2 text-to-text2'
              }`}
            >
              {initialsOf(selected.name)}
            </span>
          </div>

          {!selected.is_active && (
            <div className="flex flex-col gap-1.5 rounded-to-xl border border-to-danger/30 bg-to-dangerSoft p-4">
              <span className="to-data text-[9px] tracking-[0.12em] text-to-dangerText">DEAKTIVIERT</span>
              <span className="text-[12px] leading-relaxed text-to-text2">
                Erscheint nicht mehr in Kader, Trikotliste und Kampfgericht. Statistiken und Einsätze bleiben gespeichert.
              </span>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-to-lg border border-to-divider bg-to-surface2 p-3.5">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="to-data text-[9px] tracking-[0.12em] text-to-text3">ANMELDECODE</span>
              <span className="to-data text-[18px] font-semibold tracking-[0.1em] text-to-text">{codes[selected.id]?.code ?? '…'}</span>
            </div>
            <button
              type="button"
              onClick={() => codes[selected.id] && copyCode(codes[selected.id].code, setCopiedDetail)}
              className={`to-data flex h-9 shrink-0 items-center gap-1.5 rounded-to-pill px-3.5 text-[13px] font-semibold ${
                copiedDetail ? 'bg-to-accent/16 text-to-accent' : 'bg-to-accent text-to-onAccent'
              }`}
            >
              {copiedDetail ? (
                <>
                  <CheckIcon /> Kopiert
                </>
              ) : (
                <>
                  <CopyIcon /> Kopieren
                </>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2.5 px-0.5">
            <span className="flex-1 text-[12px] text-to-text3">
              {codes[selected.id] ? `Code wurde am ${fmtDateShort(codes[selected.id].createdAt.slice(0, 10))} erzeugt` : ''}
            </span>
            <button type="button" onClick={() => regenerate(selected.id, selected.name)} className="shrink-0 text-[13px] font-semibold text-to-accent">
              Neuen Code erzeugen
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="to-data text-[9px] tracking-[0.12em] text-to-textDisabled">ROLLE IM TEAM</span>
            <div className="flex gap-1 rounded-to-lg border border-to-divider bg-to-surface2 p-1">
              {(['Spieler', 'Co-Captain', 'Captain'] as const).map((r) => {
                const on = roleOf(selected) === r;
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setRole(selected, r)}
                    className={`h-[34px] flex-1 rounded-to-md text-[13px] ${on ? 'bg-to-accent font-semibold text-to-onAccent' : 'font-medium text-to-text2'}`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-to-lg border border-to-divider bg-to-surface">
            <SwitchRow
              label="Trainerrechte"
              sub="Sieht den Adminbereich und kann Kader veröffentlichen"
              on={selected.is_admin}
              onToggle={() => toggleFlag(selected, 'is_admin', 'Trainerrechte konnten nicht geändert werden.')}
            />
            <SwitchRow
              label="Aktiv im Team"
              sub="Aus: verschwindet aus Kader, Trikotliste und Kampfgericht"
              on={selected.is_active}
              onToggle={() => toggleActive(selected)}
            />
            <SwitchRow
              label="Vom Kampfgericht befreit"
              sub="Spielt bereits in der U18 und wird dort eingeteilt"
              on={selected.officiating_exempt}
              warn
              onToggle={() => toggleFlag(selected, 'officiating_exempt', 'Kampfgericht-Befreiung konnte nicht geändert werden.')}
            />
          </div>

          <button
            type="button"
            onClick={() => openProfile(selected)}
            className="flex min-h-[56px] items-center gap-3 rounded-to-lg border border-to-divider bg-to-surface px-3.5 text-left"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium text-to-text">Profil bearbeiten</span>
              <span className="text-[11px] text-to-textDisabled">Bild, Größe, Geburtsdatum, Position, Stärken</span>
            </span>
            <ChevronRightIcon />
          </button>
        </>
      )}

      {view === 'profile' && selected && (
        <>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setView('detail')}
              aria-label="Zurück"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md border border-to-border bg-to-surface text-to-text2"
            >
              <BackIcon />
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="to-display-sm text-to-text">Profil</span>
              <span className="to-data truncate text-[10px] tracking-[0.1em] text-to-text3">{selected.name.toUpperCase()}</span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-to-2xl border border-to-border bg-to-surface p-3.5">
            {photoFile ? (
              <img src={URL.createObjectURL(photoFile)} alt="" className="h-[58px] w-[58px] shrink-0 rounded-full object-cover" />
            ) : selected.photo_url ? (
              <img src={selected.photo_url} alt="" className="h-[58px] w-[58px] shrink-0 rounded-full object-cover" />
            ) : (
              <span className="to-data flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full bg-to-surface2 text-base text-to-text3">
                {initialsOf(selected.name)}
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-semibold text-to-text">Profilbild</span>
              <span className="text-[11px] leading-relaxed text-to-textDisabled">
                Der Spieler kann es selbst ändern – du kannst es ersetzen oder entfernen.
              </span>
            </div>
            <label className="flex h-9 shrink-0 cursor-pointer items-center rounded-to-pill border border-to-line px-3.5 text-[13px] text-to-text2">
              Ändern
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <span className="to-data text-[9px] tracking-[0.12em] text-to-textDisabled">PFLEGT AUCH DER SPIELER SELBST</span>
            <div className="flex flex-col overflow-hidden rounded-to-lg border border-to-divider bg-to-surface">
              <label className="relative flex min-h-[54px] cursor-pointer items-center gap-3 px-3.5">
                <span className="flex-1 text-sm text-to-text2">Größe</span>
                <span className="to-data text-sm font-medium text-to-text">{fmtHeight(detailsForm.height_cm)}</span>
                <ChevronRightIcon />
                <input
                  type="number"
                  inputMode="numeric"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  value={detailsForm.height_cm}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, height_cm: e.target.value }))}
                />
              </label>
              <label className="relative flex min-h-[54px] cursor-pointer items-center gap-3 border-t border-to-surface2 px-3.5">
                <span className="flex-1 text-sm text-to-text2">Geburtsdatum</span>
                <span className="to-data text-sm font-medium text-to-text">{fmtBirthDate(detailsForm.birth_date)}</span>
                <ChevronRightIcon />
                <input
                  type="date"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  value={detailsForm.birth_date}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, birth_date: e.target.value }))}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="to-data text-[9px] tracking-[0.12em] text-to-textDisabled">POSITION · NUR TRAINER</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(POSITION_LABELS) as PlayerPosition[]).map((pos) => {
                const on = detailsForm.position === pos;
                return (
                  <button
                    key={pos}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDetailsForm((f) => ({ ...f, position: on ? '' : pos }))}
                    className={`flex h-[34px] items-center rounded-to-pill border px-3.5 text-[13px] ${
                      on ? 'border-to-borderMatchday bg-to-accentSoft font-semibold text-to-accent' : 'border-to-line text-to-text2'
                    }`}
                  >
                    {POSITION_LABELS[pos].split(' (')[0]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="to-data text-[9px] tracking-[0.12em] text-to-textDisabled">STÄRKEN · NUR TRAINER · KEINE PFLICHT</span>
            <div className="flex flex-wrap gap-1.5">
              {SKILL_OPTIONS.map((skill) => {
                const on = detailsForm.skills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setDetailsForm((f) => ({
                        ...f,
                        skills: on ? f.skills.filter((s) => s !== skill) : [...f.skills, skill]
                      }))
                    }
                    className={`flex h-[34px] items-center rounded-to-pill border px-3.5 text-[13px] ${
                      on ? 'border-to-borderMatchday bg-to-accentSoft font-semibold text-to-accent' : 'border-to-line text-to-text2'
                    }`}
                  >
                    {skill}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" disabled={savingDetails} onClick={() => saveProfile(selected)} className="btn-primary h-[46px] flex-1 text-[15px]">
              {savingDetails ? 'Speichere…' : 'Speichern'}
            </button>
            <button
              type="button"
              disabled={savingDetails}
              onClick={() => setView('detail')}
              className="flex h-[46px] shrink-0 items-center justify-center rounded-to-pill border border-to-line px-4.5 text-[15px] text-to-text2"
            >
              Abbrechen
            </button>
          </div>
        </>
      )}

      {newCode && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setNewCode(null)}>
          <div
            className="flex w-full max-w-lg flex-col gap-3.5 rounded-t-[24px] border border-to-line bg-to-surface p-5 sm:rounded-b-[24px]"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
            <div className="flex flex-col gap-1">
              <h2 className="to-display-sm text-to-text">Spieler angelegt</h2>
              <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">{newCode.name.toUpperCase()}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 rounded-to-lg border border-to-borderMatchday bg-to-surface2 px-4 py-5">
              <span className="to-data text-[9px] tracking-[0.12em] text-to-text3">ANMELDECODE</span>
              <span className="to-data text-[30px] font-bold tracking-[0.16em] text-to-accent">{newCode.code}</span>
            </div>
            <p className="text-center text-[12px] leading-relaxed text-to-textDisabled">
              Schick den Code an den Spieler – damit meldet er sich das erste Mal an.
            </p>
            <button
              type="button"
              onClick={() => copyCode(newCode.code, setCreatedCopied)}
              className={`flex h-[46px] items-center justify-center rounded-to-pill text-[15px] font-semibold ${
                createdCopied ? 'bg-to-accent/16 text-to-accent' : 'bg-to-accent text-to-onAccent'
              }`}
            >
              {createdCopied ? 'Kopiert ✓' : 'Code kopieren'}
            </button>
            <button type="button" onClick={() => setNewCode(null)} className="h-6 text-[13px] font-normal text-to-text3">
              Fertig
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
