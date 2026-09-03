import { useAuth } from '../context/AuthContext';
import { RoleBadge } from './RoleBadge';

export function Header({ title }: { title: string }) {
  const { role, trainer, player, logout } = useAuth();

  return (
    <header className="sticky top-0 z-10 border-b border-black/5 bg-tbw-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-tbw-navy/60">
            TB Wülfrath U16
          </div>
          <h1 className="text-lg font-bold text-tbw-navyDark">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {role === 'trainer' && <RoleBadge role="trainer" />}
          {role === 'player' && <RoleBadge role="player" />}
          <button
            onClick={logout}
            className="rounded-lg px-2 py-1 text-xs font-medium text-tbw-ink/50 hover:bg-black/5"
            title={trainer ? trainer.name : player ? player.name : 'Abmelden'}
          >
            Abmelden
          </button>
        </div>
      </div>
    </header>
  );
}
