import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fmtDateBadge, fmtTime, hasKickedOff, mapsUrl } from '../lib/format';
import { DECLINE_REASON_LABELS, benoetigterSatz, meetingPoints, type DeclineReason, type Game, type SquadConfirmation } from '../types/database';
import { SquadDeclineSheet, SquadReconfirmSheet } from './SquadResponseSheets';

const MAX_SQUAD_SIZE = 12;

// Grobe, aus dem echten Namen abgeleitete Kurzform fürs Live-Anzeigetafel-
// Kürzel — keine erfundene Abkürzung, nur die ersten drei Buchstaben ohne
// Leerzeichen/Sonderzeichen (gleiche Herleitung wie vorher im Team-Tile).
function teamAbbrev(name: string): string {
  const letters = name.replace(/[^a-zA-ZÀ-ÿ]/g, '').toUpperCase();
  return letters.slice(0, 3) || '?';
}

function countdownLabel(target: Date, now: Date): { text: string; minutesLeft: number } {
  const diffMs = target.getTime() - now.getTime();
  const totalMinutes = Math.max(0, Math.ceil(diffMs / 60_000));
  if (totalMinutes < 60) return { text: `IN ${totalMinutes} MIN`, minutesLeft: totalMinutes };
  if (totalMinutes < 24 * 60) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return { text: `IN ${h} STD ${m} MIN`, minutesLeft: totalMinutes };
  }
  const days = Math.ceil(totalMinutes / (24 * 60));
  return { text: days === 1 ? 'IN 1 TAG' : `IN ${days} TAGEN`, minutesLeft: totalMinutes };
}

// Kopfzeile rechts: Countdown-Pille (grau, oder Akzent, sobald die eigene
// Rückmeldung noch offen ist und das Spiel < 24 Std entfernt ist — siehe
// PROMPT.md "Erinnerungen") bzw. roter Punkt + "LÄUFT" nach Anpfiff. Rein
// zeitbasiert, unabhängig vom stats-Feature-Flag (siehe Dashboard.tsx).
function CountBadge({ game, hot }: { game: Game; hot: boolean }) {
  const target = new Date(`${game.game_date}T${game.game_time}`);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (hasKickedOff(game.game_date, game.game_time, now)) {
    return (
      <span className="to-data inline-flex h-[26px] items-center gap-1.5 rounded-to-pill bg-to-dangerSoft px-2.5 text-[11px] font-semibold tracking-wide text-to-dangerText">
        <span className="h-1.5 w-1.5 rounded-full bg-to-danger" />
        LÄUFT
      </span>
    );
  }
  const { text } = countdownLabel(target, now);
  return (
    <span
      className={`to-data inline-flex h-[26px] items-center rounded-to-pill px-2.5 text-[11px] font-semibold tracking-wide ${
        hot ? 'bg-to-accentSoft text-to-accent' : 'bg-to-surface2 text-to-text2'
      }`}
    >
      {text}
    </span>
  );
}

function RouteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

function ArrowLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M5 12h13" />
      <path d="M13 7l5 5-5 5" />
    </svg>
  );
}

function SmallCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function SmallCrossIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="shrink-0" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function KaderAnsehenLink() {
  return (
    <Link to="/spiele?kader=1" className="inline-flex items-center gap-1 text-sm font-semibold text-to-accent">
      Kader ansehen
      <ArrowLinkIcon />
    </Link>
  );
}

export function NextGameCard({
  game,
  role,
  playerInSquad,
  myConfirmation,
  myDeclineReason,
  myDeclineNote,
  squadCount,
  showTracking,
  activeStatsHolder,
  liveScore,
  liveQuarter,
  refreshingLive,
  onRefreshLive,
  onResponded
}: {
  game: Game;
  role: 'trainer' | 'player' | 'viewer';
  playerInSquad: boolean | null;
  myConfirmation: SquadConfirmation | null;
  myDeclineReason: DeclineReason | null;
  myDeclineNote: string | null;
  squadCount: number | null;
  showTracking: boolean;
  activeStatsHolder: string | null;
  liveScore: { us: number; opponent: number } | null;
  liveQuarter: number | null;
  refreshingLive: boolean;
  onRefreshLive: () => void;
  onResponded: () => void;
}) {
  const [declineSheetOpen, setDeclineSheetOpen] = useState(false);
  const [reconfirmSheetOpen, setReconfirmSheetOpen] = useState(false);
  const [responding, setResponding] = useState(false);
  const [respondError, setRespondError] = useState<string | null>(null);

  const now = new Date();
  // Lokales Datum, NICHT toISOString().slice(0,10) (das ist UTC — würde in
  // den ersten ein bis zwei Stunden nach Mitternacht fälschlich noch den
  // Vortag liefern und den Spieltag verfehlen).
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isMatchday = game.game_date === todayIso;
  const kickedOff = hasKickedOff(game.game_date, game.game_time, now);
  // Ob wirklich schon getrackt wird, ist ein stärkeres "das Spiel läuft"-
  // Signal als die geplante Anpfiffzeit — die Uhrzeit ist oft nur eine grobe
  // Angabe, und wer schon tracked, hat faktisch schon angepfiffen (siehe
  // "wieso sehe ich kein Live-Ticker, obwohl getrackt wird" — vorher zeigte
  // die Karte bis zur geplanten Uhrzeit weiter "trackt gerade" +
  // "Tracking übernehmen" statt der Anzeigetafel).
  const live = showTracking && isMatchday && (kickedOff || !!activeStatsHolder);
  const matchdayPreKickoff = showTracking && isMatchday && !live;

  const isPending = !game.squad_published;
  const isNotInSquad = role === 'player' && game.squad_published && !playerInSquad && myConfirmation !== 'declined';
  const isNominated = role === 'player' && game.squad_published && !!playerInSquad && myConfirmation === 'pending';
  const isAccepted = role === 'player' && game.squad_published && !!playerInSquad && myConfirmation === 'confirmed';
  const isDeclined = role === 'player' && game.squad_published && myConfirmation === 'declined';

  // Offene Rückmeldung + Spiel < 24 Std entfernt: Countdown wird zur
  // Akzentfarbe (PROMPT.md "Erinnerungen") — keine Frist, nur ein Hinweis.
  const minutesUntilKickoff = Math.ceil((new Date(`${game.game_date}T${game.game_time}`).getTime() - Date.now()) / 60_000);
  const hotCountdown = isNominated && minutesUntilKickoff > 0 && minutesUntilKickoff < 24 * 60;

  async function respond(confirmed: boolean, reason?: DeclineReason | null, note?: string) {
    setResponding(true);
    setRespondError(null);
    try {
      const { error } = await supabase.rpc('respond_to_squad', {
        p_game_id: game.id,
        p_confirmed: confirmed,
        p_decline_reason: reason ?? null,
        p_decline_note: note?.trim() || null
      });
      if (error) throw error;
      setDeclineSheetOpen(false);
      setReconfirmSheetOpen(false);
      onResponded();
    } catch {
      setRespondError('Konnte nicht gespeichert werden. Bitte nochmal versuchen.');
    } finally {
      setResponding(false);
    }
  }

  return (
    <section
      className={`card relative overflow-hidden ${
        isDeclined ? '!border-to-dangerFrame' : isMatchday ? '!border-to-borderMatchday' : ''
      }`}
    >
      <svg viewBox="0 0 260 260" width="260" height="260" className="pointer-events-none absolute -right-[120px] -top-20" aria-hidden="true">
        <circle cx="130" cy="130" r="120" fill="none" stroke="var(--to-text)" strokeWidth="1" opacity="0.07" />
        <circle cx="130" cy="130" r="46" fill="none" stroke="var(--to-accent)" strokeWidth="1.5" opacity="0.45" />
        <line x1="130" y1="0" x2="130" y2="260" stroke="var(--to-text)" strokeWidth="1" opacity="0.07" />
      </svg>

      <div className="relative flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2.5">
          <span className={game.is_home ? 'badge-home' : 'badge-away'}>{game.is_home ? 'HEIM' : 'AUSWÄRTS'}</span>
          <CountBadge game={game} hot={hotCountdown} />
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="to-display-md text-to-text">
            {game.game_date === todayIso ? 'HEUTE' : fmtDateBadge(game.game_date)}
          </p>
          <p className="to-data text-sm text-to-text2">
            {fmtTime(game.game_time)} Uhr
            {meetingPoints(game)[0]?.time && ` · Treffpunkt ${fmtTime(meetingPoints(game)[0].time!)}`}
          </p>
          <p className="mt-0.5 text-[18px] font-semibold leading-[1.25] -tracking-[0.01em] text-to-text">vs. {game.opponent}</p>
        </div>

        {meetingPoints(game).length > 0 && (
          <div className="rounded-to-md border border-to-divider bg-to-bg px-3.5 py-2.5">
            <p className="to-label">Treffpunkt</p>
            {meetingPoints(game).map((m) => (
              <p key={m.label} className="mt-0.5 text-sm text-to-text2">
                {m.time && <span className="font-semibold text-to-text">{fmtTime(m.time)} Uhr</span>}
                {m.time && ' · '}
                {m.label}
                {m.place ? `, ${m.place}` : ''}
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-col">
          <a href={mapsUrl(game.location)} target="_blank" rel="noopener noreferrer" className="flex min-h-[48px] items-center gap-3">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-text3" aria-hidden="true">
              <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            <span className="flex-1 text-[15px] text-to-text">{game.location}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-to-accent">
              Route
              <RouteIcon />
            </span>
          </a>
          <div className="flex min-h-10 items-center gap-3">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-text3" aria-hidden="true">
              <path d="M8 3c0 2 1.8 3.5 4 3.5S16 5 16 3l3 1.2v4c-1 .5-1.5 1.5-1.5 3V21h-11v-9.8c0-1.5-.5-2.5-1.5-3v-4z" />
            </svg>
            <span className="flex-1 text-[15px] text-to-text2">Trikotsatz</span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-to-pill bg-to-surface2 px-2.5 text-[13px] font-semibold text-to-text">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  benoetigterSatz(game) === 'weiss' ? 'bg-to-text' : 'border border-to-textDisabled bg-to-surface'
                }`}
              />
              {benoetigterSatz(game) === 'weiss' ? 'Weiß' : 'Schwarz'}
            </span>
          </div>
        </div>

        {isDeclined && (
          <div className="flex items-start gap-2.5 rounded-to-lg border border-to-dangerFrame bg-to-dangerSoft px-3.5 py-3 text-[12px] leading-relaxed text-to-text2">
            <SmallCrossIcon />
            <span>
              <strong className="text-to-text">Du bist abgesagt.</strong> Dein Trainer wurde informiert. Solange der
              Kader noch offen ist, kannst du jederzeit wieder zusagen.
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3.5 border-t border-to-border pt-4">
          {/* Sobald das Spiel läuft, tritt die Live-Anzeigetafel unten an die
              Stelle der Kader-Rückmeldung — die ist dann nicht mehr die
              Aufgabe der Karte (Vorlage: "live" zeigt nur noch Tafel +
              Live-Ticker öffnen, keine Zugesagt/Abgesagt-Zeile mehr). */}
          {!live && isPending && (
            <div className="flex items-center gap-2 text-[15px] font-semibold text-to-text2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-to-text3" />
              Kader noch nicht veröffentlicht
            </div>
          )}
          {!live && isPending && (
            <p className="-mt-2 text-[13px] text-to-text3">Du bekommst eine Nachricht, sobald er steht.</p>
          )}

          {!live && isNotInSquad && (
            <div className="flex items-center justify-between gap-2.5">
              <span className="flex items-center gap-2 text-[15px] font-semibold text-to-text2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-to-text3" />
                Diesmal nicht im Kader
              </span>
              <KaderAnsehenLink />
            </div>
          )}

          {!live && isNominated && (
            <>
              <div className="flex items-center justify-between gap-2.5">
                <span className="flex items-center gap-1.5 text-[15px] font-semibold text-to-accent">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  Du bist im Kader
                </span>
                <KaderAnsehenLink />
              </div>
              {respondError && <p className="text-xs text-to-dangerText">{respondError}</p>}
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" disabled={responding} className="btn-primary !h-[50px] text-[15px]" onClick={() => respond(true)}>
                  Zusagen
                </button>
                <button
                  type="button"
                  disabled={responding}
                  className="btn-secondary !h-[50px] text-[15px] font-medium"
                  onClick={() => setDeclineSheetOpen(true)}
                >
                  Absagen
                </button>
              </div>
            </>
          )}

          {!live && isAccepted && (
            <div className="flex items-center justify-between gap-2.5">
              {matchdayPreKickoff ? (
                <span className="to-data inline-flex h-[46px] items-center gap-2 rounded-to-pill border border-to-borderMatchday bg-to-accentSoft px-4 text-sm font-semibold text-to-accent">
                  <SmallCheckIcon />
                  Zugesagt
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeclineSheetOpen(true)}
                  className="inline-flex h-[46px] items-center gap-2 rounded-to-pill border border-to-borderMatchday bg-to-accentSoft px-4 text-sm font-semibold text-to-accent"
                >
                  <SmallCheckIcon />
                  Zugesagt
                  <span className="to-data ml-0.5 text-[8px] tracking-[0.1em] text-to-text3">ÄNDERN</span>
                </button>
              )}
              <KaderAnsehenLink />
            </div>
          )}

          {!live && isDeclined && (
            <>
              <div className="flex items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => setReconfirmSheetOpen(true)}
                  className="inline-flex h-[46px] items-center gap-2 rounded-to-pill border border-to-dangerFrame bg-to-dangerSoft px-4 text-sm font-semibold text-to-dangerText"
                >
                  <SmallCrossIcon />
                  Abgesagt{myDeclineReason ? ` · ${DECLINE_REASON_LABELS[myDeclineReason]}` : ''}
                  <span className="to-data ml-0.5 text-[8px] tracking-[0.1em] text-to-text3">DOCH DABEI?</span>
                </button>
                <KaderAnsehenLink />
              </div>
              {respondError && <p className="text-xs text-to-dangerText">{respondError}</p>}
            </>
          )}

          {!live && role !== 'player' && (
            <div className="flex items-center justify-between gap-2.5">
              {!game.squad_published ? null : squadCount !== null ? (
                <span className="pill pill-ok">
                  {squadCount}/{MAX_SQUAD_SIZE} im Kader
                </span>
              ) : null}
              {game.squad_published && <KaderAnsehenLink />}
            </div>
          )}

          {matchdayPreKickoff && !activeStatsHolder && (
            <>
              <Link to={`/stats/${game.id}`} className="btn-primary flex !h-[54px] w-full items-center justify-center gap-2 text-base">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 19V9" />
                  <path d="M10 19V5" />
                  <path d="M16 19v-7" />
                  <path d="M21 19H3" />
                </svg>
                Statistiken tracken
              </Link>
              <p className="-mt-1 text-center text-[13px] text-to-text3">
                Eine Person trackt – alle anderen sehen den Live-Ticker.
              </p>
            </>
          )}
          {matchdayPreKickoff && activeStatsHolder && (
            <div className="flex items-center justify-between gap-2 rounded-to-md bg-to-bg px-3.5 py-2.5">
              <p className="text-xs text-to-text2">
                <span className="font-semibold text-to-text">{activeStatsHolder}</span> trackt gerade
              </p>
              <Link to={`/stats/${game.id}`} className="shrink-0 text-xs font-semibold text-to-accent">
                Tracking übernehmen
              </Link>
            </div>
          )}

          {live && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-to-lg bg-to-bg px-4 py-3.5">
                <span className="flex flex-col gap-1">
                  <span className="to-label">TBW</span>
                  <span className="to-data text-[30px] font-semibold leading-none text-to-accent">
                    {activeStatsHolder ? (liveScore?.us ?? 0) : '–'}
                  </span>
                </span>
                <span className="flex flex-col items-center gap-1">
                  <span className="to-data inline-flex items-center gap-1.5 text-[11px] tracking-wide text-to-dangerText">
                    <span className="h-1.5 w-1.5 rounded-full bg-to-danger" />
                    LIVE
                  </span>
                  {activeStatsHolder && (
                    <span className="to-data text-[13px] text-to-text2">Q{liveQuarter ?? 1}</span>
                  )}
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="to-label">{teamAbbrev(game.opponent)}</span>
                  <span className="to-data text-[30px] font-semibold leading-none text-to-text">
                    {activeStatsHolder ? (liveScore?.opponent ?? 0) : '–'}
                  </span>
                </span>
              </div>
              {activeStatsHolder ? (
                <Link to={`/stats/${game.id}`} className="btn-secondary flex !h-[50px] w-full items-center justify-center text-[15px]">
                  Live-Ticker öffnen
                </Link>
              ) : (
                <Link to={`/stats/${game.id}`} className="btn-primary flex !h-[54px] w-full items-center justify-center text-base">
                  Statistiken tracken
                </Link>
              )}
              <button
                type="button"
                disabled={refreshingLive}
                onClick={onRefreshLive}
                className="self-center text-[11px] font-semibold uppercase tracking-wide text-to-text3 disabled:opacity-40"
              >
                {refreshingLive ? 'Aktualisiert…' : 'Aktualisieren'}
              </button>
            </>
          )}
        </div>
      </div>

      {declineSheetOpen && (
        <SquadDeclineSheet
          busy={responding}
          error={respondError}
          published={game.squad_published}
          onCancel={() => setDeclineSheetOpen(false)}
          onSend={(reason, note) => respond(false, reason, note)}
        />
      )}
      {reconfirmSheetOpen && (
        <SquadReconfirmSheet
          busy={responding}
          error={respondError}
          onCancel={() => setReconfirmSheetOpen(false)}
          onConfirm={() => respond(true)}
        />
      )}
    </section>
  );
}
