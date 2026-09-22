export function RoleBadge({ role }: { role: 'trainer' | 'player' | 'viewer' }) {
  if (role === 'trainer')
    return (
      <span className="inline-flex items-center rounded-to-md bg-to-accent px-1.5 py-1 text-[10px] font-semibold uppercase text-to-onAccent">
        Trainer
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-to-md border border-to-line px-1.5 py-1 text-[10px] font-semibold uppercase text-to-text2">
      {role === 'viewer' ? 'Betrachter' : 'Spieler'}
    </span>
  );
}
