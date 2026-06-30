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
      <div className="flex flex-col items-center justify-center py-12 gap-2 border-2 border-dashed border-border/40 dark:border-white/5 rounded-[12px]">
        <Package size={32} className="text-subtle" />
        <p className="text-subtle dark:text-subtle text-[14px]">Įrangos informacija nepridėta.</p>
        <button onClick={onEdit} className="text-primary font-semibold text-[14px] hover:underline cursor-pointer">
          Pridėti dabar →
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-border/30 dark:border-white/10 overflow-hidden">
      {/* Column headers */}
      <div className="grid grid-cols-[176px_1fr_96px_32px] gap-3 px-4 py-2.5 bg-surface-2 dark:bg-surface-2 border-b border-border/30 dark:border-white/10">
        <span className="text-[10px] font-bold text-subtle dark:text-subtle uppercase tracking-wider">Kategorija</span>
        <span className="text-[10px] font-bold text-subtle dark:text-subtle uppercase tracking-wider">Modelis / Specifikacija</span>
        <span className="text-[10px] font-bold text-subtle dark:text-subtle uppercase tracking-wider">Kiekis</span>
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
            className="grid grid-cols-[176px_1fr_96px_32px] gap-3 items-start px-4 py-3 border-b border-border/10 last:border-none hover:bg-surface-2 transition-colors group"
            style={{ background: i % 2 === 1 ? 'var(--surface-2)' : 'var(--surface)' }}
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
              <p className="text-[14px] font-semibold text-text dark:text-gray-100 leading-snug">{item.model || '—'}</p>
              {isBatteryCategory(item.category) && item.capacity_kwh != null && (
                <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#DBEAFE] text-[#1D4ED8] border border-[#2563EB]/30">
                  <Battery className="w-3 h-3" /> {item.capacity_kwh} kWh
                </span>
              )}
              {item.notes && (
                <p className="text-[12px] text-subtle dark:text-subtle mt-0.5 leading-snug">{item.notes}</p>
              )}
            </div>

            {/* Quantity + unit badge */}
            <div className="pt-0.5 flex items-center gap-1.5">
              <span className="text-[15px] font-bold text-text dark:text-gray-100">{item.quantity}</span>
              <span className="text-[11px] font-semibold text-subtle dark:text-subtle bg-surface-2 dark:bg-surface-2 border border-border/50 dark:border-white/10 px-1.5 py-0.5 rounded-md">{item.unit || 'vnt.'}</span>
            </div>

            {/* Kebab menu */}
            <div className="relative pt-0.5">
              <button
                onClick={() => setKebabOpen(kebabOpen === i ? null : i)}
                className="w-7 h-7 flex items-center justify-center text-subtle hover:text-muted hover:bg-surface-2 rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
              >
                <MoreVertical size={15} />
              </button>
              {kebabOpen === i && (
                <div className="absolute right-0 top-8 z-20 bg-surface rounded-[10px] shadow-lg border border-border/40 dark:border-white/5 py-1 min-w-[130px]">
                  <button
                    onClick={() => { setKebabOpen(null); onEdit(); }}
                    className="w-full px-4 py-2 text-[13px] text-text dark:text-gray-100 hover:bg-surface-2 text-left flex items-center gap-2 cursor-pointer"
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
