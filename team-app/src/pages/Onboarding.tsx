import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ErrorNote } from '../components/ErrorNote';
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
    title: 'Kader',
    text: 'Sofort sehen, ob du beim nächsten Spiel dabei bist.'
  },
  {
    Icon: IconJersey,
    title: 'Trikots & Kampfgericht',
    text: 'Fair verteilt: wer als nächstes wäscht und wer am Kampfgericht sitzt, immer klar geregelt.'
  }
];

export function Onboarding() {
  const [step, setStep] = useState<Step>('intro');

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-tbw-navyDark to-tbw-navy text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        {step === 'intro' && <Intro onDone={() => setStep('welcome')} />}
        {step === 'welcome' && <Welcome onTrainer={() => setStep('trainer-login')} onPlayer={() => setStep('player-code')} />}
        {step === 'trainer-login' && (
          <TrainerLogin onBack={() => setStep('welcome')} onForgotPassword={() => setStep('trainer-forgot-password')} />
        )}
        {step === 'trainer-forgot-password' && <ForgotPassword onBack={() => setStep('trainer-login')} />}
        {step === 'player-code' && <PlayerCode onBack={() => setStep('welcome')} />}
      </div>
    </div>
  );
}

function Intro({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const slide = INTRO_SLIDES[index];
  const isLast = index === INTRO_SLIDES.length - 1;

  return (
    <div className="text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-tbw-gold">Willkommen</p>
      <slide.Icon className="mx-auto mt-6 h-14 w-14 text-tbw-gold" />
      <h2 className="headline mt-6 text-3xl text-white">{slide.title}</h2>
      <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-white/70">{slide.text}</p>

      <div className="mt-8 flex justify-center gap-2">
        {INTRO_SLIDES.map((s, i) => (
          <span
            key={s.title}
            className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-tbw-gold' : 'bg-white/20'}`}
          />
        ))}
      </div>

      <div className="mt-10 space-y-3">
        <button
          className="btn-accent w-full"
          onClick={() => (isLast ? onDone() : setIndex((i) => i + 1))}
        >
          {isLast ? "Los geht's" : 'Weiter'}
        </button>
        {!isLast && (
          <button className="w-full text-xs font-semibold text-white/50" onClick={onDone}>
            Überspringen
          </button>
        )}
      </div>
    </div>
  );
}

function Welcome({ onTrainer, onPlayer }: { onTrainer: () => void; onPlayer: () => void }) {
  return (
    <div className="text-center">
      <img src="/icons/welcome-logo.png" alt="" className="mx-auto mb-8 h-24 w-24 drop-shadow-xl" />
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-tbw-gold">TB Wülfrath Herren</p>
      <h1 className="headline mt-2 text-[42px] text-white">Team App</h1>
      <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-white/70">
        Spielplan, Kampfgericht und Trikot-Rotation an einem Ort — kein WhatsApp-Chaos mehr.
      </p>

      <div className="mt-8 grid grid-cols-3 gap-2 text-center">
        {[
          { Icon: IconJersey, label: 'Trikots' },
          { Icon: IconClipboard, label: 'Kampfgericht' },
          { Icon: IconTeam, label: 'Kader' }
        ].map((f) => (
          <div key={f.label} className="rounded-2xl bg-white/5 py-4 ring-1 ring-white/10">
            <f.Icon className="mx-auto h-5 w-5 text-tbw-gold" />
            <div className="mt-1 text-[11px] font-semibold text-white/70">{f.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 space-y-3">
        <button className="btn-accent w-full" onClick={onPlayer}>
          Los geht's
        </button>
        <button
          className="w-full rounded-full px-4 py-3 text-sm font-bold text-white/80 ring-1 ring-white/20"
          onClick={onTrainer}
        >
          Ich bin Admin
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
      <button onClick={onBack} className="mb-6 text-sm font-semibold text-white/60">
        ← Zurück
      </button>
      <h2 className="headline text-3xl text-white">Admin-Login</h2>
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
        <button type="submit" disabled={busy} className="btn-accent w-full">
          {busy ? 'Anmelden…' : 'Anmelden'}
        </button>
        <button
          type="button"
          onClick={onForgotPassword}
          className="w-full text-center text-xs font-semibold text-white/60"
        >
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
      <button onClick={onBack} className="mb-6 text-sm font-semibold text-white/60">
        ← Zurück
      </button>
      <h2 className="headline text-3xl text-white">Passwort vergessen</h2>
      {sent ? (
        <p className="mt-6 text-sm leading-relaxed text-white/70">
          Falls ein Trainer-Account mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen des Passworts
          verschickt. Bitte E-Mails prüfen (auch Spam-Ordner).
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-white/70">
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
            <button type="submit" disabled={busy} className="btn-accent w-full">
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
      <button onClick={onBack} className="mb-6 text-sm font-semibold text-white/60">
        ← Zurück
      </button>
      <h2 className="headline text-3xl text-white">Dein Code</h2>
      <p className="mt-1 text-sm text-white/70">
        Den Code hast du von deinem Trainer per WhatsApp bekommen, z. B. „FIN82".
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          required
          autoCapitalize="characters"
          autoFocus
          placeholder="z. B. FIN82"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="input text-center text-lg font-bold tracking-[0.3em]"
          maxLength={8}
        />
        {error && <ErrorNote message={error} />}
        <button type="submit" disabled={busy || !code} className="btn-accent w-full">
          {busy ? 'Prüfe…' : 'Bestätigen'}
        </button>
      </form>
    </div>
  );
}
