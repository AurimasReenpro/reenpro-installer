import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Package, Plus, Trash2, Loader2, X, Search, ChevronDown,
  Cpu, LayoutGrid, BatteryCharging, Wrench, Cable, ShieldCheck,
  Pencil, Settings2, Check,
} from 'lucide-react';
import { useConfirm } from '../../hooks/useConfirm';
import {
  getCatalogItems, createCatalogItem, deleteCatalogItem,
  getEquipmentCategories, createEquipmentCategory,
  updateEquipmentCategory, deleteEquipmentCategory,
} from '../../api/catalog';
import type { CatalogItem, EquipmentCategoryDef } from '../../types/equipment.types';
import { isBatteryCategory } from '../../types/equipment.types';

// ── Icon fallback map (icons are a UI concern, not stored in DB) ─────────────
const CATEGORY_ICON_MAP: Record<string, React.ElementType> = {
  Inverteris: Cpu,
  Moduliai: LayoutGrid,
  BESS: BatteryCharging,
  Konstrukcija: Wrench,
  Kabeliai: Cable,
  Apsauga: ShieldCheck,
};

function getCatIcon(name: string): React.ElementType {
  return CATEGORY_ICON_MAP[name] ?? Package;
}

// ── Color swatches for category creation/editing ─────────────────────────────
const COLOR_SWATCHES = [
  { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' },
  { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
  { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
  { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
  { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  { bg: '#FDF4FF', text: '#A21CAF', border: '#F0ABFC' },
  { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' },
  { bg: '#ECFEFF', text: '#0891B2', border: '#A5F3FC' },
  { bg: '#F7FEE7', text: '#65A30D', border: '#D9F99D' },
  { bg: '#FAF5FF', text: '#7C3AED', border: '#E9D5FF' },
  { bg: '#F8FAFC', text: '#475569', border: '#CBD5E1' },
  { bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB' },
];
// COLOR_SWATCHES always has at least one entry (defined above), safe to assert
const DEFAULT_SWATCH = COLOR_SWATCHES[0]!;

type CatColorForm = { name: string; bg_color: string; text_color: string; border_color: string };
const EMPTY_CAT_FORM: CatColorForm = {
  name: '',
  bg_color: DEFAULT_SWATCH.bg,
  text_color: DEFAULT_SWATCH.text,
  border_color: DEFAULT_SWATCH.border,
};

// ── Swatch picker component ──────────────────────────────────────────────────
function SwatchPicker({
  selected,
  onChange,
}: {
  selected: { bg_color: string; text_color: string; border_color: string };
  onChange: (s: { bg_color: string; text_color: string; border_color: string }) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_SWATCHES.map((s) => {
        const isSelected = s.bg === selected.bg_color && s.text === selected.text_color;
        return (
          <button
            key={s.bg}
            type="button"
            onClick={() => onChange({ bg_color: s.bg, text_color: s.text, border_color: s.border })}
            className="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
            style={{ background: s.bg, borderColor: isSelected ? s.text : s.border }}
          >
            {isSelected && <Check size={14} style={{ color: s.text }} />}
          </button>
        );
      })}
    </div>
  );
}

// ── Main form types ───────────────────────────────────────────────────────────
interface NewItemForm {
  category: string;
  brand: string;
  model: string;
  specifications: string;
  capacity_kwh: string;
}

export default function EquipmentCatalog() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  // Catalog state
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('Visos');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewItemForm>({ category: '', brand: '', model: '', specifications: '', capacity_kwh: '' });

  // Category management state
  const [showCatMgmt, setShowCatMgmt] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CatColorForm>(EMPTY_CAT_FORM);
  const [showNewCatForm, setShowNewCatForm] = useState(false);
  const [newCatForm, setNewCatForm] = useState<CatColorForm>(EMPTY_CAT_FORM);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['equipment_catalog'],
    queryFn: getCatalogItems,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['equipment_categories'],
    queryFn: getEquipmentCategories,
  });

  // ── Catalog mutations ────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () => {
      const category = form.category || (categories[0]?.name ?? 'Kita');
      const base = {
        category,
        brand: form.brand.trim(),
        model: form.model.trim(),
        specifications: form.specifications.trim() || null,
      };
      // Only attach capacity_kwh when it's an energy-storage item with a value —
      // omitting the key entirely keeps inserts working even if the column
      // hasn't been migrated yet (avoids the schema-cache 400).
      const includeCapacity = isBatteryCategory(category) && form.capacity_kwh !== '';
      return createCatalogItem(
        includeCapacity ? { ...base, capacity_kwh: parseFloat(form.capacity_kwh) } : base,
      );
    },
    onSuccess: () => {
      toast.success('Įranga pridėta į katalogą!');
      void queryClient.invalidateQueries({ queryKey: ['equipment_catalog'] });
      setShowForm(false);
      setForm({ category: '', brand: '', model: '', specifications: '', capacity_kwh: '' });
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

  // ── Category mutations ───────────────────────────────────────────────────────
  const createCatMutation = useMutation({
    mutationFn: () => createEquipmentCategory(newCatForm),
    onSuccess: () => {
      toast.success('Kategorija sukurta!');
      void queryClient.invalidateQueries({ queryKey: ['equipment_categories'] });
      setNewCatForm(EMPTY_CAT_FORM);
      setShowNewCatForm(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const updateCatMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EquipmentCategoryDef> }) =>
      updateEquipmentCategory(id, data),
    onSuccess: () => {
      toast.success('Kategorija atnaujinta!');
      void queryClient.invalidateQueries({ queryKey: ['equipment_categories'] });
      setEditingCatId(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const deleteCatMutation = useMutation({
    mutationFn: deleteEquipmentCategory,
    onSuccess: () => {
      toast.success('Kategorija ištrinta.');
      void queryClient.invalidateQueries({ queryKey: ['equipment_categories'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleDelete = async (item: CatalogItem) => {
    const ok = await confirm({
      title: 'Ištrinti iš katalogo?',
      message: `Ar tikrai norite ištrinti „${item.brand ? item.brand + ' ' : ''}${item.model}"?`,
      variant: 'danger',
    });
    if (ok) deleteMutation.mutate(item.id);
  };

  const handleDeleteCat = async (cat: EquipmentCategoryDef) => {
    const ok = await confirm({
      title: 'Ištrinti kategoriją?',
      message: `Ar tikrai norite ištrinti „${cat.name}"? Įranga šioje kategorijoje liks, bet bus rodoma kaip „${cat.name}".`,
      variant: 'danger',
    });
    if (ok) deleteCatMutation.mutate(cat.id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.model.trim()) { toast.error('Įveskite modelio pavadinimą.'); return; }
    createMutation.mutate();
  };

  const startEditCat = (cat: EquipmentCategoryDef) => {
    setEditingCatId(cat.id);
    setEditForm({ name: cat.name, bg_color: cat.bg_color, text_color: cat.text_color, border_color: cat.border_color });
  };

  // ── Filtering & grouping ─────────────────────────────────────────────────────
  const catNames = categories.map(c => c.name);
  const allFilterOptions = ['Visos', ...catNames];

  const catMap = Object.fromEntries(categories.map(c => [c.name, c]));

  const filtered = items.filter((item) => {
    const matchesSearch =
      !search ||
      item.model.toLowerCase().includes(search.toLowerCase()) ||
      item.brand.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase()) ||
      (item.specifications ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === 'Visos' || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const grouped = catNames.reduce<Record<string, CatalogItem[]>>((acc, name) => {
    const catItems = filtered.filter(i => i.category === name);
    if (catItems.length > 0) acc[name] = catItems;
    return acc;
  }, {});
  const knownNames = new Set(catNames);
  const otherItems = filtered.filter(i => !knownNames.has(i.category));
  if (otherItems.length > 0) grouped['Kita'] = otherItems;

  const defaultCatForForm = categories[0]?.name ?? '';

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text flex items-center gap-2">
            <Package className="w-6 h-6 text-primary dark:text-primary-ink" />
            Įrangos katalogas
          </h1>
          <p className="text-[14px] text-muted mt-0.5">
            {items.length} įrengini{items.length === 1 ? 's' : 'ų'} kataloge
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCatMgmt(true)}
            className="flex items-center gap-2 h-[40px] px-4 rounded-xl border border-border text-muted dark:text-gray-200 font-medium text-[14px] bg-surface hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <Settings2 size={15} />
            Kategorijos
          </button>
          <button
            onClick={() => { setForm({ category: defaultCatForForm, brand: '', model: '', specifications: '', capacity_kwh: '' }); setShowForm(true); }}
            className="flex items-center gap-2 rounded-xl bg-primary hover:opacity-90 text-white font-medium px-4 py-2 transition-all shadow-sm cursor-pointer"
          >
            <Plus size={16} />
            Pridėti įrangą
          </button>
        </div>
      </div>

      {/* ── Add Equipment Modal ── */}
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
              className="bg-surface rounded-[20px] shadow-2xl w-full max-w-md"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/20 dark:border-white/10">
                <h2 className="font-bold text-[17px] text-text dark:text-gray-100">Nauja įranga</h2>
                <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer">
                  <X size={18} className="text-subtle dark:text-subtle" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Category */}
                <div>
                  <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Kategorija *</label>
                  <div className="relative">
                    <select
                      value={form.category}
                      onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full h-[42px] pl-3 pr-9 bg-surface-2 border border-transparent dark:border-white/10 rounded-xl text-[14px] text-text dark:text-white appearance-none focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all cursor-pointer"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle dark:text-subtle pointer-events-none" />
                  </div>
                </div>

                {/* Brand */}
                <div>
                  <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Gamintojas</label>
                  <input
                    type="text"
                    value={form.brand}
                    onChange={(e) => setForm(f => ({ ...f, brand: e.target.value }))}
                    placeholder="Pvz.: Huawei, Longi, BYD..."
                    className="w-full h-[42px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-xl text-[14px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>

                {/* Model */}
                <div>
                  <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Modelis *</label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm(f => ({ ...f, model: e.target.value }))}
                    placeholder="Pvz.: SUN2000-10KTL-M1"
                    required
                    className="w-full h-[42px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-xl text-[14px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>

                {/* Specifications */}
                <div>
                  <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Specifikacijos</label>
                  <input
                    type="text"
                    value={form.specifications}
                    onChange={(e) => setForm(f => ({ ...f, specifications: e.target.value }))}
                    placeholder="Pvz.: 10 kW, 3 fazės, MPPT × 2"
                    className="w-full h-[42px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-xl text-[14px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>

                {/* Battery capacity — only for energy-storage categories */}
                {isBatteryCategory(form.category) && (
                  <div>
                    <label className="flex items-center gap-1.5 text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">
                      <BatteryCharging size={13} /> Talpa vienetui (kWh)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.capacity_kwh}
                      onChange={(e) => setForm(f => ({ ...f, capacity_kwh: e.target.value }))}
                      placeholder="Pvz.: 9 (kWh už 1 bloką)"
                      className="w-full h-[42px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-xl text-[14px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                    />
                    <p className="text-[11px] text-subtle dark:text-subtle mt-1">Bazinė talpa už vieną vienetą — bus padauginta iš kiekio objekte.</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 h-[42px] rounded-xl border border-border text-muted dark:text-subtle font-medium text-[14px] hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    Atšaukti
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="flex-1 h-[42px] rounded-xl bg-primary text-white font-medium text-[14px] hover:bg-primary transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
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

      {/* ── Category Management Modal ── */}
      <AnimatePresence>
        {showCatMgmt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowCatMgmt(false); setEditingCatId(null); setShowNewCatForm(false); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 8 }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
              className="bg-surface rounded-[20px] shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/20 dark:border-white/10 flex-shrink-0">
                <h2 className="font-bold text-[17px] text-text dark:text-gray-100 flex items-center gap-2">
                  <Settings2 size={18} className="text-primary dark:text-primary-ink" />
                  Kategorijų valdymas
                </h2>
                <button
                  onClick={() => { setShowCatMgmt(false); setEditingCatId(null); setShowNewCatForm(false); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer"
                >
                  <X size={18} className="text-subtle dark:text-subtle" />
                </button>
              </div>

              {/* Category list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {categories.map((cat) => {
                  const CatIcon = getCatIcon(cat.name);
                  const isEditing = editingCatId === cat.id;
                  return (
                    <div key={cat.id} className="rounded-[10px] border border-border/30 dark:border-white/10 overflow-hidden">
                      {/* Row */}
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-semibold text-[12px] whitespace-nowrap flex-shrink-0"
                          style={{ background: cat.bg_color, color: cat.text_color, borderColor: cat.border_color }}
                        >
                          <CatIcon size={12} />
                          {cat.name}
                        </span>
                        <div className="flex-1" />
                        <button
                          onClick={() => isEditing ? setEditingCatId(null) : startEditCat(cat)}
                          className="w-7 h-7 flex items-center justify-center rounded-[6px] text-subtle dark:text-subtle hover:text-primary dark:hover:text-primary-ink hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => void handleDeleteCat(cat)}
                          disabled={deleteCatMutation.isPending}
                          className="w-7 h-7 flex items-center justify-center rounded-[6px] text-subtle dark:text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors cursor-pointer disabled:opacity-30"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Inline edit form */}
                      {isEditing && (
                        <div className="px-3 pb-3 pt-1 border-t border-border/20 dark:border-white/10 space-y-3 bg-surface dark:bg-surface-2">
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="Kategorijos pavadinimas"
                            className="w-full h-[36px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-lg text-[13px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                          />
                          <SwatchPicker
                            selected={{ bg_color: editForm.bg_color, text_color: editForm.text_color, border_color: editForm.border_color }}
                            onChange={(s) => setEditForm(f => ({ ...f, ...s }))}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingCatId(null)}
                              className="flex-1 h-[34px] rounded-lg border border-border text-muted dark:text-subtle font-medium text-[12px] hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer"
                            >
                              Atšaukti
                            </button>
                            <button
                              onClick={() => updateCatMutation.mutate({ id: cat.id, data: editForm })}
                              disabled={updateCatMutation.isPending || !editForm.name.trim()}
                              className="flex-1 h-[34px] rounded-lg bg-primary text-white font-medium text-[12px] hover:bg-primary transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              {updateCatMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                              Išsaugoti
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* New category form */}
                {showNewCatForm ? (
                  <div className="rounded-[10px] border-2 border-primary/30 dark:border-primary/30 bg-surface dark:bg-surface-2 p-3 space-y-3">
                    <p className="text-[12px] font-bold text-primary dark:text-primary-ink uppercase tracking-wider">Nauja kategorija</p>
                    <input
                      type="text"
                      value={newCatForm.name}
                      onChange={(e) => setNewCatForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Kategorijos pavadinimas"
                      autoFocus
                      className="w-full h-[36px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-lg text-[13px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                    />
                    <SwatchPicker
                      selected={{ bg_color: newCatForm.bg_color, text_color: newCatForm.text_color, border_color: newCatForm.border_color }}
                      onChange={(s) => setNewCatForm(f => ({ ...f, ...s }))}
                    />
                    {/* Preview */}
                    {newCatForm.name.trim() && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-subtle dark:text-subtle">Peržiūra:</span>
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-semibold text-[12px]"
                          style={{ background: newCatForm.bg_color, color: newCatForm.text_color, borderColor: newCatForm.border_color }}
                        >
                          <Package size={12} />
                          {newCatForm.name}
                        </span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowNewCatForm(false); setNewCatForm(EMPTY_CAT_FORM); }}
                        className="flex-1 h-[34px] rounded-lg border border-border text-muted dark:text-subtle font-medium text-[12px] hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer"
                      >
                        Atšaukti
                      </button>
                      <button
                        onClick={() => createCatMutation.mutate()}
                        disabled={createCatMutation.isPending || !newCatForm.name.trim()}
                        className="flex-1 h-[34px] rounded-lg bg-primary text-white font-medium text-[12px] hover:bg-primary transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {createCatMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                        Sukurti
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewCatForm(true)}
                    className="w-full flex items-center justify-center gap-2 h-[38px] border border-dashed border-border dark:border-white/10 rounded-[10px] text-primary dark:text-primary-ink font-semibold text-[13px] hover:bg-surface-2 dark:hover:bg-primary/20 hover:border-primary/40 transition-colors cursor-pointer"
                  >
                    <Plus size={15} />
                    Pridėti kategoriją
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search + Filter ── */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle dark:text-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ieškoti modelio, gamintojo..."
            className="w-full h-[40px] pl-9 pr-4 bg-surface border border-border/50 dark:border-white/10 rounded-xl text-[14px] text-text dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary transition-all"
          />
        </div>
        <div className="relative">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-[40px] pl-3 pr-9 bg-surface border border-border/50 dark:border-white/10 rounded-xl text-[14px] text-text dark:text-white appearance-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary transition-all cursor-pointer"
          >
            {allFilterOptions.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle dark:text-subtle pointer-events-none" />
        </div>
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-surface border border-border rounded-2xl shadow-sm dark:shadow-none">
          <Package size={40} className="text-subtle dark:text-muted mb-3" />
          <p className="text-subtle dark:text-subtle text-[14px] font-semibold">
            {items.length === 0 ? 'Katalogas tuščias.' : 'Nerasta atitikmenų.'}
          </p>
          {items.length === 0 && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-primary dark:text-primary-ink font-semibold text-[14px] hover:underline cursor-pointer"
            >
              Pridėti pirmą įrangą →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, catItems]) => {
            const Icon = getCatIcon(category);
            const cat = catMap[category];
            return (
              <motion.div
                key={category}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface border border-border rounded-2xl shadow-sm dark:shadow-none overflow-hidden"
              >
                {/* Category header */}
                <div className="px-5 py-3.5 border-b border-border bg-surface-2/50 dark:bg-surface-2 flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-[8px] flex items-center justify-center"
                    style={cat ? { background: cat.bg_color, color: cat.text_color } : { background: '#F3F4F6', color: '#6B7280' }}
                  >
                    <Icon size={15} />
                  </div>
                  <h3 className="font-bold text-[14px] text-text dark:text-gray-100">{category}</h3>
                  <span className="ml-auto text-[12px] font-semibold text-subtle dark:text-subtle">{catItems.length} vnt.</span>
                </div>

                {/* Items table */}
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/50 dark:bg-surface-2">
                      <th className="py-2.5 px-5 text-[11px] font-bold text-subtle uppercase tracking-wider">Gamintojas</th>
                      <th className="py-2.5 px-5 text-[11px] font-bold text-subtle uppercase tracking-wider">Modelis</th>
                      <th className="py-2.5 px-5 text-[11px] font-bold text-subtle uppercase tracking-wider hidden sm:table-cell">Specifikacijos</th>
                      <th className="py-2.5 px-5 w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {catItems.map((item) => (
                      <tr key={item.id} className="border-b border-border dark:border-white/5 last:border-none hover:bg-surface-2/50 dark:hover:bg-surface-2 transition-colors group">
                        <td className="py-3 px-5 text-[13px] font-semibold text-text dark:text-gray-100">
                          {item.brand || <span className="text-subtle dark:text-muted">—</span>}
                        </td>
                        <td className="py-3 px-5 text-[13px] text-text dark:text-gray-200">
                          {item.model}
                          {item.capacity_kwh != null && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#DBEAFE] dark:bg-blue-900/30 text-[#1D4ED8] dark:text-blue-300 border border-[#2563EB]/30 dark:border-blue-500/20 align-middle">
                              <BatteryCharging size={11} /> {item.capacity_kwh} kWh
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-5 text-[13px] text-muted dark:text-subtle hidden sm:table-cell">
                          {item.specifications || <span className="text-subtle dark:text-muted">—</span>}
                        </td>
                        <td className="py-3 px-5 text-right">
                          <button
                            onClick={() => void handleDelete(item)}
                            disabled={deleteMutation.isPending}
                            className="w-7 h-7 flex items-center justify-center rounded-[6px] text-subtle dark:text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer disabled:opacity-30"
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
