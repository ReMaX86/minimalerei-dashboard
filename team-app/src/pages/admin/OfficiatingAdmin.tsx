import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { useTipoffLoader } from '../../hooks/useTipoffLoader';
import { DateField, TimeField } from '../../components/DateTimeField';
import { IconChevronRight, IconChevronDown } from '../../components/NavIcons';
import { dayOfMonth, fmtDate, fmtDateShort, fmtTime, isFuture, monthShort, weekdayBadge } from '../../lib/format';
import {
  type OfficiatingGame,
  type OfficiatingTask,
  type OfficiatingTaskType,
  type OfficiatingTeam,
  type Player
} from '../../types/database';

// Element 18 "Admin · Kampfgericht": aus zwei aufgeklappten Blöcken oben wird
// eine Meldungs-/Zuteil-Ansicht + eigene Einstellungen-Unterseite, aus der
// Flachliste eine Zeile pro Termin mit Detailseite. Neu (§6): Termin
// bearbeiten. An der Zuteilungs-/Meldefrist-Logik selbst ändert sich nichts.
type View = 'main' | 'detail' | 'settings' | 'edit';

const TASK_TYPES: OfficiatingTaskType[] = ['uhr', 'anschreiber', 'zeit'];

// Kurzform nur für diese kompakten Zeilen (Zuteil-Liste, Rollenzeilen,
// Bearbeiten-Formular) — gleiches Muster wie TASK_LABEL_SHORT in
// Kampfgericht.tsx / ROLE_LABEL in OfficiatingDutyCard.tsx.
// OFFICIATING_TASK_LABELS selbst bleibt an anderen Stellen unverändert.
const TASK_LABEL_SHORT: Record<OfficiatingTaskType, string> = {
  uhr: '24-Sek.-Uhr',
  anschreiber: 'Anschreiben',
  zeit: 'Zeit & Punkte'
};

const EMPTY_EDIT_FORM = { game_date: '', game_time: '', opponent_teams: '', opponent: '', location: '' };
const EMPTY_TASK_SELECTION: Record<OfficiatingTaskType, boolean> = { uhr: false, anschreiber: false, zeit: false };

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 7h14M10 7V5h4v2M8 7l1 13h6l1-13" />
    </svg>
  );
}

function StopwatchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4.5h2M12 4.5v3" />
      <circle cx="12" cy="14" r="7.5" />
      <path d="M12 14v-3.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
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

function DateBlock({ iso, accent }: { iso: string; accent?: boolean }) {
  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-px">
      <span className="to-data text-[9px] text-to-text3">{weekdayBadge(iso)}</span>
      <span className={`to-number text-[19px] leading-[1.05] ${accent ? 'text-to-accent' : 'text-to-text'}`}>{dayOfMonth(iso)}</span>
      <span className="to-data text-[8px] text-to-textDisabled">{monthShort(iso)}</span>
    </div>
  );
}

function StatusPill({ openCount, past }: { openCount: number; past?: boolean }) {
  if (past) {
    return <span className="to-data inline-flex h-6 items-center rounded-to-pill bg-to-surface2 px-2.5 text-[9px] font-semibold text-to-text3">KOMPLETT</span>;
  }
  const ok = openCount === 0;
  return (
    <span
      className={`to-data inline-flex h-6 items-center gap-1.5 rounded-to-pill px-2.5 text-[9px] font-semibold before:h-1.5 before:w-1.5 before:rounded-full before:bg-current ${
        ok ? 'bg-to-accentSoft text-to-accent' : 'bg-to-dangerSoft text-to-dangerText'
      }`}
    >
      {ok ? 'KOMPLETT' : openCount === 1 ? '1 OFFEN' : `${openCount} OFFEN`}
    </span>
  );
}

function infoLine(g: OfficiatingGame): string {
  const time = g.game_time ? fmtTime(g.game_time) : '';
  const rest = g.opponent ? `GEGEN ${g.opponent.toUpperCase()}` : g.location;
  return [time, rest].filter(Boolean).join(' · ');
}

export function OfficiatingAdmin() {
  const [games, setGames] = useState<OfficiatingGame[] | null>(null);
  const [tasksByGame, setTasksByGame] = useState<Record<string, OfficiatingTask[]>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<OfficiatingTeam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [view, setView] = useState<View>('main');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isNewGame, setIsNewGame] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [assignSheet, setAssignSheet] = useState<{ gameId: string; taskType: OfficiatingTaskType } | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);

  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editChecks, setEditChecks] = useState(EMPTY_TASK_SELECTION);
  const [editBusy, setEditBusy] = useState(false);

  const [newTeamName, setNewTeamName] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);
  const [signupDeadline, setSignupDeadline] = useState('');
  const [savingDeadline, setSavingDeadline] = useState(false);

  useEffect(() => {
    supabase
      .from('reminder_settings')
      .select('officiating_signup_deadline')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setSignupDeadline(
          (data as { officiating_signup_deadline: string | null } | null)?.officiating_signup_deadline ?? ''
        );
      });
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const [gamesRes, tasksRes, playersRes, teamsRes] = await Promise.all([
      supabase.from('officiating_games').select('*').order('game_date'),
      supabase.from('officiating_tasks').select('*'),
      supabase.from('players').select('*').eq('is_active', true).order('name'),
      supabase.from('officiating_teams').select('*').order('name')
    ]);
    if (gamesRes.error || tasksRes.error || playersRes.error || teamsRes.error) {
      setError('Fehler beim Laden der Kampfgericht-Termine.');
      return;
    }
    const grouped: Record<string, OfficiatingTask[]> = {};
    (tasksRes.data as OfficiatingTask[]).forEach((t) => {
      (grouped[t.officiating_game_id] ??= []).push(t);
    });
    setGames((gamesRes.data as OfficiatingGame[]) ?? []);
    setTasksByGame(grouped);
    setPlayers((playersRes.data as Player[]) ?? []);
    setTeams((teamsRes.data as OfficiatingTeam[]) ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Kampfgericht-Termine.'));
  }, [load]);

  const playersById = useMemo(() => {
    const map: Record<string, Player> = {};
    players.forEach((p) => (map[p.id] = p));
    return map;
  }, [players]);

  // Dieselbe Zahl wie "Einsätze pro Spieler" im Kampfgericht-Reiter
  // (Element 14): alle bisher zugeteilten Aufgaben, keine Saison-Filterung.
  const taskCountByPlayer = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(tasksByGame)
      .flat()
      .forEach((t) => {
        if (t.assigned_player_id) counts[t.assigned_player_id] = (counts[t.assigned_player_id] ?? 0) + 1;
      });
    return counts;
  }, [tasksByGame]);

  const sortedPlayersByCount = useMemo(
    () =>
      [...players].sort(
        (a, b) => (taskCountByPlayer[a.id] ?? 0) - (taskCountByPlayer[b.id] ?? 0) || a.name.localeCompare(b.name, 'de')
      ),
    [players, taskCountByPlayer]
  );

  const selectedGame = useMemo(() => games?.find((g) => g.id === selectedGameId) ?? null, [games, selectedGameId]);

  const today = new Date().toISOString().slice(0, 10);
  const deadlinePassed = signupDeadline !== '' && today > signupDeadline;

  function openCountOf(gameId: string): number {
    return (tasksByGame[gameId] ?? []).filter((t) => !t.assigned_player_id).length;
  }
  // Dieselbe Aufteilung wie in Kampfgericht.tsx (Element 14): reines
  // Datumskriterium, unabhängig davon, ob/wie viele Aufgaben zugeteilt
  // sind. Nur kommende Termine zählen für den Meldungsblock/die Zuteil-
  // Liste — ein vergangener Termin gilt unabhängig davon als erledigt.
  const upcoming = (games ?? []).filter((g) => isFuture(g.game_date));
  const past = (games ?? []).filter((g) => !isFuture(g.game_date)).reverse();
  const totalOpen = upcoming.reduce((sum, g) => sum + openCountOf(g.id), 0);

  function openDetail(g: OfficiatingGame) {
    setActionError(null);
    setSelectedGameId(g.id);
    setView('detail');
  }

  function openEdit(g: OfficiatingGame | null) {
    setActionError(null);
    setIsNewGame(!g);
    setSelectedGameId(g?.id ?? null);
    if (g) {
      setEditForm({
        game_date: g.game_date,
        game_time: g.game_time?.slice(0, 5) ?? '',
        opponent_teams: g.opponent_teams,
        opponent: g.opponent ?? '',
        location: g.location
      });
      const existing = new Set((tasksByGame[g.id] ?? []).map((t) => t.task_type));
      setEditChecks({ uhr: existing.has('uhr'), anschreiber: existing.has('anschreiber'), zeit: existing.has('zeit') });
    } else {
      setEditForm(EMPTY_EDIT_FORM);
      setEditChecks(EMPTY_TASK_SELECTION);
    }
    setView('edit');
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    const selectedTypes = TASK_TYPES.filter((t) => editChecks[t]);
    if (selectedTypes.length === 0) {
      setActionError('Bitte mindestens eine Aufgabe auswählen, die wir stellen müssen.');
      return;
    }

    if (!isNewGame && selectedGameId) {
      const affected = (tasksByGame[selectedGameId] ?? []).filter((t) => !editChecks[t.task_type] && t.assigned_player_id);
      if (affected.length > 0) {
        const names = affected.map((t) => `${playersById[t.assigned_player_id!]?.name ?? '?'} (${TASK_LABEL_SHORT[t.task_type]})`).join(', ');
        const ok = window.confirm(
          `${names} ${affected.length === 1 ? 'ist' : 'sind'} noch eingeteilt. Beim Abwählen verschwindet die Zuteilung samt Änderungsverlauf unwiderruflich. Trotzdem fortfahren?`
        );
        if (!ok) return;
      }
    }

    setEditBusy(true);
    setActionError(null);
    try {
      if (isNewGame) {
        const { data: inserted, error: insertError } = await supabase
          .from('officiating_games')
          .insert({
            game_date: editForm.game_date,
            game_time: editForm.game_time || null,
            opponent_teams: editForm.opponent_teams,
            opponent: editForm.opponent.trim() || null,
            location: editForm.location.trim()
          })
          .select()
          .single();
        if (insertError) throw insertError;
        const { error: tasksError } = await supabase
          .from('officiating_tasks')
          .insert(selectedTypes.map((task_type) => ({ officiating_game_id: inserted.id, task_type })));
        if (tasksError) throw tasksError;
        await load();
        setView('main');
      } else {
        const { error: updateError } = await supabase
          .from('officiating_games')
          .update({
            game_date: editForm.game_date,
            game_time: editForm.game_time || null,
            opponent_teams: editForm.opponent_teams,
            opponent: editForm.opponent.trim() || null,
            location: editForm.location.trim()
          })
          .eq('id', selectedGameId);
        if (updateError) throw updateError;

        const existingTypes = new Set((tasksByGame[selectedGameId!] ?? []).map((t) => t.task_type));
        const toInsertTypes = selectedTypes.filter((t) => !existingTypes.has(t));
        const toDeleteIds = (tasksByGame[selectedGameId!] ?? []).filter((t) => !editChecks[t.task_type]).map((t) => t.id);

        if (toInsertTypes.length > 0) {
          const { error: insertTasksError } = await supabase
            .from('officiating_tasks')
            .insert(toInsertTypes.map((task_type) => ({ officiating_game_id: selectedGameId, task_type })));
          if (insertTasksError) throw insertTasksError;
        }
        if (toDeleteIds.length > 0) {
          const { error: deleteTasksError } = await supabase.from('officiating_tasks').delete().in('id', toDeleteIds);
          if (deleteTasksError) throw deleteTasksError;
        }
        await load();
        setView('detail');
      }
      setIsNewGame(false);
    } catch {
      setActionError('Termin konnte nicht gespeichert werden.');
    } finally {
      setEditBusy(false);
    }
  }

  async function removeGame(id: string) {
    setActionError(null);
    try {
      const { error: delError } = await supabase.from('officiating_games').delete().eq('id', id);
      if (delError) throw delError;
      if (selectedGameId === id) {
        setView('main');
        setSelectedGameId(null);
      }
      await load();
    } catch {
      setActionError('Löschen fehlgeschlagen.');
    }
  }

  async function assign(taskId: string, playerId: string | null) {
    setActionError(null);
    setAssignBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc('admin_assign_officiating_task', {
        p_task_id: taskId,
        p_player_id: playerId
      });
      if (rpcError) throw rpcError;
      await load();
      setAssignSheet(null);
    } catch {
      setActionError('Zuweisung fehlgeschlagen.');
    } finally {
      setAssignBusy(false);
    }
  }

  async function addTeam(e: FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setTeamBusy(true);
    setActionError(null);
    try {
      const { error: insertError } = await supabase.from('officiating_teams').insert({ name: newTeamName.trim() });
      if (insertError) throw insertError;
      setNewTeamName('');
      await load();
    } catch {
      setActionError('Team konnte nicht angelegt werden (existiert es evtl. schon?).');
    } finally {
      setTeamBusy(false);
    }
  }

  async function removeTeam(id: string) {
    setActionError(null);
    try {
      const { error: delError } = await supabase.from('officiating_teams').delete().eq('id', id);
      if (delError) throw delError;
      await load();
    } catch {
      setActionError('Team konnte nicht gelöscht werden.');
    }
  }

  async function saveDeadline(next: string) {
    setSavingDeadline(true);
    setActionError(null);
    try {
      const { error: updError } = await supabase
        .from('reminder_settings')
        .update({ officiating_signup_deadline: next || null })
        .eq('id', 1);
      if (updError) throw updError;
      setSignupDeadline(next);
    } catch {
      setActionError('Meldefrist konnte nicht gespeichert werden.');
    } finally {
      setSavingDeadline(false);
    }
  }

  const showLoader = useTipoffLoader(!games);

  if (error) return <ErrorNote message={error} />;
  if (showLoader) return <LoadingSpinner />;
  if (!games) return null;

  const assignSheetTask =
    assignSheet && (tasksByGame[assignSheet.gameId] ?? []).find((t) => t.task_type === assignSheet.taskType);
  const assignSheetGame = assignSheet && games.find((g) => g.id === assignSheet.gameId);

  // ============ EINSTELLUNGEN ============
  if (view === 'settings') {
    return (
      <div className="flex flex-col gap-3.5">
        {actionError && <ErrorNote message={actionError} />}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView('main')}
            aria-label="Zurück"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md border border-to-border bg-to-surface text-to-text2"
          >
            <BackIcon />
          </button>
          <span className="to-display-sm text-to-text">Einstellungen</span>
        </div>

        <div className="rounded-to-xl border border-to-border bg-to-surface p-4">
          <div className="flex flex-col gap-2.5">
            <span className="to-data text-[10px] tracking-[0.12em] text-to-text3">MELDEFRIST</span>
            <p className="text-[12px] leading-relaxed text-to-text3">
              Bis dahin tragen sich die Spieler selbst ein. Danach sind die Zuteilungen fix – ändern kannst nur noch du
              oder die Kapitäne.
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <DateField label="" value={signupDeadline} onChange={setSignupDeadline} />
              </div>
              <button
                type="button"
                disabled={savingDeadline}
                onClick={() => saveDeadline(signupDeadline)}
                className="h-[46px] shrink-0 self-start rounded-to-md bg-to-accent px-4.5 text-sm font-semibold text-to-onAccent disabled:opacity-60"
              >
                Speichern
              </button>
            </div>
            <div className="flex items-center gap-2.5">
              <p className="flex-1 text-[11px] leading-relaxed text-to-textDisabled">
                Leer lassen = keine Frist, Spieler können jederzeit ändern.
              </p>
              <button
                type="button"
                disabled={savingDeadline}
                onClick={() => saveDeadline('')}
                className="h-[26px] shrink-0 rounded-to-pill border border-to-line px-2.5 text-[12px] text-to-text2 disabled:opacity-60"
              >
                Frist löschen
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-to-xl border border-to-border bg-to-surface">
          <div className="flex flex-col gap-2.5 p-4 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="to-data flex-1 text-[10px] tracking-[0.12em] text-to-text3">JAHRGÄNGE / TEAMS</span>
              <span className="to-data text-[10px] tracking-[0.12em] text-to-text3">{teams.length}</span>
            </div>
            <p className="text-[12px] leading-relaxed text-to-text3">Auswahlliste beim Anlegen eines Termins.</p>
            <form onSubmit={addTeam} className="flex gap-2">
              <input
                className="input !h-[42px]"
                placeholder="z. B. TBW U16"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
              <button
                type="submit"
                disabled={teamBusy || !newTeamName.trim()}
                className="h-[42px] shrink-0 rounded-to-md border border-to-line px-4 text-sm font-semibold text-to-text2 disabled:opacity-40"
              >
                Hinzufügen
              </button>
            </form>
          </div>
          {teams.map((t) => {
            const count = games.filter((g) => g.opponent_teams === t.name).length;
            return (
              <div key={t.id} className="flex min-h-[46px] items-center gap-3 border-t border-to-surface2 px-4">
                <span className="flex-1 text-sm text-to-text">{t.name}</span>
                <span className="to-data text-[9px] text-to-textDisabled">{count === 1 ? '1 TERMIN' : `${count} TERMINE`}</span>
                <button
                  type="button"
                  aria-label="Löschen"
                  onClick={() => removeTeam(t.id)}
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center text-to-text3"
                >
                  <TrashIcon />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ============ TERMIN BEARBEITEN / NEU ============
  if (view === 'edit') {
    return (
      <form onSubmit={saveEdit} className="flex flex-col gap-3.5">
        {actionError && <ErrorNote message={actionError} />}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView(isNewGame ? 'main' : 'detail')}
            aria-label="Zurück"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md border border-to-border bg-to-surface text-to-text2"
          >
            <BackIcon />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="to-display-sm text-to-text">{isNewGame ? 'Neuer Termin' : 'Termin bearbeiten'}</span>
            <span className="to-data truncate text-[10px] tracking-[0.1em] text-to-text3">
              {isNewGame
                ? 'NOCH NICHT GESPEICHERT'
                : `${selectedGame?.opponent_teams} · ${selectedGame ? weekdayBadge(selectedGame.game_date) : ''} ${selectedGame ? dayOfMonth(selectedGame.game_date) : ''}.${selectedGame ? monthShort(selectedGame.game_date) : ''}`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <DateField
            label="Datum"
            required
            value={editForm.game_date}
            onChange={(v) => setEditForm((f) => ({ ...f, game_date: v }))}
            placeholder={isNewGame ? 'TT.MM.JJJJ' : undefined}
          />
          <TimeField
            label="Uhrzeit"
            required
            value={editForm.game_time}
            onChange={(v) => setEditForm((f) => ({ ...f, game_time: v }))}
            placeholder={isNewGame ? '17:00' : undefined}
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-to-text3">Team</span>
          <select
            required
            className="input"
            value={editForm.opponent_teams}
            onChange={(e) => setEditForm((f) => ({ ...f, opponent_teams: e.target.value }))}
          >
            <option value="" disabled>
              Team wählen…
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-to-text3">Gegner (optional)</span>
          <input
            placeholder="z. B. DJK Erkrath"
            className="input"
            value={editForm.opponent}
            onChange={(e) => setEditForm((f) => ({ ...f, opponent: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-to-text3">Halle / Adresse</span>
          <input
            required
            placeholder="Halle / Adresse"
            className="input"
            value={editForm.location}
            onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
          />
        </label>

        <span className="to-data text-[9px] tracking-[0.12em] text-to-textDisabled">WELCHE AUFGABEN MÜSSEN WIR STELLEN?</span>
        <div className="flex flex-col overflow-hidden rounded-to-lg border border-to-divider bg-to-surface">
          {TASK_TYPES.map((type) => {
            const on = editChecks[type];
            return (
              <button
                key={type}
                type="button"
                aria-pressed={on}
                onClick={() => setEditChecks((c) => ({ ...c, [type]: !c[type] }))}
                className="flex min-h-[52px] items-center gap-3 border-t border-to-surface2 px-3.5 py-2 text-left first:border-t-0"
              >
                <span
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] ${
                    on ? 'border-to-accent bg-to-accent text-to-onAccent' : 'border-to-line text-transparent'
                  }`}
                >
                  <CheckIcon />
                </span>
                <span className="flex-1 text-sm text-to-text">{TASK_LABEL_SHORT[type]}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-to-textDisabled">
          Nicht angehakt heißt: Diese Position stellt ein anderes Team – sie erscheint bei uns als „anderes Team" und
          ist nicht zuteilbar.
        </p>

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={editBusy} className="flex h-12 flex-1 items-center justify-center rounded-to-pill bg-to-accent text-[15px] font-semibold text-to-onAccent disabled:opacity-60">
            Speichern
          </button>
          <button
            type="button"
            onClick={() => setView(isNewGame ? 'main' : 'detail')}
            className="flex h-12 shrink-0 items-center justify-center rounded-to-pill border border-to-line px-6 text-[15px] text-to-text2"
          >
            Abbrechen
          </button>
        </div>
      </form>
    );
  }

  // ============ DETAILSEITE ============
  if (view === 'detail' && selectedGame) {
    const open = openCountOf(selectedGame.id);
    return (
      <div className="flex flex-col gap-3.5">
        {actionError && <ErrorNote message={actionError} />}
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => {
              setView('main');
              setSelectedGameId(null);
            }}
            aria-label="Zurück"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-to-md border border-to-border bg-to-surface text-to-text2"
          >
            <BackIcon />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="to-display-sm truncate text-to-text">{selectedGame.opponent_teams}</span>
            <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">
              {weekdayBadge(selectedGame.game_date)} {dayOfMonth(selectedGame.game_date)}.{monthShort(selectedGame.game_date)} ·{' '}
              {infoLine(selectedGame)}
            </span>
          </div>
          <StatusPill openCount={open} />
        </div>

        <span className="to-data text-[9px] tracking-[0.12em] text-to-textDisabled">ZUTEILUNG</span>
        <div className="flex flex-col overflow-hidden rounded-to-lg border border-to-divider bg-to-surface">
          {TASK_TYPES.map((type) => {
            const task = (tasksByGame[selectedGame.id] ?? []).find((t) => t.task_type === type);
            const isOtherTeam = !task;
            const assignedName = task?.assigned_player_id ? playersById[task.assigned_player_id]?.name : null;
            return (
              <div key={type} className="flex min-h-[56px] items-center gap-3 border-t border-to-surface2 px-3.5 py-2 first:border-t-0">
                <span className={`flex-1 text-sm ${isOtherTeam ? 'text-to-textDisabled' : assignedName ? 'text-to-text2' : 'text-to-text'}`}>
                  {TASK_LABEL_SHORT[type]}
                </span>
                {isOtherTeam ? (
                  <span className="text-sm text-to-textDisabled">anderes Team</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAssignSheet({ gameId: selectedGame.id, taskType: type })}
                    className={`flex h-[34px] items-center gap-2 rounded-to-pill px-3 text-[13px] ${
                      assignedName
                        ? 'bg-to-surface2 font-medium text-to-text'
                        : 'border border-to-danger/30 font-semibold text-to-dangerText'
                    }`}
                  >
                    {assignedName ?? 'offen'}
                    <IconChevronDown className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-to-textDisabled">
          {deadlinePassed
            ? 'Nach der Meldefrist kannst nur noch du oder die Kapitäne zuteilen. Die Spieler werden über die Änderung informiert.'
            : signupDeadline
              ? `Bis zur Meldefrist am ${fmtDate(signupDeadline)} tragen sich die Spieler selbst ein – du kannst trotzdem jederzeit ändern.`
              : 'Keine Meldefrist gesetzt – die Spieler tragen sich jederzeit selbst ein, du kannst trotzdem jederzeit ändern.'}
        </p>

        <div className="flex flex-col overflow-hidden rounded-to-lg border border-to-divider bg-to-surface">
          <button
            type="button"
            onClick={() => openEdit(selectedGame)}
            className="flex min-h-[54px] items-center gap-3 border-t border-to-surface2 px-3.5 py-2 text-left first:border-t-0"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium text-to-text">Termin bearbeiten</span>
              <span className="text-[11px] text-to-textDisabled">Datum, Uhrzeit, Team, Gegner, Halle, Aufgaben</span>
            </span>
            <IconChevronRight className="h-[15px] w-[15px] shrink-0 text-to-textDisabled" />
          </button>
          <button
            type="button"
            onClick={() => removeGame(selectedGame.id)}
            className="flex min-h-[54px] items-center gap-3 border-t border-to-surface2 px-3.5 py-2 text-left"
          >
            <span className="flex-1 text-sm font-medium text-to-dangerText">Termin löschen</span>
            <IconChevronRight className="h-[15px] w-[15px] shrink-0 text-to-textDisabled" />
          </button>
        </div>

        {assignSheet && assignSheetGame && (
          <AssignSheet
            game={assignSheetGame}
            taskType={assignSheet.taskType}
            players={sortedPlayersByCount}
            taskCountByPlayer={taskCountByPlayer}
            busy={assignBusy}
            onPick={(playerId) => {
              if (assignSheetTask) assign(assignSheetTask.id, playerId);
            }}
            onClose={() => setAssignSheet(null)}
          />
        )}
      </div>
    );
  }

  // ============ HAUPTANSICHT ============
  return (
    <div className="flex flex-col gap-3.5">
      {actionError && <ErrorNote message={actionError} />}

      {!signupDeadline ? (
        <div className="rounded-to-xl border border-to-border bg-to-surface p-4">
          <div className="flex items-center gap-2.5">
            <span className="to-data flex-1 text-[10px] tracking-[0.12em] text-to-text3">KEINE MELDEFRIST GESETZT</span>
            <span className="to-number text-[22px] text-to-text2">{totalOpen}</span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-to-text2">
            Die Spieler können sich jederzeit selbst eintragen und wieder abwählen.
          </p>
        </div>
      ) : !deadlinePassed ? (
        <div className="rounded-to-xl border border-to-border bg-to-surface p-4">
          <div className="flex items-center gap-2.5">
            <span className="to-data flex-1 text-[10px] tracking-[0.12em] text-to-text3">MELDEFRIST LÄUFT BIS {fmtDateShort(signupDeadline)}</span>
            <span className="to-number text-[22px] text-to-text2">{totalOpen}</span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-to-text2">
            {totalOpen === 1
              ? 'Eine Position ist noch offen. Bis zur Frist tragen sich die Spieler selbst ein.'
              : `${totalOpen} Positionen sind noch offen. Bis zur Frist tragen sich die Spieler selbst ein.`}
          </p>
        </div>
      ) : totalOpen === 0 ? (
        <div className="flex items-center gap-3 rounded-to-xl border border-to-borderMatchday bg-to-accent/[0.06] p-4">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-accent" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-to-accent">Alles zugeteilt</span>
            <span className="to-data text-[10px] text-to-text3">MELDEFRIST ABGELAUFEN · {fmtDateShort(signupDeadline)}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-to-xl border border-to-danger/30 bg-to-dangerSoft p-4">
          <div className="flex items-center gap-2.5">
            <span className="to-data flex-1 text-[10px] tracking-[0.12em] text-to-dangerText">MELDEFRIST ABGELAUFEN · {fmtDateShort(signupDeadline)}</span>
            <span className="to-number text-[22px] text-to-dangerText">{totalOpen}</span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-to-text2">
            Die Spieler können sich nicht mehr selbst eintragen.{' '}
            {totalOpen === 1 ? 'Eine Position musst du noch zuteilen.' : `${totalOpen} Positionen musst du noch zuteilen.`}
          </p>
        </div>
      )}

      {deadlinePassed && totalOpen > 0 && (
        <div className="flex flex-col overflow-hidden rounded-to-xl border border-to-border bg-to-surface">
          {upcoming.flatMap((g) =>
            TASK_TYPES.filter((type) => {
              const task = (tasksByGame[g.id] ?? []).find((t) => t.task_type === type);
              return task && !task.assigned_player_id;
            }).map((type) => (
              <div key={`${g.id}-${type}`} className="flex min-h-16 items-center gap-3 border-t border-to-surface2 px-4 py-2.5 first:border-t-0">
                <DateBlock iso={g.game_date} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold text-to-text">{TASK_LABEL_SHORT[type]}</span>
                  <span className="to-data truncate text-[10px] text-to-text3">
                    {g.opponent_teams} · {infoLine(g)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAssignSheet({ gameId: g.id, taskType: type })}
                  className="flex h-[34px] shrink-0 items-center rounded-to-pill bg-to-accent px-3.5 text-[13px] font-semibold text-to-onAccent"
                >
                  Zuteilen
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setView('settings')}
        className="flex min-h-[58px] items-center gap-3 rounded-to-xl border border-to-border bg-to-surface px-4 text-left"
      >
        <span className="text-to-text3">
          <StopwatchIcon />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium text-to-text">Einstellungen</span>
          <span className="to-data text-[10px] text-to-text3">
            {signupDeadline ? `MELDEFRIST ${fmtDateShort(signupDeadline)}` : 'KEINE MELDEFRIST'} · {teams.length} TEAMS
          </span>
        </span>
        <IconChevronRight className="h-[15px] w-[15px] shrink-0 text-to-textDisabled" />
      </button>

      <SectionHead
        title="Termine"
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
        {upcoming.length === 0 && <p className="px-4 py-4 text-sm text-to-text3">Noch keine Termine eingetragen.</p>}
        {upcoming.map((g, i) => (
          <button
            key={g.id}
            type="button"
            onClick={() => openDetail(g)}
            className={`flex min-h-[72px] items-center gap-3 border-t border-to-surface2 px-4 py-3 text-left first:border-t-0 ${i === 0 ? 'bg-to-accent/[0.04]' : ''}`}
          >
            <DateBlock iso={g.game_date} accent={i === 0} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-sm font-semibold -tracking-[0.01em] text-to-text">{g.opponent_teams}</span>
              <span className="to-data truncate text-[10px] text-to-text3">{infoLine(g)}</span>
            </div>
            <StatusPill openCount={openCountOf(g.id)} />
            <IconChevronRight className="h-[15px] w-[15px] shrink-0 text-to-textDisabled" />
          </button>
        ))}
      </div>

      <button type="button" onClick={() => setPastOpen((v) => !v)} aria-expanded={pastOpen} className="flex items-center gap-3">
        <span className="to-display-sm text-to-text">Vergangene Termine</span>
        <span className="h-px flex-1 bg-to-divider" />
        <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">{past.length}</span>
        <IconChevronDown className={`h-[17px] w-[17px] shrink-0 text-to-text3 transition-transform ${pastOpen ? 'rotate-180' : ''}`} />
      </button>
      {pastOpen && (
        <div className="rounded-to-xl border border-to-divider bg-to-surface">
          {past.length === 0 && <p className="px-4 py-4 text-sm text-to-text3">Noch keine vergangenen Termine.</p>}
          {past.map((g) => (
            <div key={g.id} className="flex min-h-[62px] items-center gap-3 border-t border-to-surface2 px-4 py-3">
              <DateBlock iso={g.game_date} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-semibold -tracking-[0.01em] text-to-text2">{g.opponent_teams}</span>
                <span className="to-data truncate text-[10px] text-to-text3">{infoLine(g)}</span>
              </div>
              <StatusPill openCount={0} past />
            </div>
          ))}
        </div>
      )}

      {assignSheet && assignSheetGame && (
        <AssignSheet
          game={assignSheetGame}
          taskType={assignSheet.taskType}
          players={sortedPlayersByCount}
          taskCountByPlayer={taskCountByPlayer}
          busy={assignBusy}
          onPick={(playerId) => {
            if (assignSheetTask) assign(assignSheetTask.id, playerId);
          }}
          onClose={() => setAssignSheet(null)}
        />
      )}
    </div>
  );
}

function AssignSheet({
  game,
  taskType,
  players,
  taskCountByPlayer,
  busy,
  onPick,
  onClose
}: {
  game: OfficiatingGame;
  taskType: OfficiatingTaskType;
  players: Player[];
  taskCountByPlayer: Record<string, number>;
  busy: boolean;
  onPick: (playerId: string | null) => void;
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-[24px] border border-to-line bg-to-surface p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />
        <div className="flex flex-col gap-1">
          <h2 className="to-display-sm text-to-text">Wer übernimmt?</h2>
          <span className="to-data text-[10px] tracking-[0.1em] text-to-text3">
            {TASK_LABEL_SHORT[taskType]} · {game.opponent_teams} · {weekdayBadge(game.game_date)} {dayOfMonth(game.game_date)}.
            {monthShort(game.game_date)}
          </span>
        </div>
        <p className="text-[13px] text-to-text3">Sortiert nach den wenigsten Einsätzen in dieser Saison.</p>
        <div className="flex max-h-[302px] flex-col overflow-y-auto rounded-to-lg border border-to-divider bg-to-bg">
          {players.map((p) => {
            const count = taskCountByPlayer[p.id] ?? 0;
            return (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => onPick(p.id)}
                className="flex min-h-[50px] items-center gap-3 border-t border-to-surface2 px-3.5 text-left first:border-t-0 disabled:opacity-60"
              >
                <span className="to-data flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-to-surface2 text-[10px] text-to-text3">
                  {initialsOf(p.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-to-text">{p.name}</span>
                <span
                  className={`to-data inline-flex h-[22px] shrink-0 items-center rounded-to-pill px-2.5 text-[10px] font-semibold ${
                    count === 0 ? 'bg-to-accentSoft text-to-accent' : 'bg-to-surface2 text-to-text2'
                  }`}
                >
                  {count}×
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => onPick(null)}
          className="flex h-11 items-center justify-center rounded-to-pill border border-to-line text-[14px] text-to-text2 disabled:opacity-60"
        >
          Offen lassen
        </button>
        <button type="button" disabled={busy} onClick={onClose} className="h-6 text-[13px] font-normal text-to-text3">
          Abbrechen
        </button>
      </div>
    </div>,
    document.body
  );
}
