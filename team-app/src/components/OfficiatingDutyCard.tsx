import { useState } from 'react';
import { Link } from 'react-router-dom';
import { daysUntil, fmtDateBadge, fmtTime, mapsUrl } from '../lib/format';
import { officiatingGameLabel, type OfficiatingGame, type OfficiatingTask, type OfficiatingTaskType, type Player } from '../types/database';

// Kompakte Rollen-Bezeichnung nur für den Kopf dieser Karte (Vorlage
// docs/design/tipoff-design/elements/05-kampfgericht/PROMPT.md) — an allen
// anderen Stellen (Trainer-Übersicht, Admin) bleibt OFFICIATING_TASK_LABELS
// mit dem vollen Namen ("24-Sekunden-Uhr", "Zeit & Punkte") unverändert.
const ROLE_LABEL: Record<OfficiatingTaskType, string> = {
  uhr: '24-Sek.-Uhr',
  anschreiber: 'Anschreiben',
  zeit: 'Zeit/Punkte'
};

const ALL_TASK_TYPES: OfficiatingTaskType[] = ['uhr', 'anschreiber', 'zeit'];

// Countdown-Pille — rein zeitbasiert, siehe PROMPT.md "Zugeklappt":
// > 14 Tage aufgerundete Wochen, 2-14 Tage in Tagen, sonst morgen/heute
// (Stunden/Minuten) bzw. "LÄUFT" nach Erreichen der Startzeit.
function countdownLabel(dateIso: string, timeIso: string | null, now: Date): string {
  const days = daysUntil(dateIso, now);
  if (days === 0 && timeIso) {
    const target = new Date(`${dateIso}T${timeIso}`);
    const totalMinutes = Math.ceil((target.getTime() - now.getTime()) / 60_000);
    if (totalMinutes <= 0) return 'LÄUFT';
    if (totalMinutes < 60) return `IN ${totalMinutes} MIN`;
    return `IN ${Math.ceil(totalMinutes / 60)} STD`;
  }
  if (days <= 0) return 'HEUTE';
  if (days === 1) return 'MORGEN';
  if (days <= 14) return `IN ${days} TAGEN`;
  return `IN ${Math.ceil(days / 7)} WO.`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

// "In Kalender" — Termin gibt es in der App bisher nirgends zum Download,
// PROMPT.md beschreibt Titel/Ort/Beginn aber ausdrücklich neu ("Erzeugt den
// Termin wie bisher"), deshalb hier neu gebaut: schwebende (TZ-lose) lokale
// Zeit, keine feste Enddauer vorgegeben — 2 Std. als plausible Annahme für
// Kampfgericht-Einsätze. Ist keine Uhrzeit bekannt, wird ein ganztägiger
// Termin erzeugt (siehe Abweichungen in der Chat-Antwort).
function downloadIcs(game: OfficiatingGame, role: string): void {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const [y, m, d] = game.game_date.split('-').map(Number);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tipoff//Kampfgericht//DE', 'BEGIN:VEVENT', `UID:${crypto.randomUUID()}@tipoff`, `DTSTAMP:${stamp}`];
  if (game.game_time) {
    const [h, min] = game.game_time.split(':').map(Number);
    const start = new Date(y, m - 1, d, h, min);
    const end = new Date(start.getTime() + 2 * 60 * 60_000);
    const fmt = (dt: Date) => `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
    lines.push(`DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`);
  } else {
    const end = new Date(y, m - 1, d + 1);
    lines.push(`DTSTART;VALUE=DATE:${game.game_date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${y}${pad(end.getMonth() + 1)}${pad(end.getDate())}`);
  }
  lines.push(
    `SUMMARY:${icsEscape(`Kampfgericht · ${ROLE_LABEL[role as OfficiatingTaskType] ?? role}`)}`,
    `LOCATION:${icsEscape(game.location)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  );
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kampfgericht.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function StopwatchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V9.5" />
      <path d="M9.5 2.5h5" />
      <path d="M12 2.5V6" />
    </svg>
  );
}

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
      className={`shrink-0 text-to-text3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-textDisabled" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
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

export function OfficiatingDutyCard({
  task,
  teammates,
  players,
  overviewHref = '/kampfgericht'
}: {
  task: (OfficiatingTask & { officiating_games: OfficiatingGame }) | null;
  teammates: OfficiatingTask[];
  players: Record<string, Player>;
  overviewHref?: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!task) {
    const tile = (
      <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-to-md bg-to-surface2">
        <StopwatchIcon className="text-to-textDisabled" />
      </span>
    );
    const text = (
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="to-label">KAMPFGERICHT</span>
        <span className="text-[16px] font-semibold -tracking-[0.01em] text-to-text2">Kein Einsatz geplant</span>
        {overviewHref && <span className="text-[13px] text-to-text3">Offene Einsätze ansehen</span>}
      </span>
    );
    if (!overviewHref) {
      return (
        <div className="card flex items-center gap-3.5 !p-[18px]">
          {tile}
          {text}
        </div>
      );
    }
    return (
      <Link to={overviewHref} className="card flex items-center gap-3.5 !p-[18px]">
        {tile}
        {text}
        <ChevronRightIcon />
      </Link>
    );
  }

  const game = task.officiating_games;
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isToday = game.game_date === todayIso;
  const pill = countdownLabel(game.game_date, game.game_time, now);
  const dateLabel = isToday ? 'HEUTE' : fmtDateBadge(game.game_date);
  const whenLine = game.game_time ? `${dateLabel} · ${fmtTime(game.game_time)} UHR` : dateLabel;

  const others = teammates.filter((t) => t.id !== task.id).sort((a, b) => ALL_TASK_TYPES.indexOf(a.task_type) - ALL_TASK_TYPES.indexOf(b.task_type));
  const missing = 3 - teammates.length;

  return (
    <section className={`card overflow-hidden !p-0 ${isToday ? '!border-to-borderMatchday' : ''}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="officiating-duty-body"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-3.5 px-[18px] py-4 text-left ${open ? 'bg-to-surface2' : ''}`}
      >
        <span className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-to-md ${isToday ? 'bg-to-accent' : 'bg-to-surface2'}`}>
          <StopwatchIcon className={isToday ? 'text-to-onAccent' : 'text-to-accent'} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="to-label">KAMPFGERICHT</span>
          <span className="truncate text-[16px] font-semibold -tracking-[0.01em] text-to-text">{ROLE_LABEL[task.task_type]}</span>
          <span className="to-data text-[13px] uppercase text-to-text2">{whenLine}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={`to-data inline-flex h-[22px] items-center rounded-to-pill px-2.5 text-[10px] font-semibold ${
              isToday ? 'bg-to-accentSoft text-to-accent' : 'bg-to-surface2 text-to-text2'
            }`}
          >
            {pill}
          </span>
          <ChevronDownIcon open={open} />
        </span>
      </button>

      {open && (
        <div id="officiating-duty-body" className="flex flex-col gap-3.5 px-[18px] pb-[18px] pt-1">
          <div className="flex flex-col">
            <div className="flex min-h-10 items-center gap-3">
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-text3" aria-hidden="true">
                <circle cx="9" cy="8" r="3.5" />
                <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
                <path d="M18 14c2 .6 3 2.8 3 6" />
              </svg>
              <span className="flex-1 text-[15px] text-to-text">{officiatingGameLabel(game)}</span>
            </div>
            <a href={mapsUrl(game.location)} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-3">
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-text3" aria-hidden="true">
                <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
              <span className="flex-1 text-[15px] text-to-text">{game.location}</span>
              <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-to-accent">
                Route
                <RouteIcon />
              </span>
            </a>
          </div>

          {others.length > 0 && (
            <div className="flex flex-col gap-2 rounded-to-lg bg-to-surface2 p-3.5">
              <span className="to-label">MIT DIR AM TISCH</span>
              <div className="flex flex-col gap-1.5">
                {others.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="to-data w-[88px] shrink-0 text-[11px] text-to-text3">{ROLE_LABEL[t.task_type].toUpperCase()}</span>
                    <span className={t.assigned_player_id ? 'text-to-text' : 'text-to-text3'}>
                      {t.assigned_player_id ? players[t.assigned_player_id]?.name ?? '?' : 'Noch offen'}
                    </span>
                  </div>
                ))}
              </div>
              {missing === 1 && <span className="text-xs text-to-text3">Den dritten Platz stellt ein anderes Team.</span>}
              {missing === 2 && <span className="text-xs text-to-text3">Die übrigen Plätze stellt ein anderes Team.</span>}
            </div>
          )}

          <button
            type="button"
            onClick={() => downloadIcs(game, task.task_type)}
            className="flex h-[46px] w-full items-center justify-center gap-2 rounded-to-lg border border-to-line text-sm font-medium text-to-text"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="3" />
              <path d="M12 11v6" />
              <path d="M9 14h6" />
            </svg>
            In Kalender
          </button>
        </div>
      )}
    </section>
  );
}
