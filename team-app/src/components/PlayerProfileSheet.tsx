import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { computeBoxScore } from '../lib/gameStats';
import { ageFromBirthDate } from '../lib/format';
import { MyProfileModal } from './MyProfileModal';
import { POSITION_LABELS, type GameStatEvent, type Player } from '../types/database';

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// "3-Point (Sniper)" -> ["3-Point", "Sniper"] — Chip zeigt den Begriff
// fett/volt und den Spitznamen daneben klein, siehe PROMPT.md "STÄRKEN".
function splitSkill(skill: string): [string, string] {
  const m = skill.match(/^(.*)\s\((.*)\)$/);
  return m ? [m[1], m[2]] : [skill, ''];
}

const STAT_LABELS: [key: 'points' | 'rebounds' | 'assists' | 'steals' | 'turnovers' | 'fouls', label: string][] = [
  ['points', 'PUNKTE'],
  ['rebounds', 'REBOUNDS'],
  ['assists', 'ASSISTS'],
  ['steals', 'STEALS'],
  ['turnovers', 'TURNOVER'],
  ['fouls', 'FOULS']
];

interface SeasonState {
  trackedGames: number;
  totals: Record<string, number> | null;
}

export function PlayerProfileSheet({ player, onClose }: { player: Player; onClose: () => void }) {
  const { player: me, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [season, setSeason] = useState<SeasonState | null>(null);
  const [editOwnOpen, setEditOwnOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('game_stat_events').select('*').eq('player_id', player.id);
    const events = (data as GameStatEvent[]) ?? [];
    const trackedGames = new Set(events.map((e) => e.game_id)).size;
    const box = computeBoxScore(events)[0];
    setSeason({
      trackedGames,
      totals: box
        ? { points: box.points, rebounds: box.rebounds, assists: box.assists, steals: box.steals, turnovers: box.turnovers, fouls: box.fouls }
        : null
    });
  }, [player.id]);

  useEffect(() => {
    load();
  }, [load]);

  const isMe = me?.id === player.id;
  const facts: { label: string; value: string; unit?: string }[] = [];
  if (player.height_cm) facts.push({ label: 'GRÖSSE', value: String(player.height_cm), unit: 'cm' });
  if (player.birth_date) facts.push({ label: 'ALTER', value: String(ageFromBirthDate(player.birth_date)), unit: 'J.' });
  facts.push({ label: 'SPIELE', value: season ? String(season.trackedGames) : '…' });

  function openAdminEdit() {
    onClose();
    navigate(`/admin?player=${player.id}`);
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
        <div
          className="flex max-h-[88vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-[24px] border border-to-line bg-to-surface p-5 sm:rounded-b-[24px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex items-center justify-center">
            <span className="h-1 w-9 rounded-full bg-to-line" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-to-surface2 text-to-text2"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="flex items-center gap-4">
            {player.photo_url ? (
              <img src={player.photo_url} alt="" className="h-[76px] w-[76px] shrink-0 rounded-full border-2 border-to-accent object-cover" />
            ) : (
              <span className="to-data flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full border-2 border-to-accent text-xl text-to-accent">
                {initialsOf(player.name)}
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="to-display-lg truncate text-to-text">{player.name}</p>
              {player.position ? (
                <p className="to-data text-xs tracking-[0.08em] text-to-text2">
                  {POSITION_LABELS[player.position].split(' (')[0].toUpperCase()}
                </p>
              ) : (
                <p className="to-data text-xs tracking-[0.08em] text-to-textDisabled">POSITION NICHT HINTERLEGT</p>
              )}
            </div>
          </div>

          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${facts.length}, 1fr)` }}>
            {facts.map((f) => (
              <div key={f.label} className="flex flex-col gap-1.5 rounded-to-lg bg-to-surface2 p-3">
                <span className="to-data text-[9px] tracking-[0.12em] text-to-text3">{f.label}</span>
                <span className="to-number text-[20px] text-to-text">
                  {f.value}
                  {f.unit && <span className="text-xs text-to-text3"> {f.unit}</span>}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <span className="to-label">STÄRKEN</span>
            {player.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {player.skills.map((s) => {
                  const [head, sub] = splitSkill(s);
                  return (
                    <span
                      key={s}
                      className="inline-flex h-8 items-center gap-1.5 rounded-to-pill border border-to-borderMatchday bg-to-accentSoft px-3.5 text-[13px] font-semibold leading-none text-to-accent"
                    >
                      {head}
                      {sub && <em className="leading-none text-[11px] font-normal not-italic text-to-text3">{sub}</em>}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-[13px] text-to-text3">Noch keine Stärken hinterlegt.</p>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-to-divider pt-4">
            {season?.totals ? (
              <>
                <span className="to-label">SAISON · SUMME AUS {season.trackedGames} GETRACKTEN SPIELEN</span>
                <div className="grid grid-cols-3 gap-x-2 gap-y-3">
                  {STAT_LABELS.map(([key, label]) => (
                    <div key={key} className="flex flex-col gap-0.5">
                      <span className="to-number text-[24px] text-to-text">{season.totals![key]}</span>
                      <span className="to-data text-[9px] tracking-[0.1em] text-to-textDisabled">{label}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <span className="to-label">SAISON</span>
                <p className="text-[13px] text-to-text3">Noch kein Spiel mit diesem Spieler getrackt.</p>
              </>
            )}
          </div>

          {isMe && (
            <button type="button" onClick={() => setEditOwnOpen(true)} className="btn-secondary h-[46px] w-full text-sm">
              Profil bearbeiten
            </button>
          )}
          {/* Trainer sieht auch auf dem eigenen Profil zusätzlich den Weg zu
              Position/Stärken im Admin — die Vorlage kennt "eigenes Profil"
              und "Trainersicht" nur als getrennte Zustände, ein spielender
              Trainer braucht aber beides gleichzeitig. */}
          {isAdmin && !isMe && (
            <button type="button" onClick={openAdminEdit} className="btn-secondary h-[46px] w-full text-sm">
              Im Admin bearbeiten
            </button>
          )}
          {isAdmin && isMe && (
            <button type="button" onClick={openAdminEdit} className="text-center text-[13px] font-semibold text-to-accent">
              Position &amp; Stärken im Admin bearbeiten
            </button>
          )}
        </div>
      </div>
      {editOwnOpen && <MyProfileModal onClose={() => setEditOwnOpen(false)} />}
    </>,
    document.body
  );
}
