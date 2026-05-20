import { useAuth } from '../../hooks/useAuth';
import { LogOut } from 'lucide-react';

export default function Profile() {
  const { profile, logout } = useAuth();

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
        onClick={() => { void logout(); }}
        className="w-full bg-[#FFF1F0] text-[#fc391d] border border-[#fc391d]/20 font-bold text-[15px] h-[48px] rounded-[12px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <LogOut className="w-5 h-5" />
        Atsijungti
      </button>
    </div>
  );
}
