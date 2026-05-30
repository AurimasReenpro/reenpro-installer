import { useAuth } from '../../hooks/useAuth';
import { LogOut, Smartphone, CheckCircle2, Share, Download } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export default function Profile() {
  const { profile, logout } = useAuth();
  const { canInstall, promptInstall } = usePWAInstall();

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream;

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

      {/* ── App install section ── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20">
        <h3 className="text-base font-bold text-on-surface mb-4 flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" />
          Programėlė
        </h3>

        {isStandalone ? (
          <div className="flex items-center gap-2 bg-[#ecfdf5] text-[#059669] border border-[#059669]/20 font-semibold text-sm h-[48px] rounded-[12px] px-4">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            Programėlė sėkmingai įdiegta
          </div>
        ) : canInstall ? (
          <button
            onClick={() => { void promptInstall(); }}
            className="w-full bg-primary text-white font-bold text-[15px] h-[48px] rounded-[12px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <Download className="w-5 h-5" />
            Įdiegti į ekraną
          </button>
        ) : isIOS ? (
          <div className="flex items-start gap-3 bg-[#eff6ff] text-[#1d4ed8] border border-[#1d4ed8]/15 rounded-[12px] p-4 text-sm leading-relaxed">
            <Share className="w-5 h-5 shrink-0 mt-0.5" />
            <p>
              <span className="font-bold">iPhone naudotojams:</span> naršyklės apačioje spauskite
              {' '}„Share“ (kvadratą su rodykle) ir pasirinkite „Add to Home Screen“.
            </p>
          </div>
        ) : (
          <p className="text-on-surface-variant text-sm">
            Įdiegimas šiame įrenginyje negalimas arba programėlė jau įdiegta.
          </p>
        )}
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
