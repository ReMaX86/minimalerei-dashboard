import { TipoffLoader, type TipoffLoaderSize } from './TipoffLoader';

// Ladeanzeige — Element 16 "Ladeanimation" (Vorlage: docs/design/tipoff-design/
// elements/16-ladeanimation/). Der eigentliche Baustein ist TipoffLoader;
// hier nur noch die drei üblichen Einbettungen (Reiterwechsel/Karte/Zeile,
// siehe PROMPT.md §2+§3). Die 200ms/400ms-Regel liegt im useTipoffLoader-Hook,
// den die Aufrufstelle selbst konsultiert (siehe dort) — LoadingSpinner
// rendert bedingungslos, sobald es gerendert wird.
const WRAPPER_CLASS: Record<TipoffLoaderSize, string> = {
  page: 'flex justify-center py-16',
  card: 'flex justify-center py-6',
  inline: ''
};

interface LoadingSpinnerProps {
  size?: TipoffLoaderSize;
  /** Mono-Zeile "LÄDT" darunter — Default an bei size="page", sonst aus. */
  label?: boolean;
}

export function LoadingSpinner({ size = 'page', label = size === 'page' }: LoadingSpinnerProps) {
  if (size === 'inline') {
    return <TipoffLoader size="inline" />;
  }
  return (
    <div className={WRAPPER_CLASS[size]}>
      <TipoffLoader size={size} label={label} />
    </div>
  );
}
