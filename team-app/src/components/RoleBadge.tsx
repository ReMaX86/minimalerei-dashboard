export function RoleBadge({ role }: { role: 'trainer' | 'player' }) {
  return role === 'trainer' ? (
    <span className="pill bg-tbw-gold/15 text-tbw-navyDark">Trainer</span>
  ) : (
    <span className="pill bg-tbw-navy/10 text-tbw-navy">Spieler</span>
  );
}
