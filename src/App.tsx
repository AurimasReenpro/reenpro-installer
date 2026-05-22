import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import { queryClient } from './lib/queryClient';
import Login from './pages/auth/Login';
import RoleRedirect from './pages/RoleRedirect';
import ProtectedRoute from './components/auth/ProtectedRoute';
import MobileLayout from './components/mobile/MobileLayout';
import Today from './pages/mobile/Today';
import MobileSites from './pages/mobile/Sites';
import SiteDetail from './pages/mobile/SiteDetail';
import Profile from './pages/mobile/Profile';

import AdminLayout from './components/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Sites from './pages/admin/Sites';
import SiteDetails from './pages/admin/SiteDetails';
import Checklists from './pages/admin/Checklists';
import Installers from './pages/admin/Installers';
import EquipmentCatalog from './pages/admin/EquipmentCatalog';
import AdminSettings from './pages/admin/Settings';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { Toaster } from 'sonner';
import { ConfirmProvider } from './providers/ConfirmProvider';
import { useBranding } from './hooks/useBranding';

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
          <Route path="checklists" element={<Checklists />} />
          <Route path="installers" element={<Installers />} />
          <Route path="catalog" element={<EquipmentCatalog />} />
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
          <Route path="time" element={<div className="p-4 pt-8">Laiko apskaita</div>} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConfirmProvider>
          <AppContent />
        </ConfirmProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
