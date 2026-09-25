import { useState } from 'react';
import { createPortal } from 'react-dom';
import { DECLINE_REASON_LABELS, type DeclineReason } from '../types/database';

// Gemeinsam für Startseite (NextGameCard) und "Spiele & Kader" (eigene
// Zeile in NextGameSquadCard) — beide hängen an derselben respond_to_squad()
// RPC und demselben DeclineReason-Vokabular, im Gegensatz zum Training
// (eigene training_rsvps-Tabelle, eigener TrainingDeclineReason), das
// deshalb bewusst seine eigene ReasonSheet-Komponente behält.

const DECLINE_REASONS: DeclineReason[] = ['krank', 'arbeit_schule', 'urlaub', 'anderer_grund'];

function WarnIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 8v5M12 16.5v.01" />
      <path d="M10.3 3.9L2.5 18a1.7 1.7 0 0 0 1.5 2.5h16a1.7 1.7 0 0 0 1.5-2.5L13.7 3.9a1.7 1.7 0 0 0-3 0z" />
    </svg>
  );
}

export function SquadDeclineSheet({
  busy,
  error,
  published,
  onCancel,
  onSend
}: {
  busy: boolean;
  error: string | null;
  published: boolean;
  onCancel: () => void;
  onSend: (reason: DeclineReason | null, note: string) => void;
}) {
  const [reason, setReason] = useState<DeclineReason | null>(null);
  const [note, setNote] = useState('');

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-t-[24px] border border-to-line bg-to-surface2 p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[19px] font-semibold -tracking-[0.01em] text-to-text">Doch nicht dabei?</h2>

        {published ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-to-lg border border-to-vacationFrame bg-to-vacationSoft px-3.5 py-3 text-[12px] leading-relaxed text-to-text2">
            <WarnIcon className="mt-0.5 shrink-0 text-to-vacation" />
            <span>
              <strong className="text-to-text">Der Kader steht schon.</strong> Dein Trainer muss jemanden
              nachnominieren – schreib kurz dazu, warum es nicht klappt.
            </span>
          </div>
        ) : (
          <p className="mt-1 text-sm text-to-text2">
            Dein Trainer bekommt sofort eine Meldung. Solange der Kader offen ist, kannst du danach wieder zusagen.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Grund (optional)">
          {DECLINE_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason((prev) => (prev === r ? null : r))}
              className={`h-[38px] rounded-to-pill border px-3.5 text-sm ${
                reason === r ? 'border-to-accent bg-to-accent font-semibold text-to-onAccent' : 'border-to-line text-to-text'
              }`}
            >
              {DECLINE_REASON_LABELS[r]}
            </button>
          ))}
        </div>

        <textarea
          className="mt-4 min-h-16 w-full resize-none rounded-to-lg border border-to-line bg-to-bg p-3.5 text-[15px] text-to-text placeholder:text-to-text3"
          placeholder="Grund (optional) – z. B. krank, Arbeit, Verletzung"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {error && <p className="mt-3 text-xs text-to-dangerText">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={busy}
            className="h-[48px] rounded-to-pill bg-to-danger text-[15px] font-semibold text-[#120507] disabled:opacity-60"
            onClick={() => onSend(reason, note)}
          >
            {busy ? 'Sende…' : 'Absagen und Trainer informieren'}
          </button>
          <button type="button" disabled={busy} className="btn-secondary !h-[48px] text-[15px]" onClick={onCancel}>
            Doch, ich bin dabei
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function SquadReconfirmSheet({
  busy,
  error,
  onCancel,
  onConfirm
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-t-[24px] border border-to-line bg-to-surface2 p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[19px] font-semibold -tracking-[0.01em] text-to-text">Doch wieder dabei?</h2>
        <p className="mt-1 text-sm text-to-text2">
          Du stehst danach wieder als zugesagt in der Liste, dein Trainer wird informiert. Ob du im Kader landest,
          entscheidet weiterhin er.
        </p>

        {error && <p className="mt-3 text-xs text-to-dangerText">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button type="button" disabled={busy} className="btn-primary !h-[48px] text-[15px]" onClick={onConfirm}>
            {busy ? 'Sende…' : 'Wieder zusagen'}
          </button>
          <button type="button" disabled={busy} className="btn-secondary !h-[48px] text-[15px]" onClick={onCancel}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
