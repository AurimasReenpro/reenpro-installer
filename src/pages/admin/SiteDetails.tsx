import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, Building2, Loader2, Plus, Trash2, Save,
  Upload, FileText, Image as ImageIcon, X, Pencil,
  Info, Cpu, Network, FolderOpen, ListChecks, MapPin, Calendar, Circle, Building, ChevronDown, Package,
  CheckCircle2, XCircle, MinusCircle, ClipboardList, ChevronRight, AlertTriangle, Phone, Mail, User,
  Download,
} from 'lucide-react';
import { useConfirm } from '../../hooks/useConfirm';
import {
  getSiteById, updateEquipment, updateSiteDetails, uploadSiteFile, getSiteFiles, deleteSiteFile,
  getSiteChecklistSession, assignChecklistToSite, updateClientInfo, getSiteInstallerPhotos,
} from '../../api/sites';
import type { InstallerPhoto } from '../../api/sites';
import { useSignedPhotoUrl } from '../../hooks/useSignedPhotoUrl';
import { supabase } from '../../lib/supabase';
import { getCatalogItems } from '../../api/catalog';
import { parseEquipmentDetails, EQUIPMENT_CATEGORIES, EQUIPMENT_UNITS } from '../../types/equipment.types';
import type { EquipmentItem } from '../../types/equipment.types';
import { format } from 'date-fns';

// ── Shared photo helpers ──────────────────────────────────────────────────────

/**
 * Derives the relative storage path from either a bare path or a full
 * Supabase storage URL (public or signed).
 *   "abc/def/photo.jpg"                       → "abc/def/photo.jpg"
 *   "https://.../object/public/site-photos/abc/def/photo.jpg"  → "abc/def/photo.jpg"
 */
function extractStoragePath(value: string): string {
  if (!value.startsWith('http')) return value;
  const match = /site-photos\/([^?]+)/.exec(value);
  return match?.[1] ?? value;
}

/**
 * Force-downloads a signed URL as a file rather than opening it in a new tab.
 * Uses blob + object URL so the browser respects the `download` attribute even
 * for cross-origin URLs.
 */
async function forceDownload(signedUrl: string, storagePath: string): Promise<void> {
  const fileName = storagePath.split('/').pop() ?? 'photo.jpg';
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

/**
 * Removes a photo from all three locations:
 *  1. `photos` DB table   (matched by storage_path)
 *  2. `site_checklist_items.photo_url` (reset to null / 'pending')
 *  3. `site-photos` storage bucket
 *
 * Pass `checklistItemId` when you know the exact item so the UPDATE is precise;
 * otherwise falls back to matching by the photo_url value.
 */
async function deletePhotoFromAllSources(
  storagePath: string,
  checklistItemId?: string,
): Promise<void> {
  const { error: dbErr } = await supabase
    .from('photos')
    .delete()
    .eq('storage_path', storagePath);
  if (dbErr) throw new Error(`Įrašo klaida: ${dbErr.message}`);

  if (checklistItemId) {
    await supabase
      .from('site_checklist_items')
      .update({ photo_url: null, status: 'pending' })
      .eq('id', checklistItemId);
  } else {
    await supabase
      .from('site_checklist_items')
      .update({ photo_url: null, status: 'pending' })
      .eq('photo_url', storagePath);
  }

  const { error: storageErr } = await supabase.storage
    .from('site-photos')
    .remove([storagePath]);
  if (storageErr) throw new Error(`Saugyklos klaida: ${storageErr.message}`);
}

interface SiteWithTeam {
  id: string;
  code: string;
  client_name: string;
  address: string;
  status: string | null;
  scheduled_start: string | null;
  system_type: string;
  team_id: string | null;
  equipment_details: import('../../types/equipment.types').EquipmentItem[] | Record<string, string> | null;
  notes: string | null;
  stringing_details: unknown;
  team: { name: string } | null;
  kwp: number | null;
  client_phone: string | null;
  contact_person: string | null;
  client_email: string | null;
}

type TabId = 'info' | 'equip' | 'strings' | 'files' | 'check';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'info', label: 'Objekto info', icon: Info },
  { id: 'equip', label: 'Įranga', icon: Cpu },
  { id: 'strings', label: 'Stringavimas', icon: Network },
  { id: 'files', label: 'Failai', icon: FolderOpen },
  { id: 'check', label: 'Checklist', icon: ListChecks },
];

// ══════════════════════════════════════════════════════════════════════════════
// SolarGrade Checklist Tab
// ══════════════════════════════════════════════════════════════════════════════

type ItemStatus = 'pending' | 'pass' | 'fail' | 'n_a';

const STATUS_ITEM: Record<ItemStatus, { label: string; icon: React.ElementType; className: string; dotClass: string }> = {
  pending: { label: 'Laukia',     icon: Circle,       className: 'bg-[#f6f5fa] text-[#7c7484] border-[#cdc3d4]/50',  dotClass: 'bg-[#cdc3d4]' },
  pass:    { label: 'Praėjo',     icon: CheckCircle2, className: 'bg-[#ECFDF5] text-[#059669] border-[#059669]/20',   dotClass: 'bg-[#059669]' },
  fail:    { label: 'Brokas',     icon: XCircle,      className: 'bg-[#FEF2F2] text-[#DC2626] border-[#DC2626]/20',   dotClass: 'bg-[#DC2626]' },
  n_a:     { label: 'Netaikoma', icon: MinusCircle,  className: 'bg-[#FFFBEB] text-[#D97706] border-[#D97706]/20',   dotClass: 'bg-[#D97706]' },
};

/**
 * Renders a checklist item photo with Download + Delete action buttons.
 * `value` may be a bare storage path (new data) or a full https:// URL (legacy).
 */
function ChecklistPhoto({
  value,
  siteId,
  checklistItemId,
}: {
  value: string;
  siteId: string;
  checklistItemId: string;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const [deleting,    setDeleting]    = useState(false);

  const storagePath = extractStoragePath(value);
  const isPath = !value.startsWith('http');
  const { url: signedUrl, isLoading } = useSignedPhotoUrl(isPath ? storagePath : undefined);
  const displayUrl = isPath ? (signedUrl ?? '') : value;

  const handleDownload = async () => {
    if (!displayUrl) return;
    setDownloading(true);
    try {
      await forceDownload(displayUrl, storagePath);
    } catch (err) {
      toast.error(`Atsisiuntimo klaida: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Ištrinti nuotrauką?',
      message: 'Ar tikrai norite ištrinti šią nuotrauką? Veiksmas neatšaukiamas.',
      variant: 'danger',
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await deletePhotoFromAllSources(storagePath, checklistItemId);
      void queryClient.invalidateQueries({ queryKey: ['site_checklist_session', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['admin_site_photos',      siteId] });
      toast.success('Nuotrauka ištrinta.');
    } catch (err) {
      toast.error(`Klaida trinant: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-28 w-28 rounded-[8px] bg-[#f6f5fa] border border-[#cdc3d4]/30 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }

  if (!displayUrl) return null;

  return (
    <div className="inline-flex flex-col gap-2">
      {/* Thumbnail */}
      <a href={displayUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
        <img
          src={displayUrl}
          alt="Nuotrauka"
          className="h-28 w-auto rounded-[8px] border border-[#cdc3d4]/30 object-cover hover:opacity-90 transition-opacity cursor-zoom-in"
        />
      </a>
      {/* Action bar */}
      <div className="flex gap-1.5">
        <button
          onClick={() => void handleDownload()}
          disabled={downloading || deleting}
          title="Atsisiųsti"
          className="flex-1 flex items-center justify-center gap-1.5 h-[28px] rounded-[6px] bg-[#f6f5fa] border border-[#cdc3d4]/40 text-[#4b4452] hover:bg-[#ede8f5] hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-50 text-[11px] font-semibold cursor-pointer"
        >
          {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          Siųsti
        </button>
        <button
          onClick={() => void handleDelete()}
          disabled={downloading || deleting}
          title="Ištrinti nuotrauką"
          className="flex items-center justify-center gap-1.5 h-[28px] px-2.5 rounded-[6px] bg-[#FEF2F2] border border-[#DC2626]/20 text-[#DC2626] hover:bg-[#DC2626] hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
        >
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </div>
    </div>
  );
}

function ChecklistItemRow({ item, siteId }: { item: { id: string; question_text: string; category: string | null; phase: string | null; status: ItemStatus; photo_url: string | null; comment: string | null; is_required: boolean }; siteId: string }) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_ITEM[item.status];
  const StatusIcon = s.icon;

  return (
    <div className={`rounded-[10px] border transition-all duration-200 ${item.status === 'fail' ? 'border-[#DC2626]/30 bg-[#FEF2F2]/30' : 'border-[#cdc3d4]/30 bg-white hover:border-[#cdc3d4]/60'}`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 p-3.5 text-left cursor-pointer"
      >
        <StatusIcon size={18} className={item.status === 'pass' ? 'text-[#059669]' : item.status === 'fail' ? 'text-[#DC2626]' : item.status === 'n_a' ? 'text-[#D97706]' : 'text-[#cdc3d4]'} />
        <span className="flex-1 text-[13px] font-semibold text-[#1d033a] leading-snug">{item.question_text}</span>
        {item.is_required && item.status === 'pending' && (
          <span className="text-[10px] font-bold text-[#DC2626] border border-[#DC2626]/30 bg-[#FEF2F2] px-1.5 py-0.5 rounded">REQ</span>
        )}
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-[6px] border ${s.className}`}>{s.label}</span>
        <ChevronRight size={14} className={`text-[#cdc3d4] transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[#cdc3d4]/20 p-4 space-y-3">
              {/* Comment */}
              {item.comment ? (
                <div>
                  <p className="text-[11px] font-bold text-[#7c7484] uppercase tracking-wider mb-1">Komentaras</p>
                  <p className="text-[13px] text-[#1d033a] bg-[#f6f5fa] rounded-[8px] px-3 py-2 border border-[#cdc3d4]/30">{item.comment}</p>
                </div>
              ) : (
                <p className="text-[12px] text-[#7c7484] italic">Komentaro nėra.</p>
              )}

              {/* Photo */}
              {item.photo_url && (
                <div>
                  <p className="text-[11px] font-bold text-[#7c7484] uppercase tracking-wider mb-2">Nuotrauka</p>
                  <ChecklistPhoto
                    value={item.photo_url}
                    siteId={siteId}
                    checklistItemId={item.id}
                  />
                </div>
              )}

              {item.status === 'fail' && !item.photo_url && (
                <div className="flex items-center gap-2 text-[#D97706] bg-[#FFFBEB] border border-[#D97706]/20 rounded-[8px] px-3 py-2">
                  <AlertTriangle size={14} />
                  <span className="text-[12px] font-semibold">Reikia nuotraukos — laukiama montuotojo įkėlimo.</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChecklistTabContent({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState('');

  // ── Add custom item state ────────────────────────────────────────────────
  const [showAddItem,    setShowAddItem]    = useState(false);
  const [newItemText,    setNewItemText]    = useState('');
  const [newItemRequired, setNewItemRequired] = useState(true);

  // Fetch checklist session
  const { data: session, isLoading } = useQuery({
    queryKey: ['site_checklist_session', siteId],
    queryFn: () => getSiteChecklistSession(siteId),
  });

  // Fetch categories for assignment dropdown
  const { data: categories } = useQuery({
    queryKey: ['checklist_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_categories')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !session,
  });

  const assignMutation = useMutation({
    mutationFn: () => assignChecklistToSite(siteId, selectedCategory),
    onSuccess: () => {
      toast.success('Checklist priskirtas!');
      void queryClient.invalidateQueries({ queryKey: ['site_checklist_session', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  // ── Add custom checklist item mutation ───────────────────────────────────
  const addItemMutation = useMutation({
    mutationFn: async () => {
      if (!session?.id) throw new Error('Aktyvi sesija nerasta.');
      if (!newItemText.trim()) throw new Error('Darbo aprašymas negali būti tuščias.');
      const { error } = await supabase
        .from('site_checklist_items')
        .insert({
          site_checklist_id: session.id,
          question_text:     newItemText.trim(),
          is_required:       newItemRequired,
          status:            'pending',
          category:          'Papildomi darbai',
          phase:             null,
        });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Papildomas darbas pridėtas!');
      setShowAddItem(false);
      setNewItemText('');
      setNewItemRequired(true);
      // Refresh admin checklist view + mobile work tab
      void queryClient.invalidateQueries({ queryKey: ['site_checklist_session', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
      </div>
    );
  }

  // ── No session: show assignment UI ───────────────────────────────────────
  if (!session) {
    return (
      <div className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm p-8 flex flex-col items-center gap-5">
        <div className="w-16 h-16 rounded-[16px] bg-[#f6f5fa] flex items-center justify-center border border-[#cdc3d4]/30">
          <ClipboardList size={32} className="text-[#cdc3d4]" />
        </div>
        <div className="text-center">
          <p className="font-bold text-[16px] text-[#1d033a] mb-1">Checklist nepriskirtas</p>
          <p className="text-[13px] text-[#7c7484]">Priskirk šablono kategoriją, kad sukurtum šio objekto QC sesiją.</p>
        </div>
        <div className="w-full max-w-sm flex gap-2">
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="flex-1 h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary"
          >
            <option value="">-- Pasirinkti kategoriją --</option>
            {categories?.map(cat => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>
          <button
            onClick={() => assignMutation.mutate()}
            disabled={!selectedCategory || assignMutation.isPending}
            className="h-[44px] px-5 rounded-[8px] bg-primary text-white font-semibold text-[14px] hover:bg-primary/80 transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {assignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus size={16} />}
            Priskirti
          </button>
        </div>
      </div>
    );
  }

  // ── Session exists: show QC dashboard ────────────────────────────────────
  const items = session.items ?? [];
  const total = items.length;
  const passed = items.filter(i => i.status === 'pass').length;
  const failed = items.filter(i => i.status === 'fail').length;
  const naCount = items.filter(i => i.status === 'n_a').length;
  const resolved = passed + naCount;
  const pct = total > 0 ? Math.round((resolved / total) * 100) : 0;

  // Group items by category
  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    const key = item.category || 'Kita';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const SESSION_STATUS: Record<'pending' | 'in_progress' | 'completed', { label: string; className: string }> = {
    pending:     { label: 'Laukia',      className: 'bg-[#f6f5fa] text-[#7c7484] border-[#cdc3d4]/50' },
    in_progress: { label: 'Vykdoma',     className: 'bg-[#EFF6FF] text-[#2563EB] border-[#2563EB]/20' },
    completed:   { label: 'Baigta',      className: 'bg-[#ECFDF5] text-[#059669] border-[#059669]/20' },
  };
  const ss = SESSION_STATUS[session.status];

  return (
    <>
    <div className="space-y-5">
      {/* Progress header */}
      <div className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[10px] bg-[#fbf0ff] flex items-center justify-center border border-primary/10">
              <ListChecks size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-[15px] text-[#1d033a]">QC Sesija</h3>
              <p className="text-[12px] text-[#7c7484]">{total} klausimai · {format(new Date(session.created_at!), 'yyyy-MM-dd')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-[6px] border ${ss.className}`}>{ss.label}</span>
            {failed > 0 && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-[6px] border bg-[#FEF2F2] text-[#DC2626] border-[#DC2626]/20 flex items-center gap-1">
                <AlertTriangle size={11} /> {failed} brokas
              </span>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Iš viso',    value: total,    cls: 'text-[#1d033a]' },
            { label: 'Praėjo',     value: passed,   cls: 'text-[#059669]' },
            { label: 'Brokas',     value: failed,   cls: 'text-[#DC2626]' },
            { label: 'Netaikoma', value: naCount,   cls: 'text-[#D97706]' },
          ].map(s => (
            <div key={s.label} className="bg-[#f6f5fa] rounded-[10px] p-3 border border-[#cdc3d4]/30 text-center">
              <span className={`text-[20px] font-bold block ${s.cls}`}>{s.value}</span>
              <span className="text-[10px] font-semibold text-[#7c7484] uppercase tracking-wider">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2.5 bg-[#cdc3d4]/20 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-[#7c3aed]"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
          <span className="text-[14px] font-bold text-primary w-10 text-right">{pct}%</span>
        </div>

        {/* Add custom item button */}
        <div className="flex justify-end mt-4 pt-3 border-t border-[#cdc3d4]/20">
          <button
            onClick={() => setShowAddItem(true)}
            className="flex items-center gap-2 h-[34px] px-4 rounded-[8px] bg-[#f6f5fa] text-primary font-semibold text-[13px] hover:bg-[#ede8f5] border border-[#cdc3d4]/30 transition-colors cursor-pointer"
          >
            <Plus size={14} />
            Pridėti papildomą darbą
          </button>
        </div>
      </div>

      {/* Grouped items */}
      {Object.entries(grouped).map(([category, groupItems]) => {
        const groupPassed = groupItems.filter(i => i.status === 'pass').length;
        const groupTotal = groupItems.length;
        return (
          <div key={category} className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm overflow-hidden">
            {/* Group header */}
            <div className="px-5 py-3.5 bg-[#f6f5fa]/70 border-b border-[#cdc3d4]/20 flex items-center justify-between">
              <h4 className="text-[12px] font-bold text-[#7c7484] uppercase tracking-wider">{category}</h4>
              <span className="text-[12px] font-semibold text-[#7c7484]">{groupPassed}/{groupTotal}</span>
            </div>
            <div className="p-4 space-y-2">
              {groupItems.map(item => (
                <ChecklistItemRow key={item.id} item={item as { id: string; question_text: string; category: string | null; phase: string | null; status: ItemStatus; photo_url: string | null; comment: string | null; is_required: boolean }} siteId={siteId} />
              ))}
            </div>
          </div>
        );
      })}
    </div>

    {/* ── Add custom checklist item modal ── */}
    {showAddItem && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#cdc3d4]/30">
            <h3 className="text-[16px] font-bold text-[#1d033a]">Papildomas darbas</h3>
            <button
              onClick={() => setShowAddItem(false)}
              className="cursor-pointer text-[#7c7484] hover:text-[#1d033a] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">
                Darbo aprašymas <span className="text-red-500">*</span>
              </label>
              <textarea
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                placeholder="Pvz.: Patikrinti DC jungčių sandarumą..."
                rows={3}
                autoFocus
                className="w-full px-3 py-2 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={newItemRequired}
                onChange={(e) => setNewItemRequired(e.target.checked)}
                className="w-4 h-4 accent-primary cursor-pointer"
              />
              <span className="text-[14px] text-[#1d033a] font-medium">Reikalinga nuotrauka kaip įrodymas</span>
            </label>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={() => { setShowAddItem(false); setNewItemText(''); }}
              disabled={addItemMutation.isPending}
              className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] border border-[#cdc3d4] text-[#4b4452] hover:bg-[#f6f5fa] transition-colors disabled:opacity-60 cursor-pointer"
            >
              Atšaukti
            </button>
            <button
              onClick={() => addItemMutation.mutate()}
              disabled={addItemMutation.isPending || !newItemText.trim()}
              className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] bg-primary text-white hover:bg-primary/80 transition-colors flex items-center justify-center disabled:opacity-70 cursor-pointer"
            >
              {addItemMutation.isPending ? <Loader2 className="animate-spin w-5 h-5" /> : 'Pridėti'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ── End SolarGrade Checklist Tab ─────────────────────────────────────────────

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
const isImage = (name: string) => IMAGE_EXTS.includes(name.split('.').pop()?.toLowerCase() ?? '');

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  in_progress: { label: 'Vykdomas', className: 'bg-[#ECFDF5] text-[#10B981]' },
  paused:      { label: 'Sustabdytas', className: 'bg-[#FFFBEB] text-[#F59E0B]' },
  completed:   { label: 'Baigtas', className: 'bg-[#F3F4F6] text-[#6B7280]' },
  pending:     { label: 'Laukia', className: 'bg-[#F0F9FF] text-[#0284C7]' },
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface StringRow {
  name: string;
  modules: string;
  power: string;
  mppt: string;
  orientation: string;
  angle: string;
}

const EMPTY_EQUIP_ROW: EquipmentItem = { category: 'Inverteris', model: '', quantity: 1, unit: 'vnt.', notes: '' };

function EquipmentTabContent({
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
    setRows(currentEquipment.length > 0 ? [...currentEquipment] : [{ ...EMPTY_EQUIP_ROW }]);
    setEditing(true);
  };

  const updateRow = <K extends keyof EquipmentItem>(i: number, key: K, value: EquipmentItem[K]) => {
    setRows(r => r.map((rw, idx) => idx === i ? { ...rw, [key]: value } : rw));
  };

  // Build grouped catalog options
  const catalogByCategory = EQUIPMENT_CATEGORIES.reduce<Record<string, typeof catalog>>((acc, cat) => {
    acc[cat] = catalog.filter(c => c.category === cat);
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[16px] font-bold text-[#1d033a] flex items-center gap-2">
          <Package size={18} className="text-primary" />
          Komplektacija / Įranga
        </h2>
        {!editing ? (
          <button
            onClick={startEditing}
            className="flex items-center gap-2 h-[34px] px-4 rounded-[8px] bg-[#f6f5fa] text-primary font-semibold text-[13px] hover:bg-[#ede8f5] transition-colors cursor-pointer border border-[#cdc3d4]/30"
          >
            <Pencil size={14} />
            Redaguoti
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              disabled={saveMutation.isPending}
              className="h-[34px] px-4 rounded-[8px] border border-[#cdc3d4] text-[#4b4452] font-semibold text-[13px] hover:bg-[#f6f5fa] transition-colors cursor-pointer disabled:opacity-60"
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
        currentEquipment.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 border-2 border-dashed border-[#cdc3d4]/40 rounded-[12px]">
            <Package size={32} className="text-[#cdc3d4]" />
            <p className="text-[#7c7484] text-[14px]">Įrangos informacija nepridėta.</p>
            <button onClick={startEditing} className="text-primary font-semibold text-[14px] hover:underline cursor-pointer">
              Pridėti dabar →
            </button>
          </div>
        ) : (
          <div className="rounded-[10px] border border-[#cdc3d4]/30 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#f6f5fa] border-b border-[#cdc3d4]/30">
                  <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">Kategorija</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">Modelis</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider w-[100px]">Kiekis</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">Pastabos</th>
                </tr>
              </thead>
              <tbody>
                {currentEquipment.map((item, i) => (
                  <tr key={i} className="border-b border-[#cdc3d4]/10 last:border-none hover:bg-[#fbf0ff]/20 transition-colors">
                    <td className="py-3 px-4 text-[13px]">
                      <span className="bg-[#f6f5fa] border border-[#cdc3d4]/40 text-primary font-semibold px-2 py-0.5 rounded-md text-[12px]">
                        {item.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[14px] font-semibold text-[#1d033a]">{item.model}</td>
                    <td className="py-3 px-4 text-[14px] text-[#4b4452]">
                      <span className="bg-[#ecfdf5] text-[#059669] font-bold px-2 py-0.5 rounded-md text-[12px] whitespace-nowrap">
                        {item.quantity} {item.unit || 'vnt.'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[13px] text-[#7c7484]">{item.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Edit mode */}
      {editing && (
        <div className="flex flex-col gap-2">
          {/* Column headers */}
          <div className="grid grid-cols-[1.5fr_2fr_60px_90px_1.5fr_36px] gap-2 px-1 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">
            <span>Kategorija</span><span>Modelis / Specifikacija</span><span>Kiekis</span><span>Vnt.</span><span>Pastabos</span><span />
          </div>

          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1.5fr_2fr_60px_90px_1.5fr_36px] gap-2 items-center">
              {/* Category select */}
              <div className="relative">
                <select
                  value={row.category}
                  onChange={(e) => {
                    updateRow(i, 'category', e.target.value);
                    updateRow(i, 'model', ''); // reset model when category changes
                  }}
                  className="w-full h-[40px] pl-3 pr-8 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[13px] text-[#1d033a] appearance-none focus:outline-none focus:border-primary focus:bg-white cursor-pointer"
                >
                  {EQUIPMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7c7484] pointer-events-none" />
              </div>

              {/* Model — catalog dropdown with manual fallback */}
              <div className="relative">
                {(catalogByCategory[row.category] ?? []).length > 0 ? (
                  <select
                    value={row.model}
                    onChange={(e) => updateRow(i, 'model', e.target.value)}
                    className="w-full h-[40px] pl-3 pr-8 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[13px] text-[#1d033a] appearance-none focus:outline-none focus:border-primary focus:bg-white cursor-pointer"
                  >
                    <option value="">— Pasirinkite —</option>
                    {(catalogByCategory[row.category] ?? []).map(c => (
                      <option key={c.id} value={`${c.brand ? c.brand + ' ' : ''}${c.model}`}>
                        {c.brand ? `${c.brand} ` : ''}{c.model}
                        {c.specifications ? ` (${c.specifications})` : ''}
                      </option>
                    ))}
                    <option value="__custom">✎ Įvesti ranka...</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={row.model}
                    onChange={(e) => updateRow(i, 'model', e.target.value)}
                    placeholder="Modelis / specifikacija"
                    className="w-full h-[40px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[13px] text-[#1d033a] focus:outline-none focus:border-primary focus:bg-white"
                  />
                )}
                {(catalogByCategory[row.category] ?? []).length > 0 && (
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7c7484] pointer-events-none" />
                )}
              </div>

              {/* Quantity */}
              <input
                type="number"
                min={1}
                value={row.quantity}
                onChange={(e) => updateRow(i, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                className="h-[40px] px-2 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[13px] text-[#1d033a] focus:outline-none focus:border-primary focus:bg-white text-center"
              />

              {/* Unit select */}
              <div className="relative">
                <select
                  value={row.unit || 'vnt.'}
                  onChange={(e) => updateRow(i, 'unit', e.target.value)}
                  className="w-full h-[40px] pl-3 pr-7 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[13px] text-[#1d033a] appearance-none focus:outline-none focus:border-primary focus:bg-white cursor-pointer text-center"
                >
                  {EQUIPMENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#7c7484] pointer-events-none" />
              </div>

              {/* Notes */}
              <input
                type="text"
                value={row.notes}
                onChange={(e) => updateRow(i, 'notes', e.target.value)}
                placeholder="Pastabos..."
                className="h-[40px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[13px] text-[#1d033a] focus:outline-none focus:border-primary focus:bg-white"
              />

              {/* Remove */}
              <button
                onClick={() => setRows(r => r.filter((_, idx) => idx !== i))}
                className="w-9 h-9 flex items-center justify-center text-[#cdc3d4] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer rounded-[8px]"
              >
                <X size={16} />
              </button>
            </div>
          ))}

          {/* If model is __custom, show text input */}
          {rows.some(r => r.model === '__custom') && rows.map((row, i) => row.model === '__custom' && (
            <div key={`custom-${i}`} className="flex items-center gap-2 px-1">
              <span className="text-[12px] text-primary font-medium w-[calc(1.5fr)]">
                Eilutė {i + 1} — įveskite modelį ranka:
              </span>
              <input
                type="text"
                autoFocus
                placeholder="Pvz.: Huawei SUN2000 10kW"
                onBlur={(e) => { if (e.target.value.trim()) updateRow(i, 'model', e.target.value.trim()); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v) updateRow(i, 'model', v); } }}
                className="flex-1 h-[38px] px-3 bg-white border-2 border-primary rounded-[8px] text-[13px] text-[#1d033a] focus:outline-none"
              />
            </div>
          ))}

          {/* Add row */}
          <button
            onClick={() => setRows(r => [...r, { ...EMPTY_EQUIP_ROW }])}
            className="flex items-center justify-center gap-2 h-[40px] border border-dashed border-[#cdc3d4] text-primary font-semibold text-[14px] rounded-[8px] hover:bg-[#fbf0ff] hover:border-primary/50 transition-colors cursor-pointer mt-1"
          >
            <Plus size={16} />
            Pridėti eilutę
          </button>
        </div>
      )}
    </div>
  );
}

// ── Installer Photos Section ──────────────────────────────────────────────────

function InstallerPhotosSection({
  photos,
  isLoading,
  siteId,
}: {
  photos: InstallerPhoto[];
  isLoading: boolean;
  siteId: string;
}) {
  const confirm      = useConfirm();
  const queryClient  = useQueryClient();

  const [lightboxPhoto, setLightboxPhoto] = useState<InstallerPhoto | null>(null);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [downloading,   setDownloading]   = useState(false);

  const handleDownload = async (photo: InstallerPhoto) => {
    if (!photo.signedUrl) return;
    setDownloading(true);
    try {
      await forceDownload(photo.signedUrl, photo.storage_path);
    } catch (err) {
      toast.error(`Atsisiuntimo klaida: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async (photo: InstallerPhoto) => {
    const ok = await confirm({
      title: 'Ištrinti nuotrauką?',
      message: 'Ar tikrai norite ištrinti šią nuotrauką? Veiksmas neatšaukiamas.',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(photo.id);
    if (lightboxPhoto?.id === photo.id) setLightboxPhoto(null);
    try {
      await deletePhotoFromAllSources(photo.storage_path);
      void queryClient.invalidateQueries({ queryKey: ['admin_site_photos',      siteId] });
      void queryClient.invalidateQueries({ queryKey: ['site_checklist_session', siteId] });
      toast.success('Nuotrauka ištrinta.');
    } catch (err) {
      toast.error(`Klaida trinant: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <span className="ml-3 text-[14px] text-[#7c7484]">Kraunamos nuotraukos...</span>
      </div>
    );
  }

  if (photos.length === 0) return null;

  return (
    <>
      <div className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#cdc3d4]/20 bg-[#f6f5fa]/50 flex items-center gap-2">
          <ImageIcon size={18} className="text-primary" />
          <h3 className="font-semibold text-[#1d033a] text-[14px]">Montuotojų nuotraukos</h3>
          <span className="ml-auto text-[12px] text-[#7c7484]">
            {photos.length} nuotrauk{photos.length === 1 ? 'a' : 'ų'}
          </span>
        </div>

        {/* Grid */}
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {photos.map((photo) => {
              const isDeleting = deletingId === photo.id;
              return (
                <div
                  key={photo.id}
                  className="group relative aspect-square rounded-[10px] overflow-hidden bg-[#f6f5fa] border border-[#cdc3d4]/20 hover:border-primary/40 transition-colors"
                >
                  {/* Thumbnail (click → lightbox) */}
                  <button
                    onClick={() => setLightboxPhoto(photo)}
                    className="w-full h-full focus:outline-none"
                    disabled={isDeleting}
                  >
                    {photo.signedUrl ? (
                      <img
                        src={photo.signedUrl}
                        alt="Objekto nuotrauka"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={24} className="text-[#cdc3d4]" />
                      </div>
                    )}
                  </button>

                  {/* Hover action overlay — clicking the overlay itself opens the lightbox;
                      individual action buttons stopPropagation so they don't trigger this. */}
                  <div
                    onClick={() => setLightboxPhoto(photo)}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto flex flex-col justify-between p-2 cursor-pointer"
                  >
                    {/* Top-right action buttons */}
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); void handleDownload(photo); }}
                        disabled={downloading || isDeleting}
                        title="Atsisiųsti"
                        className="w-8 h-8 rounded-[6px] bg-white/90 text-[#1d033a] flex items-center justify-center hover:bg-white transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                      >
                        {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); void handleDelete(photo); }}
                        disabled={isDeleting || downloading}
                        title="Ištrinti"
                        className="w-8 h-8 rounded-[6px] bg-red-500/90 text-white flex items-center justify-center hover:bg-red-600 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                      >
                        {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                    {/* Center hint */}
                    <div className="flex justify-center">
                      <span className="text-white/90 text-[11px] font-semibold bg-black/30 px-2 py-0.5 rounded-full">
                        Peržiūrėti
                      </span>
                    </div>
                  </div>

                  {/* Deleting spinner overlay */}
                  {isDeleting && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Full-screen lightbox ─────────────────────────────────────────── */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 animate-in fade-in duration-150"
          onClick={() => setLightboxPhoto(null)}
        >
          {/* Image — fills the entire overlay; tiny padding keeps it off screen edges */}
          <img
            src={lightboxPhoto.signedUrl}
            alt="Didelis rodinys"
            className="w-full h-full object-contain p-2"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Floating action toolbar — pinned top-right, sits over the photo */}
          <div
            className="absolute top-4 right-4 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Download */}
            <button
              onClick={() => void handleDownload(lightboxPhoto)}
              disabled={downloading || deletingId === lightboxPhoto.id}
              title="Atsisiųsti"
              className="h-[38px] px-4 rounded-[8px] bg-white/90 backdrop-blur-sm text-[#1d033a] font-semibold text-[13px] flex items-center gap-2 hover:bg-white transition-colors disabled:opacity-60 cursor-pointer shadow-lg"
            >
              {downloading
                ? <Loader2 size={14} className="animate-spin" />
                : <Download size={14} />}
              Siųsti
            </button>

            {/* Delete */}
            <button
              onClick={() => void handleDelete(lightboxPhoto)}
              disabled={deletingId === lightboxPhoto.id || downloading}
              title="Ištrinti nuotrauką"
              className="h-[38px] px-4 rounded-[8px] bg-red-500/90 backdrop-blur-sm text-white font-semibold text-[13px] flex items-center gap-2 hover:bg-red-500 transition-colors disabled:opacity-60 cursor-pointer shadow-lg"
            >
              {deletingId === lightboxPhoto.id
                ? <Loader2 size={14} className="animate-spin" />
                : <Trash2 size={14} />}
              Trinti
            </button>

            {/* Close */}
            <button
              onClick={() => setLightboxPhoto(null)}
              title="Uždaryti"
              className="w-[38px] h-[38px] rounded-[8px] bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/25 transition-colors cursor-pointer shadow-lg"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function SiteDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabId>('info');

  /* ── Queries ── */
  const { data: site, isLoading: siteLoading } = useQuery({
    queryKey: ['admin_site', id],
    queryFn: () => getSiteById(id!) as unknown as Promise<SiteWithTeam>,
    enabled: !!id,
  });

  const { data: files, isLoading: filesLoading } = useQuery({
    queryKey: ['admin_site_files', id],
    queryFn: () => getSiteFiles(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  // Installer photos (uploaded from mobile) — separate from admin site_files
  const { data: installerPhotos, isLoading: photosLoading } = useQuery({
    queryKey: ['admin_site_photos', id],
    queryFn: () => getSiteInstallerPhotos(id!),
    enabled: !!id && activeTab === 'files',
    staleTime: 60_000,
  });

  /* ── Notes State ── */
  const [localNotes, setLocalNotes] = useState<string | null>(null);
  const notes = localNotes ?? site?.notes ?? '';

  /* ── Stringing State ── */
  const [localStringRows, setLocalStringRows] = useState<StringRow[] | null>(null);
  const stringRows = localStringRows ?? (site?.stringing_details as StringRow[] | null) ?? null;
  const [editingStrings, setEditingStrings] = useState(false);

  /* ── Mutations ── */
  const saveNotesMutation = useMutation({
    mutationFn: () => updateSiteDetails(id!, { notes }),
    onSuccess: () => {
      toast.success('Pastabos išsaugotos!');
      void queryClient.invalidateQueries({ queryKey: ['admin_site', id] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const saveStringsMutation = useMutation({
    mutationFn: () => updateSiteDetails(id!, { stringing_details: stringRows }),
    onSuccess: () => {
      toast.success('Stringavimas išsaugotas!');
      setEditingStrings(false);
      void queryClient.invalidateQueries({ queryKey: ['admin_site', id] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadSiteFile(id!, file),
    onSuccess: () => {
      toast.success('Failas įkeltas!');
      void queryClient.invalidateQueries({ queryKey: ['admin_site_files', id] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileName: string) => deleteSiteFile(id!, fileName),
    onSuccess: () => {
      toast.success('Failas ištrintas');
      void queryClient.invalidateQueries({ queryKey: ['admin_site_files', id] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  /* ── Client info editing ── */
  const [editingClient, setEditingClient] = useState(false);
  const [clientForm, setClientForm] = useState({
    client_name: '',
    contact_person: '',
    client_phone: '',
    client_email: '',
    address: '',
  });

  const startEditingClient = () => {
    setClientForm({
      client_name:    site?.client_name    ?? '',
      contact_person: site?.contact_person ?? '',
      client_phone:   site?.client_phone   ?? '',
      client_email:   site?.client_email   ?? '',
      address:        site?.address        ?? '',
    });
    setEditingClient(true);
  };

  const saveClientMutation = useMutation({
    mutationFn: () => updateClientInfo(id!, {
      client_name:    clientForm.client_name,
      contact_person: clientForm.contact_person || null,
      client_phone:   clientForm.client_phone   || null,
      client_email:   clientForm.client_email   || null,
      address:        clientForm.address,
    }),
    onSuccess: () => {
      toast.success('Kliento informacija išsaugota!');
      setEditingClient(false);
      void queryClient.invalidateQueries({ queryKey: ['admin_site', id] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  /* ── Handlers ── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
    e.target.value = '';
  };

  const handleDeleteFile = async (fileName: string) => {
    const ok = await confirm({
      title: 'Ištrinti failą?',
      message: `Ar tikrai norite ištrinti "${fileName}"?`,
      variant: 'danger',
    });
    if (ok) deleteFileMutation.mutate(fileName);
  };

  /* ── Helpers ── */
  const currentEquipment = parseEquipmentDetails(site?.equipment_details);
  const team = site?.team;
  const status = STATUS_MAP[site?.status ?? ''];

  if (siteLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="flex-1 flex items-center justify-center py-32">
        <p className="text-[#4b4452]">Objektas nerastas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 flex flex-col h-full max-w-6xl mx-auto w-full">
      
      {/* ── Header ── */}
      <div className="flex flex-col gap-4">
        <button
          onClick={() => { void navigate('/admin/sites'); }}
          className="flex items-center gap-2 text-[#7c7484] hover:text-primary transition-colors text-[14px] font-medium w-fit cursor-pointer"
        >
          <ArrowLeft size={16} />
          Grįžti prie objektų sąrašo
        </button>

        <div className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-[0px_4px_20px_rgba(29,3,58,0.05)] p-6">
          <div className="flex items-start justify-between gap-6 flex-col md:flex-row">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-[14px] bg-[#fbf0ff] flex items-center justify-center flex-shrink-0 border border-primary/10">
                <Building2 size={28} className="text-primary" />
              </div>
              <div>
                <h1 className="text-[20px] font-bold text-[#1d033a] leading-tight mb-1">
                  {site.client_name}
                </h1>
                <p className="text-[14px] text-[#7c7484] flex items-center gap-2 flex-wrap">
                  <MapPin size={14} /> {site.address}
                  <span className="text-[#cdc3d4]">|</span>
                  <Calendar size={14} /> {site.scheduled_start ? format(new Date(site.scheduled_start), 'yyyy-MM-dd') : '-'}
                </p>
                
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="bg-[#f6f5fa] border border-[#cdc3d4]/50 text-[12px] font-bold px-2.5 py-1 rounded-md text-primary">
                    {site.code}
                  </span>
                  {status && (
                    <span className={`px-2.5 py-1 rounded-md text-[12px] font-bold ${status.className}`}>
                      {status.label}
                    </span>
                  )}
                  <span className="bg-[#f0fdf4] text-[#16a34a] border border-[#16a34a]/20 px-2.5 py-1 rounded-md text-[12px] font-bold">
                    {team?.name || 'Nepriskirta'}
                  </span>
                  <span className="bg-[#fbf0ff] text-primary border border-primary/20 px-2.5 py-1 rounded-md text-[12px] font-bold">
                    {site.system_type}
                  </span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="bg-[#f6f5fa] border border-[#cdc3d4]/30 rounded-[12px] px-4 py-2 flex flex-col items-center flex-1 md:flex-initial">
                <span className="text-[18px] font-bold text-primary">{site.kwp || '-'}</span>
                <span className="text-[11px] text-[#7c7484] uppercase font-semibold">kWp</span>
              </div>
              <div className="bg-[#f6f5fa] border border-[#cdc3d4]/30 rounded-[12px] px-4 py-2 flex flex-col items-center flex-1 md:flex-initial">
                <span className="text-[18px] font-bold text-[#10B981]">0%</span>
                <span className="text-[11px] text-[#7c7484] uppercase font-semibold">Checklist</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="relative flex gap-1 bg-[#f6f5fa] rounded-[12px] p-1.5 overflow-x-auto scrollbar-hide border border-[#cdc3d4]/30">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative z-10 px-4 py-2 rounded-[8px] text-[13px] font-semibold transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap"
              style={{ color: isActive ? '#490891' : '#7c7484' }}
            >
              {isActive && (
                <motion.div
                  layoutId="sitedetail-tab"
                  className="absolute inset-0 bg-white rounded-[8px] shadow-sm border border-[#cdc3d4]/20"
                  style={{ zIndex: -1 }}
                  transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}
                />
              )}
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">

        {/* ════ TAB 1: INFO ════ */}
        {activeTab === 'info' && (
          <motion.div
            key="info"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            <div className="space-y-6">
              <div className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#cdc3d4]/20 bg-[#f6f5fa]/50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 size={18} className="text-primary" />
                    <h3 className="font-semibold text-[#1d033a] text-[14px]">Kliento informacija</h3>
                  </div>
                  {!editingClient ? (
                    <button
                      onClick={startEditingClient}
                      className="flex items-center gap-1.5 h-[28px] px-3 rounded-[6px] bg-[#f6f5fa] text-primary font-semibold text-[12px] hover:bg-[#ede8f5] border border-[#cdc3d4]/30 transition-colors cursor-pointer"
                    >
                      <Pencil size={13} />
                      Redaguoti
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingClient(false)}
                        disabled={saveClientMutation.isPending}
                        className="h-[28px] px-3 rounded-[6px] border border-[#cdc3d4] text-[#4b4452] font-semibold text-[12px] hover:bg-[#f6f5fa] transition-colors cursor-pointer disabled:opacity-60"
                      >
                        Atšaukti
                      </button>
                      <button
                        onClick={() => saveClientMutation.mutate()}
                        disabled={saveClientMutation.isPending}
                        className="flex items-center gap-1.5 h-[28px] px-3 rounded-[6px] bg-primary text-white font-semibold text-[12px] hover:bg-primary/80 transition-colors cursor-pointer disabled:opacity-70"
                      >
                        {saveClientMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save size={13} />}
                        Išsaugoti
                      </button>
                    </div>
                  )}
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-[#f6f5fa] rounded-[8px] p-3 border border-[#cdc3d4]/20">
                    <div className="flex items-center gap-1.5 mb-1">
                      <User size={11} className="text-[#7c7484]" />
                      <span className="text-[11px] text-[#7c7484] uppercase font-bold tracking-wider">Įmonė / Klientas</span>
                    </div>
                    {editingClient ? (
                      <input
                        type="text"
                        value={clientForm.client_name}
                        onChange={(e) => setClientForm(f => ({ ...f, client_name: e.target.value }))}
                        disabled={saveClientMutation.isPending}
                        className="w-full h-[32px] px-2 bg-white border border-[#cdc3d4] rounded-[6px] text-[13px] text-[#1d033a] focus:outline-none focus:border-primary disabled:opacity-60"
                      />
                    ) : (
                      <span className="text-[14px] font-semibold text-[#1d033a]">{site.client_name}</span>
                    )}
                  </div>
                  <div className="bg-[#f6f5fa] rounded-[8px] p-3 border border-[#cdc3d4]/20">
                    <div className="flex items-center gap-1.5 mb-1">
                      <User size={11} className="text-[#7c7484]" />
                      <span className="text-[11px] text-[#7c7484] uppercase font-bold tracking-wider">Kontaktinis asmuo</span>
                    </div>
                    {editingClient ? (
                      <input
                        type="text"
                        value={clientForm.contact_person}
                        onChange={(e) => setClientForm(f => ({ ...f, contact_person: e.target.value }))}
                        disabled={saveClientMutation.isPending}
                        placeholder="Vardas Pavardė"
                        className="w-full h-[32px] px-2 bg-white border border-[#cdc3d4] rounded-[6px] text-[13px] text-[#1d033a] focus:outline-none focus:border-primary disabled:opacity-60"
                      />
                    ) : (
                      <span className="text-[14px] font-semibold text-[#1d033a]">{site.contact_person || '-'}</span>
                    )}
                  </div>
                  <div className="bg-[#f6f5fa] rounded-[8px] p-3 border border-[#cdc3d4]/20">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Phone size={11} className="text-[#7c7484]" />
                      <span className="text-[11px] text-[#7c7484] uppercase font-bold tracking-wider">Tel. numeris</span>
                    </div>
                    {editingClient ? (
                      <input
                        type="tel"
                        value={clientForm.client_phone}
                        onChange={(e) => setClientForm(f => ({ ...f, client_phone: e.target.value }))}
                        disabled={saveClientMutation.isPending}
                        placeholder="+370 600 00000"
                        className="w-full h-[32px] px-2 bg-white border border-[#cdc3d4] rounded-[6px] text-[13px] text-[#1d033a] focus:outline-none focus:border-primary disabled:opacity-60"
                      />
                    ) : (
                      <span className="text-[14px] font-semibold text-[#1d033a]">{site.client_phone || '-'}</span>
                    )}
                  </div>
                  <div className="bg-[#f6f5fa] rounded-[8px] p-3 border border-[#cdc3d4]/20">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Mail size={11} className="text-[#7c7484]" />
                      <span className="text-[11px] text-[#7c7484] uppercase font-bold tracking-wider">El. paštas</span>
                    </div>
                    {editingClient ? (
                      <input
                        type="email"
                        value={clientForm.client_email}
                        onChange={(e) => setClientForm(f => ({ ...f, client_email: e.target.value }))}
                        disabled={saveClientMutation.isPending}
                        placeholder="vardas@imone.lt"
                        className="w-full h-[32px] px-2 bg-white border border-[#cdc3d4] rounded-[6px] text-[13px] text-[#1d033a] focus:outline-none focus:border-primary disabled:opacity-60"
                      />
                    ) : (
                      <span className="text-[14px] font-semibold text-[#1d033a]">{site.client_email || '-'}</span>
                    )}
                  </div>
                  <div className="bg-[#f6f5fa] rounded-[8px] p-3 border border-[#cdc3d4]/20 sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={11} className="text-[#7c7484]" />
                        <span className="text-[11px] text-[#7c7484] uppercase font-bold tracking-wider">Adresas</span>
                      </div>
                      {editingClient && (
                        <span className="text-[10px] text-[#7c7484] italic">Koordinatės bus atnaujintos automatiškai</span>
                      )}
                    </div>
                    {editingClient ? (
                      <input
                        type="text"
                        value={clientForm.address}
                        onChange={(e) => setClientForm(f => ({ ...f, address: e.target.value }))}
                        disabled={saveClientMutation.isPending}
                        placeholder="Pvz.: Vilniaus g. 1, Vilnius"
                        className="w-full h-[32px] px-2 bg-white border border-[#cdc3d4] rounded-[6px] text-[13px] text-[#1d033a] focus:outline-none focus:border-primary disabled:opacity-60"
                      />
                    ) : (
                      <span className="text-[14px] font-semibold text-[#1d033a]">{site.address}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#cdc3d4]/20 bg-[#f6f5fa]/50 flex items-center gap-2">
                  <Cpu size={18} className="text-primary" />
                  <h3 className="font-semibold text-[#1d033a] text-[14px]">Techniniai duomenys</h3>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-[#f6f5fa] rounded-[8px] p-3 border border-[#cdc3d4]/20">
                    <span className="text-[11px] text-[#7c7484] uppercase font-bold tracking-wider block mb-1">Įrengta galia</span>
                    <span className="text-[15px] font-bold text-primary">{site.kwp || '-'} kWp</span>
                  </div>
                  <div className="bg-[#f6f5fa] rounded-[8px] p-3 border border-[#cdc3d4]/20">
                    <span className="text-[11px] text-[#7c7484] uppercase font-bold tracking-wider block mb-1">Sistemos tipas</span>
                    <span className="text-[14px] font-semibold text-[#1d033a]">{site.system_type}</span>
                  </div>
                  <div className="bg-[#f6f5fa] rounded-[8px] p-3 border border-[#cdc3d4]/20">
                    <span className="text-[11px] text-[#7c7484] uppercase font-bold tracking-wider block mb-1">Planuojama pradžia</span>
                    <span className="text-[14px] font-semibold text-[#1d033a]">
                      {site.scheduled_start ? format(new Date(site.scheduled_start), 'yyyy-MM-dd') : '-'}
                    </span>
                  </div>
                  <div className="bg-[#f6f5fa] rounded-[8px] p-3 border border-[#cdc3d4]/20">
                    <span className="text-[11px] text-[#7c7484] uppercase font-bold tracking-wider block mb-1">Komanda</span>
                    <span className="text-[14px] font-semibold text-[#1d033a]">{team?.name || 'Nepriskirta'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 border-b border-[#cdc3d4]/20 bg-[#f6f5fa]/50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-primary" />
                  <h3 className="font-semibold text-[#1d033a] text-[14px]">Pastabos / komentarai</h3>
                </div>
                <button
                  onClick={() => saveNotesMutation.mutate()}
                  disabled={saveNotesMutation.isPending || notes === (site.notes || '')}
                  className="flex items-center gap-1.5 h-[28px] px-3 rounded-[6px] bg-primary text-white font-semibold text-[12px] hover:bg-primary/80 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {saveNotesMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save size={14} />}
                  Išsaugoti
                </button>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <textarea
                  value={notes}
                  onChange={(e) => setLocalNotes(e.target.value)}
                  placeholder="Objekto specifika, prieigos niuansai, pastabos montuotojui..."
                  className="w-full flex-1 min-h-[200px] p-4 bg-[#f6f5fa] border border-[#cdc3d4]/50 rounded-[10px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:bg-white transition-colors resize-none"
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* ════ TAB 2: EQUIPMENT ════ */}
        {activeTab === 'equip' && (
          <motion.div
            key="equip"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm p-6"
          >
            <EquipmentTabContent
              siteId={id!}
              currentEquipment={currentEquipment}
              onSaved={() => void queryClient.invalidateQueries({ queryKey: ['admin_site', id] })}
            />
          </motion.div>
        )}

        {/* ════ TAB 3: STRINGS ════ */}
        {activeTab === 'strings' && (
          <motion.div
            key="strings"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            {/* Visual schemas placeholders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-[#cdc3d4]/20 bg-[#f6f5fa]/50 flex items-center gap-2">
                  <Network size={18} className="text-primary" />
                  <h3 className="font-semibold text-[#1d033a] text-[14px]">DC schema / String layout</h3>
                </div>
                <div className="p-5 flex-1 flex items-center justify-center">
                  <div className="border-2 border-dashed border-[#cdc3d4]/50 rounded-[12px] w-full p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-[#fbf0ff]/30 hover:border-primary/40 transition-colors">
                    <ImageIcon size={32} className="text-[#cdc3d4] mb-3" />
                    <p className="font-semibold text-[#1d033a] text-[13px]">Įkelti DC schemą</p>
                    <p className="text-[11px] text-[#7c7484] mt-1">PNG, PDF</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-[#cdc3d4]/20 bg-[#f6f5fa]/50 flex items-center gap-2">
                  <Building size={18} className="text-primary" />
                  <h3 className="font-semibold text-[#1d033a] text-[14px]">Stogo planas</h3>
                </div>
                <div className="p-5 flex-1 flex items-center justify-center">
                  <div className="border-2 border-dashed border-[#cdc3d4]/50 rounded-[12px] w-full p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-[#fbf0ff]/30 hover:border-primary/40 transition-colors">
                    <ImageIcon size={32} className="text-[#cdc3d4] mb-3" />
                    <p className="font-semibold text-[#1d033a] text-[13px]">Įkelti stogo planą</p>
                    <p className="text-[11px] text-[#7c7484] mt-1">PNG, DWG, PDF</p>
                  </div>
                </div>
              </div>
            </div>

            {/* String table */}
            <div className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[16px] font-bold text-[#1d033a] flex items-center gap-2">
                  <Network size={18} className="text-primary" />
                  String parametrų lentelė
                </h2>
                
                {stringRows === null ? (
                  <button
                    onClick={() => { setLocalStringRows([]); setEditingStrings(true); }}
                    className="h-[34px] px-4 rounded-[8px] bg-primary text-white font-semibold text-[13px] hover:bg-primary/80 transition-colors cursor-pointer"
                  >
                    Aktyvuoti lentelę
                  </button>
                ) : !editingStrings ? (
                  <button
                    onClick={() => setEditingStrings(true)}
                    className="flex items-center gap-2 h-[34px] px-4 rounded-[8px] bg-[#f6f5fa] text-primary font-semibold text-[13px] hover:bg-[#ede8f5] transition-colors cursor-pointer border border-[#cdc3d4]/30"
                  >
                    <Pencil size={14} />
                    Redaguoti
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingStrings(false)}
                      disabled={saveStringsMutation.isPending}
                      className="h-[34px] px-4 rounded-[8px] border border-[#cdc3d4] text-[#4b4452] font-semibold text-[13px] hover:bg-[#f6f5fa] transition-colors cursor-pointer"
                    >
                      Atšaukti
                    </button>
                    <button
                      onClick={() => saveStringsMutation.mutate()}
                      disabled={saveStringsMutation.isPending}
                      className="flex items-center gap-2 h-[34px] px-4 rounded-[8px] bg-primary text-white font-semibold text-[13px] hover:bg-primary/80 transition-colors cursor-pointer"
                    >
                      {saveStringsMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : <Save size={14} />}
                      Išsaugoti
                    </button>
                  </div>
                )}
              </div>

              {stringRows !== null && (
                <div className="rounded-[10px] border border-[#cdc3d4]/30 overflow-x-auto">
                  <table className="w-full text-left min-w-[600px]">
                    <thead>
                      <tr className="bg-[#f6f5fa] border-b border-[#cdc3d4]/30">
                        <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">String</th>
                        <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">Moduliai</th>
                        <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">Galia kWp</th>
                        <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">MPPT</th>
                        <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">Orientacija</th>
                        <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">Kampas</th>
                        {editingStrings && <th className="py-3 px-4 w-10"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {stringRows.length === 0 && !editingStrings ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-[#7c7484] text-[13px]">
                            Nėra įvestų stringų.
                          </td>
                        </tr>
                      ) : (
                        stringRows.map((row, i) => (
                          <tr key={i} className="border-b border-[#cdc3d4]/10 last:border-none">
                            {editingStrings ? (
                              <>
                                <td className="p-2"><input value={row.name} onChange={(e) => setLocalStringRows(r => (r ?? stringRows ?? []).map((rw, idx) => idx === i ? { ...rw, name: e.target.value } : rw))} className="w-full h-8 px-2 bg-[#f6f5fa] border border-[#cdc3d4]/50 rounded text-[13px] outline-none focus:border-primary" /></td>
                                <td className="p-2"><input value={row.modules} onChange={(e) => setLocalStringRows(r => (r ?? stringRows ?? []).map((rw, idx) => idx === i ? { ...rw, modules: e.target.value } : rw))} className="w-full h-8 px-2 bg-[#f6f5fa] border border-[#cdc3d4]/50 rounded text-[13px] outline-none focus:border-primary" /></td>
                                <td className="p-2"><input value={row.power} onChange={(e) => setLocalStringRows(r => (r ?? stringRows ?? []).map((rw, idx) => idx === i ? { ...rw, power: e.target.value } : rw))} className="w-full h-8 px-2 bg-[#f6f5fa] border border-[#cdc3d4]/50 rounded text-[13px] outline-none focus:border-primary" /></td>
                                <td className="p-2"><input value={row.mppt} onChange={(e) => setLocalStringRows(r => (r ?? stringRows ?? []).map((rw, idx) => idx === i ? { ...rw, mppt: e.target.value } : rw))} className="w-full h-8 px-2 bg-[#f6f5fa] border border-[#cdc3d4]/50 rounded text-[13px] outline-none focus:border-primary" /></td>
                                <td className="p-2"><input value={row.orientation} onChange={(e) => setLocalStringRows(r => (r ?? stringRows ?? []).map((rw, idx) => idx === i ? { ...rw, orientation: e.target.value } : rw))} className="w-full h-8 px-2 bg-[#f6f5fa] border border-[#cdc3d4]/50 rounded text-[13px] outline-none focus:border-primary" /></td>
                                <td className="p-2"><input value={row.angle} onChange={(e) => setLocalStringRows(r => (r ?? stringRows ?? []).map((rw, idx) => idx === i ? { ...rw, angle: e.target.value } : rw))} className="w-full h-8 px-2 bg-[#f6f5fa] border border-[#cdc3d4]/50 rounded text-[13px] outline-none focus:border-primary" /></td>
                                <td className="p-2 text-center">
                                  <button onClick={() => setLocalStringRows(r => (r ?? stringRows ?? []).filter((_, idx) => idx !== i))} className="text-[#cdc3d4] hover:text-red-500 transition-colors"><X size={16}/></button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="py-3 px-4 font-semibold text-[#1d033a] text-[13px]">{row.name}</td>
                                <td className="py-3 px-4 text-[#4b4452] text-[13px]">{row.modules}</td>
                                <td className="py-3 px-4 text-[#4b4452] text-[13px]">{row.power}</td>
                                <td className="py-3 px-4 text-[#4b4452] text-[13px]">
                                  <span className="bg-[#fbf0ff] text-primary px-2 py-0.5 rounded text-[11px] font-semibold border border-primary/10">{row.mppt}</span>
                                </td>
                                <td className="py-3 px-4 text-[#4b4452] text-[13px]">
                                  <span className="bg-[#ECFDF5] text-[#10B981] px-2 py-0.5 rounded text-[11px] font-semibold border border-[#10B981]/10">{row.orientation}</span>
                                </td>
                                <td className="py-3 px-4 text-[#4b4452] text-[13px]">{row.angle}</td>
                              </>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {editingStrings && (
                    <div className="p-2 border-t border-[#cdc3d4]/30 bg-[#f6f5fa]/30">
                      <button
                        onClick={() => setLocalStringRows(r => [...(r ?? stringRows ?? []), { name:'', modules:'', power:'', mppt:'', orientation:'', angle:'' }])}
                        className="flex items-center gap-1.5 text-primary font-semibold text-[13px] hover:underline px-2 py-1"
                      >
                        <Plus size={14}/> Pridėti eilutę
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ════ TAB 4: FILES ════ */}
        {activeTab === 'files' && (
          <motion.div
            key="files"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-6"
          >
            {/* Upload area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="bg-white rounded-[16px] border-2 border-dashed border-[#cdc3d4]/60 hover:border-primary/50 hover:bg-[#fbf0ff]/20 transition-all cursor-pointer p-8 flex flex-col items-center gap-3 group"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              ) : (
                <div className="w-12 h-12 rounded-[12px] bg-[#f6f5fa] group-hover:bg-[#ede8f5] transition-colors flex items-center justify-center">
                  <Upload size={22} className="text-[#7c7484] group-hover:text-primary transition-colors" />
                </div>
              )}
              <div className="text-center">
                <p className="font-semibold text-[14px] text-[#1d033a]">
                  {uploadMutation.isPending ? 'Įkeliama...' : 'Įkelti failą'}
                </p>
                <p className="text-[13px] text-[#7c7484] mt-1">Nuotraukos (JPG, PNG), DWG, arba PDF dokumentai</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                disabled={uploadMutation.isPending}
              />
            </div>

            {/* Files grid */}
            {filesLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              </div>
            ) : !files || files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm">
                <FolderOpen size={32} className="text-[#cdc3d4] mb-2" />
                <p className="text-[#7c7484] text-[14px]">Failų dar nėra.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {files.map((file) => (
                  <motion.div
                    key={file.name}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group relative bg-white rounded-[12px] border border-[#cdc3d4]/20 shadow-sm overflow-hidden hover:border-primary/30 transition-colors"
                  >
                    {isImage(file.name) ? (
                      <div className="aspect-[4/3] overflow-hidden bg-[#f6f5fa]">
                        <img
                          src={file.url}
                          alt={file.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    ) : (
                      <div className="aspect-[4/3] flex items-center justify-center bg-[#f6f5fa]">
                        <FileText size={36} className="text-[#cdc3d4]" />
                      </div>
                    )}

                    <div className="p-3">
                      <p className="text-[12px] font-semibold text-[#1d033a] truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-[11px] text-[#7c7484] mt-0.5">{formatBytes(file.size)}</p>
                    </div>

                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-9 h-9 rounded-[8px] bg-white text-primary flex items-center justify-center hover:bg-[#f6f5fa] transition-colors shadow-sm"
                        title="Atidaryti"
                      >
                        <ImageIcon size={16} />
                      </a>
                      <button
                        onClick={() => void handleDeleteFile(file.name)}
                        className="w-9 h-9 rounded-[8px] bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors cursor-pointer shadow-sm"
                        title="Ištrinti"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* ── Installer photos from mobile (site-photos bucket) ── */}
            <InstallerPhotosSection photos={installerPhotos ?? []} isLoading={photosLoading} siteId={id!} />
          </motion.div>
        )}

        {/* ════ TAB 5: CHECKLIST ════ */}
        {activeTab === 'check' && (
          <motion.div
            key="check"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <ChecklistTabContent siteId={id!} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
