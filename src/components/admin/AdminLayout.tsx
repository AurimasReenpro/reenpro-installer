import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useBranding } from '../../hooks/useBranding';
import { toast } from 'sonner';
import { useConfirm } from '../../hooks/useConfirm';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Users, 
  ClipboardCheck, 
  Coins, 
  BarChart3, 
  Upload, 
  Sun, 
  LogOut, 
  Search, 
  Bell,
  Package,
  Settings
} from 'lucide-react';

export default function AdminLayout() {
  const { profile, logout } = useAuth();
  const { logoUrl, companyName } = useBranding();
  const confirm = useConfirm();

  const navItems = [
    { name: 'Dashboard', path: '/admin', icon: 'dashboard', end: true },
    { name: 'Objektai', path: '/admin/sites', icon: 'dataset', end: false },
    { name: 'Montuotojai', path: '/admin/installers', icon: 'group', end: false },
    { name: 'Checklist\'ai', path: '/admin/checklists', icon: 'fact_check', end: false },
    { name: 'Įrangos katalogas', path: '/admin/catalog', icon: 'catalog', end: false },
    { name: 'Bonusai', path: '/admin/bonuses', icon: 'payments', end: false, comingSoon: true },
    { name: 'Ataskaitos', path: '/admin/reports', icon: 'bar_chart', end: false },
    { name: 'Importas', path: '/admin/import', icon: 'upload_file', end: false, className: 'mt-4', comingSoon: true },
  ];

  const settingsItem = { name: 'Nustatymai', path: '/admin/settings', icon: 'settings', end: false };

  const getIconComponent = (icon: string) => {
    switch (icon) {
      case 'dashboard':
        return LayoutDashboard;
      case 'dataset':
        return FolderKanban;
      case 'group':
        return Users;
      case 'fact_check':
        return ClipboardCheck;
      case 'catalog':
        return Package;
      case 'settings':
        return Settings;
      case 'payments':
        return Coins;
      case 'bar_chart':
        return BarChart3;
      case 'upload_file':
        return Upload;
      default:
        return LayoutDashboard;
    }
  };

  return (
    <div className="bg-[#f6f5fa] text-[#1d033a] font-sans antialiased h-screen overflow-hidden flex">
      {/* Sidebar */}
      <aside className="w-[240px] bg-[#1d033a] flex-shrink-0 flex flex-col justify-between py-6 h-full z-20">
        <div>
          {/* Logo */}
          <div className="px-6 mb-8 flex items-center min-h-[48px]">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName ?? 'Logo'} className="h-10 w-auto max-w-[180px] object-contain" />
            ) : (
              <>
                <Sun className="text-[#fc391d] w-6 h-6 flex-shrink-0" fill="currentColor" />
                <span className="text-white font-bold text-[18px] tracking-tight truncate">
                  {companyName || 'InstallerApp'}
                </span>
              </>
            )}
          </div>
          {/* Nav Items */}
          <nav className="px-3 flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = getIconComponent(item.icon);

              if (item.comingSoon) {
                return (
                  <button
                    key={item.name}
                    onClick={() => {
                      void (async () => {
                        const wantsNotification = await confirm({
                          title: "Kuriame šią funkciją!",
                          message: "Mes intensyviai dirbame ties šiuo moduliu. Ar norėtumėte gauti pranešimą elektroniniu paštu, kai jis bus aktyvuotas?",
                          confirmText: "Taip, praneškite man!",
                          cancelText: "Uždaryti",
                          variant: 'primary'
                        });
                        if (wantsNotification) {
                          toast.success("Ačiū! Informuosime jus elektroniniu paštu.");
                        }
                      })();
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 font-medium rounded-[8px] transition-colors ${item.className || ''} text-white/70 hover:text-white hover:bg-white/5 cursor-pointer text-left`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.name}</span>
                    <motion.span 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 10 }}
                      whileHover={{ scale: 1.1, rotate: 2 }}
                      className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[#fc391d] bg-[#fc391d]/15 px-2 py-0.5 rounded-full"
                    >
                      Beta
                    </motion.span>
                  </button>
                );
              }
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 font-medium rounded-[8px] transition-colors ${item.className || ''} ${
                      isActive
                        ? 'bg-primary text-white font-semibold'
                        : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-white/70'}`} />
                      {item.name}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
        {/* Settings + Bottom Avatar */}
        <div className="px-3 border-t border-white/10 pt-3 pb-0 flex flex-col gap-1 mb-0">
          {/* Settings link */}
          <NavLink
            to={settingsItem.path}
            end={settingsItem.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 font-medium rounded-[8px] transition-colors ${
                isActive
                  ? 'bg-primary text-white font-semibold'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Settings className={`w-5 h-5 ${isActive ? 'text-white' : 'text-white/70'}`} />
                {settingsItem.name}
              </>
            )}
          </NavLink>
        </div>
        {/* Bottom Avatar */}
        <div className="px-6 flex items-center justify-between border-t border-white/10 pt-4 mt-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#b71500] text-white flex items-center justify-center font-bold text-[14px]">
              {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'AD'}
            </div>
            <span className="text-white font-medium text-[14px] truncate max-w-[100px]">
              {profile?.full_name || 'Admin'}
            </span>
          </div>
          <button 
            onClick={() => { void logout(); }}
            className="text-white/70 hover:text-white transition-colors"
            title="Atsijungti"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Bar */}
        <header className="h-[60px] bg-white flex items-center justify-between px-6 flex-shrink-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.03)] border-b border-[#cdc3d4]/30">
          <h2 className="text-[20px] font-bold text-[#1d033a]">Dashboard</h2>
          
          <div className="relative w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7c7484] w-5 h-5" />
            <input 
              type="text" 
              placeholder="Ieškoti objektų..." 
              className="w-full bg-[#f6f5fa] border border-[#cdc3d4]/50 rounded-full h-[36px] pl-10 pr-4 text-[14px] text-[#1d033a] focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <button className="relative w-[36px] h-[36px] flex items-center justify-center rounded-full hover:bg-[#eedbff] transition-colors text-[#4b4452]">
            <Bell className="w-5 h-5" />
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
