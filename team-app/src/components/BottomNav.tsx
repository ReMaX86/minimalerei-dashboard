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

// Betrachter (z. B. Abteilungsleiter) sehen Spielplan, Team und
// Kampfgericht, aber kein Trikots — dafür gibt es keine Spieler-/
// Trainer-Rechte. Spiele-Tab schließt auch das Live-Stats-Tracking ein
// (Übernahme-Button dort wie bei Spielern/Trainern, siehe Migration 0045).
const VIEWER_ITEMS = [
  { to: '/', label: 'Start', Icon: IconHome, end: true },
  { to: '/spiele', label: 'Spiele', Icon: IconTeam, end: false },
  { to: '/kampfgericht', label: 'Kampfgericht', Icon: IconClipboard, end: false }
];

// Feste Konsolen-Leiste statt schwebender Pill-Kapsel — bildet mit dem
// Header dieselbe dunkle "Arena"-Rahmung um die helle Papier-Fläche
// (Richtungsvertrag: Nav lebt auf der Arena-Fläche). Aktiver Zustand als
// LED-Strich über dem Icon statt gefüllter Kreis dahinter.
export function BottomNav() {
  const { role, isAdmin } = useAuth();
  const { flags } = useFeatureFlags();

  let items = role === 'viewer' ? VIEWER_ITEMS : ITEMS;
  if (flags.player_profiles) {
    // Team direkt hinter Spiele einreihen, nicht ans Ende anhängen — Spiele
    // steht in ITEMS wie in VIEWER_ITEMS an Index 1.
    items = [...items.slice(0, 2), { to: '/team', label: 'Team', Icon: IconUser, end: false }, ...items.slice(2)];
  }
  if (isAdmin) {
    items = [...items, { to: '/admin', label: 'Admin', Icon: IconGear, end: false }];
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-tbw-navyDark pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink to={item.to} end={item.end} className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold">
              {({ isActive }) => (
                <>
                  <span
                    className={`h-0.5 w-6 rounded-full transition ${isActive ? 'bg-tbw-gold' : 'bg-transparent'}`}
                    aria-hidden
                  />
                  <item.Icon className={`h-5 w-5 transition ${isActive ? 'text-tbw-gold' : 'text-white/45'}`} />
                  <span className={isActive ? 'text-tbw-gold' : 'text-white/45'}>{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
