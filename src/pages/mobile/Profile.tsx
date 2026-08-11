import { useAuth } from '../../hooks/useAuth';
import { LogOut, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type ThemePreference } from '../../hooks/useTheme';

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Šviesi', Icon: Sun },
  { value: 'dark', label: 'Tamsi', Icon: Moon },
  { value: 'system', label: 'Sistemos', Icon: Monitor },
];

export default function Profile() {
  const { profile, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-2xl font-bold text-primary-ink">Profilis</h2>

      <div className="bg-surface rounded-[20px] p-6 shadow-card border border-border">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center text-xl font-bold">
            {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : '??'}
          </div>
          <div>
            <h3 className="text-lg font-bold text-on-surface">{profile?.full_name || 'Vartotojas'}</h3>
            <p className="text-on-surface-variant text-sm capitalize">{profile?.role}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-subtle uppercase tracking-wider">El. paštas</label>
            <p className="text-on-surface font-medium mt-1">{profile?.email || 'Nenurodyta'}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-subtle uppercase tracking-wider">Telefonas</label>
            <p className="text-on-surface font-medium mt-1">{profile?.phone || 'Nenurodyta'}</p>
          </div>
        </div>
      </div>

      {/* Appearance — Light / Dark / System */}
      <div className="bg-surface rounded-[20px] p-4 shadow-card border border-border">
        <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Išvaizda</p>
        <div className="flex items-center gap-1 bg-surface-2 rounded-card p-1">
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                theme === value
                  ? 'bg-surface shadow-card text-primary-ink'
                  : 'text-muted active:bg-surface'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => { void logout(); }}
        className="w-full bg-[var(--danger)]/10 text-danger border border-danger/20 font-bold text-[15px] h-[48px] rounded-btn flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <LogOut className="w-5 h-5" />
        Atsijungti
      </button>
    </div>
  );
}
