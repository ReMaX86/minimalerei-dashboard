import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { useTipoffLoader } from '../../hooks/useTipoffLoader';
import { fmtDateShort } from '../../lib/format';
import type { Viewer } from '../../types/database';

// Element 21 "Admin · Betrachter" — baugleich zu Element 15 (Admin ·
// Spieler), nur ohne Rollen und ohne Profil: dieselbe Zeile, dasselbe
// Kopier-Verhalten, dieselbe Detailseite mit Code-Karte, derselbe Abschnitt
// "INAKTIV". Anlegen/Code-Erzeugung/Deaktivieren bleiben fachlich
// unverändert (create_viewer/regenerate_viewer_access_code/viewers.is_active
// wie zuvor) — neu ist nur viewer_access_codes.created_at (Migration 0070,
// spiegelt Migration 0068 auf der Spieler-Seite nach, die für Betrachter
// bisher fehlte).
//
// Die "SIEHT/SIEHT NICHT"-Liste unten wurde gegen den echten Code geprüft
// (siehe Antwort in der Chat-Rückmeldung) statt blind aus der Vorlage
// übernommen: Training läuft unconditional in Dashboard.tsx (TrainingCard),
// und der Kader-Status fürs nächste Spiel steckt in NextGameSquadCard.tsx
// auf der Spiele-Seite, die für role==='viewer' nicht gesperrt ist — beides
// SIEHT ein Betrachter heute tatsächlich, anders als die Vorlage annahm.

const SIEHT_ITEMS = ['Spielplan', 'Tabelle', 'Kampfgericht', 'Training', 'Kader'];
const SIEHT_NICHT_ITEMS = ['Trikots', 'Admin'];

type View = 'list' | 'detail';

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
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
function SmallCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-accent" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
function SmallCrossIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="shrink-0 text-to-textDisabled" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
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

function RightsCard({ lede, heading }: { lede?: string; heading?: string }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-to-xl border border-to-border bg-to-surface p-4">
      {heading && <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">{heading}</span>}
      {lede && <span className="text-[12px] leading-relaxed text-to-text3">{lede}</span>}
      <div className="flex gap-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="to-data text-[9px] tracking-[0.12em] text-to-accent">SIEHT</span>
          {SIEHT_ITEMS.map((item) => (
            <span key={item} className="flex items-center gap-1.5 text-[12px] text-to-text2">
              <SmallCheckIcon />
              {item}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="to-data text-[9px] tracking-[0.12em] text-to-textDisabled">SIEHT NICHT</span>
          {SIEHT_NICHT_ITEMS.map((item) => (
            <span key={item} className="flex items-center gap-1.5 text-[12px] text-to-textDisabled">
              <SmallCrossIcon />
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ViewersAdmin() {
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const [codes, setCodes] = useState<Record<string, { code: string; createdAt: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<{ name: string; code: string } | null>(null);
  const [createdCopied, setCreatedCopied] = useState(false);

  const [copiedListId, setCopiedListId] = useState<string | null>(null);
  const [copiedDetail, setCopiedDetail] = useState(false);

  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [{ data, error: loadError }, { data: codeRows, error: codesError }] = await Promise.all([
      supabase.from('viewers').select('*').order('is_active', { ascending: false }).order('name'),
      supabase.rpc('list_viewer_access_codes')
    ]);
    if (loadError || codesError) {
      setError('Fehler beim Laden der Betrachter-Liste.');
      return;
    }
    setViewers((data as Viewer[]) ?? []);
    setCodes(
      Object.fromEntries(
        ((codeRows as { viewer_id: string; access_code: string; created_at: string }[] | null) ?? []).map((r) => [
          r.viewer_id,
          { code: r.access_code, createdAt: r.created_at }
        ])
      )
    );
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Betrachter-Liste.'));
  }, [load]);

  const selected = useMemo(() => viewers?.find((v) => v.id === selectedId) ?? null, [viewers, selectedId]);

  const showLoader = useTipoffLoader(!viewers);

  if (error) return <ErrorNote message={error} />;
  if (showLoader) return <LoadingSpinner />;
  if (!viewers) return null;

  async function addViewer() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('create_viewer', { p_name: name.trim() });
      if (rpcError) throw rpcError;
      const row = (data as { viewer: Viewer; access_code: string }[])[0];
      setNewCode({ name: name.trim(), code: row.access_code });
      setCreatedCopied(false);
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
      const { error: rpcError } = await supabase.rpc('regenerate_viewer_access_code', { p_viewer_id: viewerId });
      if (rpcError) throw rpcError;
      setCopiedDetail(false);
      await load();
    } catch {
      setError(`Code für ${viewerName} konnte nicht neu generiert werden.`);
    }
  }

  async function toggleActive(v: Viewer) {
    setError(null);
    try {
      const { error: updError } = await supabase.from('viewers').update({ is_active: !v.is_active }).eq('id', v.id);
      if (updError) throw updError;
      await load();
    } catch {
      setError('Status konnte nicht geändert werden.');
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

  const activeViewers = viewers.filter((v) => v.is_active);
  const inactiveViewers = viewers.filter((v) => !v.is_active);

  return (
    <div className="flex flex-col gap-3.5">
      {view === 'list' && (
        <>
          <RightsCard lede="Betrachter schauen nur zu – z. B. ein Abteilungsleiter, der weder Spieler noch Trainer ist." />

          <div className="flex flex-col gap-2.5 rounded-to-xl border border-to-border bg-to-surface p-4">
            <span className="to-data text-[10px] tracking-[0.12em] text-to-text3">NEUEN BETRACHTER ANLEGEN</span>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addViewer();
              }}
              className="flex gap-2"
            >
              <input
                className="h-11 min-w-0 flex-1 rounded-to-md border border-to-line bg-to-bg px-3.5 text-sm text-to-text placeholder:text-to-textDisabled"
                placeholder="Name des Betrachters"
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

          <div className="flex items-center gap-3">
            <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">AKTIV · {activeViewers.length}</span>
            <span className="h-px flex-1 bg-to-divider" />
          </div>

          {activeViewers.length > 0 ? (
            <div className="flex flex-col overflow-hidden rounded-to-2xl border border-to-border bg-to-surface">
              {activeViewers.map((v) => {
                const codeInfo = codes[v.id];
                const done = copiedListId === v.id;
                return (
                  <div key={v.id} className="flex min-h-[60px] items-center gap-2.5 border-t border-to-surface2 px-3.5 py-2.5 first:border-t-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(v.id);
                        setView('detail');
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span className="to-data flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-to-surface2 text-[11px] text-to-text2">
                        {initialsOf(v.name)}
                      </span>
                      <span className="truncate text-sm font-semibold -tracking-[0.01em] text-to-text">{v.name}</span>
                    </button>
                    {codeInfo && (
                      <button
                        type="button"
                        onClick={() => copyCode(codeInfo.code, (on) => setCopiedListId(on ? v.id : null))}
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
                      aria-label={`${v.name} — Details`}
                      onClick={() => {
                        setSelectedId(v.id);
                        setView('detail');
                      }}
                    >
                      <ChevronRightIcon />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 rounded-to-xl border border-dashed border-to-line bg-to-surface p-6 text-center">
              <span className="text-sm font-semibold text-to-text">Noch kein Betrachter</span>
              <span className="text-xs leading-relaxed text-to-textDisabled">
                Leg jemanden an, der Spielplan und Kampfgericht mitlesen soll, ohne Spieler oder Trainer zu sein.
              </span>
            </div>
          )}

          {inactiveViewers.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">INAKTIV · {inactiveViewers.length}</span>
                <span className="h-px flex-1 bg-to-divider" />
              </div>
              <div className="flex flex-col overflow-hidden rounded-to-2xl border border-dashed border-to-line bg-to-bg opacity-[0.78]">
                {inactiveViewers.map((v) => (
                  <div key={v.id} className="flex min-h-[52px] items-center gap-2.5 border-t border-to-surface2 px-3.5 py-2 first:border-t-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(v.id);
                        setView('detail');
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span className="to-data flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-to-surface2 text-[11px] text-to-text3">
                        {initialsOf(v.name)}
                      </span>
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-[13px] font-medium text-to-text3">{v.name}</span>
                        <span className="to-data inline-flex h-[18px] w-fit items-center rounded-to-pill border border-to-line px-1.5 text-[8px] font-semibold tracking-[0.06em] text-to-textDisabled">
                          INAKTIV
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(v)}
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
                BETRACHTER · {selected.is_active ? 'AKTIV' : 'INAKTIV'}
              </span>
            </div>
            <span className="to-data flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-to-surface2 text-[13px] text-to-text2">
              {initialsOf(selected.name)}
            </span>
          </div>

          {!selected.is_active && (
            <div className="flex flex-col gap-1.5 rounded-to-xl border border-to-danger/30 bg-to-dangerSoft p-4">
              <span className="to-data text-[9px] tracking-[0.12em] text-to-dangerText">DEAKTIVIERT</span>
              <span className="text-[12px] leading-relaxed text-to-text2">
                Der Code funktioniert nicht mehr. Beim Aktivieren gilt derselbe Code wieder – oder du erzeugst einen neuen.
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

          <button
            type="button"
            onClick={() => toggleActive(selected)}
            aria-pressed={selected.is_active}
            className="flex min-h-[58px] items-center gap-3 rounded-to-lg border border-to-divider bg-to-surface px-3.5 text-left"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium text-to-text">Zugang aktiv</span>
              <span className="text-[11px] leading-snug text-to-textDisabled">
                Aus: der Code funktioniert nicht mehr, die Person bleibt in der Liste
              </span>
            </span>
            <span
              className={`flex h-[26px] w-11 shrink-0 items-center rounded-to-pill border px-[3px] transition ${
                selected.is_active ? 'border-to-accent bg-to-accent' : 'border-to-line bg-to-surface2'
              }`}
            >
              <span
                className={`h-[18px] w-[18px] rounded-full transition ${selected.is_active ? 'translate-x-[18px] bg-to-onAccent' : 'translate-x-0 bg-to-textDisabled'}`}
              />
            </span>
          </button>

          <RightsCard heading="WAS DIESE PERSON SIEHT" />
          <span className="-mt-2 text-[11px] leading-relaxed text-to-textDisabled">
            Feste Rechte – für Betrachter gibt es nichts einzustellen.
          </span>
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
              <h2 className="to-display-sm text-to-text">Betrachter angelegt</h2>
              <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">{newCode.name.toUpperCase()}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 rounded-to-lg border border-to-borderMatchday bg-to-surface2 px-4 py-5">
              <span className="to-data text-[9px] tracking-[0.12em] text-to-text3">ANMELDECODE</span>
              <span className="to-data text-[30px] font-bold tracking-[0.16em] text-to-accent">{newCode.code}</span>
            </div>
            <p className="text-center text-[12px] leading-relaxed text-to-textDisabled">
              Schick den Code an die Person – damit meldet sie sich das erste Mal an.
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
