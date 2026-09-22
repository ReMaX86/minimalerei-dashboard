import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { MyProfileModal } from './MyProfileModal';
import { Switch } from './Switch';
import { TeamPill, type TeamOption } from './TeamPill';
import { subscribeToPush, unsubscribeFromPush, type PushStatus } from '../lib/push';

// Nur ein Team heute (siehe PRODUCT.md) — die Team-Pille wechselt trotzdem
// schon automatisch auf den Button-mit-Pfeil-Zustand, sobald diese Liste
// später mehr als ein Element hat (die Auswahl selbst kommt dann dazu).
const TEAMS: TeamOption[] = [{ name: 'TB Wülfrath', squad: 'Herren' }];

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Kreis mit Foto (object-fit: cover) oder exakt zentrierten Initialen
// (display:grid; place-items:center; line-height:1) — für Header-Avatar
// und Menü-Kopf-Avatar mit je eigener Größe/Randfarbe verwendet.
function AvatarCircle({
  photoUrl,
  initials,
  size,
  fontSize,
  background,
  border
}: {
  photoUrl: string | null | undefined;
  initials: string;
  size: number;
  fontSize: number;
  background: string;
  border: string;
}) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full leading-none ${background} ${border}`}
      style={{ width: size, height: size, fontSize, fontWeight: 600 }}
    >
      {photoUrl && <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      {!photoUrl && <span>{initials}</span>}
    </span>
  );
}

// Start-Header — Kopfzeile (Team-Pille + Avatar-Profilmenü) und Begrüßung
// der Startseite. Ersetzt dort den generischen Seitentitel-Header (siehe
// App.tsx Shell) komplett; andere Screens nutzen weiterhin Header.tsx.
// 1:1-Vorlage: docs/design/tipoff-design/elements/01-start-header/.
export function StartHeader({
  nextGameDate,
  pushStatus,
  onPushChange
}: {
  nextGameDate: string | null;
  pushStatus: PushStatus | 'loading';
  onPushChange: () => void;
}) {
  const { role, trainer, player, viewer, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const person = player ?? trainer ?? viewer ?? null;
  const personPhoto = player?.photo_url ?? null;
  const personInitials = initialsOf(person?.name ?? '?');
  // "Trainer, der auch spielt" gibt es im Datenmodell als Spieler mit
  // is_admin (siehe isAdmin-Logik in Dashboard.tsx, z. B. spielender Coach) —
  // ein "Trainer"-Auth-Konto kann laut Schema nicht gleichzeitig Spieler sein.
  const roleLabel =
    role === 'trainer' ? 'Trainer' : role === 'viewer' ? 'Betrachter' : player?.is_admin ? 'Trainer · Spieler' : 'Spieler';
  const jerseyNumber = role === 'player' ? player?.jersey_number ?? null : null;

  // 'unsupported'/'loading' — der Schalter hätte technisch nichts zu tun
  // bzw. der Status steht noch nicht fest, deshalb dann kein Menüpunkt.
  const showPushItem = pushStatus !== 'unsupported' && pushStatus !== 'loading';
  const pushDenied = pushStatus === 'denied';
  const pushOn = pushStatus === 'subscribed';
  const pushHint = pushDenied ? 'In den Einstellungen blockiert' : pushOn ? 'Push ist an' : 'Push ist aus';

  async function togglePush() {
    if (pushDenied || pushBusy) return;
    setPushBusy(true);
    try {
      if (pushOn) await unsubscribeFromPush();
      else await subscribeToPush();
    } catch {
      // Eine ausführliche Fehlermeldung bleibt der Push-Karte auf dem
      // Dashboard vorbehalten (erscheint dort, solange Push nicht aktiv
      // ist) — im Menü selbst ist dafür kein Platz.
    } finally {
      onPushChange();
      setPushBusy(false);
      // Menü bleibt beim Umschalten bewusst offen (siehe Vorgabe).
    }
  }

  let daysLine: ReactNode = null;
  if (nextGameDate) {
    const diff = daysUntil(nextGameDate);
    if (diff === 0) daysLine = 'Heute ist Spieltag!';
    else if (diff === 1) daysLine = 'Morgen ist Spieltag.';
    else if (diff > 1)
      daysLine = (
        <>
          Noch <span className="font-semibold text-to-accent">{diff} Tage</span> bis zum Sprungball.
        </>
      );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <TeamPill teams={TEAMS} />

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            aria-label="Profil-Menü"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="profile-menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-full"
          >
            <AvatarCircle
              photoUrl={personPhoto}
              initials={personInitials}
              size={48}
              fontSize={15}
              background="bg-to-surface2"
              border={menuOpen ? 'border-2 border-to-accent' : 'border-2 border-to-line'}
            />
          </button>

          {menuOpen && (
            <div
              id="profile-menu"
              role="menu"
              aria-label="Profil"
              className="absolute right-0 top-[calc(100%+8px)] z-30 w-[264px] overflow-hidden rounded-[20px] border border-to-line bg-to-surface2 shadow-[0_24px_48px_rgba(0,0,0,0.55)]"
            >
              <div className="flex items-center gap-3 p-4">
                {jerseyNumber !== null ? (
                  <span className="to-number min-w-[36px] shrink-0 text-[36px] leading-none text-to-accent">
                    {jerseyNumber}
                  </span>
                ) : (
                  <AvatarCircle
                    photoUrl={personPhoto}
                    initials={personInitials}
                    size={40}
                    fontSize={14}
                    background="bg-to-bg"
                    border="border border-to-line"
                  />
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold text-to-text">{person?.name ?? '—'}</span>
                  <span className="to-label !text-to-text3">{roleLabel}</span>
                </div>
              </div>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setProfileOpen(true);
                }}
                className="flex min-h-[52px] w-full items-center gap-3 border-t border-to-divider px-4 text-left text-[15px] text-to-text"
              >
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-text2" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
                </svg>
                <span className="flex flex-1 flex-col gap-0.5">
                  Mein Profil
                  <span className="text-xs text-to-text3">Foto, Größe, Geburtsdatum</span>
                </span>
              </button>

              {showPushItem && (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={pushOn}
                  disabled={pushDenied || pushBusy}
                  onClick={togglePush}
                  className="flex min-h-[52px] w-full items-center gap-3 border-t border-to-divider px-4 text-left text-[15px] text-to-text disabled:cursor-not-allowed"
                >
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-to-text2" aria-hidden="true">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                  <span className="flex flex-1 flex-col gap-0.5">
                    Benachrichtigungen
                    <span className="text-xs text-to-text3">{pushHint}</span>
                  </span>
                  <Switch on={pushOn} />
                </button>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="flex min-h-[52px] w-full items-center gap-3 border-t border-to-divider px-4 text-left text-[15px] font-medium text-to-dangerText"
              >
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                  <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                Abmelden
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <h1 className="to-display-xl text-to-text">Hi {(person?.name ?? '').split(' ')[0]}!</h1>
        {daysLine && <p className="text-base text-to-text2">{daysLine}</p>}
      </div>

      {profileOpen && <MyProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
