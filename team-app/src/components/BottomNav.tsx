import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';

// Strich-SVGs 1:1 aus der Vorlage (docs/design/tipoff-design/elements/
// 08-menueleiste/menueleiste.html) übernommen, statt der bisherigen
// gefüllten Icons aus NavIcons.tsx — die bleiben dort für andere Stellen
// unangetastet, hier zählt Pixeltreue zur neuen Vorlage.
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6.5 10.5V20h11v-9.5" />
    </svg>
  );
}
function GamesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M12 5v14" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}
function TeamIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3.5 3.5 0 0 1 0 7M18 14.5c1.9.6 3 2.6 3 5.5" />
    </svg>
  );
}
function KitsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 4 12 6l3.5-2L20 7l-2.5 3v10h-11V10L4 7z" />
    </svg>
  );
}
function DutyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V9.5" />
      <path d="M9.5 2.5h5" />
    </svg>
  );
}
function AdminIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
    </svg>
  );
}

interface TabItem {
  key: string;
  to: string;
  label: string;
  end: boolean;
  Icon: () => JSX.Element;
}

const ITEMS: TabItem[] = [
  { key: 'start', to: '/', label: 'Start', end: true, Icon: HomeIcon },
  { key: 'games', to: '/spiele', label: 'Spiele', end: false, Icon: GamesIcon },
  { key: 'kits', to: '/trikots', label: 'Trikots', end: false, Icon: KitsIcon },
  { key: 'duty', to: '/kampfgericht', label: 'Kampfgericht', end: false, Icon: DutyIcon }
];

// Betrachter (z. B. Abteilungsleiter) sehen Spielplan, Team und
// Kampfgericht, aber kein Trikots — dafür gibt es keine Spieler-/
// Trainer-Rechte. Spiele-Tab schließt auch das Live-Stats-Tracking ein
// (Übernahme-Button dort wie bei Spielern/Trainern, siehe Migration 0045).
const VIEWER_ITEMS: TabItem[] = [
  { key: 'start', to: '/', label: 'Start', end: true, Icon: HomeIcon },
  { key: 'games', to: '/spiele', label: 'Spiele', end: false, Icon: GamesIcon },
  { key: 'duty', to: '/kampfgericht', label: 'Kampfgericht', end: false, Icon: DutyIcon }
];

// Hinweispunkte (Vorlage "Hinweispunkt"): Spiele/eigene Zu-/Absage und
// Kampfgericht/eigener Einsatz in 7 Tagen bräuchten beide Daten, die
// heute nur innerhalb von Dashboard.tsx' eigenem load() berechnet werden
// (playerNextTask, myConfirmation) — BottomNav rendert aber global auf
// jeder Seite, nicht nur dort. Ohne einen eigenen, seitenübergreifenden
// Fetch (zusätzliche Requests auf jeder Navigation) lässt sich das nicht
// sauber lösen, siehe PROMPT.md "falls die Daten noch nicht global
// vorliegen: erst ohne Punkte bauen" — daher hier bewusst noch leer.
const NO_BADGES = new Set<string>();

// Tab-Leiste — DESIGN.md/elements/08-menueleiste/PROMPT.md: schwebende
// Kapsel-Leiste, aktives Ziel wird zur breiteren Volt-Kapsel mit Text.
export function BottomNav() {
  const { role, isAdmin } = useAuth();
  const { flags } = useFeatureFlags();

  let items = role === 'viewer' ? VIEWER_ITEMS : ITEMS;
  if (flags.player_profiles) {
    // Team direkt hinter Spiele einreihen, nicht ans Ende anhängen — Spiele
    // steht in ITEMS wie in VIEWER_ITEMS an Index 1.
    items = [...items.slice(0, 2), { key: 'team', to: '/team', label: 'Team', end: false, Icon: TeamIcon }, ...items.slice(2)];
  }
  if (isAdmin) {
    items = [...items, { key: 'admin', to: '/admin', label: 'Admin', end: false, Icon: AdminIcon }];
  }

  return (
    <nav
      aria-label="Hauptmenü"
      className="fixed inset-x-[10px] bottom-[calc(10px+env(safe-area-inset-bottom))] z-50 flex items-center gap-0.5 rounded-[26px] border border-to-border p-[7px] shadow-[0_14px_34px_rgba(0,0,0,0.55)] backdrop-blur-[18px] [-webkit-backdrop-filter:blur(18px)] min-[430px]:inset-x-auto min-[430px]:left-1/2 min-[430px]:w-[370px] min-[430px]:-translate-x-1/2 bg-[rgba(18,21,26,0.92)]"
    >
      {items.map((item) => (
        <NavLink
          key={item.key}
          to={item.to}
          end={item.end}
          aria-label={item.label}
          className={({ isActive }) =>
            `flex h-11 min-w-0 cursor-pointer items-center justify-center gap-0 rounded-full p-0 text-to-text3 no-underline transition-[flex-grow,padding,gap,background-color,color] duration-[180ms] ease-out ${
              isActive ? 'flex-none gap-2 bg-to-accent px-3.5 text-to-onAccent' : 'flex-1'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className="relative flex flex-none">
                <span className={isActive ? '[&_svg]:stroke-2' : ''}>
                  <item.Icon />
                </span>
                {!isActive && NO_BADGES.has(item.key) && (
                  <>
                    <span className="absolute -right-1 -top-0.5 h-[7px] w-[7px] rounded-full border-2 border-to-surface bg-to-accent" />
                    <span className="sr-only">Es liegt etwas an</span>
                  </>
                )}
              </span>
              <span
                className={`overflow-hidden whitespace-nowrap text-[13px] font-semibold -tracking-[0.01em] transition-[max-width,opacity] duration-[180ms] ease-out ${
                  isActive ? 'max-w-[160px] opacity-100' : 'max-w-0 opacity-0'
                }`}
              >
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
