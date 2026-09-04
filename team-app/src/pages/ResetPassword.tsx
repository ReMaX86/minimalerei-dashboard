import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { ErrorNote } from '../components/ErrorNote';

export function ResetPassword() {
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
    } catch (err) {
      setError('Passwort konnte nicht gesetzt werden. Der Link ist evtl. abgelaufen — bitte erneut anfordern.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-tbw-navyDark to-tbw-navy text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        <h2 className="headline text-3xl text-white">Neues Passwort</h2>
        {done ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Dein Passwort wurde geändert. Du kannst die App jetzt nutzen.
            </p>
            <a href="/" className="btn-accent mt-6 block w-full text-center">
              Weiter zur App
            </a>
          </>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder="Neues Passwort"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder="Neues Passwort wiederholen"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="input"
            />
            {error && <ErrorNote message={error} />}
            <button type="submit" disabled={busy} className="btn-accent w-full">
              {busy ? 'Speichere…' : 'Passwort speichern'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
