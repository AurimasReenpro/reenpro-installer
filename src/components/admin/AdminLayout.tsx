import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useBranding } from '../../hooks/useBranding';
import { toast } from 'sonner';
import { useConfirm } from '../../hooks/useConfirm';
import reenproLogo from '../../assets/reenpro-baltas.svg';
import { supabase } from '../../lib/supabase';
import { useTheme, type ThemePreference } from '../../hooks/useTheme';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  FolderKanban,
  CalendarDays,
  Users,
  ClipboardCheck,
  Coins,
  BarChart3,
  Upload,
  LogOut,
  Search,
  MapPin,
  Bell,
  BellOff,
  CheckCircle,
  PlayCircle,
  Package,
  Settings,
  Moon,
  Monitor,
  Sun as SunIcon
} from 'lucide-react';

type AdminNotification = {
  id: string;
  type: 'success' | 'info';
  message: string;
  time: Date;
};

type SearchResult = {
  id: string;
  client_name: string | null;
  address: string | null;
  code: string | null;
  status: string | null;
};

export default function AdminLayout() {
  const { profile, logout } = useAuth();
  const { logoUrl, companyName } = useBranding();
  const confirm = useConfirm();
  const navigate = useNavigate();

  // Theme engine: Light / Dark / System (persisted, OS-reactive).
  const { theme, setTheme } = useTheme();
  const themeOptions: { value: ThemePreference; label: string; Icon: typeof SunIcon }[] = [
    { value: 'light', label: 'Šviesi', Icon: SunIcon },
    { value: 'dark', label: 'Tamsi', Icon: Moon },
    { value: 'system', label: 'Sistemos', Icon: Monitor },
  ];

  // Global "Spotlight" search over sites.
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounced Supabase lookup (name / address / code) when query length > 1.
  useEffect(() => {
    const q = globalSearch.trim();
    const timer = setTimeout(() => {
      if (q.length < 2) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      void (async () => {
        const { data, error } = await supabase
          .from('sites')
          .select('id, client_name, address, code, status')
          .or(`client_name.ilike.%${q}%,address.ilike.%${q}%,code.ilike.%${q}%`)
          .limit(5);
        if (!error) setSearchResults(data ?? []);
        setSearching(false);
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  // Close the search dropdown on outside-click or Esc.
  useEffect(() => {
    if (!globalSearch) return;
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setGlobalSearch('');
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGlobalSearch('');
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [globalSearch]);

  const goToResult = (siteId: string) => {
    void navigate(`/admin/sites/${siteId}`);
    setGlobalSearch('');
    setSearchResults([]);
  };

  // Notification center: live-fed via Supabase Realtime on the sites table.
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside-click or Esc.
  useEffect(() => {
    if (!notifOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [notifOpen]);

  // Realtime: listen for status transitions on sites and surface them as toasts/notifications.
  useEffect(() => {
    const channel = supabase
      .channel('sites-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sites' },
        (payload) => {
          const next = payload.new as { id: string; status: string | null; client_name: string | null };
          const prev = payload.old as { status?: string | null };
          const name = next.client_name || 'Nežinomas';

          if (next.status === 'completed' && prev.status !== 'completed') {
            setNotifications((list) => [
              { id: next.id, type: 'success', message: `Projektas užbaigtas: ${name}`, time: new Date() },
              ...list,
            ]);
          } else if (next.status === 'in_progress' && prev.status !== 'in_progress') {
            setNotifications((list) => [
              { id: next.id, type: 'info', message: `Pradėti darbai: ${name}`, time: new Date() },
              ...list,
            ]);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const navItems = [
    { name: 'Suvestinė', path: '/admin', icon: 'dashboard', end: true },
    { name: 'Objektai', path: '/admin/sites', icon: 'dataset', end: false },
    { name: 'Tvarkaraštis', path: '/admin/schedule', icon: 'schedule', end: false },
    { name: 'Montuotojai', path: '/admin/installers', icon: 'group', end: false },
    { name: 'Kontroliniai sąrašai', path: '/admin/checklists', icon: 'fact_check', end: false },
    { name: 'Įrangos katalogas', path: '/admin/catalog', icon: 'catalog', end: false },
    { name: 'Atlyginimai', path: '/admin/payroll', icon: 'payments', end: false },
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
      case 'schedule':
        return CalendarDays;
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
    <div className="bg-bg text-text font-sans antialiased h-screen overflow-hidden flex">
      {/* Sidebar — REENPRO: slyvinė juosta, kaip reikalauja dizaino sistema */}
      <aside className="w-[240px] bg-nav border-r border-nav-border flex-shrink-0 flex flex-col justify-between py-6 h-full z-20">
        <div>
          {/* Logo */}
          {/* Dizaino sistema: baltas logotipas, 160 px plotis, 24 px paraštės,
              ant #1d033a fono. Logotipas pats neša prekės ženklą, todėl šalia
              jo ember brūkšnio nėra — tik programėlės vardas po juo. */}
          <div className="px-6 mb-8">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName ?? 'Logo'} className="h-8 w-auto max-w-[160px] object-contain" />
            ) : (
              <img src={reenproLogo} alt="Reenpro" className="w-[160px] h-auto" />
            )}
            <p className="mt-2 text-[11px] font-medium uppercase tracking-[.14em] text-nav-muted">
              Montuotojas
            </p>
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
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium rounded-card transition-colors ${item.className || ''} text-nav-muted hover:bg-nav-hover hover:text-nav-ink cursor-pointer text-left`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.name}</span>
                    <motion.span
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 10 }}
                      whileHover={{ scale: 1.1, rotate: 2 }}
                      className="ml-auto text-[10px] font-bold uppercase tracking-wider text-accent bg-accent/15 px-2 py-0.5 rounded-full"
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
                    `flex items-center gap-3 px-3 py-2.5 text-[14px] rounded-card transition-all ${item.className || ''} ${
                      isActive
                        ? 'bg-nav-hover text-nav-ink font-semibold'
                        : 'text-nav-muted font-medium hover:bg-nav-hover hover:text-nav-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`w-5 h-5 ${isActive ? 'text-accent' : 'text-nav-muted'}`} />
                      {item.name}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
        {/* Settings + Theme toggle */}
        <div className="px-3 border-t border-nav-border pt-3 pb-0 flex flex-col gap-1 mb-0">
          {/* Settings link */}
          <NavLink
            to={settingsItem.path}
            end={settingsItem.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 text-[14px] rounded-card transition-all ${
                isActive
                  ? 'bg-nav-hover text-nav-ink font-semibold'
                  : 'text-nav-muted font-medium hover:bg-nav-hover hover:text-nav-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Settings className={`w-5 h-5 ${isActive ? 'text-accent' : 'text-nav-muted'}`} />
                {settingsItem.name}
              </>
            )}
          </NavLink>

          {/* Appearance — Apple-style segmented control */}
          <div className="px-3 pt-2 pb-1">
            <p className="text-[11px] font-bold text-nav-muted uppercase tracking-wider mb-1.5 ml-1">
              Išvaizda
            </p>
            <div className="flex items-center gap-1 bg-nav-hover rounded-card p-1">
              {themeOptions.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  title={label}
                  aria-pressed={theme === value}
                  className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-all cursor-pointer ${
                    theme === value
                      ? 'bg-accent/25 text-nav-ink'
                      : 'text-nav-muted hover:text-nav-ink'
                  }`}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Bottom Avatar */}
        <div className="px-6 flex items-center justify-between border-t border-nav-border pt-4 mt-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-[14px]">
              {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'AD'}
            </div>
            <span className="text-nav-ink font-semibold text-[14px] truncate max-w-[100px]">
              {profile?.full_name || 'Admin'}
            </span>
          </div>
          <button
            onClick={() => { void logout(); }}
            className="text-nav-muted hover:text-nav-ink transition-colors"
            title="Atsijungti"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Bar */}
        <header className="h-[60px] bg-surface/80 backdrop-blur-xl flex items-center justify-between px-6 flex-shrink-0 z-10 border-b border-border">
          <h2 className="text-[20px] font-extrabold tracking-tight text-text flex-shrink-0">Suvestinė</h2>

          {/* Global Spotlight search */}
          <div className="relative w-full max-w-md hidden md:block mx-4" ref={searchRef}>
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Ieškoti objektų pagal pavadinimą, adresą ar ID..."
              className="bg-surface-2 border border-border text-text placeholder-subtle rounded-card pl-10 pr-4 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />

            {globalSearch.trim().length > 1 && (
              <div className="absolute top-full mt-2 w-full bg-surface rounded-card shadow-xl border border-border overflow-hidden z-50">
                {searching ? (
                  <div className="px-4 py-6 text-center text-sm text-muted">Ieškoma…</div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted">Nieko nerasta</div>
                ) : (
                  <ul className="max-h-80 overflow-y-auto divide-y divide-border">
                    {searchResults.map((site) => (
                      <li key={site.id}>
                        <button
                          onClick={() => goToResult(site.id)}
                          className="w-full text-left px-4 py-3 hover:bg-surface-2 transition-colors flex items-center gap-3"
                        >
                          <MapPin size={16} className="text-subtle shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-text truncate">
                              {site.client_name || 'Nežinomas klientas'}
                            </span>
                            <span className="block text-xs text-muted truncate">
                              {site.address || '—'}
                            </span>
                          </span>
                          {site.code && (
                            <span className="ml-auto shrink-0 text-[11px] font-bold text-on-primary-fixed bg-primary-fixed border border-primary/20 px-2 py-0.5 rounded-md">
                              {site.code}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="relative flex-shrink-0" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((o) => !o)}
              className="p-2 rounded-full hover:bg-surface-2 transition-colors relative text-muted"
              title="Pranešimai"
              aria-haspopup="true"
              aria-expanded={notifOpen}
            >
              <Bell size={20} />
              {notifications.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-primary absolute top-1.5 right-1.5 border border-surface"></span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-surface border border-border shadow-xl rounded-card z-50 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <span className="text-sm font-bold text-text">Pranešimai</span>
                  {notifications.length > 0 && (
                    <button
                      onClick={() => setNotifications([])}
                      className="text-xs font-semibold text-muted hover:text-primary-ink transition-colors"
                    >
                      Išvalyti
                    </button>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <BellOff size={24} className="text-subtle mx-auto mb-2" />
                    <p className="text-sm text-muted">Nėra naujų pranešimų</p>
                  </div>
                ) : (
                  <ul className="max-h-80 overflow-y-auto divide-y divide-border">
                    {notifications.map((n, i) => (
                      <li key={`${n.id}-${i}`} className="flex items-start gap-3 p-4 hover:bg-surface-2 transition-colors">
                        <span className="mt-0.5 shrink-0">
                          {n.type === 'success' ? (
                            <CheckCircle size={16} className="text-success" />
                          ) : (
                            <PlayCircle size={16} className="text-info" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm text-text leading-snug">{n.message}</p>
                          <p className="text-xs text-muted mt-0.5">
                            {n.time.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto bg-bg p-6 space-y-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
