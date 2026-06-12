import { useState } from 'react';
import { Package, Battery, MoreVertical, Pencil, Zap, Sun, Wrench, Network, Shield } from 'lucide-react';
import { isBatteryCategory } from '../../../types/equipment.types';
import type { EquipmentItem } from '../../../types/equipment.types';

// ── Category icon fallback map (icons are a UI concern, not stored in DB) ────
const EQUIP_ICON_MAP: Record<string, React.ElementType> = {
  Inverteris: Zap,
  Moduliai: Sun,
  BESS: Battery,
  'Energijos kaupiklis': Battery,
  Konstrukcija: Wrench,
  Kabeliai: Network,
  Apsauga: Shield,
};
const DEFAULT_EQUIP_ICON = Package;
const DEFAULT_CAT_COLORS = { bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB' };

type CatColors = { bg: string; text: string; border: string };

/** Read-only equipment list (view mode of the Equipment tab). */
export default function EquipmentViewTable({
  items,
  catColorMap,
  onEdit,
}: {
  items: EquipmentItem[];
  catColorMap: Record<string, CatColors>;
  onEdit: () => void;
}) {
  const [kebabOpen, setKebabOpen] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 border-2 border-dashed border-[#cdc3d4]/40 dark:border-white/5 rounded-[12px]">
        <Package size={32} className="text-[#cdc3d4]" />
        <p className="text-[#7c7484] dark:text-gray-400 text-[14px]">Įrangos informacija nepridėta.</p>
        <button onClick={onEdit} className="text-primary font-semibold text-[14px] hover:underline cursor-pointer">
          Pridėti dabar →
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-[#cdc3d4]/30 dark:border-white/10 overflow-hidden">
      {/* Column headers */}
      <div className="grid grid-cols-[176px_1fr_96px_32px] gap-3 px-4 py-2.5 bg-[#f6f5fa] dark:bg-[#27272a] border-b border-[#cdc3d4]/30 dark:border-white/10">
        <span className="text-[10px] font-bold text-[#7c7484] dark:text-gray-400 uppercase tracking-wider">Kategorija</span>
        <span className="text-[10px] font-bold text-[#7c7484] dark:text-gray-400 uppercase tracking-wider">Modelis / Specifikacija</span>
        <span className="text-[10px] font-bold text-[#7c7484] dark:text-gray-400 uppercase tracking-wider">Kiekis</span>
        <span />
      </div>

      {/* Transparent click-away overlay for kebab */}
      {kebabOpen !== null && (
        <div className="fixed inset-0 z-10" onClick={() => setKebabOpen(null)} />
      )}

      {items.map((item, i) => {
        const colors = catColorMap[item.category] ?? DEFAULT_CAT_COLORS;
        const CatIcon = EQUIP_ICON_MAP[item.category] ?? DEFAULT_EQUIP_ICON;
        return (
          <div
            key={i}
            className="grid grid-cols-[176px_1fr_96px_32px] gap-3 items-start px-4 py-3 border-b border-[#cdc3d4]/10 last:border-none hover:bg-[#fbf9ff] transition-colors group"
            style={{ background: i % 2 === 1 ? '#fdfcff' : '#ffffff' }}
          >
            {/* Category pill */}
            <div className="pt-0.5">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-semibold text-[12px] whitespace-nowrap"
                style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
              >
                <CatIcon size={12} />
                {item.category}
              </span>
            </div>

            {/* Model + notes */}
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[#1d033a] dark:text-gray-100 leading-snug">{item.model || '—'}</p>
              {isBatteryCategory(item.category) && item.capacity_kwh != null && (
                <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#DBEAFE] text-[#1D4ED8] border border-[#2563EB]/30">
                  <Battery className="w-3 h-3" /> {item.capacity_kwh} kWh
                </span>
              )}
              {item.notes && (
                <p className="text-[12px] text-[#7c7484] dark:text-gray-400 mt-0.5 leading-snug">{item.notes}</p>
              )}
            </div>

            {/* Quantity + unit badge */}
            <div className="pt-0.5 flex items-center gap-1.5">
              <span className="text-[15px] font-bold text-[#1d033a] dark:text-gray-100">{item.quantity}</span>
              <span className="text-[11px] font-semibold text-[#7c7484] dark:text-gray-400 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4]/50 dark:border-white/10 px-1.5 py-0.5 rounded-md">{item.unit || 'vnt.'}</span>
            </div>

            {/* Kebab menu */}
            <div className="relative pt-0.5">
              <button
                onClick={() => setKebabOpen(kebabOpen === i ? null : i)}
                className="w-7 h-7 flex items-center justify-center text-[#cdc3d4] hover:text-[#4b4452] hover:bg-[#f6f5fa] rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
              >
                <MoreVertical size={15} />
              </button>
              {kebabOpen === i && (
                <div className="absolute right-0 top-8 z-20 bg-white dark:bg-[#18181b] rounded-[10px] shadow-lg border border-[#cdc3d4]/40 dark:border-white/5 py-1 min-w-[130px]">
                  <button
                    onClick={() => { setKebabOpen(null); onEdit(); }}
                    className="w-full px-4 py-2 text-[13px] text-[#1d033a] dark:text-gray-100 hover:bg-[#f6f5fa] text-left flex items-center gap-2 cursor-pointer"
                  >
                    <Pencil size={13} className="text-primary" /> Redaguoti
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
