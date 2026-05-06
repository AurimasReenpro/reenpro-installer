import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { FEATURES } from '../../config/features';

export default function MobileLayout() {
  const location = useLocation();

  const navItems = [
    { path: '/m', icon: 'today', label: 'Šiandien', exact: true },
    { path: '/m/sites', icon: 'list', label: 'Visi' },
    { path: '/m/time', icon: 'schedule', label: 'Laikas' },
    ...(FEATURES.INSTALLER_BONUS_VIEW
      ? [{ path: '/m/bonus', icon: 'payments', label: 'Priedai' }]
      : []),
    { path: '/m/profile', icon: 'person', label: 'Profilis' },
  ];

  return (
    <div className="h-screen flex flex-col bg-app-bg relative">
      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 h-[56px] bg-surface-bright shadow-sm z-50 flex items-center justify-between px-4">
        <button className="text-on-surface-variant flex items-center justify-center min-w-[44px] min-h-[44px]">
          <span className="material-symbols-outlined">menu</span>
        </button>
        <h1 className="text-primary font-bold text-lg">InstallerApp</h1>
        <button className="text-on-surface-variant flex items-center justify-center min-w-[44px] min-h-[44px] relative">
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute w-2 h-2 bg-[#fc391d] top-2 right-2 rounded-full border-2 border-surface-bright"></span>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-[56px] pb-[64px] bg-app-bg">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 h-[64px] bg-surface-bright border-t border-outline-variant shadow-[0_-2px_10px_rgba(29,3,58,0.05)] z-50 flex">
        {navItems.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              <span
                className="material-symbols-outlined"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {item.icon}
              </span>
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
