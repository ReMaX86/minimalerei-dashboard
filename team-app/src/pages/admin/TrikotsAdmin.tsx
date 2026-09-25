import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { useTipoffLoader } from '../../hooks/useTipoffLoader';
import { fmtDateShort } from '../../lib/format';
import { washCountsFor } from '../../lib/trikots';
import type { Player, TrikotSet, TrikotSetId, TrikotWashAdjustmentLogRow, TrikotWashLogRow } from '../../types/database';

// Element 20 "Admin · Trikots" — Neugestaltung nach docs/design/tipoff-design/
// elements/20-admin-trikots/. Fachliche Logik (Rotation, Vorschlagsregel,
// Übergabe, Verlauf) bleibt unverändert; neu sind nur die drei Werkzeuge aus
// PROMPT.md §3–5 (Zähler einzeln ändern, Stände übertragen, Besitz
// korrigieren) — siehe washCountsFor()/trikot_wash_adjustment_log
// (Migration 0069) für die dafür nötige Erweiterung des Waschzähler-Modells.

type View = 'main' | 'counters' | 'bulk' | 'owner';

const EDIT_REASONS = ['Stand aus der Vorsaison', 'Korrektur', 'Hat extra gewaschen'];
const BULK_REASON = 'Stand aus der Vorsaison';

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M12 8v5M12 16h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M6 12h12" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M12 6v12M6 12h12" />
    </svg>
  );
}

function Swatch({ setId, size = 26 }: { setId: TrikotSetId; size?: number }) {
  const white = setId === 'weiss';
  return (
    <span
      className={`shrink-0 rounded-[9px] border ${white ? 'border-to-text bg-to-text' : 'border-to-lineMuted bg-to-bg'}`}
      style={{ width: size, height: size }}
    />
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function sinceLabel(set: TrikotSet): string {
  if (!set.since) return set.current_holder_id ? '' : 'ABGEGEBEN —';
  return set.current_holder_id ? `SEIT ${fmtDateShort(set.since)}` : `ABGEGEBEN ${fmtDateShort(set.since)}`;
}

function NoteBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-to-lg border border-to-borderMatchday bg-to-accentSoft px-3.5 py-3">
      <InfoIcon />
      <span className="flex-1 text-[12px] leading-relaxed text-to-text2">{children}</span>
    </div>
  );
}

function EditSheet({
  player,
  base,
  busy,
  error,
  onSave,
  onCancel
}: {
  player: Player;
  base: number;
  busy: boolean;
  error: string | null;
  onSave: (val: number, reason: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(base);
  const [reason, setReason] = useState('');
  const changed = val !== base;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="flex w-full max-w-lg flex-col gap-3.5 rounded-t-[24px] border border-to-line bg-to-surface p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
        <div className="flex flex-col gap-1">
          <h2 className="to-display-sm text-to-text">{player.name}</h2>
          <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">WASCHZÄHLER ANPASSEN</span>
        </div>

        <div className="flex items-center justify-center gap-[18px] rounded-to-lg border border-to-divider bg-to-surface2 py-4">
          <button
            type="button"
            disabled={val === 0}
            onClick={() => setVal((v) => Math.max(0, v - 1))}
            className="flex h-[46px] w-[46px] items-center justify-center rounded-to-lg border border-to-line text-to-text2 disabled:text-to-textDisabled"
          >
            <MinusIcon />
          </button>
          <span className="flex min-w-[82px] flex-col items-center gap-0.5">
            <span className={`to-number text-[40px] ${changed ? 'text-to-accent' : 'text-to-text'}`}>{val}</span>
            <span className="to-data text-[9px] tracking-[0.1em] text-to-textDisabled">VORHER {base}×</span>
          </span>
          <button
            type="button"
            onClick={() => setVal((v) => v + 1)}
            className="flex h-[46px] w-[46px] items-center justify-center rounded-to-lg border border-to-borderMatchday bg-to-accentSoft text-to-accent"
          >
            <PlusIcon />
          </button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-to-text3">Grund (steht im Verlauf)</span>
          <input className="input" placeholder="z. B. Stand aus der Vorsaison" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          {EDIT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason((prev) => (prev === r ? '' : r))}
              className={`flex h-8 items-center rounded-to-pill border px-3 text-[13px] ${
                reason === r ? 'border-to-borderMatchday bg-to-accentSoft font-semibold text-to-accent' : 'border-to-line text-to-text2'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-to-dangerText">{error}</p>}

        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(val, reason.trim())}
          className="flex h-12 items-center justify-center rounded-to-pill bg-to-accent text-[15px] font-semibold text-to-onAccent disabled:opacity-60"
        >
          {busy ? 'Speichere…' : 'Speichern'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="h-6 text-[13px] text-to-text3">
          Abbrechen
        </button>
      </div>
    </div>,
    document.body
  );
}

function OwnerPickSheet({
  set,
  players,
  busy,
  error,
  onPick,
  onCancel
}: {
  set: TrikotSet;
  players: Player[];
  busy: boolean;
  error: string | null;
  onPick: (playerId: string | null) => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col gap-3.5 overflow-y-auto rounded-t-[24px] border border-to-line bg-to-surface p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
        <div className="flex flex-col gap-1">
          <h2 className="to-display-sm text-to-text">Wer hat den Satz?</h2>
          <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">{set.label.toUpperCase()}</span>
        </div>
        <p className="text-xs text-to-textDisabled">Der Waschzähler ändert sich dadurch NICHT.</p>

        {error && <p className="text-xs text-to-dangerText">{error}</p>}

        <div className="flex max-h-[300px] flex-col overflow-y-auto rounded-to-lg border border-to-divider bg-to-surface2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onPick(null)}
            className={`flex min-h-[50px] items-center gap-3 border-t border-to-surface2 px-3.5 text-left first:border-t-0 ${
              !set.current_holder_id ? 'bg-to-accentWash' : ''
            }`}
          >
            <span className="to-data flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-to-surface2 text-[10px] text-to-text3">
              H
            </span>
            <span className={`min-w-0 flex-1 truncate text-sm ${!set.current_holder_id ? 'font-semibold text-to-accent' : 'text-to-text'}`}>
              In der Halle abgelegt
            </span>
          </button>
          {players.map((p) => {
            const isOn = set.current_holder_id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => onPick(p.id)}
                className={`flex min-h-[50px] items-center gap-3 border-t border-to-surface2 px-3.5 text-left first:border-t-0 ${isOn ? 'bg-to-accentWash' : ''}`}
              >
                <span className="to-data flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-to-surface2 text-[10px] text-to-text3">
                  {initials(p.name)}
                </span>
                <span className={`min-w-0 flex-1 truncate text-sm ${isOn ? 'font-semibold text-to-accent' : 'text-to-text'}`}>{p.name}</span>
              </button>
            );
          })}
        </div>

        <button type="button" disabled={busy} onClick={onCancel} className="h-6 text-[13px] text-to-text3">
          Abbrechen
        </button>
      </div>
    </div>,
    document.body
  );
}

function ResetSheet({
  busy,
  error,
  onConfirm,
  onCancel
}: {
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="flex w-full max-w-lg flex-col gap-3.5 rounded-t-[24px] border border-to-danger/30 bg-to-surface p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
        <div className="flex flex-col gap-1">
          <h2 className="to-display-sm text-to-dangerText">Rotation zurücksetzen?</h2>
          <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">BETRIFFT DIE GANZE SAISON</span>
        </div>

        <div className="flex flex-col gap-2 rounded-to-lg border border-to-danger/30 bg-to-dangerSoft p-3.5">
          <span className="flex gap-2 text-[13px] leading-relaxed text-to-text2">
            – <span>Der komplette <b className="font-semibold text-to-text">Verlauf</b> wird gelöscht.</span>
          </span>
          <span className="flex gap-2 text-[13px] leading-relaxed text-to-text2">
            – <span>Alle <b className="font-semibold text-to-text">Waschzähler</b> gehen auf 0 zurück.</span>
          </span>
          <span className="flex gap-2 text-[13px] leading-relaxed text-to-text2">
            – <span>Beide Sätze stehen wieder auf <b className="font-semibold text-to-text">„Niemand"</b>.</span>
          </span>
        </div>

        <p className="text-[11px] leading-relaxed text-to-textDisabled">
          Gedacht für den Saisonwechsel – nicht mitten in der Saison. Einzelne Korrekturen gehen über „Waschzähler bearbeiten".
        </p>

        {error && <p className="text-xs text-to-dangerText">{error}</p>}

        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="flex h-12 items-center justify-center rounded-to-pill bg-to-danger text-[15px] font-semibold text-[#120507] disabled:opacity-60"
        >
          {busy ? 'Setze zurück…' : 'Ja, alles zurücksetzen'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="h-6 text-[13px] text-to-text3">
          Abbrechen
        </button>
      </div>
    </div>,
    document.body
  );
}

export function TrikotsAdmin() {
  const [view, setView] = useState<View>('main');
  const [sets, setSets] = useState<TrikotSet[] | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [washLog, setWashLog] = useState<TrikotWashLogRow[] | null>(null);
  const [adjustmentLog, setAdjustmentLog] = useState<TrikotWashAdjustmentLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const [bulkValues, setBulkValues] = useState<Record<string, string>>({});
  const [bulkBusy, setBulkBusy] = useState(false);

  const [pickSetId, setPickSetId] = useState<TrikotSetId | null>(null);
  const [pickBusy, setPickBusy] = useState(false);

  const [showReset, setShowReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [setsRes, playersRes, washRes, adjustmentRes] = await Promise.all([
      supabase.from('trikot_sets').select('*').order('id'),
      supabase.from('players').select('*').eq('is_active', true),
      supabase.from('trikot_wash_log').select('*'),
      supabase.from('trikot_wash_adjustment_log').select('*')
    ]);
    if (setsRes.error || playersRes.error || washRes.error || adjustmentRes.error) {
      setError('Fehler beim Laden.');
      return;
    }
    setSets((setsRes.data as TrikotSet[]) ?? []);
    setPlayers((playersRes.data as Player[]) ?? []);
    setWashLog((washRes.data as TrikotWashLogRow[]) ?? []);
    setAdjustmentLog((adjustmentRes.data as TrikotWashAdjustmentLogRow[]) ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden.'));
  }, [load]);

  const showLoader = useTipoffLoader(!sets || !players || !washLog || !adjustmentLog);

  if (error) return <ErrorNote message={error} />;
  if (showLoader) return <LoadingSpinner />;
  if (!sets || !players || !washLog || !adjustmentLog) return null;

  const washCounts = washCountsFor(washLog, adjustmentLog);
  const byWashThenName = (a: Player, b: Player) => (washCounts[a.id] ?? 0) - (washCounts[b.id] ?? 0) || a.name.localeCompare(b.name, 'de');
  const sortedByWash = [...players].sort(byWashThenName);
  const alphabetical = [...players].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const nextName = sortedByWash[0]?.name ?? '—';

  const playersById: Record<string, Player> = {};
  players.forEach((p) => (playersById[p.id] = p));

  async function saveEdit(val: number, reason: string) {
    if (!editPlayer) return;
    const base = washCounts[editPlayer.id] ?? 0;
    const delta = val - base;
    setEditBusy(true);
    setActionError(null);
    try {
      if (delta !== 0) {
        const { error: insertError } = await supabase
          .from('trikot_wash_adjustment_log')
          .insert({ player_id: editPlayer.id, delta, reason: reason || null });
        if (insertError) throw insertError;
      }
      setEditPlayer(null);
      await load();
    } catch {
      setActionError('Zähler konnte nicht gespeichert werden.');
    } finally {
      setEditBusy(false);
    }
  }

  function bulkValueFor(p: Player): number {
    const raw = bulkValues[p.id];
    if (raw === undefined) return washCounts[p.id] ?? 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  const bulkPreview: Record<string, number> = {};
  players.forEach((p) => (bulkPreview[p.id] = bulkValueFor(p)));
  const bulkNextName =
    [...players].sort((a, b) => bulkPreview[a.id] - bulkPreview[b.id] || a.name.localeCompare(b.name, 'de'))[0]?.name ?? '—';

  async function saveBulk() {
    const rows = alphabetical
      .map((p) => ({ player_id: p.id, delta: bulkValueFor(p) - (washCounts[p.id] ?? 0) }))
      .filter((r) => r.delta !== 0)
      .map((r) => ({ ...r, reason: BULK_REASON }));
    setBulkBusy(true);
    setActionError(null);
    try {
      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('trikot_wash_adjustment_log').insert(rows);
        if (insertError) throw insertError;
      }
      setBulkValues({});
      setView('counters');
      await load();
    } catch {
      setActionError('Stände konnten nicht übertragen werden.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function pickOwner(setId: TrikotSetId, playerId: string | null) {
    setPickBusy(true);
    setActionError(null);
    try {
      const { error: rpcError } = await supabase.rpc('transfer_trikot_set', { p_set_id: setId, p_to_player_id: playerId });
      if (rpcError) throw rpcError;
      setPickSetId(null);
      await load();
    } catch {
      setActionError('Besitz konnte nicht korrigiert werden.');
    } finally {
      setPickBusy(false);
    }
  }

  async function doReset() {
    setResetBusy(true);
    setActionError(null);
    try {
      const { error: rpcError } = await supabase.rpc('reset_trikots');
      if (rpcError) throw rpcError;
      setShowReset(false);
      setView('main');
      await load();
    } catch {
      setActionError('Zurücksetzen fehlgeschlagen.');
    } finally {
      setResetBusy(false);
    }
  }

  if (view === 'counters') {
    return (
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView('main')}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md border border-to-border bg-to-surface text-to-text2"
          >
            <BackIcon />
          </button>
          <span className="to-display-sm flex-1 text-to-text">Waschzähler</span>
          <button
            type="button"
            onClick={() => setView('bulk')}
            className="flex h-[30px] shrink-0 items-center rounded-to-pill border border-to-line px-3 text-xs font-semibold text-to-text2"
          >
            Alle bearbeiten
          </button>
        </div>

        <NoteBox>
          Nächster Vorschlag: <b className="font-semibold text-to-accent">{nextName}</b>
        </NoteBox>

        {actionError && <p className="text-xs text-to-dangerText">{actionError}</p>}

        <section className="overflow-hidden rounded-to-xl border border-to-border bg-to-surface">
          {sortedByWash.map((p, i) => {
            const count = washCounts[p.id] ?? 0;
            const isNext = i === 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setEditPlayer(p)}
                className={`flex min-h-[54px] w-full items-center gap-3 px-4 text-left ${i === 0 ? '' : 'border-t border-to-surface2'} ${
                  isNext ? 'bg-to-accentWash' : ''
                }`}
              >
                <span className={`min-w-0 flex-1 truncate text-sm ${isNext ? 'font-semibold text-to-accent' : 'text-to-text'}`}>{p.name}</span>
                <span
                  className={`to-data inline-flex h-[26px] min-w-[38px] shrink-0 items-center justify-center rounded-to-pill px-2.5 text-[11px] font-semibold ${
                    count === 0 ? 'bg-to-accentSoft text-to-accent' : 'bg-to-surface2 text-to-text2'
                  }`}
                >
                  {count}×
                </span>
                <span className="shrink-0 text-to-textDisabled">
                  <PenIcon />
                </span>
              </button>
            );
          })}
        </section>
        <span className="text-[11px] leading-relaxed text-to-textDisabled">
          Jede Änderung steht im Verlauf als „Zähler vom Trainer angepasst".
        </span>

        {editPlayer && (
          <EditSheet
            player={editPlayer}
            base={washCounts[editPlayer.id] ?? 0}
            busy={editBusy}
            error={actionError}
            onSave={saveEdit}
            onCancel={() => setEditPlayer(null)}
          />
        )}
      </div>
    );
  }

  if (view === 'bulk') {
    return (
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView('counters')}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md border border-to-border bg-to-surface text-to-text2"
          >
            <BackIcon />
          </button>
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="to-display-sm text-to-text">Stände übertragen</span>
            <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">ALLE AUF EINMAL</span>
          </span>
        </div>

        <p className="text-[13px] leading-relaxed text-to-textDisabled">
          Wenn ihr mitten in der Saison mit der App startet: Trag ein, wie oft jeder bisher gewaschen hat. Die Rotation rechnet danach normal
          weiter.
        </p>

        <section className="overflow-hidden rounded-to-xl border border-to-border bg-to-surface">
          {alphabetical.map((p, i) => (
            <div key={p.id} className={`flex items-center gap-3 px-4 py-2 ${i === 0 ? '' : 'border-t border-to-surface2'}`}>
              <span className="min-w-0 flex-1 truncate text-sm text-to-text">{p.name}</span>
              <span className="input flex h-9 w-[74px] shrink-0 items-center gap-1.5 !px-3 !py-0">
                <input
                  inputMode="numeric"
                  value={bulkValues[p.id] ?? String(washCounts[p.id] ?? 0)}
                  onChange={(e) => setBulkValues((prev) => ({ ...prev, [p.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                  className="to-data w-full min-w-0 bg-transparent text-base font-semibold text-to-text outline-none"
                />
                <span className="to-data text-[11px] text-to-textDisabled">×</span>
              </span>
            </div>
          ))}
        </section>

        <NoteBox>
          Danach ist <b className="font-semibold text-to-accent">{bulkNextName}</b> als Nächster dran.
        </NoteBox>

        {actionError && <p className="text-xs text-to-dangerText">{actionError}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={bulkBusy}
            onClick={saveBulk}
            className="flex h-12 flex-1 items-center justify-center rounded-to-pill bg-to-accent text-[15px] font-semibold text-to-onAccent disabled:opacity-60"
          >
            {bulkBusy ? 'Speichere…' : 'Alle speichern'}
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => {
              setBulkValues({});
              setView('counters');
            }}
            className="flex h-12 shrink-0 items-center justify-center rounded-to-pill border border-to-line px-6 text-[15px] text-to-text2"
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  if (view === 'owner') {
    return (
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView('main')}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md border border-to-border bg-to-surface text-to-text2"
          >
            <BackIcon />
          </button>
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="to-display-sm text-to-text">Besitz korrigieren</span>
            <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">ÄNDERT KEINEN WASCHZÄHLER</span>
          </span>
        </div>

        {actionError && <p className="text-xs text-to-dangerText">{actionError}</p>}

        <section className="overflow-hidden rounded-to-xl border border-to-border bg-to-surface">
          {sets.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setPickSetId(s.id)}
              className={`flex min-h-[66px] w-full items-center gap-3 px-4 text-left ${i === 0 ? '' : 'border-t border-to-surface2'}`}
            >
              <Swatch setId={s.id} size={34} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={`truncate text-[15px] font-semibold ${s.current_holder_id ? 'text-to-text' : 'text-to-text2'}`}>
                  {s.current_holder_id ? playersById[s.current_holder_id]?.name ?? '?' : 'In der Halle'}
                </span>
                <span className="to-data text-[11px] text-to-textDisabled">
                  {s.label.toUpperCase()} · {sinceLabel(s)}
                </span>
              </span>
              <span className="shrink-0 text-to-textDisabled">
                <ChevronIcon />
              </span>
            </button>
          ))}
        </section>
        <span className="text-[11px] leading-relaxed text-to-textDisabled">
          Nur wer den Satz gerade zu Hause oder dabei hat. Gewaschen hat weiterhin, wer ihn mitgenommen hat – der Zähler bleibt unverändert.
        </span>

        {pickSetId && (
          <OwnerPickSheet
            set={sets.find((s) => s.id === pickSetId)!}
            players={alphabetical}
            busy={pickBusy}
            error={actionError}
            onPick={(playerId) => pickOwner(pickSetId, playerId)}
            onCancel={() => setPickSetId(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <span className="to-display-sm text-to-text">Wo sind die Sätze</span>

      <div className="grid grid-cols-2 gap-2.5">
        {sets.map((s) => (
          <div key={s.id} className="flex flex-col gap-2.5 rounded-to-xl border border-to-border bg-to-surface p-3.5">
            <div className="flex items-center gap-2">
              <Swatch setId={s.id} />
              <span className="to-data text-[9px] leading-tight tracking-[0.1em] text-to-text3">{s.label.toUpperCase()}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className={`truncate text-[15px] font-semibold ${s.current_holder_id ? 'text-to-text' : 'text-to-text2'}`}>
                {s.current_holder_id ? playersById[s.current_holder_id]?.name ?? '?' : 'In der Halle'}
              </span>
              <span className="to-data text-[9px] text-to-textDisabled">{sinceLabel(s)}</span>
            </div>
          </div>
        ))}
      </div>

      {actionError && <p className="text-xs text-to-dangerText">{actionError}</p>}

      <section className="overflow-hidden rounded-to-xl border border-to-border bg-to-surface">
        <button
          type="button"
          onClick={() => setView('counters')}
          className="flex min-h-[60px] w-full items-center gap-3 px-4 text-left"
        >
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium text-to-text">Waschzähler bearbeiten</span>
            <span className="text-[11px] text-to-textDisabled">Einzeln korrigieren oder alle Stände übertragen</span>
          </span>
          <span className="shrink-0 text-to-textDisabled">
            <ChevronIcon />
          </span>
        </button>
        <button
          type="button"
          onClick={() => setView('owner')}
          className="flex min-h-[60px] w-full items-center gap-3 border-t border-to-surface2 px-4 text-left"
        >
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium text-to-text">Besitz korrigieren</span>
            <span className="text-[11px] text-to-textDisabled">Wer hat gerade welchen Satz</span>
          </span>
          <span className="shrink-0 text-to-textDisabled">
            <ChevronIcon />
          </span>
        </button>
        <button
          type="button"
          onClick={() => setShowReset(true)}
          className="flex min-h-[60px] w-full items-center gap-3 border-t border-to-surface2 px-4 text-left"
        >
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium text-to-dangerText">Rotation zurücksetzen</span>
            <span className="text-[11px] text-to-textDisabled">Verlauf, Zähler und Besitz auf Anfang</span>
          </span>
          <span className="shrink-0 text-to-textDisabled">
            <ChevronIcon />
          </span>
        </button>
      </section>

      {showReset && <ResetSheet busy={resetBusy} error={actionError} onConfirm={doReset} onCancel={() => setShowReset(false)} />}
    </div>
  );
}
