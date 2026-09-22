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

// Tab-Leiste — DESIGN.md §5: Hintergrund --to-bg, oben 1px --to-divider,
// aktiv = Volt, inaktiv = --to-text-3. Das bestehende (gefüllte) Icon-Set
// bleibt vorerst wie es ist — die Übergabe verlangt eigentlich Linien-Icons
// (Strich 1.8), das ist aber ein reiner Icon-Zeichen-Task für eine der
// späteren Verfeinerungsrunden, kein Layout-/Farb-Thema.
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
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-to-divider bg-to-bg pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink to={item.to} end={item.end} className="flex flex-col items-center gap-1.5 py-2.5 text-[11px] font-semibold">
              {({ isActive }) => (
                <>
                  <item.Icon className={`h-6 w-6 transition ${isActive ? 'text-to-accent' : 'text-to-text3'}`} />
                  <span className={isActive ? 'text-to-accent' : 'text-to-text3'}>{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
