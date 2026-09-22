// Ladeanzeige — dasselbe Zeichen wie der Splash (docs/design/tipoff-design/
// elements/02-logo-animation/, Variante 3), hier nur der pulsierende Ring
// ohne Punkt und ohne die volle Einstiegs-Animation.
export function LoadingSpinner() {
  return (
    <div className="flex justify-center py-16">
      <svg className="to-mark-ring-pulse h-8 w-8" viewBox="0 0 100 100" aria-hidden="true">
        <path className="to-mark-ring" d="M64.91 34.7 A26 26 0 1 1 35.09 34.7" />
      </svg>
    </div>
  );
}
