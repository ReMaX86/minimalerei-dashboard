import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { supabase } from '../lib/supabase';
import type { Player, Trainer } from '../types/database';

type Role = 'loading' | 'guest' | 'trainer' | 'player';

interface AuthState {
  role: Role;
  trainer: Trainer | null;
  player: Player | null;
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  loginTrainer: (email: string, password: string) => Promise<void>;
  redeemCode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshPlayer: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('loading');
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const resolveSession = useCallback(async () => {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      setRole('guest');
      setTrainer(null);
      setPlayer(null);
      return;
    }

    const { data: trainerRow } = await supabase
      .from('trainers')
      .select('id, name, email')
      .eq('id', session.user.id)
      .maybeSingle();

    if (trainerRow) {
      setTrainer(trainerRow as Trainer);
      setPlayer(null);
      setRole('trainer');
      return;
    }

    // player_auth_links has no client-facing RLS policy by design (see
    // migration 0001) — resolve the current player via the security-definer
    // current_player_id() function instead of querying the table directly.
    const { data: playerId } = await supabase.rpc('current_player_id');

    if (playerId) {
      const { data: playerRow } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId)
        .maybeSingle();
      if (playerRow) {
        setPlayer(playerRow as Player);
        setTrainer(null);
        setRole('player');
        return;
      }
    }

    setRole('guest');
    setTrainer(null);
    setPlayer(null);
  }, []);

  useEffect(() => {
    resolveSession();
    // Supabase fires PASSWORD_RECOVERY when a recovery link's session is picked up
    // from the URL, regardless of which page it landed on (e.g. if the redirect URL
    // isn't set up exactly right and it falls back to the site root) — so this is a
    // more reliable trigger for the reset-password screen than checking the path.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
      resolveSession();
    });
    return () => sub.subscription.unsubscribe();
  }, [resolveSession]);

  const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  const loginTrainer = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const redeemCode = useCallback(async (code: string) => {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      const { error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError) throw anonError;
    }

    const { error } = await supabase.rpc('redeem_access_code', { p_code: code.trim() });
    if (error) {
      if (error.message.includes('invalid_code')) {
        throw new Error('Code nicht erkannt. Bitte beim Trainer nachfragen.');
      }
      throw error;
    }
    await resolveSession();
  }, [resolveSession]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setRole('guest');
    setTrainer(null);
    setPlayer(null);
  }, []);

  const refreshPlayer = useCallback(async () => {
    if (!player) return;
    const { data } = await supabase.from('players').select('*').eq('id', player.id).maybeSingle();
    if (data) setPlayer(data as Player);
  }, [player]);

  const value = useMemo(
    () => ({
      role,
      trainer,
      player,
      passwordRecovery,
      clearPasswordRecovery,
      loginTrainer,
      redeemCode,
      logout,
      refreshPlayer
    }),
    [role, trainer, player, passwordRecovery, clearPasswordRecovery, loginTrainer, redeemCode, logout, refreshPlayer]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
