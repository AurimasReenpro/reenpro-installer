import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Package, Pencil, Loader2, Save, Info, Battery, ChevronDown, X, Plus } from 'lucide-react';
import { getCatalogItems, getEquipmentCategories } from '../../../api/catalog';
import { updateEquipment } from '../../../api/sites';
import { EQUIPMENT_CATEGORIES, EQUIPMENT_UNITS, isBatteryCategory } from '../../../types/equipment.types';
import type { EquipmentItem, CatalogItem } from '../../../types/equipment.types';
import ExtraMaterialsSection from './ExtraMaterialsSection';
import EquipmentViewTable from './EquipmentViewTable';

/** Label a catalog item the same way the model dropdown shows it (brand + model). */
const catalogLabel = (c: CatalogItem) => `${c.brand ? c.brand + ' ' : ''}${c.model}`;

const DEFAULT_CAT_COLORS = { bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB' };

const EMPTY_EQUIP_ROW: EquipmentItem = { category: 'Inverteris', model: '', quantity: 1, unit: 'vnt.', notes: '' };

export default function EquipmentTab({
  siteId,
  currentEquipment,
  onSaved,
}: {
  siteId: string;
  currentEquipment: EquipmentItem[];
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<EquipmentItem[]>([]);

  const { data: catalog = [] } = useQuery({
    queryKey: ['equipment_catalog'],
    queryFn: getCatalogItems,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['equipment_categories'],
    queryFn: getEquipmentCategories,
  });

  const catColorMap = Object.fromEntries(
    categories.map(c => [c.name, { bg: c.bg_color, text: c.text_color, border: c.border_color }])
  );

  const saveMutation = useMutation({
    mutationFn: () => updateEquipment(siteId, rows.filter(r => r.model.trim())),
    onSuccess: () => {
      toast.success('Įrangos informacija išsaugota!');
      setEditing(false);
      onSaved();
      void queryClient.invalidateQueries({ queryKey: ['equipment_catalog'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const startEditing = () => {
    const defaultCat = categories[0]?.name ?? EMPTY_EQUIP_ROW.category;
    const defaultRow = { ...EMPTY_EQUIP_ROW, category: defaultCat };
    setRows(currentEquipment.length > 0 ? [...currentEquipment] : [defaultRow]);
    setEditing(true);
  };

  const updateRow = <K extends keyof EquipmentItem>(i: number, key: K, value: EquipmentItem[K]) => {
    setRows(r => r.map((rw, idx) => {
      if (idx !== i) return rw;
      const next: EquipmentItem = { ...rw, [key]: value };
      // Auto-rollup battery capacity from the catalog when model/quantity/category
      // changes: total = catalog capacity_kwh × quantity. Manual rows are untouched.
      if (key === 'model' || key === 'quantity' || key === 'category') {
        if (isBatteryCategory(next.category)) {
          const match = catalog.find(c => c.category === next.category && catalogLabel(c) === next.model);
          if (match && match.capacity_kwh != null) {
            next.capacity_kwh = parseFloat((match.capacity_kwh * (next.quantity || 1)).toFixed(2));
          }
        } else {
          delete next.capacity_kwh; // left the battery category
        }
      }
      return next;
    }));
  };

  // Build grouped catalog options
  const catalogByCategory = EQUIPMENT_CATEGORIES.reduce<Record<string, typeof catalog>>((acc, cat) => {
    acc[cat] = catalog.filter(c => c.category === cat);
    return acc;
  }, {});

  return (
    <div className="bg-white dark:bg-[#18181b] rounded-[16px] border border-[#cdc3d4]/20 dark:border-white/10 shadow-sm p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[16px] font-bold text-[#1d033a] dark:text-gray-100 flex items-center gap-2">
          <Package size={18} className="text-primary" />
          Komplektacija / Įranga
        </h2>
        {!editing ? (
          <button
            onClick={startEditing}
            className="flex items-center gap-2 h-[34px] px-4 rounded-[8px] bg-[#f6f5fa] dark:bg-[#27272a] text-primary font-semibold text-[13px] hover:bg-[#ede8f5] transition-colors cursor-pointer border border-[#cdc3d4]/30 dark:border-white/10"
          >
            <Pencil size={14} />
            Redaguoti
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              disabled={saveMutation.isPending}
              className="h-[34px] px-4 rounded-[8px] border border-[#cdc3d4] dark:border-white/10 text-[#4b4452] dark:text-gray-300 font-semibold text-[13px] hover:bg-[#f6f5fa] transition-colors cursor-pointer disabled:opacity-60"
            >
              Atšaukti
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 h-[34px] px-4 rounded-[8px] bg-primary text-white font-semibold text-[13px] hover:bg-primary/80 transition-colors cursor-pointer disabled:opacity-70"
            >
              {saveMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : <Save size={14} />}
              Išsaugoti
            </button>
          </div>
        )}
      </div>

      {/* View mode */}
      {!editing && (
        <EquipmentViewTable items={currentEquipment} catColorMap={catColorMap} onEdit={startEditing} />
      )}

      {/* Info callout */}
      {!editing && (
        <div className="mt-4 flex items-start gap-2.5 px-4 py-3 rounded-[10px] bg-[#EFF6FF] border border-[#BFDBFE] text-[13px] text-[#1d033a] dark:text-gray-100">
          <Info size={15} className="text-[#2563EB] flex-shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">Kategorija</span> automatiškai nustatoma pagal objekto tipą. Galima laisvai pridėti bet kokių papildomų komponentų.
          </span>
        </div>
      )}

      {/* ── Extra materials used on-site (off-contract → bill separately) ── */}
      {!editing && <ExtraMaterialsSection siteId={siteId} />}

      {/* Edit mode */}
      {editing && (
        <div className="flex flex-col gap-2">
          {/* Column headers */}
          <div className="grid grid-cols-[160px_1fr_56px_76px_1fr_32px] gap-2 px-1 mb-0.5 text-[10px] font-bold text-[#7c7484] dark:text-gray-400 uppercase tracking-wider">
            <span>Kategorija</span>
            <span>Modelis / Specifikacija</span>
            <span>Kiekis</span>
            <span>Vnt.</span>
            <span>Pastabos</span>
            <span />
          </div>

          {rows.map((row, i) => {
            const colors = catColorMap[row.category] ?? DEFAULT_CAT_COLORS;
            const hasCatalog = (catalogByCategory[row.category] ?? []).length > 0;
            const isBattery = isBatteryCategory(row.category);
            const battMatch = isBattery
              ? catalog.find(c => c.category === row.category && catalogLabel(c) === row.model)
              : undefined;
            const isDerived = isBattery && battMatch?.capacity_kwh != null;
            return (
              <div
                key={i}
                className="rounded-[10px] border p-2.5"
                style={{ borderColor: colors.border, background: colors.bg + '28' }}
              >
                <div className="grid grid-cols-[160px_1fr_56px_76px_1fr_32px] gap-2 items-center">
                {/* Category select */}
                <div className="relative">
                  <select
                    value={row.category}
                    onChange={(e) => { updateRow(i, 'category', e.target.value); updateRow(i, 'model', ''); }}
                    className="w-full h-[38px] pl-2.5 pr-7 rounded-[8px] text-[12px] font-semibold appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer border"
                    style={{ borderColor: colors.border, background: colors.bg, color: colors.text }}
                  >
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: colors.text }} />
                </div>

                {/* Model — catalog dropdown or free-text */}
                <div className="relative">
                  {hasCatalog && row.model !== '__custom' ? (
                    <>
                      <select
                        value={row.model}
                        onChange={(e) => updateRow(i, 'model', e.target.value)}
                        className="w-full h-[38px] pl-3 pr-8 bg-white dark:bg-[#18181b] border border-[#cdc3d4] dark:border-white/10 rounded-[8px] text-[13px] text-[#1d033a] dark:text-gray-100 appearance-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 cursor-pointer"
                      >
                        <option value="">— Pasirinkite —</option>
                        {(catalogByCategory[row.category] ?? []).map(c => (
                          <option key={c.id} value={`${c.brand ? c.brand + ' ' : ''}${c.model}`}>
                            {c.brand ? `${c.brand} ` : ''}{c.model}{c.specifications ? ` (${c.specifications})` : ''}
                          </option>
                        ))}
                        <option value="__custom">Įvesti ranka...</option>
                      </select>
                      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7c7484] dark:text-gray-400 pointer-events-none" />
                    </>
                  ) : hasCatalog && row.model === '__custom' ? (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Pvz.: Huawei SUN2000 10kW"
                        onBlur={(e) => { if (e.target.value.trim()) updateRow(i, 'model', e.target.value.trim()); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v) updateRow(i, 'model', v); } }}
                        className="flex-1 h-[38px] px-3 bg-white dark:bg-[#18181b] border-2 border-primary rounded-[8px] text-[13px] text-[#1d033a] dark:text-gray-100 focus:outline-none"
                      />
                      <button onClick={() => updateRow(i, 'model', '')} className="h-[38px] px-2 text-[#7c7484] dark:text-gray-400 hover:text-red-500 transition-colors cursor-pointer">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={row.model}
                      onChange={(e) => updateRow(i, 'model', e.target.value)}
                      placeholder="Modelis / specifikacija"
                      className="w-full h-[38px] px-3 bg-white dark:bg-[#18181b] border border-[#cdc3d4] dark:border-white/10 rounded-[8px] text-[13px] text-[#1d033a] dark:text-gray-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                  )}
                </div>

                {/* Quantity */}
                <input
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) => updateRow(i, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-[38px] px-1 bg-white dark:bg-[#18181b] border border-[#cdc3d4] dark:border-white/10 rounded-[8px] text-[13px] font-bold text-[#1d033a] dark:text-gray-100 focus:outline-none focus:border-primary text-center"
                />

                {/* Unit */}
                <div className="relative">
                  <select
                    value={row.unit || 'vnt.'}
                    onChange={(e) => updateRow(i, 'unit', e.target.value)}
                    className="w-full h-[38px] pl-2 pr-6 bg-white dark:bg-[#18181b] border border-[#cdc3d4] dark:border-white/10 rounded-[8px] text-[12px] text-[#4b4452] dark:text-gray-300 appearance-none focus:outline-none focus:border-primary cursor-pointer text-center"
                  >
                    {EQUIPMENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#7c7484] dark:text-gray-400 pointer-events-none" />
                </div>

                {/* Notes */}
                <input
                  type="text"
                  value={row.notes}
                  onChange={(e) => updateRow(i, 'notes', e.target.value)}
                  placeholder="Pastabos..."
                  className="h-[38px] px-3 bg-white dark:bg-[#18181b] border border-[#cdc3d4] dark:border-white/10 rounded-[8px] text-[13px] text-[#1d033a] dark:text-gray-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />

                {/* Remove */}
                <button
                  onClick={() => setRows(r => r.filter((_, idx) => idx !== i))}
                  className="w-8 h-8 flex items-center justify-center text-[#cdc3d4] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer rounded-[8px]"
                >
                  <X size={15} />
                </button>
                </div>

                {/* Conditional: battery capacity for energy-storage rows.
                    Read-only when derived from the catalog (capacity × quantity);
                    manually editable for custom / non-catalog batteries. */}
                {isBattery && (
                  <div className="flex items-center gap-2 mt-2 pl-0.5 flex-wrap">
                    <Battery className="w-4 h-4 text-gray-400 shrink-0" />
                    <label className="text-[12px] text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">Baterijos talpa (kWh)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={row.capacity_kwh ?? ''}
                      readOnly={isDerived}
                      onChange={(e) => updateRow(i, 'capacity_kwh', e.target.value === '' ? undefined : Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="Pvz.: 15"
                      className={`w-[120px] h-[36px] px-3 border rounded-[8px] text-[13px] font-semibold focus:outline-none ${
                        isDerived
                          ? 'bg-gray-100 dark:bg-[#27272a] border-gray-200 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                          : 'bg-white dark:bg-[#18181b] border-[#cdc3d4] dark:border-white/10 text-[#1d033a] dark:text-gray-100 focus:border-primary focus:ring-1 focus:ring-primary/20'
                      }`}
                    />
                    {isDerived && battMatch?.capacity_kwh != null && (
                      <span className="text-[11px] text-[#7c7484] dark:text-gray-400">
                        = {battMatch.capacity_kwh} kWh × {row.quantity} (iš katalogo)
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add row — primary button */}
          <button
            onClick={() => setRows(r => [...r, { ...EMPTY_EQUIP_ROW }])}
            className="flex items-center justify-center gap-2 h-[40px] px-5 rounded-[8px] bg-primary text-white font-semibold text-[13px] hover:bg-primary/80 transition-colors cursor-pointer mt-1 self-start"
          >
            <Plus size={16} />
            Pridėti eilutę
          </button>
        </div>
      )}
    </div>
  );
}
