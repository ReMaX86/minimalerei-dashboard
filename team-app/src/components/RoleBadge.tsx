export function RoleBadge({ role }: { role: 'trainer' | 'player' | 'viewer' }) {
  if (role === 'trainer')
    return (
      <span className="inline-flex items-center rounded-md bg-tbw-gold px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-tbw-navyDark">
        Trainer
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-md border border-white/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/70">
      {role === 'viewer' ? 'Betrachter' : 'Spieler'}
    </span>
  );
}
