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
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-black/5 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === t.id ? 'bg-white text-tbw-navy shadow-sm' : 'text-tbw-ink/50'
            }`}
          >
            {t.label}
          </button>
        ))}
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
