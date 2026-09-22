import { useEffect, useState } from 'react';

// Countdown — DESIGN.md §5: Mono 30px/600 Volt, Einheiten (T/STD/MIN)
// 11px --to-text-3, auf --to-bg-Fläche innerhalb der Karte.
export function Countdown({ gameDate, gameTime }: { gameDate: string; gameTime: string }) {
  const target = new Date(`${gameDate}T${gameTime}`).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const diffMs = Math.max(0, target - now);
  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="flex items-center justify-between gap-3 rounded-to-md bg-to-bg px-3.5 py-3">
      <div className="to-data flex items-baseline gap-1.5 text-to-accent">
        <Unit value={pad(days)} label="T" />
        <Unit value={pad(hours)} label="STD" />
        <Unit value={pad(minutes)} label="MIN" />
      </div>
      <span className="text-right text-xs leading-tight text-to-text2">
        bis zum
        <br />
        Sprungball
      </span>
    </div>
  );
}

function Unit({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-[11px] text-to-text3">{label}</span>
    </span>
  );
}
