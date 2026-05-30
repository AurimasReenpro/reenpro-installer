import { LayoutGrid, Cpu, BatteryCharging, Wrench, Cable, ShieldCheck, Info, ChevronRight, Package } from 'lucide-react';
import type { Database } from '../../../types/database.types';
import { parseEquipmentDetails } from '../../../types/equipment.types';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Inverteris': Cpu,
  'Moduliai': LayoutGrid,
  'BESS': BatteryCharging,
  'Konstrukcija': Wrench,
  'Kabeliai': Cable,
  'Apsauga': ShieldCheck,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'Inverteris': { bg: 'bg-[#ede8ff]', text: 'text-primary' },
  'Moduliai': { bg: 'bg-[#ecfdf5]', text: 'text-[#059669]' },
  'BESS': { bg: 'bg-[#fff7ed]', text: 'text-[#ea580c]' },
  'Konstrukcija': { bg: 'bg-[#f0f9ff]', text: 'text-[#0284c7]' },
  'Kabeliai': { bg: 'bg-[#fdf4ff]', text: 'text-[#a21caf]' },
  'Apsauga': { bg: 'bg-[#fff1f2]', text: 'text-[#e11d48]' },
};

interface OverviewTabProps {
  teamMembers: UserProfile[];
  equipmentDetails: unknown;
}

export default function OverviewTab({ teamMembers, equipmentDetails }: OverviewTabProps) {
  const items = parseEquipmentDetails(equipmentDetails);

  return (
    <div className="px-4 pb-[120px] pt-4">

      {/* ── Equipment section ── */}
      <h3 className="text-[#1d033a] font-bold mb-3">Sistemos informacija</h3>

      {items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {items.map((item, i) => {
            const Icon = CATEGORY_ICONS[item.category] ?? Package;
            const colors = CATEGORY_COLORS[item.category] ?? { bg: 'bg-[#f6f5fa]', text: 'text-primary' };
            return (
              <div
                key={i}
                className="bg-white rounded-xl p-4 flex items-center gap-4 shadow-sm border border-[#cdc3d4]/30"
              >
                {/* Icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colors.bg} ${colors.text}`}>
                  <Icon className="w-5 h-5" />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-[#1d033a] text-sm">{item.model || '—'}</p>
                    {/* Quantity badge */}
                    <span className="bg-[#ecfdf5] text-[#059669] text-[11px] font-bold px-2 py-0.5 rounded-full border border-[#059669]/15 whitespace-nowrap">
                      {item.quantity} {item.unit || 'vnt.'}
                    </span>
                  </div>
                  <p className="text-xs text-primary font-semibold mt-0.5">{item.category}</p>
                  {item.notes ? (
                    <p className="text-xs text-[#574f61] mt-0.5 italic">{item.notes}</p>
                  ) : null}
                </div>

                <ChevronRight className="w-4 h-4 text-[#cdc3d4] shrink-0" />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#f6e9ff] rounded-xl p-5 flex items-start gap-3 border border-primary/10">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-[#39323f] leading-relaxed">
            Administratorius dar nepridėjo įrangos informacijos šiam objektui.
          </p>
        </div>
      )}

      {/* ── Team section ── */}
      <h3 className="text-[#1d033a] font-bold mt-6 mb-3">Komanda</h3>
      <div className="bg-white rounded-xl p-4 shadow-sm border border-[#cdc3d4]/30 flex flex-col gap-3">
        {teamMembers?.map((member) => (
          <div key={member.id} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#ecdcff] flex items-center justify-center text-primary font-bold text-xs shrink-0">
              {member.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <span className="text-[#1d033a] font-medium text-sm">
              {member.full_name || 'Nežinomas vartotojas'}
            </span>
          </div>
        ))}
        {(!teamMembers || teamMembers.length === 0) && (
          <p className="text-sm text-[#39323f]">Nėra priskirtų montuotojų.</p>
        )}
      </div>
    </div>
  );
}
