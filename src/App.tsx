import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import Login from './pages/auth/Login';
import RoleRedirect from './pages/RoleRedirect';
import ProtectedRoute from './components/auth/ProtectedRoute';
import MobileLayout from './components/mobile/MobileLayout';
import Today from './pages/mobile/Today';
import SiteDetail from './pages/mobile/SiteDetail';

const queryClient = new QueryClient();

// Admin placeholder
function AdminLayout() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-primary">Admin Layout</h1>
      <p className="text-on-surface-variant">Role: admin</p>
    </div>
  );
}

function AppContent() {
  // Initialize auth listener
  useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RoleRedirect />} />
      
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/m"
        element={
          <ProtectedRoute requiredRole="installer">
            <MobileLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Today />} />
        <Route path="sites" element={<div className="p-4 pt-8">Visi objektai</div>} />
        <Route path="sites/:id" element={<SiteDetail />} />
        <Route path="time" element={<div className="p-4 pt-8">Laiko apskaita</div>} />
        <Route path="profile" element={<div className="p-4 pt-8">Profilis</div>} />
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
