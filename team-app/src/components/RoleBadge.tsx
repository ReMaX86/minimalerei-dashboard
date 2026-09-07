export function RoleBadge({ role }: { role: 'trainer' | 'player' | 'viewer' }) {
  if (role === 'trainer') return <span className="pill bg-tbw-gold/15 text-tbw-navyDark">Trainer</span>;
  if (role === 'viewer') return <span className="pill bg-tbw-ink/10 text-tbw-ink/70">Betrachter</span>;
  return <span className="pill bg-tbw-navy/10 text-tbw-navy">Spieler</span>;
}
