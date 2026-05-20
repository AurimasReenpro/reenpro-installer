import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import type { Database } from '../../types/database.types';

export type Site = Database['public']['Tables']['sites']['Row'];

interface SiteCardProps {
  site: Site;
  onStartWork?: () => void;
}

export default function SiteCard({ site, onStartWork }: SiteCardProps) {
  const navigate = useNavigate();

  const getBorderColor = () => {
    switch (site.status) {
      case 'in_progress':
        return 'border-2 border-[#10B981]';
      case 'paused':
        return 'border-2 border-[#F59E0B]';
      case 'pending':
        return 'border border-outline-variant';
      case 'completed':
        return 'border border-outline-variant opacity-60';
      default:
        return 'border border-outline-variant';
    }
  };

  const getSystemPillColor = () => {
    switch (site.system_type) {
      case 'PV+BESS':
        return 'bg-primary text-white';
      case 'PV':
        return 'bg-[#fd7461] text-white';
      case 'BESS':
        return 'bg-primary-light text-white';
      default:
        return 'bg-app-bg text-primary';
    }
  };

  const getButtonProps = () => {
    switch (site.status) {
      case 'pending':
        return { bg: 'bg-[#fc391d]', text: 'text-white', label: 'PRADĖTI DARBĄ' };
      case 'in_progress':
        return { bg: 'bg-primary', text: 'text-white', label: 'TĘSTI DARBĄ →' };
      case 'paused':
        return { bg: 'bg-primary', text: 'text-white', label: 'TĘSTI DARBĄ' };
      case 'completed':
        return { bg: 'bg-app-bg', text: 'text-on-surface-variant', label: 'BAIGTA ✓', disabled: true };
      default:
        return { bg: 'bg-primary', text: 'text-white', label: 'ATIDARYTI' };
    }
  };

  const btnProps = getButtonProps();

  const isOverdue = site.status === 'pending' && site.scheduled_start && new Date(site.scheduled_start) < new Date();

  return (
    <div className={`bg-white rounded-2xl mx-4 mb-3 p-5 shadow-sm ${getBorderColor()}`}>
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2.5 py-1 bg-app-bg text-primary text-xs font-semibold">
            {site.code}
          </span>
          {isOverdue && (
            <span className="bg-[#FFF1F0] text-[#fc391d] border border-[#fc391d]/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
              Vėluoja
            </span>
          )}
        </div>
      </div>

      <h3 className="text-on-surface font-bold text-lg mt-2">{site.client_name}</h3>
      
      <div className="flex items-center gap-1 text-primary-light text-sm mt-1">
        <MapPin className="w-4 h-4 text-primary-light" />
        <span>{site.address}</span>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getSystemPillColor()}`}>
          {site.system_type}
        </span>
        <span className="bg-app-bg text-primary px-3 py-1 rounded-full text-xs font-semibold">
          {site.kwp} kWp
        </span>
      </div>

      <button
        onClick={() => {
          if (btnProps.disabled) return;
          if (site.status === 'pending' && onStartWork) {
            onStartWork();
          } else {
            void navigate(`/m/sites/${site.id}`);
          }
        }}
        disabled={btnProps.disabled}
        className={`mt-4 w-full h-[56px] rounded-xl font-semibold text-[15px] flex items-center justify-center transition-transform active:scale-[0.98] ${btnProps.bg} ${btnProps.text} ${btnProps.disabled ? 'cursor-not-allowed opacity-80' : ''}`}
      >
        {btnProps.label}
      </button>
    </div>
  );
}
