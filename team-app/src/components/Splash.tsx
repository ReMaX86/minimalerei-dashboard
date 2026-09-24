import { useEffect, useState } from 'react';

const ENTRANCE_MS = 1150;
const REDUCED_ENTRANCE_MS = 300;
const HOLD_MS = 1500;
const FADE_MS = 200;

// Kaltstart-Splash — Variante 3 "Shot Clock" aus
// docs/design/tipoff-design/elements/02-logo-animation/. Gesteuert von
// App.tsx (dort auch das "nur einmal pro Sitzung"-Flag). `ready` verzögert
// nie den Start der Animation, nur wie lange sie nach der Haltezeit
// weiterpulsiert.
export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [reducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [pulsing, setPulsing] = useState(false);
  const [held, setHeld] = useState(false);
  const [fading, setFading] = useState(false);

  // Der Einstieg läuft immer vollständig durch (oder, bei reduzierter
  // Bewegung, das fertige Zeichen steht 300ms) — danach pulsiert das
  // Zeichen sichtbar weiter.
  useEffect(() => {
    const timer = setTimeout(() => setPulsing(true), reducedMotion ? REDUCED_ENTRANCE_MS : ENTRANCE_MS);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  // Das fertige Zeichen bleibt danach noch 1,5s stehen, unabhängig davon, ob
  // die Daten schon da sind — erst danach darf überhaupt ausgeblendet
  // werden.
  useEffect(() => {
    if (!pulsing) return;
    const timer = setTimeout(() => setHeld(true), HOLD_MS);
    return () => clearTimeout(timer);
  }, [pulsing]);

  // Sind die Haltezeit vorbei UND die Daten schon da: sofort ausblenden;
  // sonst wartet dieser Effekt (über die `ready`-Abhängigkeit) einfach
  // weiter, während das Zeichen pulsiert.
  useEffect(() => {
    if (!held || !ready) return;
    setFading(true);
    const timer = setTimeout(onDone, FADE_MS);
    return () => clearTimeout(timer);
  }, [held, ready, onDone]);

  return (
    <div className={`to-splash-overlay ${fading ? 'to-splash-overlay-fading' : ''}`} aria-hidden="true">
      <svg className={`to-splash-mark ${pulsing ? 'to-splash-pulsing' : ''}`} viewBox="0 0 100 100">
        <path className={`to-mark-ring ${reducedMotion ? '' : 'to-splash-ring'}`} d="M64.91 34.7 A26 26 0 1 1 35.09 34.7" />
        <circle className={`to-mark-dot ${reducedMotion ? '' : 'to-splash-dot'}`} cx="50" cy="19" r="9.5" />
      </svg>
      <span className={`to-splash-wordmark ${reducedMotion ? 'to-splash-wordmark-static' : ''}`}>tipoff</span>
    </div>
  );
}
