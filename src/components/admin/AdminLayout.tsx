import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import * as Sentry from "@sentry/react";

export default function AdminLayout() {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      queryClient.clear(); 
      signOut();
      void navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout error:', error); Sentry.captureException(error, { extra: { context: 'Logout error:' } });
      signOut();
      void navigate('/login', { replace: true });
    }
  };

  const navItems = [
    { name: 'Dashboard', path: '/admin', icon: 'dashboard', end: true },
    { name: 'Objektai', path: '/admin/sites', icon: 'dataset', end: false },
    { name: 'Montuotojai', path: '/admin/installers', icon: 'group', end: false },
    { name: 'Checklist\'ai', path: '/admin/checklists', icon: 'fact_check', end: false },
    { name: 'Bonusai', path: '/admin/bonuses', icon: 'payments', end: false },
    { name: 'Ataskaitos', path: '/admin/reports', icon: 'bar_chart', end: false },
    { name: 'Importas', path: '/admin/import', icon: 'upload_file', end: false, className: 'mt-4' },
  ];

  return (
    <div className="bg-[#f6f5fa] text-[#1d033a] font-sans antialiased h-screen overflow-hidden flex">
      {/* Sidebar */}
      <aside className="w-[240px] bg-[#1d033a] flex-shrink-0 flex flex-col justify-between py-6 h-full z-20">
        <div>
          {/* Logo */}
          <div className="px-6 mb-8 flex items-center gap-2">
            <span className="material-symbols-outlined icon-filled text-[#fc391d] text-[24px]">sunny</span>
            <span className="text-white font-bold text-[20px] tracking-tight">InstallerApp</span>
          </div>
          {/* Nav Items */}
          <nav className="px-3 flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 font-medium rounded-[8px] transition-colors ${item.className || ''} ${
                    isActive
                      ? 'bg-[#490891] text-white font-semibold'
                      : 'text-white/70 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`material-symbols-outlined ${isActive ? 'icon-filled' : ''}`}>
                      {item.icon}
                    </span>
                    {item.name}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
        {/* Bottom Avatar */}
        <div className="px-6 flex items-center justify-between border-t border-white/10 pt-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#b71500] text-white flex items-center justify-center font-bold text-[14px]">
              {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'AD'}
            </div>
            <span className="text-white font-medium text-[14px] truncate max-w-[100px]">
              {profile?.full_name || 'Admin'}
            </span>
          </div>
          <button 
            onClick={() => { void handleSignOut(); }}
            className="text-white/70 hover:text-white transition-colors"
            title="Atsijungti"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Bar */}
        <header className="h-[60px] bg-white flex items-center justify-between px-6 flex-shrink-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.03)] border-b border-[#cdc3d4]/30">
          <h2 className="text-[20px] font-bold text-[#1d033a]">Dashboard</h2>
          
          <div className="relative w-[320px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#7c7484] text-[20px]">
              search
            </span>
            <input 
              type="text" 
              placeholder="Ieškoti objektų..." 
              className="w-full bg-[#f6f5fa] border border-[#cdc3d4]/50 rounded-full h-[36px] pl-10 pr-4 text-[14px] text-[#1d033a] focus:outline-none focus:border-[#490891] transition-colors"
            />
          </div>

          <button className="relative w-[36px] h-[36px] flex items-center justify-center rounded-full hover:bg-[#eedbff] transition-colors text-[#4b4452]">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-[8px] right-[8px] w-[8px] h-[8px] bg-[#fc391d] rounded-full border-[1.5px] border-white"></span>
          </button>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto bg-[#f6f5fa] p-6 space-y-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
