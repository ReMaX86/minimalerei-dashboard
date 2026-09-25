import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { useTipoffLoader } from '../../hooks/useTipoffLoader';
import { fmtDateShort } from '../../lib/format';
import {
  ANNOUNCEMENT_KIND_EXPLANATION,
  ANNOUNCEMENT_KIND_LABELS,
  announcementEndInfo,
  computeExpiresAt,
  isAnnouncementOpen,
  pushSubLabel,
  remainingTimeLabel,
  sortAnnouncements
} from '../../lib/announcements';
import type { Announcement, AnnouncementKind, AnnouncementReadRow } from '../../types/database';

// Element 22 "Meldungen" — Neugestaltung nach docs/design/tipoff-design/
// elements/22-meldungen/. Anlegen/Bearbeiten/Beenden/Löschen sind neu
// gebaut (siehe PROMPT.md §2-6), Sichtbarkeit bleibt an isAdmin (Trainer
// bzw. Spieler mit is_admin) hängen — Captain/Co-Captain kommen nicht in
// den Adminbereich, das war schon vor diesem Element so (App.tsx-
// Routenwächter auf /admin), keine Änderung nötig, siehe Chat-Antwort.

const KIND_ORDER: AnnouncementKind[] = ['hinweis', 'wichtig', 'dringend'];

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-2.5 8-2.5 8h17S18 15 18 8zM10.5 20a2 2 0 0 0 3 0" />
    </svg>
  );
}

function kindBarClass(kind: AnnouncementKind): string {
  return kind === 'dringend' ? 'bg-to-danger' : kind === 'wichtig' ? 'bg-to-accent' : 'bg-to-line';
}
function kindLabelClass(kind: AnnouncementKind): string {
  return kind === 'dringend' ? 'text-to-dangerText' : kind === 'wichtig' ? 'text-to-accent' : 'text-to-text3';
}
function kindRowToneClass(kind: AnnouncementKind): string {
  return kind === 'dringend' ? 'bg-to-dangerSoft/40' : kind === 'wichtig' ? 'bg-to-accentWash' : '';
}

function EndSheet({
  announcement,
  busy,
  error,
  onConfirm,
  onCancel
}: {
  announcement: Announcement;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="flex w-full max-w-lg flex-col gap-3.5 rounded-t-[24px] border border-to-line bg-to-surface p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
        <h2 className="to-display-sm text-to-text">Meldung beenden?</h2>
        <p className="rounded-to-lg border border-to-divider bg-to-surface2 p-3.5 text-[13px] leading-relaxed text-to-text2">{announcement.message}</p>
        <p className="text-[12px] leading-relaxed text-to-textDisabled">
          Sie verschwindet sofort von allen Startseiten und rutscht hier unter „Beendet". Wer sie gelesen hat, bleibt gespeichert. Löschen kannst du
          sie danach immer noch.
        </p>
        {error && <p className="text-xs text-to-dangerText">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="flex h-12 items-center justify-center rounded-to-pill bg-to-accent text-[15px] font-semibold text-to-onAccent disabled:opacity-60"
        >
          {busy ? 'Beende…' : 'Beenden'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="flex h-[46px] items-center justify-center rounded-to-pill border border-to-line text-[15px] text-to-text2"
        >
          Abbrechen
        </button>
      </div>
    </div>,
    document.body
  );
}

function DeleteSheet({
  text,
  busy,
  error,
  onConfirm,
  onCancel
}: {
  text: string;
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
        <h2 className="to-display-sm text-to-text">Meldung löschen?</h2>
        <p className="rounded-to-lg border border-to-divider bg-to-surface2 p-3.5 text-[13px] leading-relaxed text-to-text2">{text}</p>
        <p className="text-[12px] leading-relaxed text-to-textDisabled">
          Die Meldung und die Info, wer sie gelesen hat, sind danach weg. Das lässt sich nicht zurückholen – zum Ausblenden reicht „Beenden".
        </p>
        {error && <p className="text-xs text-to-dangerText">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="flex h-12 items-center justify-center rounded-to-pill bg-to-danger text-[15px] font-semibold text-[#120507] disabled:opacity-60"
        >
          {busy ? 'Lösche…' : 'Endgültig löschen'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="flex h-[46px] items-center justify-center rounded-to-pill border border-to-line text-[15px] text-to-text2"
        >
          Abbrechen
        </button>
      </div>
    </div>,
    document.body
  );
}

function PublishedSheet({ kind, push, activeCount, onClose }: { kind: AnnouncementKind; push: boolean; activeCount: number; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="flex w-full max-w-lg flex-col gap-3.5 rounded-t-[24px] border border-to-line bg-to-surface p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
        <h2 className="to-display-sm text-to-text">Meldung ist online</h2>
        <span className={`to-data text-[10px] tracking-[0.1em] ${push ? 'text-to-accent' : 'text-to-text3'}`}>
          {push ? `PUSH AN ${activeCount} SPIELER GESENDET` : 'OHNE PUSH VERÖFFENTLICHT'}
        </span>
        <p className="text-[12px] leading-relaxed text-to-textDisabled">
          Sie steht ab jetzt bei allen ganz oben auf der Startseite. {ANNOUNCEMENT_KIND_EXPLANATION[kind]} Wer sie gelesen hat, siehst du hier in der
          Liste.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-12 items-center justify-center rounded-to-pill bg-to-accent text-[15px] font-semibold text-to-onAccent"
        >
          Fertig
        </button>
      </div>
    </div>,
    document.body
  );
}

export function AnnouncementsAdmin() {
  const { trainer, player } = useAuth();
  const authorName = trainer?.name ?? player?.name ?? 'Trainer';

  const [items, setItems] = useState<Announcement[] | null>(null);
  const [reads, setReads] = useState<AnnouncementReadRow[] | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [kind, setKind] = useState<AnnouncementKind>('hinweis');
  const [text, setText] = useState('');
  const [pushOn, setPushOn] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [publishedSheet, setPublishedSheet] = useState<{ kind: AnnouncementKind; push: boolean } | null>(null);
  const [endTarget, setEndTarget] = useState<Announcement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [endedOpen, setEndedOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [itemsRes, readsRes, playersRes] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('announcement_reads').select('*'),
      supabase.from('players').select('id').eq('is_active', true)
    ]);
    if (itemsRes.error || readsRes.error || playersRes.error) {
      setError('Fehler beim Laden der Meldungen.');
      return;
    }
    setItems((itemsRes.data as Announcement[]) ?? []);
    setReads((readsRes.data as AnnouncementReadRow[]) ?? []);
    setActiveCount((playersRes.data as { id: string }[]).length);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Meldungen.'));
  }, [load]);

  const showLoader = useTipoffLoader(!items || !reads || activeCount === null);

  if (error) return <ErrorNote message={error} />;
  if (showLoader) return <LoadingSpinner />;
  if (!items || !reads || activeCount === null) return null;

  const readCountFor = (id: string) => reads.filter((r) => r.announcement_id === id).length;
  const running = sortAnnouncements(items.filter((a) => isAnnouncementOpen(a, readCountFor(a.id), activeCount)));
  const ended = items
    .filter((a) => !isAnnouncementOpen(a, readCountFor(a.id), activeCount))
    .map((a) => ({ a, info: announcementEndInfo(a, reads.filter((r) => r.announcement_id === a.id), activeCount)! }))
    .sort((x, y) => y.info.at.localeCompare(x.info.at));

  function selectKind(k: AnnouncementKind) {
    setKind(k);
    if (k === 'dringend' || k === 'wichtig') setPushOn(true);
  }

  function startEdit(a: Announcement) {
    setEditingId(a.id);
    setKind(a.kind);
    setText(a.message);
    setPushOn(false);
    setActionError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setKind('hinweis');
    setText('');
    setPushOn(false);
  }

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    setActionError(null);
    const effectivePush = kind === 'dringend' ? true : pushOn;
    try {
      if (editingId) {
        const original = items!.find((a) => a.id === editingId)!;
        const { error: updateError } = await supabase
          .from('announcements')
          .update({ message: text.trim(), kind, expires_at: computeExpiresAt(kind, original.created_at) })
          .eq('id', editingId);
        if (updateError) throw updateError;
        cancelEdit();
        await load();
      } else {
        const nowIso = new Date().toISOString();
        const { error: insertError } = await supabase.from('announcements').insert({
          message: text.trim(),
          kind,
          author_name: authorName,
          expires_at: computeExpiresAt(kind, nowIso),
          push_requested: effectivePush
        });
        if (insertError) throw insertError;
        setText('');
        setPublishedSheet({ kind, push: effectivePush });
        await load();
      }
    } catch {
      setActionError('Meldung konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnd() {
    if (!endTarget) return;
    setSheetBusy(true);
    setActionError(null);
    try {
      const { error: updateError } = await supabase.from('announcements').update({ ended_at: new Date().toISOString() }).eq('id', endTarget.id);
      if (updateError) throw updateError;
      setEndTarget(null);
      await load();
    } catch {
      setActionError('Meldung konnte nicht beendet werden.');
    } finally {
      setSheetBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSheetBusy(true);
    setActionError(null);
    try {
      const { error: deleteError } = await supabase.from('announcements').delete().eq('id', deleteTarget.id);
      if (deleteError) throw deleteError;
      setDeleteTarget(null);
      await load();
    } catch {
      setActionError('Meldung konnte nicht gelöscht werden.');
    } finally {
      setSheetBusy(false);
    }
  }

  const effectivePushOn = kind === 'dringend' ? true : pushOn;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-3 rounded-to-xl border border-to-border bg-to-surface p-4">
        <span className="to-data text-[10px] tracking-[0.12em] text-to-text3">{editingId ? 'MELDUNG BEARBEITEN' : 'NEUE MELDUNG'}</span>

        <div className="flex gap-1 rounded-to-lg border border-to-divider bg-to-surface2 p-1">
          {KIND_ORDER.map((k) => {
            const on = kind === k;
            const activeClass = k === 'dringend' ? 'bg-to-danger text-[#120507]' : 'bg-to-accent text-to-onAccent';
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => selectKind(k)}
                className={`h-[38px] flex-1 rounded-to-sm text-[13px] transition ${on ? `font-semibold ${activeClass}` : 'font-medium text-to-text2'}`}
              >
                {ANNOUNCEMENT_KIND_LABELS[k]}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-to-textDisabled">{ANNOUNCEMENT_KIND_EXPLANATION[kind]}</p>

        <textarea
          rows={3}
          placeholder="z. B. Training am Freitag fällt aus – Halle belegt"
          className="min-h-[84px] resize-none rounded-to-md border border-to-line bg-to-bg p-3.5 text-sm text-to-text outline-none placeholder:text-to-textDisabled focus:border-to-borderMatchday"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <button
          type="button"
          disabled={kind === 'dringend'}
          onClick={() => setPushOn((v) => !v)}
          aria-pressed={effectivePushOn}
          className="flex min-h-[50px] items-center gap-3 rounded-to-md border border-to-divider bg-to-surface2 px-3.5 text-left disabled:cursor-default"
        >
          <span className="shrink-0 text-to-text3">
            <BellIcon />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] text-to-text2">Push an {activeCount} Spieler</span>
            <span className="to-data text-[9px] tracking-[0.1em] text-to-textDisabled">{pushSubLabel(kind, effectivePushOn)}</span>
          </span>
          <span
            className={`flex h-[26px] w-11 shrink-0 items-center rounded-to-pill border px-[3px] transition ${
              effectivePushOn ? 'border-to-accent bg-to-accent' : 'border-to-line bg-to-surface2'
            }`}
          >
            <span
              className={`h-[18px] w-[18px] rounded-full transition ${
                effectivePushOn ? 'translate-x-[18px] bg-to-onAccent' : 'translate-x-0 bg-to-textDisabled'
              }`}
            />
          </span>
        </button>

        {actionError && <p className="text-xs text-to-dangerText">{actionError}</p>}

        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={submit}
          className="flex h-12 items-center justify-center rounded-to-pill bg-to-accent text-[15px] font-semibold text-to-onAccent disabled:bg-to-surface2 disabled:text-to-textDisabled"
        >
          {busy ? 'Speichere…' : editingId ? 'Änderungen speichern' : 'Veröffentlichen'}
        </button>
        {editingId && (
          <button type="button" disabled={busy} onClick={cancelEdit} className="h-6 text-[13px] text-to-text3">
            Bearbeiten abbrechen
          </button>
        )}
      </div>

      {running.length > 0 ? (
        <>
          <div className="flex items-center gap-3">
            <span className="to-display-sm text-to-text">Läuft gerade</span>
            <span className="h-px flex-1 bg-to-divider" />
            <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">{running.length}</span>
          </div>

          <section className="overflow-hidden rounded-to-xl border border-to-border bg-to-surface">
            {running.map((a, i) => {
              const editing = editingId === a.id;
              const count = readCountFor(a.id);
              const pct = activeCount > 0 ? Math.round((count / activeCount) * 100) : 0;
              return (
                <div
                  key={a.id}
                  className={`flex gap-3 px-4 py-3.5 ${i === 0 ? '' : 'border-t border-to-surface2'} ${kindRowToneClass(a.kind)} ${
                    editing ? 'ring-1 ring-inset ring-to-borderMatchday' : ''
                  }`}
                >
                  <span className={`w-1 shrink-0 rounded-full ${kindBarClass(a.kind)}`} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`to-data text-[9px] tracking-[0.1em] ${kindLabelClass(a.kind)}`}>{ANNOUNCEMENT_KIND_LABELS[a.kind].toUpperCase()}</span>
                      <span className={`to-data ml-auto whitespace-nowrap text-[9px] tracking-[0.06em] ${editing ? 'text-to-accent' : 'text-to-textDisabled'}`}>
                        {editing ? 'WIRD OBEN BEARBEITET' : remainingTimeLabel(a)}
                      </span>
                    </div>
                    <p className={`text-sm font-medium leading-relaxed ${editing ? 'text-to-text3' : 'text-to-text'}`}>{a.message}</p>
                    <div className="flex items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-to-surface2">
                        <span className={`block h-1 rounded-full ${kindBarClass(a.kind)}`} style={{ width: `${pct}%` }} />
                      </span>
                      <span className="to-data whitespace-nowrap text-[9px] text-to-text3">
                        {count} VON {activeCount}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => startEdit(a)}
                        className="flex h-7 items-center rounded-to-pill border border-to-line px-3 text-[13px] font-semibold text-to-text2"
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        onClick={() => setEndTarget(a)}
                        className="flex h-7 items-center rounded-to-pill border border-to-line px-3 text-[13px] font-semibold text-to-text2"
                      >
                        Beenden
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(a)}
                        className="flex h-7 items-center rounded-to-pill border border-to-danger/30 px-3 text-[13px] font-semibold text-to-dangerText"
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      ) : (
        <div className="flex flex-col items-center gap-1.5 rounded-to-xl border border-dashed border-to-line bg-to-surface p-6 text-center">
          <span className="text-sm font-semibold text-to-text">Keine Meldung läuft</span>
          <span className="text-xs leading-relaxed text-to-textDisabled">
            Schreib eine Meldung, wenn alle etwas wissen müssen. Sie steht bei allen ganz oben auf der Startseite, bis sie gelesen ist oder abläuft.
          </span>
        </div>
      )}

      {ended.length > 0 && (
        <>
          <button type="button" onClick={() => setEndedOpen((v) => !v)} className="flex items-center gap-3">
            <span className="to-display-sm text-to-text">Beendet</span>
            <span className="h-px flex-1 bg-to-divider" />
            <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">{ended.length}</span>
            <ChevronDownIcon open={endedOpen} />
          </button>

          {endedOpen && (
            <section className="overflow-hidden rounded-to-xl border border-to-border bg-to-bg">
              {ended.map(({ a, info }, i) => {
                const count = readCountFor(a.id);
                const label = info.reason === 'ended' ? 'BEENDET AM' : 'ABGELAUFEN AM';
                return (
                  <div key={a.id} className={`flex gap-3 px-4 py-3 ${i === 0 ? '' : 'border-t border-to-surface2'}`}>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-[13px] leading-relaxed text-to-text3">{a.message}</p>
                      <span className="to-data text-[9px] tracking-[0.06em] text-to-textDisabled">
                        {label} {fmtDateShort(info.at.slice(0, 10))} · {count} VON {activeCount} GELESEN
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(a)}
                      className="flex h-7 shrink-0 items-center self-start rounded-to-pill border border-to-danger/30 px-3 text-[13px] font-semibold text-to-dangerText"
                    >
                      Löschen
                    </button>
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}

      {publishedSheet && (
        <PublishedSheet kind={publishedSheet.kind} push={publishedSheet.push} activeCount={activeCount} onClose={() => setPublishedSheet(null)} />
      )}
      {endTarget && <EndSheet announcement={endTarget} busy={sheetBusy} error={actionError} onConfirm={confirmEnd} onCancel={() => setEndTarget(null)} />}
      {deleteTarget && (
        <DeleteSheet text={deleteTarget.message} busy={sheetBusy} error={actionError} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
