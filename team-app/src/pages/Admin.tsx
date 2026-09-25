import { useEffect, useState } from 'react';
import { useScrollResetOnChange } from '../hooks/useScrollResetOnChange';
import { PlayersAdmin } from './admin/PlayersAdmin';
import { GamesAdmin } from './admin/GamesAdmin';
import { OfficiatingAdmin } from './admin/OfficiatingAdmin';
import { TrainingsAdmin } from './admin/TrainingsAdmin';
import { TrikotsAdmin } from './admin/TrikotsAdmin';
import { ViewersAdmin } from './admin/ViewersAdmin';
import { AnnouncementsAdmin } from './admin/AnnouncementsAdmin';
import { FeatureFlagsAdmin } from './admin/FeatureFlagsAdmin';
import { useFeatureFlags } from '../context/FeatureFlagsContext';

const CORE_TABS = [
  { id: 'players', label: 'Spieler' },
  { id: 'games', label: 'Spiele' },
  { id: 'trainings', label: 'Training' },
  { id: 'viewers', label: 'Betrachter' }
] as const;

// "officiating"/"trikots" waren bis Element 23 feste Reiter (CORE_TABS) —
// jetzt genau wie "announcements" hinter einem feature_flags-Eintrag
// (Kampfgericht/Trikots in FeatureFlagsAdmin abschaltbar, siehe
// Migration 0072), deshalb hier zu FEATURE_TABS verschoben.
const FEATURE_TABS = [
  { id: 'officiating', label: 'Kampfgericht' },
  { id: 'trikots', label: 'Trikots' },
  { id: 'announcements', label: 'Meldungen' }
] as const;

type TabId = (typeof CORE_TABS)[number]['id'] | (typeof FEATURE_TABS)[number]['id'] | 'features';

// "trikots" hat historisch eine andere Tab-Id als sein feature_flags-Key
// ("kits", siehe Migration 0072) — daher diese kleine Zuordnung statt
// direkt flags[t.id].
const FEATURE_TAB_FLAG: Record<(typeof FEATURE_TABS)[number]['id'], keyof ReturnType<typeof useFeatureFlags>['flags']> = {
  officiating: 'officiating',
  trikots: 'kits',
  announcements: 'announcements'
};

export function Admin() {
  const { flags } = useFeatureFlags();
  const tabs = [
    ...CORE_TABS,
    ...FEATURE_TABS.filter((t) => flags[FEATURE_TAB_FLAG[t.id]]),
    { id: 'features', label: 'Funktionen' }
  ] as const;
  const [tab, setTab] = useState<TabId>('players');

  useScrollResetOnChange(tab);

  // Falls der gerade aktive Reiter durch einen deaktivierten Flag verschwindet
  // (z. B. Trainer schaltet "Meldungen" aus, während er dort ist).
  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab('players');
  }, [tabs, tab]);

  return (
    <div className="space-y-4">
      <div className="relative -mx-5">
        <div
          className="flex gap-1.5 overflow-x-auto px-5 pb-2 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ scrollSnapType: 'x proximity' }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`h-[34px] shrink-0 whitespace-nowrap rounded-to-pill border px-3.5 text-[13px] transition ${
                tab === t.id
                  ? 'border-to-accent bg-to-accent font-semibold text-to-onAccent'
                  : 'border-to-border bg-to-surface font-medium text-to-text2'
              }`}
              style={{ scrollSnapAlign: 'start' }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="pointer-events-none absolute inset-y-0 right-0 w-11 bg-gradient-to-r from-transparent to-to-bg" />
      </div>

      {tab === 'players' && <PlayersAdmin />}
      {tab === 'games' && <GamesAdmin />}
      {tab === 'officiating' && <OfficiatingAdmin />}
      {tab === 'trainings' && <TrainingsAdmin />}
      {tab === 'trikots' && <TrikotsAdmin />}
      {tab === 'viewers' && <ViewersAdmin />}
      {tab === 'announcements' && <AnnouncementsAdmin />}
      {tab === 'features' && <FeatureFlagsAdmin />}
    </div>
  );
}
