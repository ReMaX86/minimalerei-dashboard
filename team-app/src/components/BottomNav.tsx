import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { IconHome, IconJersey, IconClipboard, IconTeam, IconUser, IconGear } from './NavIcons';

const ITEMS = [
  { to: '/', label: 'Start', Icon: IconHome, end: true },
  { to: '/spiele', label: 'Spiele', Icon: IconTeam, end: false },
  { to: '/trikots', label: 'Trikots', Icon: IconJersey, end: false },
  { to: '/kampfgericht', label: 'Kampfgericht', Icon: IconClipboard, end: false }
];

// Betrachter (z. B. Abteilungsleiter) sehen nur Spielplan + Kampfgericht,
// kein Kader/Trikots — dafür gibt es keine Spieler-/Trainer-Rechte.
const VIEWER_ITEMS = [
  { to: '/', label: 'Start', Icon: IconHome, end: true },
  { to: '/kampfgericht', label: 'Kampfgericht', Icon: IconClipboard, end: false }
];

export function BottomNav() {
  const { role, isAdmin } = useAuth();
  const { flags } = useFeatureFlags();

  let items = role === 'viewer' ? VIEWER_ITEMS : ITEMS;
  if (role !== 'viewer' && flags.player_profiles) {
    // Team direkt hinter Spiele einreihen, nicht ans Ende anhängen.
    items = [...items.slice(0, 2), { to: '/team', label: 'Team', Icon: IconUser, end: false }, ...items.slice(2)];
  }
  if (isAdmin) {
    items = [...items, { to: '/admin', label: 'Admin', Icon: IconGear, end: false }];
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <ul className="mx-auto flex max-w-lg justify-around rounded-full bg-tbw-navyDark px-2 py-2 shadow-[0_10px_30px_-8px_rgba(7,22,15,0.5)]">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.end}
              className="flex flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-bold text-white/55"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                      isActive ? 'bg-tbw-gold text-tbw-navyDark' : 'text-white/55'
                    }`}
                  >
                    <item.Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className={isActive ? 'text-tbw-gold' : ''}>{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
