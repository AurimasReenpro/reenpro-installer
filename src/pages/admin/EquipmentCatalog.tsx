import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Package, Plus, Trash2, Loader2, X, Search, ChevronDown,
  Cpu, LayoutGrid, BatteryCharging, Wrench, Cable, ShieldCheck
} from 'lucide-react';
import { useConfirm } from '../../hooks/useConfirm';
import { getCatalogItems, createCatalogItem, deleteCatalogItem } from '../../api/catalog';
import { EQUIPMENT_CATEGORIES, type EquipmentCategory } from '../../types/equipment.types';
import type { CatalogItem } from '../../types/equipment.types';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Inverteris': Cpu,
  'Moduliai': LayoutGrid,
  'BESS': BatteryCharging,
  'Konstrukcija': Wrench,
  'Kabeliai': Cable,
  'Apsauga': ShieldCheck,
  'Kita': Package,
};

const CATEGORY_COLORS: Record<string, string> = {
  'Inverteris': 'bg-[#ede8ff] text-primary',
  'Moduliai': 'bg-[#ecfdf5] text-[#059669]',
  'BESS': 'bg-[#fff7ed] text-[#ea580c]',
  'Konstrukcija': 'bg-[#f0f9ff] text-[#0284c7]',
  'Kabeliai': 'bg-[#fdf4ff] text-[#a21caf]',
  'Apsauga': 'bg-[#fff1f2] text-[#e11d48]',
  'Kita': 'bg-[#f6f5fa] text-[#4b4452]',
};

interface NewItemForm {
  category: EquipmentCategory;
  brand: string;
  model: string;
  specifications: string;
}

const EMPTY_FORM: NewItemForm = {
  category: 'Inverteris',
  brand: '',
  model: '',
  specifications: '',
};

export default function EquipmentCatalog() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('Visos');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewItemForm>(EMPTY_FORM);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['equipment_catalog'],
    queryFn: getCatalogItems,
  });

  const createMutation = useMutation({
    mutationFn: () => createCatalogItem({
      category: form.category,
      brand: form.brand.trim(),
      model: form.model.trim(),
      specifications: form.specifications.trim() || null,
    }),
    onSuccess: () => {
      toast.success('Įranga pridėta į katalogą!');
      void queryClient.invalidateQueries({ queryKey: ['equipment_catalog'] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCatalogItem,
    onSuccess: () => {
      toast.success('Įranga ištrinta iš katalogo.');
      void queryClient.invalidateQueries({ queryKey: ['equipment_catalog'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const handleDelete = async (item: CatalogItem) => {
    const ok = await confirm({
      title: 'Ištrinti iš katalogo?',
      message: `Ar tikrai norite ištrinti „${item.brand ? item.brand + ' ' : ''}${item.model}"?`,
      variant: 'danger',
    });
    if (ok) deleteMutation.mutate(item.id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.model.trim()) { toast.error('Įveskite modelio pavadinimą.'); return; }
    createMutation.mutate();
  };

  const allCategories = ['Visos', ...EQUIPMENT_CATEGORIES];

  const filtered = items.filter((item) => {
    const matchesSearch =
      !search ||
      item.model.toLowerCase().includes(search.toLowerCase()) ||
      item.brand.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase()) ||
      (item.specifications ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      filterCategory === 'Visos' || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Group for display
  const grouped = EQUIPMENT_CATEGORIES.reduce<Record<string, CatalogItem[]>>((acc, cat) => {
    const catItems = filtered.filter((i) => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {});
  const otherItems = filtered.filter((i) => !EQUIPMENT_CATEGORIES.includes(i.category as EquipmentCategory));
  if (otherItems.length > 0) grouped['Kita'] = otherItems;

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-[#1d033a] flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            Įrangos katalogas
          </h1>
          <p className="text-[14px] text-[#7c7484] mt-0.5">
            {items.length} įrengini{items.length === 1 ? 's' : 'ų'} kataloge
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 h-[40px] px-5 rounded-[10px] bg-primary text-white font-semibold text-[14px] hover:bg-primary/80 transition-colors shadow-sm cursor-pointer"
        >
          <Plus size={16} />
          Pridėti įrangą
        </button>
      </div>

      {/* ── Add Form Modal ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 8 }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
              className="bg-white rounded-[20px] shadow-2xl w-full max-w-md"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#cdc3d4]/20">
                <h2 className="font-bold text-[17px] text-[#1d033a]">Nauja įranga</h2>
                <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f6f5fa] transition-colors cursor-pointer">
                  <X size={18} className="text-[#7c7484]" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Category */}
                <div>
                  <label className="block text-[11px] font-bold text-[#7c7484] uppercase tracking-wider mb-1.5">Kategorija *</label>
                  <div className="relative">
                    <select
                      value={form.category}
                      onChange={(e) => setForm(f => ({ ...f, category: e.target.value as EquipmentCategory }))}
                      className="w-full h-[42px] pl-3 pr-9 bg-[#f6f5fa] border border-[#cdc3d4]/60 rounded-[10px] text-[14px] text-[#1d033a] appearance-none focus:outline-none focus:border-primary cursor-pointer"
                    >
                      {EQUIPMENT_CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7c7484] pointer-events-none" />
                  </div>
                </div>

                {/* Brand */}
                <div>
                  <label className="block text-[11px] font-bold text-[#7c7484] uppercase tracking-wider mb-1.5">Gamintojas</label>
                  <input
                    type="text"
                    value={form.brand}
                    onChange={(e) => setForm(f => ({ ...f, brand: e.target.value }))}
                    placeholder="Pvz.: Huawei, Longi, BYD..."
                    className="w-full h-[42px] px-3 bg-[#f6f5fa] border border-[#cdc3d4]/60 rounded-[10px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:bg-white transition-colors"
                  />
                </div>

                {/* Model */}
                <div>
                  <label className="block text-[11px] font-bold text-[#7c7484] uppercase tracking-wider mb-1.5">Modelis *</label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm(f => ({ ...f, model: e.target.value }))}
                    placeholder="Pvz.: SUN2000-10KTL-M1"
                    required
                    className="w-full h-[42px] px-3 bg-[#f6f5fa] border border-[#cdc3d4]/60 rounded-[10px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:bg-white transition-colors"
                  />
                </div>

                {/* Specifications */}
                <div>
                  <label className="block text-[11px] font-bold text-[#7c7484] uppercase tracking-wider mb-1.5">Specifikacijos</label>
                  <input
                    type="text"
                    value={form.specifications}
                    onChange={(e) => setForm(f => ({ ...f, specifications: e.target.value }))}
                    placeholder="Pvz.: 10 kW, 3 fazės, MPPT × 2"
                    className="w-full h-[42px] px-3 bg-[#f6f5fa] border border-[#cdc3d4]/60 rounded-[10px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:bg-white transition-colors"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 h-[42px] rounded-[10px] border border-[#cdc3d4] text-[#4b4452] font-semibold text-[14px] hover:bg-[#f6f5fa] transition-colors cursor-pointer"
                  >
                    Atšaukti
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="flex-1 h-[42px] rounded-[10px] bg-primary text-white font-semibold text-[14px] hover:bg-primary/80 transition-colors disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    Pridėti
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search + Filter ── */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7c7484]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ieškoti modelio, gamintojo..."
            className="w-full h-[40px] pl-9 pr-4 bg-white border border-[#cdc3d4]/50 rounded-[10px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="relative">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-[40px] pl-3 pr-9 bg-white border border-[#cdc3d4]/50 rounded-[10px] text-[14px] text-[#1d033a] appearance-none focus:outline-none focus:border-primary cursor-pointer"
          >
            {allCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7c7484] pointer-events-none" />
        </div>
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm">
          <Package size={40} className="text-[#cdc3d4] mb-3" />
          <p className="text-[#7c7484] text-[14px] font-semibold">
            {items.length === 0 ? 'Katalogas tuščias.' : 'Nerasta atitikmenų.'}
          </p>
          {items.length === 0 && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-primary font-semibold text-[14px] hover:underline cursor-pointer"
            >
              Pridėti pirmą įrangą →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, catItems]) => {
            const Icon = CATEGORY_ICONS[category] ?? Package;
            const colorClass = CATEGORY_COLORS[category] ?? 'bg-[#f6f5fa] text-[#4b4452]';
            return (
              <motion.div
                key={category}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm overflow-hidden"
              >
                {/* Category header */}
                <div className="px-5 py-3.5 border-b border-[#cdc3d4]/20 bg-[#f6f5fa]/50 flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-[8px] flex items-center justify-center ${colorClass}`}>
                    <Icon size={15} />
                  </div>
                  <h3 className="font-bold text-[14px] text-[#1d033a]">{category}</h3>
                  <span className="ml-auto text-[12px] font-semibold text-[#7c7484]">{catItems.length} vnt.</span>
                </div>

                {/* Items table */}
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#cdc3d4]/10">
                      <th className="py-2.5 px-5 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">Gamintojas</th>
                      <th className="py-2.5 px-5 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">Modelis</th>
                      <th className="py-2.5 px-5 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider hidden sm:table-cell">Specifikacijos</th>
                      <th className="py-2.5 px-5 w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {catItems.map((item) => (
                      <tr key={item.id} className="border-b border-[#cdc3d4]/10 last:border-none hover:bg-[#fbf0ff]/20 transition-colors group">
                        <td className="py-3 px-5 text-[13px] font-semibold text-[#1d033a]">
                          {item.brand || <span className="text-[#cdc3d4]">—</span>}
                        </td>
                        <td className="py-3 px-5 text-[13px] text-[#1d033a]">{item.model}</td>
                        <td className="py-3 px-5 text-[13px] text-[#4b4452] hidden sm:table-cell">
                          {item.specifications || <span className="text-[#cdc3d4]">—</span>}
                        </td>
                        <td className="py-3 px-5 text-right">
                          <button
                            onClick={() => void handleDelete(item)}
                            disabled={deleteMutation.isPending}
                            className="w-7 h-7 flex items-center justify-center rounded-[6px] text-[#cdc3d4] hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer disabled:opacity-30"
                          >
                            {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
