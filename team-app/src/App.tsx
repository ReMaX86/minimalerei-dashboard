import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useFeatureFlags } from './context/FeatureFlagsContext';
import { LoadingSpinner } from './components/LoadingSpinner';
import { BottomNav } from './components/BottomNav';
import { Header } from './components/Header';
import { Onboarding } from './pages/Onboarding';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { Trikots } from './pages/Trikots';
import { Kampfgericht } from './pages/Kampfgericht';
import { Kader } from './pages/Kader';
import { Admin } from './pages/Admin';
import { PlayerProfiles } from './pages/PlayerProfiles';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <Header title={title} />
      <main className="mx-auto max-w-lg px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  const { role, isAdmin, passwordRecovery } = useAuth();
  const { flags, loading: flagsLoading } = useFeatureFlags();
  const location = useLocation();

  // On mobile, logging in from the Onboarding form can leave the page
  // scrolled down (the on-screen keyboard shifted the viewport while the
  // form was focused) — reset to the top once we switch into the app so the
  // dashboard's greeting isn't hidden above the fold.
  useEffect(() => {
    if (role === 'trainer' || role === 'player') {
      window.scrollTo(0, 0);
    }
  }, [role]);

  if (location.pathname === '/reset-password' || passwordRecovery) {
    return <ResetPassword />;
  }

  if (role === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (role === 'guest') {
    return <Onboarding />;
  }

  // Route decisions below depend on which optional features are enabled
  // (e.g. /team only exists if player_profiles is on) — wait for the flags
  // to load first, otherwise a direct link/refresh on such a route would
  // redirect away before we actually know whether it should be visible.
  if (flagsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Shell title="Start">
            <Dashboard />
          </Shell>
        }
      />
      <Route
        path="/trikots"
        element={
          role === 'viewer' ? (
            <Navigate to="/" replace />
          ) : (
            <Shell title="Trikots">
              <Trikots />
            </Shell>
          )
        }
      />
      <Route
        path="/kampfgericht"
        element={
          <Shell title="Kampfgericht">
            <Kampfgericht />
          </Shell>
        }
      />
      <Route
        path="/kader"
        element={
          role === 'viewer' ? (
            <Navigate to="/" replace />
          ) : (
            <Shell title="Kader">
              <Kader />
            </Shell>
          )
        }
      />
      <Route
        path="/team"
        element={
          flags.player_profiles && role !== 'viewer' ? (
            <Shell title="Team">
              <PlayerProfiles />
            </Shell>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/admin"
        element={
          isAdmin ? (
            <Shell title="Admin">
              <Admin />
            </Shell>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
