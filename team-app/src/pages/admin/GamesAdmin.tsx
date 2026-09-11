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
