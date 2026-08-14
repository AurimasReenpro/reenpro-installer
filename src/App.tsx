import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useIsRestoring } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import { queryClient } from './lib/queryClient';
import { createIDBPersister } from './lib/persister';
import Login from './pages/auth/Login';
import RoleRedirect from './pages/RoleRedirect';
import ProtectedRoute from './components/auth/ProtectedRoute';
import ErrorBoundary from './components/ui/ErrorBoundary';
import FullPageSpinner from './components/ui/FullPageSpinner';
import { Toaster } from 'sonner';
import { ConfirmProvider } from './providers/ConfirmProvider';
import { useBranding } from './hooks/useBranding';

// ── Code-split the two app surfaces ───────────────────────────────────────────
// The admin desktop bundle and the mobile field bundle are loaded on demand, so
// a field worker on a slow connection never downloads the admin code (and vice
// versa). Login + RoleRedirect stay eager — they're tiny and needed instantly.
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Sites = lazy(() => import('./pages/admin/Sites'));
const SiteDetails = lazy(() => import('./pages/admin/SiteDetails'));
const Checklists = lazy(() => import('./pages/admin/Checklists'));
const Installers = lazy(() => import('./pages/admin/Installers'));
const EquipmentCatalog = lazy(() => import('./pages/admin/EquipmentCatalog'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Schedule = lazy(() => import('./pages/admin/Schedule'));
// Atlyginimai laikinai atjungti (2026-08-14). Maršruto nėra, tad ir kodas
// nepatenka į paketą. `src/pages/admin/payroll/` paliktas vietoje — grąžinti
// reikia šios eilutės ir maršruto žemiau.

const MobileLayout = lazy(() => import('./components/mobile/MobileLayout'));
const Today = lazy(() => import('./pages/mobile/Today'));
const MobileSites = lazy(() => import('./pages/mobile/Sites'));
const SiteDetail = lazy(() => import('./pages/mobile/SiteDetail'));
const Profile = lazy(() => import('./pages/mobile/Profile'));
const Stats = lazy(() => import('./pages/mobile/Stats'));

// Holds the first paint until the IndexedDB cache has been restored, so the app
// never flashes an empty state before the persisted data hydrates.
function RestoreGate({ children }: { children: ReactNode }) {
  const isRestoring = useIsRestoring();
  if (isRestoring) return <FullPageSpinner />;
  return <>{children}</>;
}

function AppContent() {
  // Initialize branding (updates CSS variables)
  useBranding();
  // Initialize auth listener
  useAuth();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const toastPosition = isAdmin ? 'top-right' : 'bottom-center';

  return (
    <>
      <Toaster
        position={toastPosition}
        richColors
        toastOptions={{
          style: {
            borderRadius: '12px',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '14px',
          }
        }}
      />
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RoleRedirect />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <ErrorBoundary>
                  <AdminLayout />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="sites" element={<Sites />} />
            <Route path="sites/:id" element={<SiteDetails />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="checklists" element={<Checklists />} />
            <Route path="installers" element={<Installers />} />
            <Route path="catalog" element={<EquipmentCatalog />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route
            path="/m"
            element={
              <ProtectedRoute requiredRole="installer">
                <ErrorBoundary>
                  <MobileLayout />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          >
            <Route index element={<Today />} />
            <Route path="sites" element={<MobileSites />} />
            <Route path="sites/:id" element={<SiteDetail />} />
            <Route path="stats" element={<Stats />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

const persister = createIDBPersister();

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        // On-disk snapshot is trusted for up to 36h — long enough for a worker
        // to reopen the app underground the next day and still view their data.
        maxAge: 36 * 60 * 60_000,
        // Bump when cache shape changes to invalidate stale persisted snapshots.
        buster: 'v1',
        // Persist paused (queued offline) mutations too, so the outbox survives reloads.
        dehydrateOptions: { shouldDehydrateMutation: () => true },
      }}
      onSuccess={() => {
        // Restoration complete → replay any mutations that were queued offline.
        void queryClient.resumePausedMutations();
      }}
    >
      <BrowserRouter>
        <ConfirmProvider>
          <RestoreGate>
            <AppContent />
          </RestoreGate>
        </ConfirmProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  );
}
