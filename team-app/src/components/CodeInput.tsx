import { useRef } from 'react';

// Zugangscode-Eingabe — DESIGN.md §5 "Code-Eingabe": Kästen sind nur
// Darstellung, ein einziges echtes <input> (transparent darüber) hält den
// eigentlichen Wert. Die Mockup-Vorgabe geht von 6 Zeichen (3+3) aus — echte
// Codes sind aber "3 Buchstaben + 2 Ziffern" (z. B. "FIN82", siehe
// generate_access_code in supabase/migrations/0001_init.sql), deshalb hier
// 3+2 statt 3+3, mit optionaler Erweiterung falls ein Code doch länger ist
// (seltener Kollisions-Fallback in derselben Funktion).
export function CodeInput({
  id,
  value,
  onChange,
  maxLength = 8,
  autoFocus
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const secondGroupLen = Math.max(2, value.length - 3);

  const boxes = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => {
      const pos = from + i;
      const ch = value[pos] ?? '';
      const active = pos === value.length;
      const filled = !!ch;
      return (
        <div
          key={pos}
          className={`code-box ${filled ? 'code-box-filled' : ''} ${active ? 'code-box-active' : ''}`}
        >
          {ch}
          {active && <span className="ml-0.5 h-6 w-0.5 animate-pulse rounded-sm bg-to-accent" aria-hidden />}
        </div>
      );
    });

  return (
    <div className="relative flex items-center gap-2" onClick={() => inputRef.current?.focus()}>
      <div className="flex items-center gap-2">{boxes(0, 3)}</div>
      <div className="h-0.5 w-2.5 shrink-0 bg-to-line" aria-hidden />
      <div className="flex items-center gap-2">{boxes(3, secondGroupLen)}</div>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="text"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, maxLength))}
        className="absolute inset-0 h-full w-full cursor-pointer border-0 bg-transparent text-base text-transparent caret-transparent opacity-0"
      />
    </div>
  );
}
