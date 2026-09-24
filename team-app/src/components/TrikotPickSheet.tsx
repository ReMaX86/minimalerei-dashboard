import { useState } from 'react';
import { createPortal } from 'react-dom';

export interface PickOption {
  id: string; // Spieler-ID, oder der Sentinel 'hall' für "In der Halle abgelegt"
  avatarLabel: string; // Initialen, oder "—" für den Hallen-Sentinel
  name: string;
  meta?: string; // "1× GEWASCHEN" | "TRAINER" | "DU" | "NIEMAND" | ''
}

// Ein Blatt, drei Verwendungen in Trikots.tsx (Element 13): "Wer übernimmt
// das Waschen?" (Kann-nicht/Anderen-bestimmen), "Wer hat den Satz jetzt?"
// (Übergabe-Kacheln) und "Wer hat das Set dann?" (Nachfrage → Nein). Rein
// präsentational — welche Optionen/Meta-Texte/CTA/Aktion dahinterstecken,
// entscheidet der jeweilige Aufrufer, siehe PROMPT.md "die Pille
// VORSCHLAG" (immer auf `defaultId`, in allen drei Verwendungen).
export function TrikotPickSheet({
  title,
  subtitle,
  options,
  defaultId,
  cta,
  busy,
  onConfirm,
  onCancel
}: {
  title: string;
  subtitle: string;
  options: PickOption[];
  defaultId: string;
  cta: string;
  busy: boolean;
  onConfirm: (id: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(defaultId);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-[24px] border border-to-line bg-to-surface p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />

        <div className="flex flex-col gap-1.5">
          <h2 className="to-display-sm text-to-text">{title}</h2>
          <p className="text-[13px] leading-relaxed text-to-text3">{subtitle}</p>
        </div>

        <div className="flex flex-col">
          {options.map((o) => {
            const isDefault = o.id === defaultId;
            const isOn = o.id === selected;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelected(o.id)}
                className="flex min-h-[56px] items-center gap-3 border-b border-to-surface2 py-2 text-left last:border-b-0"
              >
                <span className="to-data flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-to-surface2 text-xs text-to-text2">
                  {o.avatarLabel}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold -tracking-[0.01em] text-to-text">{o.name}</span>
                    {isDefault && (
                      <span className="to-data inline-flex h-[18px] shrink-0 items-center rounded-to-pill bg-to-accentSoft px-1.5 text-[8px] font-semibold text-to-accent">
                        VORSCHLAG
                      </span>
                    )}
                  </span>
                  {o.meta && <span className="to-data text-[10px] text-to-textDisabled">{o.meta}</span>}
                </span>
                <span
                  className={`h-[26px] w-[26px] shrink-0 rounded-full border-[1.5px] ${
                    isOn ? 'border-to-accent bg-to-accent' : 'border-to-line'
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <button type="button" disabled={busy} onClick={() => onConfirm(selected)} className="btn-primary !h-[52px] text-[15px]">
            {busy ? 'Speichere…' : cta}
          </button>
          <button type="button" disabled={busy} onClick={onCancel} className="h-11 text-sm font-medium text-to-text2">
            Abbrechen
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
