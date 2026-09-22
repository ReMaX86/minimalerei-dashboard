import tipoffMarkVolt from '../assets/tipoff-mark-volt.svg';

export interface TeamOption {
  name: string;
  squad: string;
}

// Team-Pille — DESIGN.md-Ergänzung (elements/01-start-header/PROMPT.md
// Abschnitt A): bei genau einem Team reine Anzeige, bei mehreren ein Button
// mit Pfeil, der (später) eine Team-Auswahl öffnet. Die Auswahl selbst gibt
// es noch nicht — die Komponente wechselt aber schon automatisch anhand von
// `teams.length`, damit später nur die Auswahl selbst nachgerüstet werden muss.
export function TeamPill({ teams, onOpenSwitcher }: { teams: TeamOption[]; onOpenSwitcher?: () => void }) {
  const current = teams[0];
  if (!current) return null;

  const content = (
    <>
      <img src={tipoffMarkVolt} alt="" className="h-6 w-6 shrink-0" aria-hidden="true" />
      <span className="text-sm font-semibold leading-none text-to-text">{current.name}</span>
      <span className="text-sm leading-none text-to-text2">{current.squad}</span>
    </>
  );

  if (teams.length > 1) {
    return (
      <button
        type="button"
        aria-label="Team wechseln"
        onClick={onOpenSwitcher}
        className="flex h-11 items-center gap-2.5 rounded-to-pill border border-to-line bg-to-surface py-0 pl-2.5 pr-3.5 cursor-pointer"
      >
        {content}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-text2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    );
  }

  return <div className="flex h-11 items-center gap-2.5 rounded-to-pill border border-to-line bg-to-surface py-0 pl-2.5 pr-4">{content}</div>;
}
