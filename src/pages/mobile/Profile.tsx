import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import * as Sentry from "@sentry/react";

export default function Profile() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      queryClient.clear(); // Wipe all cached user data
      void navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout error:', error); Sentry.captureException(error, { extra: { context: 'Logout error:' } });
      // Force redirect anyway
      void navigate('/login', { replace: true });
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-2xl font-bold text-primary">Profilis</h2>
      
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-avatar-accent text-white flex items-center justify-center text-xl font-bold">
            {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : '??'}
          </div>
          <div>
            <h3 className="text-lg font-bold text-on-surface">{profile?.full_name || 'Vartotojas'}</h3>
            <p className="text-on-surface-variant text-sm capitalize">{profile?.role}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-outline uppercase tracking-wider">El. paštas</label>
            <p className="text-on-surface font-medium mt-1">{profile?.email || 'Nenurodyta'}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-outline uppercase tracking-wider">Telefonas</label>
            <p className="text-on-surface font-medium mt-1">{profile?.phone || 'Nenurodyta'}</p>
          </div>
        </div>
      </div>

      <button
        onClick={() => { void handleLogout(); }}
        className="w-full bg-[#FFF1F0] text-notify border border-notify/20 font-bold text-[15px] h-[48px] rounded-[12px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <span className="material-symbols-outlined">logout</span>
        Atsijungti
      </button>
    </div>
  );
}
