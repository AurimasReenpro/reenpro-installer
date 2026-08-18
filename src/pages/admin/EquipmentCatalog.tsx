import { Fragment, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Package, Plus, Trash2, Loader2, X, Search, ChevronDown, ChevronRight,
  Cpu, LayoutGrid, BatteryCharging, Wrench, Cable, ShieldCheck,
  Pencil, Settings2, Check, EyeOff,
} from 'lucide-react';
import { useConfirm } from '../../hooks/useConfirm';
import MaterialTemplatesPanel from './MaterialTemplatesPanel';
import {
  getCatalogItems, createCatalogItem, updateCatalogItem, deleteCatalogItem,
  getCatalogItemUsage, CatalogItemInUseError,
  getEquipmentCategories, createEquipmentCategory,
  updateEquipmentCategory, deleteEquipmentCategory,
} from '../../api/catalog';
import type { CatalogItem, CatalogKind, EquipmentCategoryDef } from '../../types/equipment.types';
import {
  isBatteryCategory, CATALOG_KINDS, CATALOG_KIND_LABELS, EQUIPMENT_UNITS,
} from '../../types/equipment.types';

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
  unit: string;
  code: string;
  kind: CatalogKind;
}

const TUSCIA_FORMA: NewItemForm = {
  category: '', brand: '', model: '', specifications: '', capacity_kwh: '',
  unit: 'vnt.', code: '', kind: 'material',
};

/** Rūšies filtras: viena vieta, du rodiniai. */
const KIND_FILTRAI = [
  { id: 'all',       label: 'Visi'      },
  { id: 'equipment', label: 'Įranga'    },
  { id: 'material',  label: 'Medžiagos' },
] as const;
type KindFiltras = (typeof KIND_FILTRAI)[number]['id'];

/**
 * Iki tiek įrašų kategorijos rodomos išskleistos.
 *
 * Su keliais įrašais suskleidimas tik trukdo, o su keliais šimtais be jo matai
 * vien slinkties juostą. Riba, ne jungiklis, nes teisingas atsakymas priklauso
 * nuo to, kiek prekių yra, o ne nuo to, ką žmogus kartą pasirinko.
 */
const IŠSKLEIDIMO_RIBA = 40;

/** Vienas laukas įrašo redagavimo formoje — kad TS nesileistų į `any`. */
type ItemForm = {
  category: string; brand: string; model: string; specifications: string;
  capacity_kwh: string; unit: string; code: string; kind: CatalogKind;
  is_active: boolean;
};

export default function EquipmentCatalog() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  // Catalog state
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('Visos');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewItemForm>(TUSCIA_FORMA);
  const [kindFiltras, setKindFiltras] = useState<KindFiltras>('all');
  const [rodinys, setRodinys] = useState<'catalog' | 'templates'>('catalog');
  const [rodytiNeaktyvius, setRodytiNeaktyvius] = useState(false);

  // Įrašo redagavimas vietoje — atveriamas paspaudus eilutę.
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);
  // Rankiniu būdu suskleistos/išskleistos kategorijos. Kol kategorijos čia
  // nėra, galioja `IŠSKLEIDIMO_RIBA`.
  const [perjungtos, setPerjungtos] = useState<Record<string, boolean>>({});

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
        unit: form.unit.trim() || 'vnt.',
        // Tuščias kodas rašomas kaip NULL, ne "" — unikalumo indeksas
        // netikrina NULL reikšmių, tad kelis įrašus be kodo turėti galima.
        code: form.code.trim() || null,
        kind: form.kind,
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
      toast.success('Įrašas pridėtas į katalogą!');
      void queryClient.invalidateQueries({ queryKey: ['equipment_catalog'] });
      setShowForm(false);
      setForm(TUSCIA_FORMA);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCatalogItem,
    onSuccess: () => {
      toast.success('Įrašas ištrintas iš katalogo.');
      setEditingItemId(null);
      void queryClient.invalidateQueries({ queryKey: ['equipment_catalog'] });
    },
    onError: (err: unknown) => {
      if (err instanceof CatalogItemInUseError) {
        toast.error('Prekė buvo panaudota — ištrinti nebegalima. Išjunkite ją.');
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Klaida');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateCatalogItem>[1] }) =>
      updateCatalogItem(id, patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['equipment_catalog'] }),
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
  const itemLabel = (item: CatalogItem) =>
    [item.brand, item.model].filter(Boolean).join(' ').trim();

  /**
   * Trynimas arba išjungimas — sprendžia panaudojimas, ne mygtukas.
   *
   * Bazė panaudotos prekės ištrinti neleidžia (`ON DELETE RESTRICT`), ir tai
   * teisinga: senas žiniaraštis turi likti skaitomas. Bet klaidos pranešimas
   * apie svetimą raktą žmogui nieko nesako, tad panaudojimas tikrinamas
   * pirmiau ir siūlomas išjungimas — prekė dingsta iš rinkiklių, o senose
   * eilutėse lieka.
   */
  const handleDelete = async (item: CatalogItem) => {
    const { ziniarasciai, sablonai } = await getCatalogItemUsage(item.id);
    const panaudota = ziniarasciai + sablonai;

    if (panaudota === 0) {
      const ok = await confirm({
        title: 'Ištrinti iš katalogo?',
        message: `Ar tikrai norite ištrinti „${itemLabel(item)}"? Ši prekė niekur nenaudojama.`,
        variant: 'danger',
      });
      if (ok) deleteMutation.mutate(item.id);
      return;
    }

    if (!item.is_active) {
      toast.error(`„${itemLabel(item)}" jau išjungta, o ištrinti negalima — naudojama ${panaudota} vietoje.`);
      return;
    }

    const kur = [
      ziniarasciai > 0 ? `${ziniarasciai} žiniaraščio eilutėse` : null,
      sablonai > 0 ? `${sablonai} šablono eilutėse` : null,
    ].filter(Boolean).join(' ir ');

    const ok = await confirm({
      title: 'Ištrinti negalima',
      message: `„${itemLabel(item)}" naudojama ${kur}, tad ištrynus seni žiniaraščiai liktų be pavadinimo. Ar išjungti? Prekė dings iš rinkiklių, bet senose eilutėse liks.`,
      variant: 'danger',
    });
    if (ok) {
      updateMutation.mutate(
        { id: item.id, patch: { is_active: false } },
        { onSuccess: () => { toast.success('Prekė išjungta.'); setEditingItemId(null); } },
      );
    }
  };

  // ── Įrašo redagavimas ────────────────────────────────────────────────────────
  const startEditItem = (item: CatalogItem) => {
    setEditingItemId(item.id);
    setItemForm({
      category: item.category,
      brand: item.brand,
      model: item.model,
      specifications: item.specifications ?? '',
      capacity_kwh: item.capacity_kwh?.toString() ?? '',
      unit: item.unit,
      code: item.code ?? '',
      kind: item.kind,
      is_active: item.is_active,
    });
  };

  const saveEditItem = (item: CatalogItem) => {
    if (!itemForm) return;
    if (!itemForm.model.trim()) { toast.error('Pavadinimas negali būti tuščias.'); return; }

    const patch: Parameters<typeof updateCatalogItem>[1] = {
      category: itemForm.category,
      brand: itemForm.brand.trim(),
      model: itemForm.model.trim(),
      specifications: itemForm.specifications.trim() || null,
      unit: itemForm.unit.trim() || 'vnt.',
      // Tuščias kodas rašomas kaip NULL — unikalumo indeksas NULL netikrina,
      // tad kelias prekes be kodo turėti galima, o kelias su "" — ne.
      code: itemForm.code.trim() || null,
      kind: itemForm.kind,
      is_active: itemForm.is_active,
    };
    if (isBatteryCategory(itemForm.category)) {
      patch.capacity_kwh = itemForm.capacity_kwh === '' ? null : parseFloat(itemForm.capacity_kwh);
    }

    updateMutation.mutate({ id: item.id, patch }, {
      onSuccess: () => { toast.success('Išsaugota.'); setEditingItemId(null); },
    });
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
      (item.specifications ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (item.code ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === 'Visos' || item.category === filterCategory;
    const matchesKind = kindFiltras === 'all' || item.kind === kindFiltras;
    // Išjungtos prekės slepiamos, kol jų neprašoma — bet redaguojamą įrašą
    // reikia matyti, kitaip išjungus jis dingtų iš po pirštų.
    const matchesActive = rodytiNeaktyvius || item.is_active || item.id === editingItemId;
    return matchesSearch && matchesCategory && matchesKind && matchesActive;
  });

  const neaktyvuSkaicius = items.filter((i) => !i.is_active).length;

  const grouped = catNames.reduce<Record<string, CatalogItem[]>>((acc, name) => {
    const catItems = filtered.filter(i => i.category === name);
    if (catItems.length > 0) acc[name] = catItems;
    return acc;
  }, {});
  const knownNames = new Set(catNames);
  const otherItems = filtered.filter(i => !knownNames.has(i.category));
  if (otherItems.length > 0) grouped['Kita'] = otherItems;

  // Ieškant visada išskleista — paslėptas atitikmuo yra tas pats, kas nerastas.
  const numatytaiIšskleista = !!search || filtered.length <= IŠSKLEIDIMO_RIBA;
  const arIšskleista = (kategorija: string) =>
    perjungtos[kategorija] ?? numatytaiIšskleista;
  const perjungti = (kategorija: string) =>
    setPerjungtos((p) => ({ ...p, [kategorija]: !arIšskleista(kategorija) }));

  const defaultCatForForm = categories[0]?.name ?? '';

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text flex items-center gap-2">
            <Package className="w-6 h-6 text-primary dark:text-primary-ink" />
            Katalogas
          </h1>
          <p className="text-[14px] text-muted mt-0.5">
            {rodinys === 'catalog'
              ? `${items.length} įraš${items.length === 1 ? 'as' : 'ai'} kataloge`
              : 'Šablonai užpildo objekto žiniaraštį vienu paspaudimu'}
          </p>
        </div>
        <div className="flex gap-2">
          {rodinys === 'catalog' && (
          <button
            onClick={() => setShowCatMgmt(true)}
            className="flex items-center gap-2 h-[40px] px-4 rounded-card border border-border text-muted font-medium text-[14px] bg-surface hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <Settings2 size={15} />
            Kategorijos
          </button>
          )}
          {rodinys === 'catalog' && (
          <button
            onClick={() => {
              // Rūšis parenkama pagal aktyvų filtrą — jei žiūri medžiagas,
              // greičiausiai medžiagą ir pridedi.
              setForm({
                ...TUSCIA_FORMA,
                category: defaultCatForForm,
                kind: kindFiltras === 'equipment' ? 'equipment' : 'material',
              });
              setShowForm(true);
            }}
            className="flex items-center gap-2 rounded-card bg-primary hover:opacity-90 text-white font-medium px-4 py-2 transition-all shadow-sm cursor-pointer"
          >
            <Plus size={16} />
            Pridėti
          </button>
          )}
        </div>
      </div>

      {/* Katalogas ir šablonai — vienoje vietoje: abu yra atmintinė
          medžiagoms, tad jų neverta skirstyti po meniu punktus. */}
      <div className="inline-flex rounded-card bg-surface-2 p-1">
        {([['catalog', 'Katalogas'], ['templates', 'Šablonai']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setRodinys(id)}
            className={`h-[34px] px-4 rounded-btn text-[13px] font-semibold transition-colors cursor-pointer ${
              rodinys === id ? 'bg-surface text-primary dark:text-primary-ink shadow-sm' : 'text-subtle hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {rodinys === 'templates' && <MaterialTemplatesPanel />}

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
                <h2 className="font-bold text-[17px] text-text">Nauja įranga</h2>
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
                      className="w-full h-[42px] pl-3 pr-9 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white appearance-none focus:outline-none focus:bg-surface dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all cursor-pointer"
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
                    className="w-full h-[42px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white focus:outline-none focus:bg-surface dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
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
                    className="w-full h-[42px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white focus:outline-none focus:bg-surface dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>

                {/* Rūšis, matas ir Rivilės kodas */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Rūšis</label>
                    <select
                      value={form.kind}
                      onChange={(e) => setForm(f => ({ ...f, kind: e.target.value as CatalogKind }))}
                      className="w-full h-[42px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text focus:outline-none focus:bg-surface dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all cursor-pointer"
                    >
                      {CATALOG_KINDS.map((k) => (
                        <option key={k} value={k}>{CATALOG_KIND_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Matas</label>
                    <input
                      type="text"
                      list="catalog-units"
                      value={form.unit}
                      onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))}
                      placeholder="vnt."
                      className="w-full h-[42px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text focus:outline-none focus:bg-surface dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Rivilės kodas</label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))}
                      placeholder="neprivalomas"
                      className="w-full h-[42px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text focus:outline-none focus:bg-surface dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                </div>

                {/* Specifications */}
                <div>
                  <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Specifikacijos</label>
                  <input
                    type="text"
                    value={form.specifications}
                    onChange={(e) => setForm(f => ({ ...f, specifications: e.target.value }))}
                    placeholder="Pvz.: 10 kW, 3 fazės, MPPT × 2"
                    className="w-full h-[42px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white focus:outline-none focus:bg-surface dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
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
                      className="w-full h-[42px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white focus:outline-none focus:bg-surface dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                    />
                    <p className="text-[11px] text-subtle dark:text-subtle mt-1">Bazinė talpa už vieną vienetą — bus padauginta iš kiekio objekte.</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 h-[42px] rounded-card border border-border text-muted dark:text-subtle font-medium text-[14px] hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    Atšaukti
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="flex-1 h-[42px] rounded-card bg-primary text-white font-medium text-[14px] hover:bg-primary transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
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
                <h2 className="font-bold text-[17px] text-text flex items-center gap-2">
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
                          className="w-7 h-7 flex items-center justify-center rounded-[6px] text-subtle dark:text-muted hover:text-danger hover:bg-danger/10 dark:hover:bg-danger/30 transition-colors cursor-pointer disabled:opacity-30"
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
                            className="w-full h-[36px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-lg text-[13px] text-text dark:text-white focus:outline-none focus:bg-surface dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
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
                      className="w-full h-[36px] px-3 bg-surface-2 border border-transparent dark:border-white/10 rounded-lg text-[13px] text-text dark:text-white focus:outline-none focus:bg-surface dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
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

      {rodinys === 'catalog' && (
      <>
      {/* ── Search + Filter ── */}
      <div className="flex gap-3 flex-wrap">
        {/* Įranga ir medžiagos gyvena viename kataloge — skiriasi tik rodinys. */}
        <div className="inline-flex rounded-card bg-surface-2 p-1 shrink-0">
          {KIND_FILTRAI.map((k) => (
            <button
              key={k.id}
              onClick={() => setKindFiltras(k.id)}
              className={`h-[32px] px-3.5 rounded-btn text-[13px] font-semibold transition-colors cursor-pointer ${
                kindFiltras === k.id
                  ? 'bg-surface text-primary dark:text-primary-ink shadow-sm'
                  : 'text-subtle hover:text-text'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle dark:text-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ieškoti modelio, gamintojo, kodo..."
            className="w-full h-[40px] pl-9 pr-4 bg-surface border border-border/50 dark:border-white/10 rounded-card text-[14px] text-text placeholder-subtle focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary transition-all"
          />
        </div>
        <div className="relative">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-[40px] pl-3 pr-9 bg-surface border border-border/50 dark:border-white/10 rounded-card text-[14px] text-text dark:text-white appearance-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary transition-all cursor-pointer"
          >
            {allFilterOptions.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle dark:text-subtle pointer-events-none" />
        </div>

        {/* Išjungtų nerodome, kol jų nėra — tuščias jungiklis būtų triukšmas. */}
        {neaktyvuSkaicius > 0 && (
          <button
            onClick={() => setRodytiNeaktyvius(v => !v)}
            className={`flex items-center gap-2 h-[40px] px-4 rounded-card border text-[13px] font-medium transition-colors cursor-pointer ${
              rodytiNeaktyvius
                ? 'border-primary text-primary dark:text-primary-ink bg-primary/10'
                : 'border-border text-muted dark:text-subtle bg-surface hover:bg-surface-2'
            }`}
          >
            <EyeOff size={15} />
            Išjungtos ({neaktyvuSkaicius})
          </button>
        )}
      </div>

      {/* Mato pasiūlymai reikalingi ir eilutės redaktoriui, tad sąrašas gyvena
          čia, o ne pridėjimo lange, kuris rodomas tik atidarius. */}
      <datalist id="catalog-units">
        {EQUIPMENT_UNITS.map((u) => <option key={u} value={u} />)}
      </datalist>

      {/* ── Content ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-surface border border-border rounded-card shadow-sm dark:shadow-none">
          <Package size={40} className="text-subtle dark:text-muted mb-3" />
          <p className="text-subtle dark:text-subtle text-[14px] font-semibold">
            {items.length === 0 ? 'Katalogas tuščias.' : 'Nerasta atitikmenų.'}
          </p>
          {items.length === 0 && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-primary dark:text-primary-ink font-semibold text-[14px] hover:underline cursor-pointer"
            >
              Pridėti pirmą įrašą →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([category, catItems]) => {
            const Icon = getCatIcon(category);
            const cat = catMap[category];
            const išskleista = arIšskleista(category);
            return (
              <motion.div
                key={category}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface border border-border rounded-card shadow-sm dark:shadow-none overflow-hidden"
              >
                {/* Kategorijos antraštė — ji pati yra suskleidimo mygtukas. */}
                <button
                  type="button"
                  onClick={() => perjungti(category)}
                  className="w-full px-5 py-3.5 bg-surface-2/50 dark:bg-surface-2 flex items-center gap-2 text-left hover:bg-surface-2 transition-colors cursor-pointer"
                >
                  {išskleista
                    ? <ChevronDown size={15} className="text-subtle dark:text-subtle shrink-0" />
                    : <ChevronRight size={15} className="text-subtle dark:text-subtle shrink-0" />}
                  <div
                    className="w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0"
                    style={cat ? { background: cat.bg_color, color: cat.text_color } : { background: '#F3F4F6', color: '#6B7280' }}
                  >
                    <Icon size={15} />
                  </div>
                  <h3 className="font-bold text-[14px] text-text">{category}</h3>
                  <span className="ml-auto text-[12px] font-semibold text-subtle dark:text-subtle">{catItems.length} vnt.</span>
                </button>

                {išskleista && (
                <table className="w-full text-left border-t border-border">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/50 dark:bg-surface-2">
                      <th className="py-2.5 px-5 text-[11px] font-bold text-subtle uppercase tracking-wider">Pavadinimas</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-subtle uppercase tracking-wider w-[140px]">Rivilės kodas</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-subtle uppercase tracking-wider w-[80px]">Vnt.</th>
                      <th className="py-2.5 px-5 text-[11px] font-bold text-subtle uppercase tracking-wider hidden lg:table-cell">Specifikacijos</th>
                      <th className="py-2.5 px-5 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {catItems.map((item) => {
                      const redaguojama = editingItemId === item.id;
                      return (
                      <Fragment key={item.id}>
                        {/* Visa eilutė yra mygtukas: pavadinimas taisomas
                            paspaudus ant prekės, be atskiro pieštuko. */}
                        <tr
                          onClick={() => redaguojama ? setEditingItemId(null) : startEditItem(item)}
                          className={`border-b border-border dark:border-white/5 last:border-none transition-colors cursor-pointer ${
                            redaguojama ? 'bg-surface-2 dark:bg-surface-2' : 'hover:bg-surface-2/50 dark:hover:bg-surface-2'
                          } ${item.is_active ? '' : 'opacity-55'}`}
                        >
                          <td className="py-3 px-5 text-[13px] text-text">
                            {itemLabel(item) || <span className="text-subtle dark:text-muted">—</span>}
                            {item.capacity_kwh != null && (
                              <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-info-bg text-info border border-info/30 align-middle">
                                <BatteryCharging size={11} /> {item.capacity_kwh} kWh
                              </span>
                            )}
                            {!item.is_active && (
                              <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-2 text-subtle border border-border align-middle">
                                <EyeOff size={11} /> Išjungta
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-[12px] tabular-nums text-muted dark:text-subtle">
                            {item.code || <span className="text-subtle dark:text-muted">—</span>}
                          </td>
                          <td className="py-3 px-3 text-[12px] text-muted dark:text-subtle">{item.unit}</td>
                          <td className="py-3 px-5 text-[13px] text-muted dark:text-subtle hidden lg:table-cell">
                            {item.specifications || <span className="text-subtle dark:text-muted">—</span>}
                          </td>
                          <td className="py-3 px-5 text-right">
                            <Pencil size={13} className="inline text-subtle dark:text-muted" />
                          </td>
                        </tr>

                        {redaguojama && itemForm && (
                          <tr className="border-b border-border dark:border-white/5">
                            <td colSpan={5} className="p-0">
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="px-5 py-4 bg-surface border-l-2 border-primary space-y-3"
                              >
                                <div>
                                  <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Pavadinimas *</label>
                                  <input
                                    type="text"
                                    value={itemForm.model}
                                    autoFocus
                                    onChange={(e) => setItemForm(f => f && ({ ...f, model: e.target.value }))}
                                    className="w-full h-[38px] px-3 bg-surface-2 border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors"
                                  />
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <div>
                                    <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Kategorija</label>
                                    <select
                                      value={itemForm.category}
                                      onChange={(e) => setItemForm(f => f && ({ ...f, category: e.target.value }))}
                                      className="w-full h-[38px] px-2 bg-surface-2 border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary transition-colors cursor-pointer"
                                    >
                                      {!catNames.includes(itemForm.category) && (
                                        <option value={itemForm.category}>{itemForm.category}</option>
                                      )}
                                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Rūšis</label>
                                    <select
                                      value={itemForm.kind}
                                      onChange={(e) => setItemForm(f => f && ({ ...f, kind: e.target.value as CatalogKind }))}
                                      className="w-full h-[38px] px-2 bg-surface-2 border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary transition-colors cursor-pointer"
                                    >
                                      {CATALOG_KINDS.map(k => <option key={k} value={k}>{CATALOG_KIND_LABELS[k]}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Matas</label>
                                    <input
                                      type="text"
                                      list="catalog-units"
                                      value={itemForm.unit}
                                      onChange={(e) => setItemForm(f => f && ({ ...f, unit: e.target.value }))}
                                      className="w-full h-[38px] px-3 bg-surface-2 border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Rivilės kodas</label>
                                    <input
                                      type="text"
                                      value={itemForm.code}
                                      placeholder="—"
                                      onChange={(e) => setItemForm(f => f && ({ ...f, code: e.target.value }))}
                                      className="w-full h-[38px] px-3 tabular-nums bg-surface-2 border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Gamintojas</label>
                                    <input
                                      type="text"
                                      value={itemForm.brand}
                                      placeholder="neprivalomas"
                                      onChange={(e) => setItemForm(f => f && ({ ...f, brand: e.target.value }))}
                                      className="w-full h-[38px] px-3 bg-surface-2 border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Specifikacijos</label>
                                    <input
                                      type="text"
                                      value={itemForm.specifications}
                                      placeholder="Pvz.: 10 kW, 3 fazės"
                                      onChange={(e) => setItemForm(f => f && ({ ...f, specifications: e.target.value }))}
                                      className="w-full h-[38px] px-3 bg-surface-2 border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors"
                                    />
                                  </div>
                                </div>

                                {isBatteryCategory(itemForm.category) && (
                                  <div className="md:w-1/2">
                                    <label className="flex items-center gap-1.5 text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">
                                      <BatteryCharging size={13} /> Talpa vienetui (kWh)
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={itemForm.capacity_kwh}
                                      onChange={(e) => setItemForm(f => f && ({ ...f, capacity_kwh: e.target.value }))}
                                      className="w-full h-[38px] px-3 bg-surface-2 border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors"
                                    />
                                  </div>
                                )}

                                <div className="flex items-center gap-3 flex-wrap pt-1">
                                  <label className="flex items-center gap-2 text-[13px] text-muted dark:text-subtle cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={itemForm.is_active}
                                      onChange={(e) => setItemForm(f => f && ({ ...f, is_active: e.target.checked }))}
                                      className="w-4 h-4 accent-primary cursor-pointer"
                                    />
                                    Rodyti rinkikliuose
                                  </label>

                                  <div className="flex-1" />

                                  <button
                                    type="button"
                                    onClick={() => void handleDelete(item)}
                                    disabled={deleteMutation.isPending}
                                    className="flex items-center gap-1.5 h-[36px] px-3 rounded-btn text-danger text-[13px] font-medium hover:bg-danger/10 dark:hover:bg-danger/30 transition-colors cursor-pointer disabled:opacity-40"
                                  >
                                    {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                    Ištrinti
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingItemId(null)}
                                    className="h-[36px] px-4 rounded-btn border border-border text-muted dark:text-subtle font-medium text-[13px] hover:bg-surface-2 transition-colors cursor-pointer"
                                  >
                                    Atšaukti
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => saveEditItem(item)}
                                    disabled={updateMutation.isPending}
                                    className="flex items-center gap-1.5 h-[36px] px-4 rounded-btn bg-primary text-white font-medium text-[13px] hover:opacity-90 transition-all disabled:opacity-60 cursor-pointer"
                                  >
                                    {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                    Išsaugoti
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}
