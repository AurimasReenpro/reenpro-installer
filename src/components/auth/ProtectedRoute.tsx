import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import FullPageSpinner from '../ui/FullPageSpinner';

interface ProtectedRouteProps {
  children?: React.ReactNode;
  requiredRole?: 'admin' | 'installer';
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuthStore();

  if (loading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && profile?.role !== requiredRole) {
    if (profile?.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    if (profile?.role === 'installer') {
      return <Navigate to="/m" replace />;
    }
    // Fallback if role is completely missing
    return <Navigate to="/login" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
