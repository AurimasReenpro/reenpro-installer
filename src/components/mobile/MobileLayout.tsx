import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Menu as MenuIcon, Bell, Calendar, List, Clock, Coins, User, Download } from 'lucide-react';
import { toast } from 'sonner';
import { FEATURES } from '../../config/features';
import { useBranding } from '../../hooks/useBranding';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export default function MobileLayout() {
  const location = useLocation();
  const { logoUrl, companyName } = useBranding();
  const { canInstall, promptInstall } = usePWAInstall();

  const navItems = [
    { path: '/m', icon: 'today', label: 'Šiandien', exact: true },
    { path: '/m/sites', icon: 'list', label: 'Visi' },
    { path: '/m/time', icon: 'schedule', label: 'Laikas' },
    ...(FEATURES.INSTALLER_BONUS_VIEW
      ? [{ path: '/m/bonus', icon: 'payments', label: 'Priedai' }]
      : []),
    { path: '/m/profile', icon: 'person', label: 'Profilis' },
  ];

  const getIconComponent = (icon: string) => {
    switch (icon) {
      case 'today':
        return Calendar;
      case 'list':
        return List;
      case 'schedule':
        return Clock;
      case 'payments':
        return Coins;
      case 'person':
        return User;
      default:
        return Calendar;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-app-bg relative">
      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 h-[56px] bg-surface-bright shadow-sm z-50 flex items-center justify-between px-4">
        <button
          onClick={() => toast.info('Meniu kuriamas.')}
          aria-label="Meniu"
          className="text-on-surface-variant flex items-center justify-center min-w-[48px] min-h-[48px]"
        >
          <MenuIcon className="w-6 h-6" />
        </button>
        {logoUrl ? (
          <img src={logoUrl} alt={companyName ?? 'Logo'} className="h-8 w-auto max-w-[140px] object-contain" />
        ) : (
          <h1 className="text-primary font-bold text-lg truncate px-2">{companyName || 'InstallerApp'}</h1>
        )}
        <button
          onClick={() => toast.info('Pranešimų centras kuriamas.')}
          aria-label="Pranešimai"
          className="text-on-surface-variant flex items-center justify-center min-w-[48px] min-h-[48px]"
        >
          <Bell className="w-6 h-6" />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-[56px] pb-[72px] bg-app-bg">
        <Outlet />
      </main>

      {/* Install App prompt (only when the browser offers installation) */}
      {canInstall && (
        <button
          onClick={() => { void promptInstall(); }}
          aria-label="Įdiegti programėlę"
          className="fixed bottom-[84px] right-4 z-50 flex items-center gap-2 h-12 px-4 rounded-full bg-primary text-white text-sm font-semibold shadow-lg active:scale-[0.97] transition-transform"
        >
          <Download className="w-5 h-5" />
          Įdiegti programėlę
        </button>
      )}

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 h-[72px] bg-surface-bright border-t border-outline-variant shadow-[0_-2px_10px_rgba(29,3,58,0.05)] z-50 flex">
        {navItems.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path);

          const Icon = getIconComponent(item.icon);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[48px] ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              <span
                className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}
              >
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
