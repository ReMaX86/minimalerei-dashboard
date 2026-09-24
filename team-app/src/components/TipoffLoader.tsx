// Ladeanimation "Dribbling" — Element 16, Vorlage:
// docs/design/tipoff-design/elements/16-ladeanimation/. Markup + CSS 1:1
// aus der Referenz übernommen (CSS liegt in index.css). Einziger Baustein
// für alle Ladezustände in der App — ersetzt das bisherige to-mark-ring-pulse.
export type TipoffLoaderSize = 'page' | 'card' | 'inline';

interface TipoffLoaderProps {
  size?: TipoffLoaderSize;
  /** Mono-Zeile "LÄDT" darunter (nur für size="page" vorgesehen). */
  label?: boolean;
  /** Steht daneben schon ein Text ("Wird gespeichert"), doppelt aria-live vermeiden. */
  hideFromScreenReaders?: boolean;
  className?: string;
}

export function TipoffLoader({ size = 'page', label, hideFromScreenReaders, className }: TipoffLoaderProps) {
  const loader = (
    <span
      className={`tipoff-loader tipoff-loader--${size}${className ? ` ${className}` : ''}`}
      role={hideFromScreenReaders ? undefined : 'status'}
      aria-live={hideFromScreenReaders ? undefined : 'polite'}
      aria-label={hideFromScreenReaders ? undefined : 'Lädt'}
      aria-hidden={hideFromScreenReaders ? 'true' : undefined}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <ellipse className="tl-shadow" cx="50" cy="86" rx="20" ry="5" />
        <g className="tl-move">
          <g className="tl-squash">
            <g className="tl-spin">
              <circle className="tl-ball" cx="50" cy="40" r="19" />
              <path className="tl-seam" d="M31 40h38" />
              <path className="tl-seam" d="M50 21v38" />
              <path className="tl-seam tl-curve" d="M37 27c7 8 7 18 0 26" />
              <path className="tl-seam tl-curve" d="M63 27c-7 8-7 18 0 26" />
            </g>
          </g>
        </g>
      </svg>
    </span>
  );

  if (!label) return loader;

  return (
    <span className="tl-block">
      {loader}
      <span className="tl-label" aria-hidden="true">
        LÄDT
      </span>
    </span>
  );
}
