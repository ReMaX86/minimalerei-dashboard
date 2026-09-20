import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useFeatureFlags } from '../../context/FeatureFlagsContext';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorNote } from '../../components/ErrorNote';
import { MeetingPointFields, EMPTY_MEETING_POINT } from '../../components/MeetingPointFields';
import { DateField, TimeField } from '../../components/DateTimeField';
import { fmtDate, fmtTime } from '../../lib/format';
import { gameResult, meetingPoints, type Game, type TrikotSetId } from '../../types/database';

const RESULT_LABELS = { sieg: 'Sieg', niederlage: 'Niederlage', unentschieden: 'Unentschieden' } as const;

const EMPTY_FORM = {
  game_date: '',
  game_time: '',
  opponent: '',
  is_home: true,
  trikot_override: '' as '' | TrikotSetId,
  location: '',
  ...EMPTY_MEETING_POINT
};

export function GamesAdmin() {
  const { flags } = useFeatureFlags();
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // Endstand nachtragen, wenn ein Spiel nicht live getrackt wurde (z. B.
  // vergessen) — statt Zwang zum Event-für-Event-Tracking einfach den
  // Endstand direkt eintragen. Nur ein Spiel gleichzeitig offen.
  const [scoreFormId, setScoreFormId] = useState<string | null>(null);
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

  function edit(g: Game) {
    setEditingId(g.id);
    setShowForm(true);
    setForm({
      game_date: g.game_date,
      game_time: g.game_time.slice(0, 5),
      opponent: g.opponent,
      is_home: g.is_home,
      trikot_override: g.trikot_override ?? '',
      location: g.location,
      meeting_time_hall: g.meeting_time_hall?.slice(0, 5) ?? '',
      meeting_time_carpool: g.meeting_time_carpool?.slice(0, 5) ?? '',
      meeting_point_carpool: g.meeting_point_carpool ?? ''
    });
  }

  function resetForm() {
    setEditingId(null);
    setShowForm(false);
    setForm(EMPTY_FORM);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
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
      const { error: saveError } = editingId
        ? await supabase.from('games').update(payload).eq('id', editingId)
        : await supabase.from('games').insert(payload);
      if (saveError) throw saveError;
      resetForm();
      await load();
    } catch {
      setError('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const { error: delError } = await supabase.from('games').delete().eq('id', id);
      if (delError) throw delError;
      if (editingId === id) resetForm();
      await load();
    } catch {
      setError('Löschen fehlgeschlagen.');
    }
  }

  function openScoreForm(id: string) {
    setScoreForm({ us: '', opponent: '' });
    setScoreFormId(id);
  }

  function closeScoreForm() {
    setScoreFormId(null);
  }

  async function saveScore(id: string) {
    const us = Number(scoreForm.us);
    const opponent = Number(scoreForm.opponent);
    if (!Number.isInteger(us) || us < 0 || !Number.isInteger(opponent) || opponent < 0) {
      setError('Bitte für beide Teams eine gültige Punktzahl (0 oder mehr) eingeben.');
      return;
    }
    setSavingScore(true);
    setError(null);
    try {
      const { error: saveError } = await supabase
        .from('games')
        .update({ final_score_us: us, final_score_opponent: opponent, stats_finalized_at: new Date().toISOString() })
        .eq('id', id);
      if (saveError) throw saveError;
      setScoreFormId(null);
      await load();
    } catch {
      setError('Endstand konnte nicht gespeichert werden.');
    } finally {
      setSavingScore(false);
    }
  }

  async function resetStats(id: string) {
    if (
      !window.confirm(
        'Tracking wirklich zurücksetzen? Alle erfassten Aktionen, der Punktestand und die Aufstellung für dieses Spiel gehen dabei unwiderruflich verloren.'
      )
    ) {
      return;
    }
    setError(null);
    try {
      const { error: resetError } = await supabase.rpc('reset_game_stats', { p_game_id: id });
      if (resetError) throw resetError;
      await load();
    } catch {
      setError('Tracking konnte nicht zurückgesetzt werden.');
    }
  }

  if (error) return <ErrorNote message={error} />;
  if (!games) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {!showForm && (
        <div className="flex justify-end">
          <button className="text-xs font-bold text-tbw-navy" onClick={() => setShowForm(true)}>
            + Neu
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="card space-y-2">
          <p className="text-sm font-bold text-tbw-navyDark">{editingId ? 'Spiel bearbeiten' : 'Neues Spiel'}</p>
          <div className="space-y-2">
            <DateField
              label="Datum"
              required
              value={form.game_date}
              onChange={(v) => setForm((f) => ({ ...f, game_date: v }))}
            />
            <TimeField
              label="Uhrzeit"
              required
              value={form.game_time}
              onChange={(v) => setForm((f) => ({ ...f, game_time: v }))}
            />
          </div>
          <input
            required
            placeholder="Gegner"
            className="input"
            value={form.opponent}
            onChange={(e) => setForm((f) => ({ ...f, opponent: e.target.value }))}
          />
          <input
            required
            placeholder="Halle / Adresse"
            className="input"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_home}
                onChange={(e) => setForm((f) => ({ ...f, is_home: e.target.checked }))}
              />
              Heimspiel
            </label>
            <select
              className="input !w-auto"
              value={form.trikot_override}
              onChange={(e) => setForm((f) => ({ ...f, trikot_override: e.target.value as '' | TrikotSetId }))}
            >
              <option value="">Trikot automatisch</option>
              <option value="weiss">Trikot: Weiß erzwingen</option>
              <option value="schwarz">Trikot: Schwarz erzwingen</option>
            </select>
          </div>
          <div className="border-t border-black/5 pt-2">
            <p className="text-xs font-semibold text-tbw-ink/50">Treffpunkt</p>
            <div className="mt-2">
              <MeetingPointFields
                isHome={form.is_home}
                value={form}
                onChange={(next) => setForm((f) => ({ ...f, ...next }))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy}>
              {editingId ? 'Speichern' : 'Anlegen'}
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={resetForm}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      <ul className="space-y-2">
        {games.map((g) => (
          <li key={g.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-tbw-navyDark">
                  vs. {g.opponent} <span className="pill pill-open ml-1">{g.is_home ? 'Heim' : 'Auswärts'}</span>
                </p>
                <p className="text-sm text-tbw-ink/60">
                  {fmtDate(g.game_date)} · {fmtTime(g.game_time)} Uhr · {g.location}
                </p>
                <p className="text-xs text-tbw-ink/40">
                  Kader: {g.squad_published ? 'veröffentlicht' : 'Entwurf'}
                  {g.trikot_override ? ` · Trikot fix: ${g.trikot_override === 'weiss' ? 'Weiß' : 'Schwarz'}` : ''}
                </p>
                {meetingPoints(g).map((m) => (
                  <p key={m.label} className="text-xs text-tbw-ink/40">
                    Treffpunkt {m.label}: {m.time ? `${fmtTime(m.time)} Uhr` : ''}
                    {m.place ? `${m.time ? ', ' : ''}${m.place}` : ''}
                  </p>
                ))}
                {flags.stats && scoreFormId === g.id && (
                  <div className="mt-2 rounded-xl bg-tbw-bg p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-tbw-ink/40">
                      Endstand nachtragen
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder="Wir"
                        value={scoreForm.us}
                        onChange={(e) => setScoreForm((f) => ({ ...f, us: e.target.value }))}
                        className="input !py-1.5 text-center"
                      />
                      <span className="text-sm font-bold text-tbw-ink/40">:</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder={g.opponent}
                        value={scoreForm.opponent}
                        onChange={(e) => setScoreForm((f) => ({ ...f, opponent: e.target.value }))}
                        className="input !py-1.5 text-center"
                      />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        className="btn-primary flex-1 !py-1.5 text-xs"
                        disabled={savingScore}
                        onClick={() => saveScore(g.id)}
                      >
                        Speichern
                      </button>
                      <button className="btn-secondary flex-1 !py-1.5 text-xs" disabled={savingScore} onClick={closeScoreForm}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}
                {flags.stats && gameResult(g) && (
                  <p className="text-xs text-tbw-ink/40">
                    Endstand: {g.final_score_us}:{g.final_score_opponent} ·{' '}
                    <span
                      className={
                        gameResult(g) === 'sieg'
                          ? 'font-semibold text-status-ok'
                          : gameResult(g) === 'niederlage'
                            ? 'font-semibold text-tbw-red'
                            : 'font-semibold'
                      }
                    >
                      {RESULT_LABELS[gameResult(g)!]}
                    </span>
                    {g.stats_finalized_at ? ' · Stats abgeschlossen' : ' · Stats laufen noch'}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => edit(g)}>
                  Bearbeiten
                </button>
                {flags.stats && (
                  <Link to={`/stats/${g.id}`} className="btn-secondary !px-2 !py-1 text-center text-xs">
                    {g.stats_finalized_at ? 'Stats ansehen' : 'Stats tracken'}
                  </Link>
                )}
                {flags.stats && !gameResult(g) && scoreFormId !== g.id && (
                  <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => openScoreForm(g.id)}>
                    Endstand nachtragen
                  </button>
                )}
                {flags.stats &&
                  // Nicht nur bei vorhandenem Endstand zeigen (der existiert erst
                  // ab dem ersten erfassten Korb) — sonst wäre der Reset-Button
                  // ausgerechnet dann unsichtbar, wenn versehentlich schon durch
                  // die Viertel geklickt wurde, aber noch kein Punkt erfasst ist.
                  (gameResult(g) || g.last_announced_quarter > 0 || g.stats_finalized_at) && (
                    <button
                      className="btn-secondary !px-2 !py-1 text-xs !text-tbw-red"
                      onClick={() => resetStats(g.id)}
                    >
                      Tracking zurücksetzen
                    </button>
                  )}
                <button className="btn-secondary !px-2 !py-1 text-xs !text-tbw-red" onClick={() => remove(g.id)}>
                  Löschen
                </button>
              </div>
            </div>
          </li>
        ))}
        {games.length === 0 && <p className="text-sm text-tbw-ink/50">Noch keine Spiele eingetragen.</p>}
      </ul>
    </div>
  );
}
