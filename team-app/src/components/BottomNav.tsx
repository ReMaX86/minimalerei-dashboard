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
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-base leading-none transition ${
                      isActive ? 'bg-tbw-gold' : ''
                    }`}
                  >
                    {item.icon}
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
