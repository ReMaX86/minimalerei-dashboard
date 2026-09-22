import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ErrorNote } from '../components/ErrorNote';
import { CodeInput } from '../components/CodeInput';
import { useScrollResetOnChange } from '../hooks/useScrollResetOnChange';
import { IconCalendar, IconTeam, IconJersey, IconClipboard } from '../components/NavIcons';

type Step = 'intro' | 'welcome' | 'trainer-login' | 'trainer-forgot-password' | 'player-code';

const INTRO_SLIDES = [
  {
    Icon: IconCalendar,
    title: 'Spielplan & Training',
    text: 'Alle Termine auf einen Blick — beim Training mit einem Klick zu- oder absagen.'
  },
  {
    Icon: IconTeam,
    title: 'Spiele',
    text: 'Sofort sehen, ob du beim nächsten Spiel dabei bist.'
  },
  {
    Icon: IconJersey,
    title: 'Trikots & Kampfgericht',
    text: 'Fair verteilt: wer als nächstes wäscht und wer am Kampfgericht sitzt, immer klar geregelt.'
  }
];

// Court-Linien-Deko — DESIGN.md §5: dünne Kreise (weiß, geringe Deckkraft),
// sparsam, max. ein Element pro Screen, nie hinter wichtigem Text.
function CourtLines() {
  return (
    <svg
      viewBox="0 0 390 300"
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-auto w-full"
      aria-hidden="true"
    >
      <circle cx="195" cy="330" r="150" fill="none" stroke="#F2F4F7" strokeWidth="1" opacity="0.06" />
      <circle cx="195" cy="330" r="60" fill="none" stroke="#F2F4F7" strokeWidth="1" opacity="0.06" />
    </svg>
  );
}

export function Onboarding() {
  const [step, setStep] = useState<Step>('intro');

  useScrollResetOnChange(step);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-to-bg text-to-text">
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        {step === 'intro' && <Intro onDone={() => setStep('welcome')} />}
        {step === 'welcome' && <Welcome onTrainer={() => setStep('trainer-login')} onPlayer={() => setStep('player-code')} />}
        {step === 'trainer-login' && (
          <TrainerLogin onBack={() => setStep('welcome')} onForgotPassword={() => setStep('trainer-forgot-password')} />
        )}
        {step === 'trainer-forgot-password' && <ForgotPassword onBack={() => setStep('trainer-login')} />}
        {step === 'player-code' && <PlayerCode onBack={() => setStep('welcome')} />}
      </div>
      {(step === 'welcome' || step === 'player-code') && <CourtLines />}
    </div>
  );
}

const INTRO_SLIDE_MS = 5000;

function Intro({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const slide = INTRO_SLIDES[index];
  const isLast = index === INTRO_SLIDES.length - 1;

  // Läuft von allein durch, damit man auf einem ausgestellten/vorgeführten
  // Gerät nicht ständig antippen muss — ein manuelles "Weiter" setzt den
  // Timer für die neue Folie einfach über die index-Abhängigkeit zurück.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLast) onDone();
      else setIndex((i) => i + 1);
    }, INTRO_SLIDE_MS);
    return () => clearTimeout(timer);
    // onDone bewusst nicht in den Deps: Onboarding gibt bei jedem Rerender
    // eine neue Closure rein, das würde den Timer sonst unnötig zurücksetzen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, isLast]);

  return (
    <div className="text-center">
      <p className="to-label text-to-accent">Willkommen</p>
      <slide.Icon className="mx-auto mt-6 h-14 w-14 text-to-accent" />
      <h2 className="to-display-xl mt-6 text-to-text">{slide.title}</h2>
      <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-to-text2">{slide.text}</p>

      <div className="mt-8 flex justify-center gap-2">
        {INTRO_SLIDES.map((s, i) => (
          <span key={s.title} className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-to-accent' : 'bg-to-line'}`} />
        ))}
      </div>

      <div className="mt-10 space-y-3">
        <button className="btn-primary w-full" onClick={() => (isLast ? onDone() : setIndex((i) => i + 1))}>
          {isLast ? "Los geht's" : 'Weiter'}
        </button>
        {!isLast && (
          <button className="w-full text-xs font-semibold text-to-text3" onClick={onDone}>
            Überspringen
          </button>
        )}
      </div>
    </div>
  );
}

const WELCOME_FEATURES = [
  { label: 'Kader' },
  { label: 'Trikots' },
  { label: 'Kampfgericht' },
  { label: 'Spielplan' }
];

function Welcome({ onTrainer, onPlayer }: { onTrainer: () => void; onPlayer: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center text-to-accent">
          <svg viewBox="0 0 100 100" width="26" height="26" aria-hidden="true">
            <path
              d="M64.91 34.7 A26 26 0 1 1 35.09 34.7"
              fill="none"
              stroke="currentColor"
              style={{ strokeWidth: 11, strokeLinecap: 'round' }}
            />
            <circle cx="50" cy="19" r="10" fill="currentColor" />
          </svg>
        </span>
        <span className="to-display text-[22px]" style={{ fontStretch: '112%', fontWeight: 700, letterSpacing: '-0.045em' }}>
          tipoff
        </span>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <p className="to-label text-to-accent">Willkommen im Team</p>
        <h1 className="to-display-xl text-to-text">Alles klar vor dem Sprungball.</h1>
        <p className="max-w-xs text-base leading-relaxed text-to-text2">
          Kader, Trikots, Kampfgericht und Spielplan deines Teams — an einem Ort und immer aktuell.
        </p>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-2">
        {WELCOME_FEATURES.map((f, i) => (
          <div key={f.label} className="flex h-11 items-center gap-2.5 rounded-to-md border border-to-divider bg-to-surface px-3.5">
            <span className="to-data text-[11px] text-to-accent">{String(i + 1).padStart(2, '0')}</span>
            <span className="text-sm font-medium text-to-text">{f.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-3">
        <button className="btn-primary w-full justify-between" onClick={onPlayer}>
          <span>Mit Zugangscode starten</span>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="M13 6l6 6-6 6" />
          </svg>
        </button>
        <p className="text-center text-[13px] text-to-text3">Noch keinen Code? Dein Trainer schickt ihn dir.</p>
        <button className="btn-secondary w-full" onClick={onTrainer}>
          Ich bin Trainer
        </button>
      </div>
    </div>
  );
}

function TrainerLogin({ onBack, onForgotPassword }: { onBack: () => void; onForgotPassword: () => void }) {
  const { loginTrainer } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginTrainer(email, password);
    } catch (err) {
      setError('Login fehlgeschlagen. E-Mail und Passwort prüfen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="to-display-lg mt-6 text-to-text">Trainer-Login</h2>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="E-Mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />
        {error && <ErrorNote message={error} />}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Anmelden…' : 'Anmelden'}
        </button>
        <button type="button" onClick={onForgotPassword} className="w-full text-center text-xs font-semibold text-to-text3">
          Passwort vergessen?
        </button>
      </form>
    </div>
  );
}

function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) {
      setError('Link konnte nicht gesendet werden. E-Mail-Adresse prüfen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="to-display-lg mt-6 text-to-text">Passwort vergessen</h2>
      {sent ? (
        <p className="mt-6 text-sm leading-relaxed text-to-text2">
          Falls ein Trainer-Account mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen des Passworts
          verschickt. Bitte E-Mails prüfen (auch Spam-Ordner).
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-to-text2">
            Wir schicken dir einen Link, mit dem du ein neues Passwort setzen kannst.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="E-Mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
            {error && <ErrorNote message={error} />}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Sende…' : 'Link senden'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function PlayerCode({ onBack }: { onBack: () => void }) {
  const { redeemCode } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await redeemCode(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code nicht erkannt. Bitte beim Trainer nachfragen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <BackButton onClick={onBack} />
      <div className="mt-6 flex flex-col gap-4">
        <p className="to-label text-to-accent">Zugangscode</p>
        <h1 className="to-display-xl text-to-text">Dein persönlicher Code.</h1>
        <p className="text-base leading-relaxed text-to-text2">
          Den Code hast du von deinem Trainer bekommen, z. B. „FIN82" — ein Passwort brauchst du nicht.
        </p>
      </div>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div className="flex flex-col gap-3">
          <label htmlFor="tipoff-code" className="to-label">
            Code eingeben
          </label>
          <CodeInput id="tipoff-code" value={code} onChange={setCode} autoFocus maxLength={8} />
          <p className="text-sm text-to-text3">Buchstaben und Zahlen · Groß-/Kleinschreibung egal</p>
        </div>
        {error && <ErrorNote message={error} />}
        <button type="submit" disabled={busy || !code} className="btn-primary w-full">
          {busy ? 'Prüfe…' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Zurück"
      className="flex h-11 w-11 items-center justify-center rounded-full border border-to-line text-to-text"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5" />
        <path d="M11 6l-6 6 6 6" />
      </svg>
    </button>
  );
}
