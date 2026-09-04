import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
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

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen pb-20">
      <Header title={title} />
      <main className="mx-auto max-w-lg px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  const { role } = useAuth();
  const location = useLocation();

  if (location.pathname === '/reset-password') {
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
          <Shell title="Trikots">
            <Trikots />
          </Shell>
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
          <Shell title="Kader">
            <Kader />
          </Shell>
        }
      />
      <Route
        path="/admin"
        element={
          role === 'trainer' ? (
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
