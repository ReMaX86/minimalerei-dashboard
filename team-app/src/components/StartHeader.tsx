import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { Avatar } from './Avatar';
import { MyProfileModal } from './MyProfileModal';
import { subscribeToPush, unsubscribeFromPush, type PushStatus } from '../lib/push';
import { IconBell, IconLogout, IconUser } from './NavIcons';
import tipoffMarkVolt from '../assets/tipoff-mark-volt.svg';

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

// Start-Header — Kopfzeile (Team-Pille + Avatar-Profilmenü) und Begrüßung
// der Startseite. Ersetzt dort den generischen Seitentitel-Header (siehe
// App.tsx Shell) komplett; andere Screens nutzen weiterhin Header.tsx.
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
  const { flags } = useFeatureFlags();
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
  const canEditProfile = role === 'player' && flags.player_profiles && !!player;
  const roleLabel = role === 'trainer' ? 'Trainer' : role === 'viewer' ? 'Betrachter' : 'Spieler';
  const showPushItem = flags.push_notifications && pushStatus !== 'unsupported' && pushStatus !== 'loading';

  async function togglePush() {
    setPushBusy(true);
    try {
      if (pushStatus === 'subscribed') await unsubscribeFromPush();
      else await subscribeToPush();
    } catch {
      // Eine ausführliche Fehlermeldung bleibt der Push-Karte auf dem
      // Dashboard vorbehalten — im Menü selbst ist dafür kein Platz; ein
      // fehlgeschlagener Versuch zeigt sich dort am unveränderten Status.
    } finally {
      onPushChange();
      setPushBusy(false);
      setMenuOpen(false);
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
      <div className="flex items-center justify-between">
        {/* Team-Pille — für einen späteren Team-Wechsel vorgesehen, bis
            dahin ohne Funktion (siehe Vorgabe). */}
        <div className="flex h-11 items-center gap-2.5 rounded-to-pill border border-to-line bg-to-surface py-0 pl-2.5 pr-3.5">
          <img src={tipoffMarkVolt} alt="" className="h-6 w-6" aria-hidden="true" />
          <span className="text-sm font-semibold text-to-text">TB Wülfrath</span>
          <span className="text-sm text-to-text2">Herren</span>
        </div>

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            aria-label="Profil-Menü"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className={`h-12 w-12 overflow-hidden rounded-full border-2 transition ${
              menuOpen ? 'border-to-accent' : 'border-to-line'
            }`}
          >
            {player ? (
              <Avatar player={player} size="md" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-to-surface2 text-[15px] font-semibold text-to-text">
                {initialsOf(person?.name ?? '?')}
              </span>
            )}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] z-30 w-[248px] overflow-hidden rounded-[20px] border border-to-line bg-to-surface2 shadow-[0_24px_48px_rgba(0,0,0,0.55)]"
            >
              <div className="flex items-center gap-3 p-4">
                {role === 'player' && person && (
                  <span className="to-number shrink-0 text-[36px] text-to-accent">{initialsOf(person.name)}</span>
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold text-to-text">{person?.name ?? '—'}</span>
                  <span className="to-label !text-to-text3">{roleLabel}</span>
                </div>
              </div>

              {canEditProfile && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setProfileOpen(true);
                  }}
                  className="flex h-12 w-full items-center gap-3 border-t border-to-line px-4 text-left text-[15px] text-to-text"
                >
                  <IconUser className="h-[19px] w-[19px] text-to-text2" />
                  Mein Profil
                </button>
              )}

              {showPushItem && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={pushBusy}
                  onClick={togglePush}
                  className="flex h-12 w-full items-center gap-3 border-t border-to-line px-4 text-left text-[15px] text-to-text disabled:opacity-50"
                >
                  <IconBell className="h-[19px] w-[19px] text-to-text2" />
                  {pushStatus === 'subscribed' ? 'Benachrichtigungen deaktivieren' : 'Benachrichtigungen aktivieren'}
                </button>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="flex h-12 w-full items-center gap-3 border-t border-to-line px-4 text-left text-[15px] text-to-dangerText"
              >
                <IconLogout className="h-[19px] w-[19px]" />
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
