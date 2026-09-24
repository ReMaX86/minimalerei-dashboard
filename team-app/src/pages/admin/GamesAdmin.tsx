import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useFeatureFlags } from '../../context/FeatureFlagsContext';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { useTipoffLoader } from '../../hooks/useTipoffLoader';
import { Switch } from '../../components/Switch';
import { DateField, TimeField } from '../../components/DateTimeField';
import { IconChevronRight, IconChevronDown } from '../../components/NavIcons';
import { dayOfMonth, fmtTime, monthShort, weekdayBadge, hasKickedOff } from '../../lib/format';
import { benoetigterSatz, gameResult, meetingPoints, type Game, type TrikotSetId } from '../../types/database';

// Element 17 "Admin · Spiele": vier gleich aussehende Knöpfe pro Spielkarte
// werden zu einer Zeile pro Spiel + einer eigenen Detailseite mit allen
// Aktionen. An der Logik (Anlegen/Bearbeiten/Tracking/Endstand/Löschen)
// ändert sich nichts — nur Darstellung und Navigation.
type View = 'list' | 'detail' | 'edit' | 'score';

const EMPTY_FORM = {
  game_date: '',
  game_time: '',
  opponent: '',
  is_home: true,
  trikot_override: '' as '' | TrikotSetId,
  location: '',
  meeting_time_hall: '',
  meeting_time_carpool: '',
  meeting_point_carpool: ''
};

const RESULT_LABEL = { sieg: 'SIEG', niederlage: 'NIEDERLAGE', unentschieden: 'UNENTSCHIEDEN' } as const;

// "Gespielt" = Anpfiff erreicht ODER schon finalisiert — dieselbe Definition
// wie an anderer Stelle in der App (siehe Dashboard.tsx "lastResult"), statt
// hier eine eigene, abweichende zu erfinden.
function isPlayed(g: Game): boolean {
  return !!g.stats_finalized_at || hasKickedOff(g.game_date, g.game_time);
}

// Reset-Sichtbarkeit unverändert aus dem bisherigen Code übernommen: nicht
// nur bei vorhandenem Endstand zeigen, sonst wäre der Knopf ausgerechnet
// dann unsichtbar, wenn schon durch die Viertel geklickt wurde, aber noch
// kein Punkt erfasst ist. Bewusst unabhängig von "gespielt vs. kommend",
// da Tracking laut PROMPT jederzeit gestartet werden kann.
function canResetStats(g: Game): boolean {
  return !!gameResult(g) || g.last_announced_quarter > 0 || !!g.stats_finalized_at;
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function SectionHead({ title, action, meta }: { title: string; action?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="to-display-sm text-to-text">{title}</span>
      <span className="h-px flex-1 bg-to-divider" />
      {meta}
      {action}
    </div>
  );
}

function Chip({ tone, children }: { tone: 'ok' | 'warn'; children: ReactNode }) {
  return (
    <span
      className={`to-data inline-flex h-[19px] items-center rounded-to-pill px-2 text-[8px] font-semibold tracking-[0.06em] ${
        tone === 'warn' ? 'border border-to-danger/30 bg-to-dangerSoft text-to-dangerText' : 'bg-to-surface2 text-to-text2'
      }`}
    >
      {children}
    </span>
  );
}

function HaBadge({ isHome }: { isHome: boolean }) {
  return (
    <span
      className={`to-data inline-flex h-[18px] shrink-0 items-center rounded-to-pill px-1.5 text-[8px] font-semibold tracking-[0.06em] ${
        isHome ? 'bg-to-surface2 text-to-text2' : 'border border-to-line bg-transparent text-to-text3'
      }`}
    >
      {isHome ? 'HEIM' : 'AUSWÄRTS'}
    </span>
  );
}

function DateBlock({ iso, accent }: { iso: string; accent?: boolean }) {
  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-px">
      <span className="to-data text-[9px] text-to-text3">{weekdayBadge(iso)}</span>
      <span className={`to-number text-[20px] leading-[1.05] ${accent ? 'text-to-accent' : 'text-to-text'}`}>{dayOfMonth(iso)}</span>
      <span className="to-data text-[8px] text-to-textDisabled">{monthShort(iso)}</span>
    </div>
  );
}

function kitLabel(g: Game): string {
  if (!g.trikot_override) return 'AUTOMATISCH';
  return g.trikot_override === 'weiss' ? 'WEISS' : 'SCHWARZ';
}

function meetChip(g: Game): { label: string; ok: boolean } {
  const primary = meetingPoints(g).find((m) => m.time);
  if (!primary?.time) return { label: 'TREFFPUNKT FEHLT', ok: false };
  return { label: `TREFFPUNKT ${fmtTime(primary.time)}`, ok: true };
}

function GameRow({ game, isNext, onOpen }: { game: Game; isNext: boolean; onOpen: () => void }) {
  const meet = meetChip(game);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-h-[74px] items-center gap-3 border-t border-to-surface2 px-4 py-3 text-left first:border-t-0 ${isNext ? 'bg-to-accent/[0.04]' : ''}`}
    >
      <DateBlock iso={game.game_date} accent={isNext} />
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <div className="flex min-w-0 items-center gap-[7px]">
          <span className="truncate text-sm font-semibold -tracking-[0.01em] text-to-text">{game.opponent}</span>
          <HaBadge isHome={game.is_home} />
        </div>
        <div className="flex flex-wrap gap-[5px]">
          <Chip tone={meet.ok ? 'ok' : 'warn'}>{meet.label}</Chip>
          <Chip tone="ok">TRIKOT {kitLabel(game)}</Chip>
        </div>
      </div>
      <IconChevronRight className="h-[15px] w-[15px] shrink-0 text-to-textDisabled" />
    </button>
  );
}

function PastGameRow({ game, onOpen }: { game: Game; onOpen: () => void }) {
  const result = gameResult(game);
  const tone = result === 'sieg' ? 'text-to-accent' : result === 'niederlage' ? 'text-to-dangerText' : 'text-to-text2';
  return (
    <button type="button" onClick={onOpen} className="flex min-h-[66px] items-center gap-3 border-t border-to-surface2 px-4 py-3 text-left first:border-t-0">
      <DateBlock iso={game.game_date} />
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <span className="truncate text-sm font-semibold -tracking-[0.01em] text-to-text2">{game.opponent}</span>
        <span className="to-data text-[9px] tracking-[0.08em] text-to-textDisabled">
          {game.stats_finalized_at ? 'STATS ABGESCHLOSSEN' : 'NICHT GETRACKT'}
        </span>
      </div>
      {result && (
        <div className="flex shrink-0 flex-col items-end gap-[3px]">
          <span className={`to-number text-[17px] leading-none ${tone}`}>
            {game.final_score_us}:{game.final_score_opponent}
          </span>
          <span className={`to-data text-[8px] tracking-[0.08em] ${tone}`}>{RESULT_LABEL[result]}</span>
        </div>
      )}
      <IconChevronRight className="h-[15px] w-[15px] shrink-0 text-to-textDisabled" />
    </button>
  );
}

function StatusList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col overflow-hidden rounded-to-lg border border-to-divider bg-to-surface">{children}</div>;
}

function StatusRow({ label, value, kind }: { label: string; value: ReactNode; kind?: 'ok' | 'warn' }) {
  return (
    <div className="flex min-h-[48px] items-center gap-3 border-t border-to-surface2 px-3.5 py-2 first:border-t-0">
      <span
        className={`h-[7px] w-[7px] shrink-0 rounded-full ${kind === 'ok' ? 'bg-to-accent' : kind === 'warn' ? 'bg-to-danger' : 'bg-to-textDisabled'}`}
      />
      <span className="flex-1 text-[13px] text-to-text2">{label}</span>
      <span
        className={`text-[13px] font-semibold ${kind === 'ok' ? 'text-to-accent' : kind === 'warn' ? 'text-to-dangerText' : 'text-to-text'}`}
      >
        {value}
      </span>
    </div>
  );
}

function ActionRowInner({ label, sub }: { label: string; sub: string }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-to-text">{label}</span>
        <span className="text-[11px] text-to-textDisabled">{sub}</span>
      </span>
      <IconChevronRight className="h-[15px] w-[15px] shrink-0 text-to-textDisabled" />
    </>
  );
}

function ActionsList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col overflow-hidden rounded-to-lg border border-to-divider bg-to-surface">{children}</div>;
}

function ActionButton({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[54px] items-center gap-3 border-t border-to-surface2 px-3.5 py-2 text-left first:border-t-0"
    >
      <ActionRowInner label={label} sub={sub} />
    </button>
  );
}

function ActionLink({ label, sub, to }: { label: string; sub: string; to: string }) {
  return (
    <Link to={to} className="flex min-h-[54px] items-center gap-3 border-t border-to-surface2 px-3.5 py-2 first:border-t-0">
      <ActionRowInner label={label} sub={sub} />
    </Link>
  );
}

function DangerBox({ children }: { children: ReactNode }) {
  return <div className="flex flex-col overflow-hidden rounded-to-lg border border-to-danger/30 bg-to-danger/5">{children}</div>;
}

function DangerButton({ label, sub, onClick }: { label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[54px] items-center gap-3 border-t border-to-danger/20 px-3.5 py-2 text-left first:border-t-0"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-to-dangerText">{label}</span>
        {sub && <span className="text-[11px] text-to-textDisabled">{sub}</span>}
      </span>
      <IconChevronRight className="h-[15px] w-[15px] shrink-0 text-to-dangerText/70" />
    </button>
  );
}

function HomeAwaySegment({ isHome, onChange }: { isHome: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-1 rounded-to-lg border border-to-divider bg-to-surface2 p-1">
      {(['home', 'away'] as const).map((v) => {
        const on = v === 'home' ? isHome : !isHome;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(v === 'home')}
            className={`h-[38px] flex-1 rounded-to-sm text-sm transition ${on ? 'bg-to-accent font-semibold text-to-onAccent' : 'font-medium text-to-text2'}`}
          >
            {v === 'home' ? 'Heimspiel' : 'Auswärts'}
          </button>
        );
      })}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-to-text3">{label}</span>
      {children}
    </label>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <span className="to-data text-[9px] tracking-[0.12em] text-to-textDisabled">{children}</span>;
}

function ResetConfirmSheet({
  game,
  busy,
  onConfirm,
  onCancel
}: {
  game: Game;
  busy: boolean;
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
        <div className="flex flex-col gap-1">
          <h2 className="to-display-sm text-to-dangerText">Tracking zurücksetzen?</h2>
          <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">
            {weekdayBadge(game.game_date)} {dayOfMonth(game.game_date)}.{monthShort(game.game_date)} · {game.opponent.toUpperCase()} ·{' '}
            {game.is_home ? 'HEIM' : 'AUSWÄRTS'}
          </span>
        </div>
        <div className="flex flex-col gap-2 rounded-to-lg border border-to-danger/30 bg-to-danger/[0.06] px-4 py-3.5">
          <p className="flex gap-2.5 text-[13px] leading-[1.45] text-to-text2">
            <span>–</span>
            <span>
              Alle <b className="font-semibold text-to-text">Spielerstatistiken</b> dieses Spiels werden gelöscht.
            </span>
          </p>
          <p className="flex gap-2.5 text-[13px] leading-[1.45] text-to-text2">
            <span>–</span>
            <span>
              Die Werte verschwinden aus der <b className="font-semibold text-to-text">Bestenliste</b> und den Profilen.
            </span>
          </p>
          <p className="flex gap-2.5 text-[13px] leading-[1.45] text-to-text2">
            <span>–</span>
            <span>
              Der <b className="font-semibold text-to-text">Endstand {game.final_score_us}:{game.final_score_opponent}</b> bleibt erhalten.
            </span>
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="flex h-12 items-center justify-center rounded-to-pill bg-to-danger text-[15px] font-semibold text-[#120507] disabled:opacity-60"
        >
          {busy ? 'Wird zurückgesetzt…' : 'Ja, Tracking zurücksetzen'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="h-[26px] text-[13px] text-to-text3">
          Abbrechen
        </button>
      </div>
    </div>,
    document.body
  );
}

export function GamesAdmin() {
  const { flags } = useFeatureFlags();
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNewGame, setIsNewGame] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [resetSheetOpen, setResetSheetOpen] = useState(false);
  const [resettingStats, setResettingStats] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [scoreForm, setScoreForm] = useState({ us: '', opponent: '' });
  const [savingScore, setSavingScore] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase.from('games').select('*').order('game_date').order('game_time');
    if (loadError) {
      setError('Fehler beim Laden der Spiele.');
      return;
    }
    setGames((data as Game[]) ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Spiele.'));
  }, [load]);

  const selected = useMemo(() => games?.find((g) => g.id === selectedId) ?? null, [games, selectedId]);
  const upcoming = useMemo(() => (games ?? []).filter((g) => !isPlayed(g)), [games]);
  const played = useMemo(
    () => (games ?? []).filter(isPlayed).sort((a, b) => (b.game_date + b.game_time).localeCompare(a.game_date + a.game_time)),
    [games]
  );

  function openDetail(g: Game) {
    setActionError(null);
    setSelectedId(g.id);
    setView('detail');
  }

  function openEdit(g: Game | null) {
    setActionError(null);
    setIsNewGame(!g);
    setSelectedId(g?.id ?? null);
    setForm(
      g
        ? {
            game_date: g.game_date,
            game_time: g.game_time.slice(0, 5),
            opponent: g.opponent,
            is_home: g.is_home,
            trikot_override: g.trikot_override ?? '',
            location: g.location,
            meeting_time_hall: g.meeting_time_hall?.slice(0, 5) ?? '',
            meeting_time_carpool: g.meeting_time_carpool?.slice(0, 5) ?? '',
            meeting_point_carpool: g.meeting_point_carpool ?? ''
          }
        : EMPTY_FORM
    );
    setView('edit');
  }

  function openScore(g: Game) {
    setActionError(null);
    setScoreForm({ us: '', opponent: '' });
    setSelectedId(g.id);
    setView('score');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setActionError(null);
    const payload = {
      game_date: form.game_date,
      game_time: form.game_time,
      opponent: form.opponent.trim(),
      is_home: form.is_home,
      trikot_override: form.trikot_override || null,
      location: form.location.trim(),
      meeting_time_hall: form.meeting_time_hall || null,
      meeting_time_carpool: form.is_home ? null : form.meeting_time_carpool || null,
      meeting_point_carpool: form.is_home ? null : form.meeting_point_carpool.trim() || null
    };
    try {
      const { error: saveError } = isNewGame
        ? await supabase.from('games').insert(payload)
        : await supabase.from('games').update(payload).eq('id', selectedId);
      if (saveError) throw saveError;
      await load();
      if (isNewGame) {
        setView('list');
        setSelectedId(null);
      } else {
        setView('detail');
      }
      setIsNewGame(false);
    } catch {
      setActionError('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setActionError(null);
    try {
      const { error: delError } = await supabase.from('games').delete().eq('id', id);
      if (delError) throw delError;
      if (selectedId === id) {
        setView('list');
        setSelectedId(null);
      }
      await load();
    } catch {
      setActionError('Löschen fehlgeschlagen.');
    }
  }

  async function saveScore() {
    if (!selected) return;
    const us = Number(scoreForm.us);
    const opponent = Number(scoreForm.opponent);
    if (!Number.isInteger(us) || us < 0 || !Number.isInteger(opponent) || opponent < 0) {
      setActionError('Bitte für beide Teams eine gültige Punktzahl (0 oder mehr) eingeben.');
      return;
    }
    setSavingScore(true);
    setActionError(null);
    try {
      const { error: saveError } = await supabase
        .from('games')
        .update({ final_score_us: us, final_score_opponent: opponent, stats_finalized_at: new Date().toISOString() })
        .eq('id', selected.id);
      if (saveError) throw saveError;
      await load();
      setView('detail');
    } catch {
      setActionError('Endstand konnte nicht gespeichert werden.');
    } finally {
      setSavingScore(false);
    }
  }

  async function confirmResetStats() {
    if (!selected) return;
    setResettingStats(true);
    setActionError(null);
    try {
      const { error: resetError } = await supabase.rpc('reset_game_stats', { p_game_id: selected.id });
      if (resetError) throw resetError;
      await load();
      setResetSheetOpen(false);
    } catch {
      setActionError('Tracking konnte nicht zurückgesetzt werden.');
    } finally {
      setResettingStats(false);
    }
  }

  const showLoader = useTipoffLoader(!games);

  if (error) return <ErrorNote message={error} />;
  if (showLoader) return <LoadingSpinner />;
  if (!games) return null;

  // ============ DETAILSEITE ============
  if (view === 'detail' && selected) {
    const played_ = isPlayed(selected);
    const result = gameResult(selected);
    const meet = meetChip(selected);
    return (
      <div className="flex flex-col gap-3.5">
        {actionError && <ErrorNote message={actionError} />}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setView('list');
              setSelectedId(null);
            }}
            aria-label="Zurück"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md border border-to-border bg-to-surface text-to-text2"
          >
            <BackIcon />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="to-display-sm truncate text-to-text">{selected.opponent}</span>
            <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">
              {weekdayBadge(selected.game_date)} {dayOfMonth(selected.game_date)}.{monthShort(selected.game_date)} ·{' '}
              {fmtTime(selected.game_time)} · {selected.is_home ? 'HEIM' : 'AUSWÄRTS'}
            </span>
          </div>
        </div>

        <StatusList>
          {played_ ? (
            <>
              <StatusRow label="Endstand" value={result ? `${selected.final_score_us}:${selected.final_score_opponent}` : 'noch offen'} kind={result ? 'ok' : undefined} />
              {flags.stats && (
                <StatusRow label="Tracking" value={selected.stats_finalized_at ? 'abgeschlossen' : 'nicht getrackt'} kind={selected.stats_finalized_at ? 'ok' : undefined} />
              )}
              <StatusRow
                label="Trikot"
                value={
                  selected.trikot_override
                    ? selected.trikot_override === 'weiss'
                      ? 'Weiß'
                      : 'Schwarz'
                    : `Automatisch · ${benoetigterSatz(selected) === 'weiss' ? 'weiß' : 'schwarz'}`
                }
              />
            </>
          ) : (
            <>
              <StatusRow label="Treffpunkt" value={meet.ok ? `${meet.label.replace('TREFFPUNKT ', '')} Uhr` : 'fehlt'} kind={meet.ok ? 'ok' : 'warn'} />
              <StatusRow label="Trikot" value={selected.trikot_override ? (selected.trikot_override === 'weiss' ? 'Weiß' : 'Schwarz') : 'Automatisch'} />
              {flags.stats && (
                <StatusRow label="Endstand" value={result ? `${selected.final_score_us}:${selected.final_score_opponent}` : 'noch offen'} kind={result ? 'ok' : undefined} />
              )}
            </>
          )}
        </StatusList>

        <ActionsList>
          <ActionButton label="Spiel bearbeiten" sub="Datum, Uhrzeit, Gegner, Ort, Trikot, Treffpunkt" onClick={() => openEdit(selected)} />
          {flags.stats && (
            <ActionLink
              label={selected.stats_finalized_at ? 'Stats ansehen' : 'Stats tracken'}
              sub={selected.stats_finalized_at ? 'Boxscore dieses Spiels' : 'Live-Erfassung jetzt starten'}
              to={`/stats/${selected.id}`}
            />
          )}
          {flags.stats && !result && <ActionButton label="Endstand nachtragen" sub="Ohne Tracking gespielt? Ergebnis eintragen" onClick={() => openScore(selected)} />}
        </ActionsList>

        <span className="to-data text-[9px] tracking-[0.12em] text-to-textDisabled">NICHT RÜCKGÄNGIG ZU MACHEN</span>
        <DangerBox>
          {flags.stats && canResetStats(selected) && (
            <DangerButton label="Tracking zurücksetzen" sub="Löscht alle Statistiken dieses Spiels" onClick={() => setResetSheetOpen(true)} />
          )}
          <DangerButton label="Spiel löschen" onClick={() => remove(selected.id)} />
        </DangerBox>

        {resetSheetOpen && (
          <ResetConfirmSheet game={selected} busy={resettingStats} onConfirm={confirmResetStats} onCancel={() => setResetSheetOpen(false)} />
        )}
      </div>
    );
  }

  // ============ FORMULAR (Bearbeiten / Neu) ============
  if (view === 'edit') {
    return (
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        {actionError && <ErrorNote message={actionError} />}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView(isNewGame ? 'list' : 'detail')}
            aria-label="Zurück"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md border border-to-border bg-to-surface text-to-text2"
          >
            <BackIcon />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="to-display-sm text-to-text">{isNewGame ? 'Neues Spiel' : 'Spiel bearbeiten'}</span>
            <span className="to-data truncate text-[10px] tracking-[0.1em] text-to-text3">
              {isNewGame ? 'NOCH NICHT GESPEICHERT' : selected?.opponent.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <GroupLabel>SPIEL</GroupLabel>
          <div className="grid grid-cols-2 gap-2.5">
            <DateField
              label="Datum"
              required
              value={form.game_date}
              onChange={(v) => setForm((f) => ({ ...f, game_date: v }))}
              placeholder={isNewGame ? 'TT.MM.JJJJ' : undefined}
            />
            <TimeField
              label="Uhrzeit"
              required
              value={form.game_time}
              onChange={(v) => setForm((f) => ({ ...f, game_time: v }))}
              placeholder={isNewGame ? '20:00' : undefined}
            />
          </div>
          <FormField label="Gegner">
            <input
              required
              placeholder="Gegner"
              className="input"
              value={form.opponent}
              onChange={(e) => setForm((f) => ({ ...f, opponent: e.target.value }))}
            />
          </FormField>
          <FormField label="Ort">
            <input
              required
              placeholder="Adresse der Halle"
              className="input"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </FormField>
        </div>

        <div className="flex flex-col gap-2.5">
          <GroupLabel>HEIM ODER AUSWÄRTS</GroupLabel>
          <HomeAwaySegment isHome={form.is_home} onChange={(is_home) => setForm((f) => ({ ...f, is_home }))} />
        </div>

        <div className="flex flex-col gap-2.5">
          <GroupLabel>TRIKOTSATZ</GroupLabel>
          <select
            className="input"
            value={form.trikot_override}
            onChange={(e) => setForm((f) => ({ ...f, trikot_override: e.target.value as '' | TrikotSetId }))}
          >
            <option value="">Trikot automatisch</option>
            <option value="weiss">Trikot: Weiß erzwingen</option>
            <option value="schwarz">Trikot: Schwarz erzwingen</option>
          </select>
        </div>

        <div className="flex flex-col gap-2.5">
          <GroupLabel>TREFFPUNKT</GroupLabel>
          {form.is_home ? (
            <TimeField
              label="Halle — Zeit"
              value={form.meeting_time_hall}
              onChange={(v) => setForm((f) => ({ ...f, meeting_time_hall: v }))}
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <TimeField
                  label="Fahrgemeinschaft — Zeit"
                  value={form.meeting_time_carpool}
                  onChange={(v) => setForm((f) => ({ ...f, meeting_time_carpool: v }))}
                />
                <TimeField
                  label="Direkt an der Halle"
                  value={form.meeting_time_hall}
                  onChange={(v) => setForm((f) => ({ ...f, meeting_time_hall: v }))}
                />
              </div>
              <FormField label="Fahrgemeinschaft — Ort">
                <input
                  type="text"
                  placeholder="z. B. Parkplatz Schulzentrum"
                  className="input"
                  value={form.meeting_point_carpool}
                  onChange={(e) => setForm((f) => ({ ...f, meeting_point_carpool: e.target.value }))}
                />
              </FormField>
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-to-textDisabled">
            Bei Auswärtsspielen zeigt die App beide Zeiten an; bei Heimspielen nur die Halle.
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={busy} className="flex h-12 flex-1 items-center justify-center rounded-to-pill bg-to-accent text-[15px] font-semibold text-to-onAccent disabled:opacity-60">
            Speichern
          </button>
          <button
            type="button"
            onClick={() => setView(isNewGame ? 'list' : 'detail')}
            className="flex h-12 shrink-0 items-center justify-center rounded-to-pill border border-to-line px-6 text-[15px] text-to-text2"
          >
            Abbrechen
          </button>
        </div>
      </form>
    );
  }

  // ============ ENDSTAND NACHTRAGEN ============
  if (view === 'score' && selected) {
    return (
      <div className="flex flex-col gap-3.5">
        {actionError && <ErrorNote message={actionError} />}
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
            <span className="to-display-sm text-to-text">Endstand</span>
            <span className="to-data truncate text-[10px] tracking-[0.1em] text-to-text3">
              {weekdayBadge(selected.game_date)} {dayOfMonth(selected.game_date)}.{monthShort(selected.game_date)} · {selected.opponent.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex flex-1 flex-col items-center gap-1.5">
            <span className="to-data text-center text-[9px] tracking-[0.1em] text-to-text3">TB WÜLFRATH</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="to-number h-16 w-full rounded-to-lg border border-to-line bg-to-surface text-center text-[28px] text-to-text outline-none focus:border-to-borderMatchday"
              value={scoreForm.us}
              onChange={(e) => setScoreForm((f) => ({ ...f, us: e.target.value }))}
            />
          </div>
          <span className="to-number pt-[18px] text-[22px] text-to-textDisabled">:</span>
          <div className="flex flex-1 flex-col items-center gap-1.5">
            <span className="to-data w-full truncate text-center text-[9px] tracking-[0.1em] text-to-text3">{selected.opponent.toUpperCase()}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="to-number h-16 w-full rounded-to-lg border border-to-line bg-to-surface text-center text-[28px] text-to-text outline-none focus:border-to-borderMatchday"
              value={scoreForm.opponent}
              onChange={(e) => setScoreForm((f) => ({ ...f, opponent: e.target.value }))}
            />
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-to-textDisabled">
          Wurde das Spiel getrackt, steht der Endstand schon; ein hier eingetragener Wert überschreibt ihn und die Spielerstatistiken
          bleiben unberührt.
        </p>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={savingScore}
            onClick={saveScore}
            className="flex h-12 flex-1 items-center justify-center rounded-to-pill bg-to-accent text-[15px] font-semibold text-to-onAccent disabled:opacity-60"
          >
            Speichern
          </button>
          <button
            type="button"
            onClick={() => setView('detail')}
            className="flex h-12 shrink-0 items-center justify-center rounded-to-pill border border-to-line px-6 text-[15px] text-to-text2"
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  // ============ SPIELPLAN ============
  return (
    <div className="flex flex-col gap-3.5">
      {actionError && <ErrorNote message={actionError} />}

      <SectionHead
        title="Kommende Spiele"
        action={
          <button
            type="button"
            onClick={() => openEdit(null)}
            className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-to-pill bg-to-accent px-3.5 text-[13px] font-semibold text-to-onAccent"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Neu
          </button>
        }
      />

      <div className="rounded-to-xl border border-to-border bg-to-surface">
        {upcoming.length === 0 && <p className="px-4 py-4 text-sm text-to-text3">Keine kommenden Spiele.</p>}
        {upcoming.map((g, i) => (
          <GameRow key={g.id} game={g} isNext={i === 0} onOpen={() => openDetail(g)} />
        ))}
      </div>

      <button type="button" onClick={() => setPastOpen((v) => !v)} aria-expanded={pastOpen} className="flex items-center gap-3">
        <span className="to-display-sm text-to-text">Gespielt</span>
        <span className="h-px flex-1 bg-to-divider" />
        <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">{played.length}</span>
        <IconChevronDown className={`h-[17px] w-[17px] shrink-0 text-to-text3 transition-transform ${pastOpen ? 'rotate-180' : ''}`} />
      </button>

      {pastOpen && (
        <div className="rounded-to-xl border border-to-divider bg-to-surface">
          {played.length === 0 && <p className="px-4 py-4 text-sm text-to-text3">Noch keine gespielten Spiele.</p>}
          {played.map((g) => (
            <PastGameRow key={g.id} game={g} onOpen={() => openDetail(g)} />
          ))}
        </div>
      )}
    </div>
  );
}
