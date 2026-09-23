import { useState } from 'react';
import { createPortal } from 'react-dom';
import { SKILL_OPTIONS } from '../types/database';

const MAX_STRENGTHS = 3;

function splitSkill(skill: string): [string, string] {
  const m = skill.match(/^(.*)\s\((.*)\)$/);
  return m ? [m[1], m[2]] : [skill, ''];
}

// Blatt „Stärken" (Element 11, Admin-only) — feste Auswahl aus den elf
// SKILL_OPTIONS, höchstens drei gleichzeitig. Die Drei ist eine Annahme aus
// der Vorlage; SKILL_OPTIONS erlaubt technisch beliebig viele, hier wird
// die Grenze bewusst nur in diesem Blatt durchgesetzt.
export function StrengthsPicker({
  playerName,
  initialSelected,
  busy,
  onSave,
  onCancel
}: {
  playerName: string;
  initialSelected: string[];
  busy: boolean;
  onSave: (skills: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const atCap = selected.length >= MAX_STRENGTHS;

  function toggle(skill: string) {
    setSelected((prev) => (prev.includes(skill) ? prev.filter((s) => s !== skill) : prev.length < MAX_STRENGTHS ? [...prev, skill] : prev));
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-[24px] border border-to-line bg-to-surface p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto h-1 w-9 rounded-full bg-to-line" />

        <div className="flex flex-col gap-1">
          <h2 className="to-display-sm text-to-text">Stärken</h2>
          <p className="text-[13px] text-to-text3">{playerName} · höchstens drei auswählen</p>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="to-label flex-1">AUSGEWÄHLT</span>
            <span className="to-data text-[11px] text-to-text3">
              {selected.length}/{MAX_STRENGTHS}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SKILL_OPTIONS.map((skill) => {
              const on = selected.includes(skill);
              const locked = !on && atCap;
              const [head, sub] = splitSkill(skill);
              return (
                <button
                  key={skill}
                  type="button"
                  disabled={locked}
                  onClick={() => toggle(skill)}
                  className={`inline-flex h-9 items-baseline gap-1.5 rounded-to-pill px-3.5 text-[15px] font-semibold ${
                    on
                      ? 'bg-to-accent text-to-onAccent'
                      : 'border border-to-line font-medium text-to-text2'
                  } ${locked ? 'opacity-45' : ''}`}
                >
                  {head}
                  <em className={`text-[13px] font-normal not-italic ${on ? 'text-to-onAccent/70' : 'text-to-textDisabled'}`}>{sub}</em>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button type="button" disabled={busy} onClick={() => onSave(selected)} className="btn-primary !h-[52px] text-[15px]">
            {busy ? 'Speichere…' : 'Speichern'}
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
