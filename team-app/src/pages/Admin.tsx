import { useState } from 'react';
import { PlayersAdmin } from './admin/PlayersAdmin';
import { GamesAdmin } from './admin/GamesAdmin';
import { OfficiatingAdmin } from './admin/OfficiatingAdmin';
import { TrainingsAdmin } from './admin/TrainingsAdmin';

const TABS = [
  { id: 'players', label: 'Spieler' },
  { id: 'games', label: 'Spiele' },
  { id: 'officiating', label: 'Kampfgericht' },
  { id: 'trainings', label: 'Training' }
] as const;

type TabId = (typeof TABS)[number]['id'];

export function Admin() {
  const [tab, setTab] = useState<TabId>('players');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-black/5 p-1">
        {TABS.map((t) => (
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
    </div>
  );
}
