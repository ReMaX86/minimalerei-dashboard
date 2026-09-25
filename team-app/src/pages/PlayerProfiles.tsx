import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorNote } from '../components/ErrorNote';
import { useTipoffLoader } from '../hooks/useTipoffLoader';
import { PlayerProfileSheet } from '../components/PlayerProfileSheet';
import { BestenlisteBoard } from '../components/BestenlisteBoard';
import { fmtDateShort } from '../lib/format';
import { ANNOUNCEMENT_KIND_LABELS } from '../lib/announcements';
import { type Announcement, type AnnouncementReadRow, type Player, type PlayerPosition } from '../types/database';

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function nameLines(name: string): [string, string] {
  const [first, ...rest] = name.split(' ');
  return [first, rest.join(' ')];
}

// Gröbere Positionsfamilie fürs Raster ("FLÜGEL"/"AUFBAU"/"CENTER" statt der
// fünf feinen Positionen) — die Vorlage kennt nur diese drei Kürzel, unser
// Schema führt fünf (siehe PlayerPosition). Eigene, dokumentierte Zuordnung,
// da es dafür keinen bestehenden Wert gibt.
const GRID_POSITION: Record<PlayerPosition, string> = {
  pg: 'AUFBAU',
  sg: 'FLÜGEL',
  sf: 'FLÜGEL',
  pf: 'FLÜGEL',
  c: 'CENTER'
};

export function PlayerProfiles() {
  const { role, player: me } = useAuth();
  const { flags } = useFeatureFlags();
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Player | null>(null);
  // Element 22 §"Archiv für Spieler" — bestätigte Meldungen bleiben hier
  // nachlesbar, statt nach dem Haken auf der Startseite endgültig weg zu
  // sein. Nur für role==='player' relevant: announcement_reads kennt nur
  // player_id, ein Trainer/Betrachter hat dort nie eigene Zeilen.
  const [readAnnouncements, setReadAnnouncements] = useState<{ announcement: Announcement; readAt: string }[] | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase
      .from('players')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (loadError) {
      setError('Fehler beim Laden der Spielerprofile.');
      return;
    }
    setPlayers((data as Player[]) ?? []);

    if (role === 'player' && me) {
      const { data: readRows } = await supabase.from('announcement_reads').select('*').eq('player_id', me.id);
      const ids = ((readRows as AnnouncementReadRow[] | null) ?? []).map((r) => r.announcement_id);
      if (ids.length > 0) {
        const { data: announcementRows } = await supabase.from('announcements').select('*').in('id', ids);
        const byId = new Map(((announcementRows as Announcement[] | null) ?? []).map((a) => [a.id, a] as const));
        const combined = ((readRows as AnnouncementReadRow[] | null) ?? [])
          .map((r) => ({ announcement: byId.get(r.announcement_id), readAt: r.created_at }))
          .filter((x): x is { announcement: Announcement; readAt: string } => !!x.announcement)
          .sort((a, b) => b.readAt.localeCompare(a.readAt));
        setReadAnnouncements(combined);
      } else {
        setReadAnnouncements([]);
      }
    }
  }, [role, me]);

  useEffect(() => {
    load().catch(() => setError('Fehler beim Laden der Spielerprofile.'));
  }, [load]);

  const showLoader = useTipoffLoader(!players);

  if (error) return <ErrorNote message={error} />;
  if (showLoader) return <LoadingSpinner />;
  if (!players) return null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <span className="to-display-sm text-to-text">Kader</span>
        <span className="h-px flex-1 bg-to-divider" />
        <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">{players.length} SPIELER</span>
      </div>

      {players.length === 0 ? (
        <p className="card text-sm text-to-text3">Noch keine Spieler eingetragen.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {players.map((p) => {
            const role = p.is_admin ? 'T' : p.is_captain || p.is_co_captain ? 'C' : null;
            const [first, last] = nameLines(p.name);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                className={`flex flex-col items-center gap-2 rounded-to-xl border px-2 pb-3.5 pt-4 text-center ${
                  role ? 'border-to-borderMatchday' : 'border-to-border'
                } bg-to-surface`}
              >
                <span className="relative flex">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt="" className="h-[58px] w-[58px] rounded-full border border-to-line object-cover" />
                  ) : (
                    <span className="to-data flex h-[58px] w-[58px] items-center justify-center rounded-full border border-to-line bg-to-surface2 text-[15px] text-to-text2">
                      {initialsOf(p.name)}
                    </span>
                  )}
                  {role && (
                    <span className="to-data absolute -bottom-0.5 -right-1 flex h-[17px] items-center rounded-to-pill border-2 border-to-surface bg-to-accent px-1.5 text-[8px] font-bold text-to-onAccent">
                      {role}
                    </span>
                  )}
                </span>
                <span className="flex w-full flex-col items-center gap-0.5">
                  <span className="w-full truncate text-xs font-semibold -tracking-[0.01em] text-to-text">{first}</span>
                  <span className="w-full truncate text-xs font-semibold -tracking-[0.01em] text-to-text">{last}</span>
                  {p.position && (
                    <span className="to-data pt-0.5 text-[9px] tracking-[0.06em] text-to-textDisabled">{GRID_POSITION[p.position]}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {flags.team_stats && flags.stats && <BestenlisteBoard />}

      {readAnnouncements && readAnnouncements.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <span className="to-display-sm text-to-text">Frühere Meldungen</span>
            <span className="h-px flex-1 bg-to-divider" />
            <span className="to-data text-[10px] tracking-[0.12em] text-to-textDisabled">{readAnnouncements.length}</span>
          </div>
          <section className="overflow-hidden rounded-to-xl border border-to-border bg-to-surface">
            {readAnnouncements.map(({ announcement: a, readAt }, i) => (
              <div key={a.id} className={`flex flex-col gap-1 px-4 py-3 ${i === 0 ? '' : 'border-t border-to-surface2'}`}>
                <span
                  className={`to-data w-fit text-[9px] tracking-[0.1em] ${
                    a.kind === 'dringend' ? 'text-to-dangerText' : a.kind === 'wichtig' ? 'text-to-accent' : 'text-to-text3'
                  }`}
                >
                  {ANNOUNCEMENT_KIND_LABELS[a.kind].toUpperCase()}
                </span>
                <p className="text-sm leading-relaxed text-to-text2">{a.message}</p>
                <span className="to-data text-[9px] tracking-[0.06em] text-to-textDisabled">BESTÄTIGT AM {fmtDateShort(readAt.slice(0, 10))}</span>
              </div>
            ))}
          </section>
        </>
      )}

      {selected && <PlayerProfileSheet player={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
