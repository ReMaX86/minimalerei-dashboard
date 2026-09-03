import { useAuth } from '../context/AuthContext';
import { RoleBadge } from './RoleBadge';

export function Header({ title }: { title: string }) {
  const { role, trainer, player, logout } = useAuth();

  return (
    <header className="sticky top-0 z-10 bg-tbw-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-1.5 rounded-full bg-tbw-gold" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-tbw-navy/55">
              TB Wülfrath Herren
            </div>
            <h1 className="headline text-2xl text-tbw-navyDark">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {role === 'trainer' && <RoleBadge role="trainer" />}
          {role === 'player' && <RoleBadge role="player" />}
          <button
            onClick={logout}
            className="rounded-full px-2.5 py-1 text-xs font-bold text-tbw-ink/50 hover:bg-black/5"
            title={trainer ? trainer.name : player ? player.name : 'Abmelden'}
          >
            Abmelden
          </button>
        </div>
      </div>
    </header>
  );
}
