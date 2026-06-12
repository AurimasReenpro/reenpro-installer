import { LayoutGrid, Cpu, BatteryCharging, Wrench, Cable, ShieldCheck, Package, Zap, Battery } from 'lucide-react';
import { parseEquipmentDetails } from '../../../types/equipment.types';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Inverteris': Cpu,
  'Moduliai': LayoutGrid,
  'BESS': BatteryCharging,
  'Energijos kaupiklis': BatteryCharging,
  'Konstrukcija': Wrench,
  'Kabeliai': Cable,
  'Apsauga': ShieldCheck,
};

interface OverviewTabProps {
  equipmentDetails: unknown;
  kwp: number | null;
  kwh: number | null;
}

export default function OverviewTab({ equipmentDetails, kwp, kwh }: OverviewTabProps) {
  const items = parseEquipmentDetails(equipmentDetails);

  return (
    <div className="px-4 pb-[140px] pt-4 flex flex-col gap-4">

      {/* ── Capacity summary ── */}
      <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-4 flex items-center">
        <div className="flex-1 flex flex-col items-center gap-1">
          <Zap size={18} className="text-gray-400 dark:text-zinc-500" />
          <p className="text-[20px] font-bold text-gray-900 dark:text-zinc-100 leading-none">
            {kwp ?? '—'} <span className="text-[12px] text-gray-400 dark:text-zinc-500 font-semibold">kWp</span>
          </p>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 font-medium">Sistemos galia</p>
        </div>
        <div className="w-px self-stretch bg-gray-100 dark:bg-white/10 mx-1" />
        <div className="flex-1 flex flex-col items-center gap-1">
          <Battery size={18} className="text-gray-400 dark:text-zinc-500" />
          <p className="text-[20px] font-bold text-gray-900 dark:text-zinc-100 leading-none">
            {kwh != null ? kwh : '—'} <span className="text-[12px] text-gray-400 dark:text-zinc-500 font-semibold">kWh</span>
          </p>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 font-medium">Baterija</p>
        </div>
      </div>

      {/* ── Equipment list ── */}
      <div>
        <h3 className="text-[12px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2 px-1">Komplektacija</h3>
        {items.length > 0 ? (
          <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
            {items.map((item, i) => {
              const Icon = CATEGORY_ICONS[item.category] ?? Package;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3 ${i < items.length - 1 ? 'border-b border-gray-50 dark:border-white/5' : ''}`}
                >
                  <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                    <Icon className="w-[18px] h-[18px] text-gray-500 dark:text-zinc-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-zinc-100 text-[14px] truncate">{item.model || '—'}</p>
                    <p className="text-[12px] text-gray-400 dark:text-zinc-500">
                      {item.category}
                      {item.capacity_kwh != null ? ` · ${item.capacity_kwh} kWh` : ''}
                      {item.notes ? ` · ${item.notes}` : ''}
                    </p>
                  </div>
                  <span className="text-[13px] font-semibold text-gray-500 dark:text-zinc-400 whitespace-nowrap shrink-0">
                    {item.quantity} {item.unit || 'vnt.'}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm py-10 flex flex-col items-center gap-2">
            <Package className="w-9 h-9 text-gray-300 dark:text-zinc-600" />
            <p className="text-[14px] text-gray-400 dark:text-zinc-500">Įrangos informacijos dar nėra.</p>
          </div>
        )}
      </div>
    </div>
  );
}
