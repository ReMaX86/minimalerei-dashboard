import type { ChangeEvent, ReactNode } from 'react';
import { fmtTime } from '../lib/format';

// iOS Safari renders the native date/time picker's internal content (segment
// placeholders + calendar/clock icon) inside a shadow root that ignores the
// host input's own CSS width — it can spill past the field's border and even
// past the card, and neither width/min-width nor overflow-hidden on the
// input itself stops it (confirmed on real devices after three attempts).
// The reliable fix is to stop letting the native control paint at all: keep
// it functional but fully transparent, absolutely positioned (inset-0) so
// its box is forced to the wrapper's size regardless of internal content,
// and render our own plain-div "fake input" underneath for the visible
// value — a normal box that always respects width/overflow correctly.
function fmtDateDisplay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  min?: string;
}

function FieldShell({
  label,
  display,
  placeholder,
  children
}: {
  label: string;
  display: string;
  placeholder: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs">
      <span className="font-semibold text-tbw-ink/50">{label}</span>
      <span className="relative mt-1 block overflow-hidden rounded-2xl">
        {children}
        <span className={`input pointer-events-none block ${display ? '' : 'text-tbw-ink/40'}`}>
          {display || placeholder}
        </span>
      </span>
    </label>
  );
}

export function DateField({ label, value, onChange, required, min }: FieldProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  return (
    <FieldShell label={label} display={value ? fmtDateDisplay(value) : ''} placeholder="Datum wählen">
      <input
        type="date"
        required={required}
        min={min}
        className="absolute inset-0 h-full w-full opacity-0"
        value={value}
        onChange={handleChange}
      />
    </FieldShell>
  );
}

export function TimeField({ label, value, onChange, required }: FieldProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  return (
    <FieldShell label={label} display={value ? fmtTime(value) : ''} placeholder="Uhrzeit wählen">
      <input
        type="time"
        required={required}
        className="absolute inset-0 h-full w-full opacity-0"
        value={value}
        onChange={handleChange}
      />
    </FieldShell>
  );
}
