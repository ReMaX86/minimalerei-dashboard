import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { RoleBadge } from './RoleBadge';
import { Avatar } from './Avatar';
import { MyProfileModal } from './MyProfileModal';

export function Header({ title }: { title: string }) {
  const { role, trainer, player, viewer, logout } = useAuth();
  const { flags } = useFeatureFlags();
  const [profileOpen, setProfileOpen] = useState(false);
  const canEditProfile = role === 'player' && flags.player_profiles;

  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-tbw-navyDark">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-tbw-gold text-[11px] font-black tracking-tight text-tbw-navyDark">
            TBW
          </span>
          <h1 className="headline text-xl text-white">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {role === 'trainer' && <RoleBadge role="trainer" />}
          {role === 'player' &&
            (canEditProfile && player ? (
              <button
                onClick={() => setProfileOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-white/15 py-1 pl-1 pr-2 text-xs font-bold text-white/80"
                title="Mein Profil bearbeiten"
              >
                <Avatar player={player} size="xs" />
                Spieler
              </button>
            ) : (
              <RoleBadge role="player" />
            ))}
          {role === 'viewer' && <RoleBadge role="viewer" />}
          <button
            onClick={logout}
            className="rounded-md px-2 py-1 text-xs font-bold text-white/40 hover:bg-white/10 hover:text-white/70"
            title={trainer ? trainer.name : player ? player.name : viewer ? viewer.name : 'Abmelden'}
          >
            Abmelden
          </button>
        </div>
      </div>
      {profileOpen && <MyProfileModal onClose={() => setProfileOpen(false)} />}
    </header>
  );
}
