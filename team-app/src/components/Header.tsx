import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { RoleBadge } from './RoleBadge';
import { Avatar } from './Avatar';
import { MyProfileModal } from './MyProfileModal';
import { IconLogout } from './NavIcons';

export function Header({ title }: { title: string }) {
  const { role, trainer, player, viewer, logout } = useAuth();
  const { flags } = useFeatureFlags();
  const [profileOpen, setProfileOpen] = useState(false);
  const canEditProfile = role === 'player' && flags.player_profiles;

  return (
    <header className="sticky top-0 z-10 border-b border-to-divider bg-to-bg">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* "Jump Ball"-Zeichen — DESIGN.md §4 (assets/tipoff-mark-*.svg) */}
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-to-md bg-to-accent text-to-onAccent">
            <svg viewBox="0 0 100 100" width="19" height="19" aria-hidden="true">
              <path
                d="M64.91 34.7 A26 26 0 1 1 35.09 34.7"
                fill="none"
                stroke="currentColor"
                style={{ strokeWidth: 11, strokeLinecap: 'round' }}
              />
              <circle cx="50" cy="19" r="10" fill="currentColor" />
            </svg>
          </span>
          <h1 className="to-display-lg min-w-0 truncate text-to-text">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {role === 'trainer' && <RoleBadge role="trainer" />}
          {role === 'player' &&
            (canEditProfile && player ? (
              <button
                onClick={() => setProfileOpen(true)}
                aria-label="Mein Profil bearbeiten"
                title="Mein Profil bearbeiten"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-to-line"
              >
                <Avatar player={player} size="xs" />
              </button>
            ) : (
              <RoleBadge role="player" />
            ))}
          {role === 'viewer' && <RoleBadge role="viewer" />}
          <button
            onClick={logout}
            aria-label="Abmelden"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-to-md text-to-text3 hover:bg-to-surface2 hover:text-to-text2"
            title={trainer ? `${trainer.name} · Abmelden` : player ? `${player.name} · Abmelden` : viewer ? `${viewer.name} · Abmelden` : 'Abmelden'}
          >
            <IconLogout className="h-[19px] w-[19px]" />
          </button>
        </div>
      </div>
      {profileOpen && <MyProfileModal onClose={() => setProfileOpen(false)} />}
    </header>
  );
}
