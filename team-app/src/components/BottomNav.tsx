import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ITEMS = [
  { to: '/', label: 'Start', icon: '🏠', end: true },
  { to: '/trikots', label: 'Trikots', icon: '👕', end: false },
  { to: '/kampfgericht', label: 'Kampfgericht', icon: '📋', end: false },
  { to: '/kader', label: 'Kader', icon: '🧑‍🤝‍🧑', end: false }
];

export function BottomNav() {
  const { role } = useAuth();
  const items = role === 'trainer' ? [...ITEMS, { to: '/admin', label: 'Admin', icon: '⚙️', end: false }] : ITEMS;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/5 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg justify-around">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  isActive ? 'text-tbw-navy' : 'text-tbw-ink/45'
                }`
              }
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
