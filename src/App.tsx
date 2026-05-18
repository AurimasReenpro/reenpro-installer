import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import Checklists from './pages/admin/Checklists';
import ErrorBoundary from './components/ui/ErrorBoundary';

function AppContent() {
  // Initialize auth listener
  useAuth();

  return (
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
        <Route path="checklists" element={<Checklists />} />
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
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
