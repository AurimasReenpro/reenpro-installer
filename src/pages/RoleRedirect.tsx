import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import FullPageSpinner from '../components/ui/FullPageSpinner';

export default function RoleRedirect() {
  const { user, profile, loading } = useAuthStore();

  if (loading) {
    return <FullPageSpinner />;
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (profile.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  if (profile.role === 'installer') {
    return <Navigate to="/m" replace />;
  }

  // Fallback if role is unknown
  return <Navigate to="/login" replace />;
}
