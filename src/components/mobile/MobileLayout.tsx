import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Menu as MenuIcon, Bell, Calendar, List, Clock, Coins, User, WifiOff, RefreshCw, BarChart3 } from 'lucide-react';
import { useIsMutating } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FEATURES } from '../../config/features';
import { useBranding } from '../../hooks/useBranding';
import { useSyncStore } from '../../stores/useSyncStore';

// Track real connectivity via the browser's online/offline events.
function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  return online;
}

/** Subtle header chip: amber when offline, blue while flushing the outbox. */
function NetworkStatusChip() {
  const online = useOnlineStatus();
  // Pending mutations (incl. queued/paused offline writes) — used to show the
  // brief "syncing" state once connectivity returns and the outbox flushes.
  const pending = useIsMutating();
  // Photos sitting in the durable IndexedDB outbox.
  const pendingPhotos = useSyncStore((s) => s.pendingPhotos);

  if (!online) {
    return (
      <span
        title="Neprisijungta — duomenys saugomi telefone ir bus išsiųsti atsiradus ryšiui"
        className="flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-warning-bg text-warning border border-warning/40 text-[11px] font-semibold whitespace-nowrap"
      >
        <WifiOff className="w-3.5 h-3.5" />
        {pendingPhotos > 0 ? `Neprisijungta · ${pendingPhotos} nuotr.` : 'Neprisijungta'}
      </span>
    );
  }
  if (pending > 0 || pendingPhotos > 0) {
    return (
      <span className="flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-primary-fixed text-on-primary-fixed border border-primary/20 text-[11px] font-semibold whitespace-nowrap">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        {pendingPhotos > 0 ? `Keliama (${pendingPhotos})` : 'Sinchronizuojama…'}
      </span>
    );
  }
  return null;
}

export default function MobileLayout() {
  const location = useLocation();
  const { logoUrl, companyName } = useBranding();

  const navItems = [
    { path: '/m', icon: 'today', label: 'Šiandien', exact: true },
    { path: '/m/sites', icon: 'list', label: 'Visi' },
    { path: '/m/stats', icon: 'stats', label: 'Statistika' },
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
      case 'stats':
        return BarChart3;
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
        <div className="flex items-center gap-1.5">
          <NetworkStatusChip />
          <button
            onClick={() => toast.info('Pranešimų centras kuriamas.')}
            aria-label="Pranešimai"
            className="text-on-surface-variant flex items-center justify-center min-w-[48px] min-h-[48px]"
          >
            <Bell className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-[56px] pb-[72px] bg-app-bg">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 h-[72px] bg-surface-bright border-t border-outline-variant shadow-[0_-2px_10px_rgba(24,35,33,0.05)] z-50 flex">
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
