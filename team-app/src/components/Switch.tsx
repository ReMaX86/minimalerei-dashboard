// Schalter — DESIGN.md-Ergänzung (docs/design/tipoff-design/elements/
// 01-start-header/start-header.html .switch): 44×26px Pille, Daumen 20px,
// --to-line/--to-text-3 aus, --to-accent/--to-on-accent an.
export function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[26px] w-11 shrink-0 items-center rounded-to-pill p-[3px] transition-colors ${
        on ? 'bg-to-accent' : 'bg-to-line'
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full transition-transform ${on ? 'translate-x-[18px] bg-to-onAccent' : 'translate-x-0 bg-to-text3'}`}
      />
    </span>
  );
}
