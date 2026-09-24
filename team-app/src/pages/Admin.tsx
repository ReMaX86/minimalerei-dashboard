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
  { id: 'officiating', label: 'Kampfgericht' },
  { id: 'trainings', label: 'Training' },
  { id: 'trikots', label: 'Trikots' },
  { id: 'viewers', label: 'Betrachter' }
] as const;

const FEATURE_TABS = [{ id: 'announcements', label: 'Meldungen' }] as const;

type TabId = (typeof CORE_TABS)[number]['id'] | (typeof FEATURE_TABS)[number]['id'] | 'features';

export function Admin() {
  const { flags } = useFeatureFlags();
  const tabs = [
    ...CORE_TABS,
    ...FEATURE_TABS.filter((t) => flags[t.id]),
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
