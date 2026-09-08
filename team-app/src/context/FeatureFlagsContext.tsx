import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { FEATURE_LABELS, type FeatureKey } from '../types/database';

type Flags = Record<FeatureKey, boolean>;

const DEFAULT_FLAGS: Flags = Object.fromEntries(
  Object.keys(FEATURE_LABELS).map((key) => [key, false])
) as Flags;

interface FeatureFlagsState {
  flags: Flags;
  loading: boolean;
  refresh: () => Promise<void>;
}

const FeatureFlagsContext = createContext<FeatureFlagsState | null>(null);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const [flags, setFlags] = useState<Flags>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('feature_flags').select('*');
    const next = { ...DEFAULT_FLAGS };
    (data ?? []).forEach((row: { key: string; enabled: boolean }) => {
      if (row.key in next) next[row.key as FeatureKey] = row.enabled;
    });
    setFlags(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (role === 'loading') return;
    if (role === 'guest') {
      setFlags(DEFAULT_FLAGS);
      setLoading(false);
      return;
    }
    refresh().catch(() => setLoading(false));
  }, [role, refresh]);

  return (
    <FeatureFlagsContext.Provider value={{ flags, loading, refresh }}>{children}</FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  const ctx = useContext(FeatureFlagsContext);
  if (!ctx) throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider');
  return ctx;
}
