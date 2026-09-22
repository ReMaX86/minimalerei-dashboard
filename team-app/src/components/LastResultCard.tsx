import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fmtDateBadgeWithYear } from '../lib/format';
import { ErrorNote } from './ErrorNote';
import { gameResult, type Game } from '../types/database';

// "Letzte 5"/Serie — leitet Form-Kästchen, Bilanz und ggf. ein Serien-Label
// aus den letzten (bis zu) 5 Spielen MIT eingetragenem Endstand her (siehe
// docs/design/tipoff-design/elements/03-letztes-ergebnis/PROMPT.md
// "Zeile 'Letzte 5' / Serie"). `games` bereits nach Datum absteigend
// sortiert vom Dashboard — das jüngste Spiel steht links.
function computeStreak(games: Game[]): {
  chips: ('w' | 'l')[];
  record: string;
  streak: { label: string; accent: boolean } | null;
} {
  const chips = games
    .map((g) => gameResult(g))
    .filter((r): r is 'sieg' | 'niederlage' => r === 'sieg' || r === 'niederlage')
    .map((r): 'w' | 'l' => (r === 'sieg' ? 'w' : 'l'));

  const wins = chips.filter((c) => c === 'w').length;
  const losses = chips.length - wins;
  const record = `${wins} S · ${losses} N`;

  let streakLen = 0;
  for (const c of chips) {
    if (c === chips[0]) streakLen++;
    else break;
  }
  const streak =
    streakLen >= 3
      ? { label: `${streakLen} ${chips[0] === 'w' ? 'SIEGE' : 'NIEDERLAGEN'} IN FOLGE`, accent: chips[0] === 'w' }
      : null;

  return { chips, record, streak };
}

function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 19V9" />
      <path d="M10 19V5" />
      <path d="M16 19v-7" />
      <path d="M21 19H3" />
    </svg>
  );
}

export function LastResultCard({
  game,
  role,
  inSquad,
  wasTracked,
  myBoxScore,
  recentResults,
  onScoreReported
}: {
  game: Game;
  role: 'trainer' | 'player' | 'viewer';
  inSquad: boolean | null;
  wasTracked: boolean;
  myBoxScore: { points: number; rebounds: number; assists: number } | null;
  recentResults: Game[];
  onScoreReported: () => void;
}) {
  const [enteringScore, setEnteringScore] = useState(false);
  const [usScore, setUsScore] = useState('');
  const [oppScore, setOppScore] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasScore = game.final_score_us !== null && game.final_score_opponent !== null;
  const result = hasScore ? gameResult(game) : null;
  const isWin = result === 'sieg';
  const isLoss = result === 'niederlage';
  const { chips, record, streak } = computeStreak(recentResults);
  // Eigene Kacheln nur für Spieler, die selbst im Kader standen — für
  // Trainer/Betrachter (keine eigenen Werte) und "notinsquad" entfallen sie
  // ersatzlos, der Box-Score-Link bleibt aber (siehe PROMPT.md Zustand 5).
  const showOwnStats = hasScore && wasTracked && role === 'player' && !!inSquad && !!myBoxScore;

  async function submitScore() {
    const us = Number(usScore);
    const opp = Number(oppScore);
    if (!Number.isInteger(us) || !Number.isInteger(opp) || us < 0 || opp < 0) {
      setError('Bitte beide Punktzahlen eintragen.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('report_final_score', {
        p_game_id: game.id,
        p_score_us: us,
        p_score_opponent: opp
      });
      if (rpcError) throw rpcError;
      onScoreReported();
    } catch {
      setError('Endstand konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card flex flex-col gap-4 !p-5">
      <div className="flex items-center justify-between gap-2.5">
        <span className="to-label truncate">LETZTES SPIEL · {game.is_home ? 'HEIM' : 'AUSWÄRTS'}</span>
        <span
          className={`to-data inline-flex h-6 shrink-0 items-center rounded-to-sm px-2.5 text-[10px] font-semibold tracking-wide ${
            !hasScore
              ? 'bg-to-surface2 text-to-text2'
              : isWin
                ? 'bg-to-accent text-to-onAccent'
                : 'bg-to-dangerSoft text-to-dangerText'
          }`}
        >
          {!hasScore ? 'OFFEN' : isWin ? 'SIEG' : 'NIEDERLAGE'}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-[17px] font-semibold leading-[1.25] text-to-text">vs. {game.opponent}</p>
          <p className="to-data text-[13px] text-to-text3">{fmtDateBadgeWithYear(game.game_date)}</p>
        </div>
        {hasScore ? (
          <div className="to-data flex shrink-0 items-baseline gap-0.5 text-[34px] font-semibold leading-none">
            <span className={isWin ? 'text-to-accent' : 'text-to-text'}>{game.final_score_us}</span>
            <span className="text-[26px] text-to-text3">:</span>
            <span className={isLoss ? 'text-to-text2' : 'text-to-text'}>{game.final_score_opponent}</span>
          </div>
        ) : (
          <div className="to-data shrink-0 text-[26px] text-to-text3">– : –</div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-to-border pt-3.5">
        <span className={`to-label whitespace-nowrap ${streak ? (streak.accent ? '!text-to-accent' : '!text-to-dangerText') : ''}`}>
          {streak ? streak.label : 'LETZTE 5'}
        </span>
        <span className="flex flex-1 gap-1.5">
          {chips.map((c, i) => (
            <span
              key={i}
              className={`to-data flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-to-sm text-xs font-semibold ${
                c === 'w' ? 'bg-to-accent text-to-onAccent' : 'bg-to-surface2 text-to-dangerText'
              }`}
            >
              {c === 'w' ? 'S' : 'N'}
            </span>
          ))}
        </span>
        {!streak && <span className="whitespace-nowrap text-[13px] text-to-text2">{record}</span>}
      </div>

      {!hasScore ? (
        enteringScore ? (
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="input text-center"
                placeholder="TB Wülfrath"
                value={usScore}
                onChange={(e) => setUsScore(e.target.value)}
              />
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="input text-center"
                placeholder={game.opponent}
                value={oppScore}
                onChange={(e) => setOppScore(e.target.value)}
              />
            </div>
            {error && <ErrorNote message={error} />}
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" disabled={saving} className="btn-primary !h-[50px] text-[15px]" onClick={submitScore}>
                {saving ? 'Speichere…' : 'Speichern'}
              </button>
              <button
                type="button"
                disabled={saving}
                className="btn-secondary !h-[50px] text-[15px]"
                onClick={() => {
                  setEnteringScore(false);
                  setError(null);
                }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <button type="button" className="btn-primary w-full text-[15px]" onClick={() => setEnteringScore(true)}>
              Endstand eintragen
            </button>
            <p className="text-center text-xs text-to-text3">Jede·r mit Zugang kann das Ergebnis nachtragen.</p>
          </div>
        )
      ) : (
        <>
          {showOwnStats && myBoxScore && (
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1 rounded-to-lg bg-to-surface2 px-3.5 py-3">
                <span className="to-label">DEINE PUNKTE</span>
                <span className="to-number text-[26px] leading-none text-to-accent">{myBoxScore.points}</span>
              </div>
              <div className="flex flex-1 flex-col gap-1 rounded-to-lg bg-to-surface2 px-3.5 py-3">
                <span className="to-label">REBOUNDS</span>
                <span className="to-number text-[26px] leading-none text-to-text">{myBoxScore.rebounds}</span>
              </div>
              <div className="flex flex-1 flex-col gap-1 rounded-to-lg bg-to-surface2 px-3.5 py-3">
                <span className="to-label">ASSISTS</span>
                <span className="to-number text-[26px] leading-none text-to-text">{myBoxScore.assists}</span>
              </div>
            </div>
          )}

          {wasTracked ? (
            <Link
              to={`/stats/${game.id}`}
              className="flex min-h-[48px] items-center gap-2.5 border-t border-to-border pt-3.5 text-to-text"
            >
              <BarChartIcon className="shrink-0 text-to-accent" />
              <span className="flex-1 text-[15px] font-semibold">Box-Score ansehen</span>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-text3" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          ) : (
            <div className="flex min-h-[48px] items-center gap-2.5 border-t border-to-border pt-3.5 text-sm text-to-text2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-to-text3" />
              Nicht getrackt – nur Endstand
            </div>
          )}
        </>
      )}
    </section>
  );
}
