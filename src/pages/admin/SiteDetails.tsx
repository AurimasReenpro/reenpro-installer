import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, Building2, Loader2, Plus, Trash2, Save,
  Upload, FileText, Image as ImageIcon, X, Pencil, ZoomIn,
  Info, Cpu, Network, FolderOpen, ListChecks, MapPin, Calendar, Circle, ChevronDown, Package,
  CheckCircle2, XCircle, MinusCircle, ClipboardList, ChevronRight, AlertTriangle, Phone, Mail, User,
  Download, Zap, Sun, Battery, Wrench, Shield, MoreVertical, DraftingCompass,
} from 'lucide-react';
import { useConfirm } from '../../hooks/useConfirm';
import ImageAnnotator from '../../components/shared/ImageAnnotator';
import ImageLightbox from '../../components/shared/ImageLightbox';
import PdfPagePreview from '../../components/shared/PdfPagePreview';
import { isPdf } from '../../lib/pdf';
import {
  getSiteById, updateEquipment, updateSiteDetails, uploadSiteFile, uploadBlueprintFile, groupBlueprints, getSiteFiles, deleteSiteFile,
  addBlueprintCategory, removeBlueprintCategory,
  getSiteChecklistSession, assignChecklistToSite, updateClientInfo, updateTechData, getSiteInstallerPhotos,
} from '../../api/sites';
import type { InstallerPhoto } from '../../api/sites';
import { useSignedPhotoUrl } from '../../hooks/useSignedPhotoUrl';
import { supabase } from '../../lib/supabase';
import { getCatalogItems, getEquipmentCategories } from '../../api/catalog';
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
  blueprint_categories: string[] | null;
  team: { name: string } | null;
  kwp: number | null;
  client_phone: string | null;
  contact_person: string | null;
  client_email: string | null;
  roof_type: string | null;
  roof_material: string | null;
  roof_angle: string | null;
}

type TabId = 'info' | 'equip' | 'blueprints' | 'files' | 'check';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'info', label: 'Objekto info', icon: Info },
  { id: 'equip', label: 'Įranga', icon: Cpu },
  { id: 'blueprints', label: 'Brėžiniai', icon: DraftingCompass },
  { id: 'files', label: 'Failai', icon: FolderOpen },
  { id: 'check', label: 'Checklist', icon: ListChecks },
];

// ══════════════════════════════════════════════════════════════════════════════
// SolarGrade Checklist Tab
// ══════════════════════════════════════════════════════════════════════════════

type ItemStatus = 'pending' | 'pass' | 'fail' | 'n_a';

const STATUS_ITEM: Record<ItemStatus, { label: string; icon: React.ElementType; className: string; dotClass: string }> = {
  pending: { label: 'Laukia',     icon: Circle,       className: 'bg-[#f6f5fa] text-[#7c7484] border-[#cdc3d4]/50',  dotClass: 'bg-[#cdc3d4]' },
  pass:    { label: 'Atlikta',    icon: CheckCircle2, className: 'bg-[#ECFDF5] text-[#059669] border-[#059669]/20',   dotClass: 'bg-[#059669]' },
  fail:    { label: 'Neatlikta', icon: XCircle,      className: 'bg-[#FEF2F2] text-[#DC2626] border-[#DC2626]/20',   dotClass: 'bg-[#DC2626]' },
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

function ChecklistItemRow({
  item,
  siteId,
  installerPhotos = [],
}: {
  item: { id: string; question_text: string; category: string | null; phase: string | null; status: ItemStatus; photo_url: string | null; comment: string | null; is_required: boolean; is_extra?: boolean };
  siteId: string;
  /** Photos from the `photos` table whose storage_path maps to this item (durable record). */
  installerPhotos?: InstallerPhoto[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const s = STATUS_ITEM[item.status];
  const StatusIcon = s.icon;

  // Durable photos (photos table) are the source of truth. Fall back to the
  // legacy single `photo_url` column only when no rows matched this item.
  const photoUrls = installerPhotos.map(p => p.signedUrl).filter((u): u is string => !!u);
  const hasInstallerPhotos = photoUrls.length > 0;
  const hasAnyPhoto = hasInstallerPhotos || !!item.photo_url;

  return (
    <div className={`rounded-[10px] border transition-all duration-200 ${item.status === 'fail' ? 'border-[#DC2626]/30 bg-[#FEF2F2]/30' : 'border-[#cdc3d4]/30 bg-white hover:border-[#cdc3d4]/60'}`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 p-3.5 text-left cursor-pointer"
      >
        <StatusIcon size={18} className={item.status === 'pass' ? 'text-[#059669]' : item.status === 'fail' ? 'text-[#DC2626]' : item.status === 'n_a' ? 'text-[#D97706]' : 'text-[#cdc3d4]'} />
        <span className="flex-1 text-[13px] font-semibold text-[#1d033a] leading-snug">
          {item.question_text}
          {item.is_extra && (
            <span className="ml-2 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#FBF0FF] text-primary border border-primary/20 align-middle">
              PAPILDOMAS DARBAS
            </span>
          )}
        </span>
        {/* Collapsed-state evidence thumbnail */}
        {hasInstallerPhotos && (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(true); setLightboxIndex(0); }}
            className="relative shrink-0 w-9 h-9 rounded-[6px] overflow-hidden border border-[#cdc3d4]/40 cursor-zoom-in hover:border-primary/50 transition-colors"
            title="Peržiūrėti nuotrauką"
          >
            <img src={photoUrls[0]} alt="Įrodymas" className="w-full h-full object-cover" />
            {photoUrls.length > 1 && (
              <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] font-bold px-1 leading-tight rounded-tl-[4px]">
                {photoUrls.length}
              </span>
            )}
          </span>
        )}
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

              {/* Installer's photos (Įrodymai) — durable photos-table records */}
              <div>
                <p className="text-[11px] font-bold text-[#7c7484] uppercase tracking-wider mb-2">Montuotojo nuotrauka</p>
                {hasInstallerPhotos ? (
                  <div className="flex flex-wrap gap-2">
                    {photoUrls.map((u, idx) => (
                      <button
                        key={installerPhotos[idx]?.id ?? u}
                        onClick={() => setLightboxIndex(idx)}
                        className="w-20 h-20 rounded-[8px] overflow-hidden border border-[#cdc3d4]/30 hover:border-primary/50 transition-colors cursor-zoom-in focus:outline-none"
                        title="Peržiūrėti"
                      >
                        <img src={u} alt="Įrodymas" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : item.photo_url ? (
                  /* Legacy fallback: single photo_url column */
                  <ChecklistPhoto
                    value={item.photo_url}
                    siteId={siteId}
                    checklistItemId={item.id}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-[#7c7484] bg-[#f6f5fa] border border-dashed border-[#cdc3d4]/50 rounded-[8px] px-3 py-2.5">
                    <ImageIcon size={14} className="text-[#cdc3d4]" />
                    <span className="text-[12px] italic">Nėra nuotraukos</span>
                  </div>
                )}
              </div>

              {item.status === 'fail' && !hasAnyPhoto && (
                <div className="flex items-center gap-2 text-[#D97706] bg-[#FFFBEB] border border-[#D97706]/20 rounded-[8px] px-3 py-2">
                  <AlertTriangle size={14} />
                  <span className="text-[12px] font-semibold">Reikia nuotraukos — laukiama montuotojo įkėlimo.</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen lightbox for the installer evidence photos */}
      {lightboxIndex !== null && hasInstallerPhotos && (
        <ImageLightbox
          urls={photoUrls}
          index={lightboxIndex}
          originalFileUrl={photoUrls[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
        />
      )}
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

  // Installer photos (durable `photos` table records, batch-signed). Matched to
  // each checklist item via the `/${itemId}/` segment in the storage path —
  // the same durable lookup the mobile WorkTab uses.
  const { data: installerPhotos } = useQuery({
    queryKey: ['admin_site_photos', siteId],
    queryFn: () => getSiteInstallerPhotos(siteId),
    enabled: !!siteId,
  });
  const photosForItem = (itemId: string) =>
    (installerPhotos ?? []).filter(p => p.storage_path.includes(`/${itemId}/`));

  // Installer-logged extra materials for this site.
  const { data: extraMaterials } = useQuery({
    queryKey: ['site_extra_materials', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_extra_materials')
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
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
                <AlertTriangle size={11} /> {failed} neatlikta
              </span>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Iš viso',    value: total,    cls: 'text-[#1d033a]' },
            { label: 'Atlikta',    value: passed,   cls: 'text-[#059669]' },
            { label: 'Neatlikta', value: failed,   cls: 'text-[#DC2626]' },
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
                <ChecklistItemRow key={item.id} item={item as { id: string; question_text: string; category: string | null; phase: string | null; status: ItemStatus; photo_url: string | null; comment: string | null; is_required: boolean; is_extra?: boolean }} siteId={siteId} installerPhotos={photosForItem(item.id)} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Installer-logged extra materials */}
      {extraMaterials && extraMaterials.length > 0 && (
        <div className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-[#f6f5fa]/70 border-b border-[#cdc3d4]/20 flex items-center justify-between">
            <h4 className="text-[12px] font-bold text-[#7c7484] uppercase tracking-wider flex items-center gap-2">
              <Package size={14} className="text-primary" /> Papildomos medžiagos
            </h4>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#FBF0FF] text-primary border border-primary/20">
              PAPILDOMOS MEDŽIAGOS
            </span>
          </div>
          <div className="p-4 space-y-2">
            {extraMaterials.map(m => (
              <div key={m.id} className="flex items-center gap-3 bg-[#f6f5fa] rounded-[10px] px-3.5 py-2.5 border border-[#cdc3d4]/30">
                <Package size={15} className="text-[#7c7484] shrink-0" />
                <span className="flex-1 text-[13px] font-semibold text-[#1d033a] truncate">{m.name}</span>
                <span className="text-[13px] text-[#574f61] font-medium whitespace-nowrap">{m.quantity} {m.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
const isPreviewable = (name: string) => isImage(name) || isPdf(name);

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

// ── Category icon fallback map (icons are a UI concern, not stored in DB) ────
const EQUIP_ICON_MAP: Record<string, React.ElementType> = {
  Inverteris: Zap,
  Moduliai: Sun,
  BESS: Battery,
  Konstrukcija: Wrench,
  Kabeliai: Network,
  Apsauga: Shield,
};
const DEFAULT_EQUIP_ICON = Package;
const DEFAULT_CAT_COLORS = { bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB' };

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
  const [kebabOpen, setKebabOpen] = useState<number | null>(null);

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
          <div className="rounded-[12px] border border-[#cdc3d4]/30 overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[176px_1fr_96px_32px] gap-3 px-4 py-2.5 bg-[#f6f5fa] border-b border-[#cdc3d4]/30">
              <span className="text-[10px] font-bold text-[#7c7484] uppercase tracking-wider">Kategorija</span>
              <span className="text-[10px] font-bold text-[#7c7484] uppercase tracking-wider">Modelis / Specifikacija</span>
              <span className="text-[10px] font-bold text-[#7c7484] uppercase tracking-wider">Kiekis</span>
              <span />
            </div>

            {/* Transparent click-away overlay for kebab */}
            {kebabOpen !== null && (
              <div className="fixed inset-0 z-10" onClick={() => setKebabOpen(null)} />
            )}

            {currentEquipment.map((item, i) => {
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
                    <p className="text-[14px] font-semibold text-[#1d033a] leading-snug">{item.model || '—'}</p>
                    {item.notes && (
                      <p className="text-[12px] text-[#7c7484] mt-0.5 leading-snug">{item.notes}</p>
                    )}
                  </div>

                  {/* Quantity + unit badge */}
                  <div className="pt-0.5 flex items-center gap-1.5">
                    <span className="text-[15px] font-bold text-[#1d033a]">{item.quantity}</span>
                    <span className="text-[11px] font-semibold text-[#7c7484] bg-[#f6f5fa] border border-[#cdc3d4]/50 px-1.5 py-0.5 rounded-md">{item.unit || 'vnt.'}</span>
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
                      <div className="absolute right-0 top-8 z-20 bg-white rounded-[10px] shadow-lg border border-[#cdc3d4]/40 py-1 min-w-[130px]">
                        <button
                          onClick={() => { setKebabOpen(null); startEditing(); }}
                          className="w-full px-4 py-2 text-[13px] text-[#1d033a] hover:bg-[#f6f5fa] text-left flex items-center gap-2 cursor-pointer"
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
        )
      )}

      {/* Info callout */}
      {!editing && (
        <div className="mt-4 flex items-start gap-2.5 px-4 py-3 rounded-[10px] bg-[#EFF6FF] border border-[#BFDBFE] text-[13px] text-[#1d033a]">
          <Info size={15} className="text-[#2563EB] flex-shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">Kategorija</span> automatiškai nustatoma pagal objekto tipą. Galima laisvai pridėti bet kokių papildomų komponentų.
          </span>
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="flex flex-col gap-2">
          {/* Column headers */}
          <div className="grid grid-cols-[160px_1fr_56px_76px_1fr_32px] gap-2 px-1 mb-0.5 text-[10px] font-bold text-[#7c7484] uppercase tracking-wider">
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
            return (
              <div
                key={i}
                className="grid grid-cols-[160px_1fr_56px_76px_1fr_32px] gap-2 items-center p-2.5 rounded-[10px] border"
                style={{ borderColor: colors.border, background: colors.bg + '28' }}
              >
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
                        className="w-full h-[38px] pl-3 pr-8 bg-white border border-[#cdc3d4] rounded-[8px] text-[13px] text-[#1d033a] appearance-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 cursor-pointer"
                      >
                        <option value="">— Pasirinkite —</option>
                        {(catalogByCategory[row.category] ?? []).map(c => (
                          <option key={c.id} value={`${c.brand ? c.brand + ' ' : ''}${c.model}`}>
                            {c.brand ? `${c.brand} ` : ''}{c.model}{c.specifications ? ` (${c.specifications})` : ''}
                          </option>
                        ))}
                        <option value="__custom">✎ Įvesti ranka...</option>
                      </select>
                      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7c7484] pointer-events-none" />
                    </>
                  ) : hasCatalog && row.model === '__custom' ? (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Pvz.: Huawei SUN2000 10kW"
                        onBlur={(e) => { if (e.target.value.trim()) updateRow(i, 'model', e.target.value.trim()); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v) updateRow(i, 'model', v); } }}
                        className="flex-1 h-[38px] px-3 bg-white border-2 border-primary rounded-[8px] text-[13px] text-[#1d033a] focus:outline-none"
                      />
                      <button onClick={() => updateRow(i, 'model', '')} className="h-[38px] px-2 text-[#7c7484] hover:text-red-500 transition-colors cursor-pointer">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={row.model}
                      onChange={(e) => updateRow(i, 'model', e.target.value)}
                      placeholder="Modelis / specifikacija"
                      className="w-full h-[38px] px-3 bg-white border border-[#cdc3d4] rounded-[8px] text-[13px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                  )}
                </div>

                {/* Quantity */}
                <input
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) => updateRow(i, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-[38px] px-1 bg-white border border-[#cdc3d4] rounded-[8px] text-[13px] font-bold text-[#1d033a] focus:outline-none focus:border-primary text-center"
                />

                {/* Unit */}
                <div className="relative">
                  <select
                    value={row.unit || 'vnt.'}
                    onChange={(e) => updateRow(i, 'unit', e.target.value)}
                    className="w-full h-[38px] pl-2 pr-6 bg-white border border-[#cdc3d4] rounded-[8px] text-[12px] text-[#4b4452] appearance-none focus:outline-none focus:border-primary cursor-pointer text-center"
                  >
                    {EQUIPMENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#7c7484] pointer-events-none" />
                </div>

                {/* Notes */}
                <input
                  type="text"
                  value={row.notes}
                  onChange={(e) => updateRow(i, 'notes', e.target.value)}
                  placeholder="Pastabos..."
                  className="h-[38px] px-3 bg-white border border-[#cdc3d4] rounded-[8px] text-[13px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />

                {/* Remove */}
                <button
                  onClick={() => setRows(r => r.filter((_, idx) => idx !== i))}
                  className="w-8 h-8 flex items-center justify-center text-[#cdc3d4] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer rounded-[8px]"
                >
                  <X size={15} />
                </button>
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
  const blueprintInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabId>('info');
  const [annotatingFile, setAnnotatingFile] = useState<{ name: string; url: string; page?: number } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxPdf, setLightboxPdf] = useState<{ url: string; page: number } | null>(null);
  // Active page per category, so the annotator/lightbox open on the page shown.
  const [pageByCategory, setPageByCategory] = useState<Record<string, number>>({});
  // Blueprint upload/category state
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [uploadTargetCategory, setUploadTargetCategory] = useState<string | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryName, setCategoryName] = useState('');

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

  const uploadBlueprintMutation = useMutation({
    mutationFn: ({ category, file }: { category: string; file: File }) =>
      uploadBlueprintFile(id!, category, file),
    onSuccess: () => {
      toast.success('Brėžinys įkeltas!');
      setUploadingCategory(null);
      void queryClient.invalidateQueries({ queryKey: ['admin_site_files', id] });
    },
    onError: (err: unknown) => {
      setUploadingCategory(null);
      toast.error(err instanceof Error ? err.message : 'Klaida');
    },
  });

  const addCategoryMutation = useMutation({
    mutationFn: (name: string) => addBlueprintCategory(id!, name),
    onSuccess: () => {
      setCategoryName('');
      setShowCategoryModal(false);
      void queryClient.invalidateQueries({ queryKey: ['admin_site', id] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const removeCategoryMutation = useMutation({
    mutationFn: async ({ category, fileName }: { category: string; fileName?: string }) => {
      if (fileName) await deleteSiteFile(id!, fileName);
      await removeBlueprintCategory(id!, category);
    },
    onSuccess: () => {
      toast.success('Kategorija pašalinta');
      setDeletingCategory(null);
      void queryClient.invalidateQueries({ queryKey: ['admin_site', id] });
      void queryClient.invalidateQueries({ queryKey: ['admin_site_files', id] });
    },
    onError: (err: unknown) => {
      setDeletingCategory(null);
      toast.error(err instanceof Error ? err.message : 'Klaida');
    },
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

  /* ── Tech data editing ── */
  const [editingTech, setEditingTech] = useState(false);
  const [techForm, setTechForm] = useState({
    kwp: '',
    system_type: '',
    scheduled_start: '',
    roof_type: '',
    roof_material: '',
    roof_angle: '',
  });

  const startEditingTech = () => {
    setTechForm({
      kwp:             site?.kwp != null ? String(site.kwp) : '',
      system_type:     site?.system_type     ?? 'PV',
      scheduled_start: site?.scheduled_start
        ? format(new Date(site.scheduled_start), "yyyy-MM-dd'T'HH:mm")
        : '',
      roof_type:     site?.roof_type     ?? '',
      roof_material: site?.roof_material ?? '',
      roof_angle:    site?.roof_angle    ?? '',
    });
    setEditingTech(true);
  };

  const saveTechMutation = useMutation({
    mutationFn: () => updateTechData(id!, {
      kwp:             techForm.kwp !== '' ? parseFloat(techForm.kwp) : null,
      system_type:     techForm.system_type,
      scheduled_start: techForm.scheduled_start
        ? new Date(techForm.scheduled_start).toISOString()
        : null,
      roof_type:     techForm.roof_type     || null,
      roof_material: techForm.roof_material || null,
      roof_angle:    techForm.roof_angle    || null,
    }),
    onSuccess: () => {
      toast.success('Techniniai duomenys išsaugoti!');
      setEditingTech(false);
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

  // Triggers the hidden blueprint file picker for a given category.
  const pickBlueprint = (category: string) => {
    setUploadTargetCategory(category);
    blueprintInputRef.current?.click();
  };

  const handleBlueprintInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const category = uploadTargetCategory;
    e.target.value = '';
    if (!file || !category) return;
    setUploadingCategory(category);
    uploadBlueprintMutation.mutate({ category, file });
  };

  const handleAddCategory = () => {
    const name = categoryName.trim();
    if (!name) return;
    // Avoid duplicates against both existing blueprints and persisted placeholders.
    if (displayCategories.includes(name)) {
      toast.error('Tokia kategorija jau egzistuoja.');
      return;
    }
    addCategoryMutation.mutate(name);
  };

  const handleDeleteBlueprint = async (fileName: string) => {
    const ok = await confirm({
      title: 'Pašalinti brėžinį?',
      message: 'Ar tikrai norite pašalinti šį brėžinį?',
      variant: 'danger',
    });
    if (ok) deleteFileMutation.mutate(fileName);
  };

  const handleDeleteCategory = async (category: string, fileName?: string) => {
    const ok = await confirm({
      title: 'Pašalinti kategoriją?',
      message: fileName
        ? `Kategorija „${category}" ir jos brėžinys bus pašalinti. Veiksmas neatšaukiamas.`
        : `Ar tikrai norite pašalinti kategoriją „${category}"?`,
      variant: 'danger',
    });
    if (!ok) return;
    setDeletingCategory(category);
    removeCategoryMutation.mutate({ category, fileName });
  };

  /* ── Helpers ── */
  const currentEquipment = parseEquipmentDetails(site?.equipment_details);
  // Blueprints are stored with a `__` prefix so they stay out of the Files tab.
  const blueprints = groupBlueprints(files ?? []);
  // Categories to render = persisted placeholders ∪ categories derived from
  // uploaded files (deduped). A Set keeps insertion order while removing dupes.
  const displayCategories = [
    ...new Set<string>([
      ...(site?.blueprint_categories ?? []),
      ...blueprints.map((b) => b.category),
    ]),
  ];
  const blueprintByCategory = (category: string) =>
    blueprints.find((b) => b.category === category)?.file;
  const regularFiles = files?.filter(f => !f.name.startsWith('__'));
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
    <div className="space-y-6 max-w-6xl mx-auto w-full">
      
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
      <div className="relative flex gap-1 bg-[#f6f5fa] rounded-[12px] p-1.5 overflow-x-auto border border-[#cdc3d4]/30 flex-shrink-0 min-h-[48px]">
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
                <div className="px-5 py-3.5 border-b border-[#cdc3d4]/20 bg-[#f6f5fa]/50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Cpu size={18} className="text-primary" />
                    <h3 className="font-semibold text-[#1d033a] text-[14px]">Techniniai duomenys</h3>
                  </div>
                  <button
                    onClick={startEditingTech}
                    className="flex items-center gap-1.5 h-[28px] px-3 rounded-[6px] bg-[#f6f5fa] text-primary font-semibold text-[12px] hover:bg-[#ede8f5] border border-[#cdc3d4]/30 transition-colors cursor-pointer"
                  >
                    <Pencil size={13} />
                    Redaguoti
                  </button>
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
                  <div className="bg-[#f6f5fa] rounded-[8px] p-3 border border-[#cdc3d4]/20">
                    <span className="text-[11px] text-[#7c7484] uppercase font-bold tracking-wider block mb-1">Stogo tipas</span>
                    <span className="text-[14px] font-semibold text-[#1d033a]">{site.roof_type || '-'}</span>
                  </div>
                  <div className="bg-[#f6f5fa] rounded-[8px] p-3 border border-[#cdc3d4]/20">
                    <span className="text-[11px] text-[#7c7484] uppercase font-bold tracking-wider block mb-1">Stogo danga</span>
                    <span className="text-[14px] font-semibold text-[#1d033a]">{site.roof_material || '-'}</span>
                  </div>
                  <div className="bg-[#f6f5fa] rounded-[8px] p-3 border border-[#cdc3d4]/20">
                    <span className="text-[11px] text-[#7c7484] uppercase font-bold tracking-wider block mb-1">Stogo nuolydis</span>
                    <span className="text-[14px] font-semibold text-[#1d033a]">{site.roof_angle || '-'}</span>
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
        {activeTab === 'blueprints' && (
          <motion.div
            key="blueprints"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            {/* Hidden file picker shared by every blueprint card */}
            <input
              ref={blueprintInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.dwg"
              onChange={handleBlueprintInputChange}
            />

            {/* Header + new category button */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-[16px] font-bold text-[#1d033a] flex items-center gap-2">
                <DraftingCompass size={18} className="text-primary" />
                Brėžiniai
              </h2>
              <button
                onClick={() => { setCategoryName(''); setShowCategoryModal(true); }}
                className="flex items-center gap-2 h-[34px] px-4 rounded-[8px] bg-primary text-white font-semibold text-[13px] hover:bg-primary/80 transition-colors cursor-pointer"
              >
                <Plus size={16} />
                Nauja kategorija
              </button>
            </div>

            {/* Blueprint category grid */}
            {displayCategories.length === 0 ? (
              <div className="bg-white rounded-[16px] border border-dashed border-[#cdc3d4]/50 shadow-sm p-10 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-[16px] bg-[#f6f5fa] flex items-center justify-center border border-[#cdc3d4]/30">
                  <DraftingCompass size={28} className="text-[#cdc3d4]" />
                </div>
                <p className="font-bold text-[15px] text-[#1d033a]">Brėžinių dar nėra</p>
                <p className="text-[13px] text-[#7c7484] max-w-sm">
                  Sukurk kategoriją (pvz. „Vizualizacija", „El. schema", „Stringavimas") ir įkelk po vieną brėžinį.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {displayCategories.map((category) => {
                  const file = blueprintByCategory(category);
                  const busy = uploadingCategory === category;
                  return (
                    <div key={category} className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm overflow-hidden flex flex-col">
                      <div className="px-5 py-3.5 border-b border-[#cdc3d4]/20 bg-[#f6f5fa]/50 flex items-center gap-2">
                        <DraftingCompass size={18} className="text-primary shrink-0" />
                        <h3 className="font-semibold text-[#1d033a] text-[14px] truncate flex-1">{category}</h3>
                        <button
                          onClick={() => void handleDeleteCategory(category, file?.name)}
                          disabled={deletingCategory === category}
                          className="w-7 h-7 flex items-center justify-center text-[#cdc3d4] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                          title="Pašalinti kategoriją"
                        >
                          {deletingCategory === category ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                      </div>
                      <div className="p-5 flex-1 flex items-center justify-center">
                        {file ? (
                          <div className="group relative rounded-[12px] overflow-hidden border border-[#cdc3d4]/30 w-full">
                            {isPdf(file.name) ? (
                              <PdfPagePreview
                                url={file.url}
                                page={pageByCategory[category] ?? 1}
                                onPageChange={(p) => setPageByCategory((prev) => ({ ...prev, [category]: p }))}
                                className="w-full aspect-[4/3] object-contain bg-[#f6f5fa]"
                              />
                            ) : isImage(file.name) ? (
                              <img
                                src={file.url}
                                alt={category}
                                className="w-full aspect-[4/3] object-contain bg-[#f6f5fa]"
                              />
                            ) : (
                              <div className="aspect-[4/3] flex flex-col items-center justify-center bg-[#f6f5fa] gap-2">
                                <FileText size={40} className="text-[#cdc3d4]" />
                                <p className="text-[12px] text-[#7c7484] font-semibold truncate px-4">{category}</p>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                              {isPreviewable(file.name) && (
                                <button
                                  onClick={() => isPdf(file.name)
                                    ? setLightboxPdf({ url: file.url, page: pageByCategory[category] ?? 1 })
                                    : setLightboxUrl(file.url)}
                                  className="pointer-events-auto w-9 h-9 rounded-[8px] bg-white text-primary flex items-center justify-center hover:bg-[#f6f5fa] transition-colors cursor-pointer shadow-sm"
                                  title="Padidinti"
                                >
                                  <ZoomIn size={16} />
                                </button>
                              )}
                              {isPreviewable(file.name) && (
                                <button
                                  onClick={() => setAnnotatingFile({ name: file.name, url: file.url, page: pageByCategory[category] ?? 1 })}
                                  className="pointer-events-auto w-9 h-9 rounded-[8px] bg-primary text-white flex items-center justify-center hover:bg-primary/80 transition-colors cursor-pointer shadow-sm"
                                  title="Žymėti"
                                >
                                  <Pencil size={15} />
                                </button>
                              )}
                              <button
                                onClick={() => pickBlueprint(category)}
                                className="pointer-events-auto w-9 h-9 rounded-[8px] bg-white/80 text-[#4b4452] flex items-center justify-center hover:bg-white transition-colors cursor-pointer shadow-sm"
                                title="Pakeisti"
                              >
                                <Upload size={15} />
                              </button>
                              <button
                                onClick={() => void handleDeleteBlueprint(file.name)}
                                className="pointer-events-auto w-9 h-9 rounded-[8px] bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors cursor-pointer shadow-sm"
                                title="Pašalinti"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => !busy && pickBlueprint(category)}
                            className="border-2 border-dashed border-[#cdc3d4]/50 rounded-[12px] w-full p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-[#fbf0ff]/30 hover:border-primary/40 transition-colors"
                          >
                            {busy ? (
                              <Loader2 size={32} className="text-primary animate-spin mb-3" />
                            ) : (
                              <ImageIcon size={32} className="text-[#cdc3d4] mb-3" />
                            )}
                            <p className="font-semibold text-[#1d033a] text-[13px]">
                              {busy ? 'Įkeliama...' : 'Įkelti brėžinį'}
                            </p>
                            <p className="text-[11px] text-[#7c7484] mt-1">PNG, JPG, PDF, DWG</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

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
            ) : !regularFiles || regularFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm">
                <FolderOpen size={32} className="text-[#cdc3d4] mb-2" />
                <p className="text-[#7c7484] text-[14px]">Failų dar nėra.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {regularFiles.map((file) => (
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

                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      {isImage(file.name) && (
                        <button
                          onClick={() => setLightboxUrl(file.url)}
                          className="w-9 h-9 rounded-[8px] bg-white text-primary flex items-center justify-center hover:bg-[#f6f5fa] transition-colors cursor-pointer shadow-sm"
                          title="Padidinti"
                        >
                          <ZoomIn size={16} />
                        </button>
                      )}
                      {!isImage(file.name) && (
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-9 h-9 rounded-[8px] bg-white text-primary flex items-center justify-center hover:bg-[#f6f5fa] transition-colors shadow-sm"
                          title="Atidaryti"
                        >
                          <ImageIcon size={16} />
                        </a>
                      )}
                      {isImage(file.name) && (
                        <button
                          onClick={() => setAnnotatingFile({ name: file.name, url: file.url })}
                          className="w-9 h-9 rounded-[8px] bg-primary text-white flex items-center justify-center hover:bg-primary/80 transition-colors cursor-pointer shadow-sm"
                          title="Žymėti"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
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

      {/* ════ TECH DATA EDIT MODAL ════ */}
      {editingTech && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#cdc3d4]/30 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Cpu size={18} className="text-primary" />
                <h3 className="text-[16px] font-bold text-[#1d033a]">Redaguoti techninius duomenis</h3>
              </div>
              <button
                onClick={() => setEditingTech(false)}
                disabled={saveTechMutation.isPending}
                className="text-[#7c7484] hover:text-[#1d033a] transition-colors disabled:opacity-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Įrengta galia (kWp)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={techForm.kwp}
                  onChange={e => setTechForm(f => ({ ...f, kwp: e.target.value }))}
                  placeholder="Pvz.: 10.5"
                  className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Sistemos tipas</label>
                <select
                  value={techForm.system_type}
                  onChange={e => setTechForm(f => ({ ...f, system_type: e.target.value }))}
                  className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="PV">Saulės elektrinė (PV)</option>
                  <option value="PV+BESS">Saulės elektrinė + Baterija (PV+BESS)</option>
                  <option value="BESS">Baterija (BESS)</option>
                  <option value="OTHER">Šilumos siurblys / Kita</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Planuojama pradžia</label>
                <input
                  type="datetime-local"
                  value={techForm.scheduled_start}
                  onChange={e => setTechForm(f => ({ ...f, scheduled_start: e.target.value }))}
                  className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Stogo tipas</label>
                <select
                  value={techForm.roof_type}
                  onChange={e => setTechForm(f => ({ ...f, roof_type: e.target.value }))}
                  className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="">-- Pasirinkti --</option>
                  <option value="Plokščias">Plokščias</option>
                  <option value="Šlaitinis">Šlaitinis</option>
                  <option value="Ant žemės">Ant žemės</option>
                  <option value="Netaikoma">Netaikoma</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Stogo danga</label>
                <input
                  type="text"
                  value={techForm.roof_material}
                  onChange={e => setTechForm(f => ({ ...f, roof_material: e.target.value }))}
                  placeholder="Įvesti arba pasirinkti..."
                  className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['Bitumas', 'Čerpės', 'Trapecinė skarda', 'Klasikinė / Falcai', 'Šiferis', 'Netaikoma'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setTechForm(f => ({ ...f, roof_material: opt }))}
                      className={`px-2.5 py-1 rounded-[6px] text-[12px] font-medium border transition-colors cursor-pointer ${
                        techForm.roof_material === opt
                          ? 'bg-primary text-white border-primary'
                          : 'bg-[#f6f5fa] text-[#4b4452] border-[#cdc3d4] hover:border-primary/50 hover:text-primary'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Stogo nuolydis</label>
                <select
                  value={techForm.roof_angle}
                  onChange={e => setTechForm(f => ({ ...f, roof_angle: e.target.value }))}
                  className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="">-- Pasirinkti --</option>
                  <option value="Iki 30°">Iki 30°</option>
                  <option value="Virš 30°">Virš 30°</option>
                  <option value="Plokščias (0° - 10°)">Plokščias (0° - 10°)</option>
                  <option value="Netaikoma">Netaikoma</option>
                </select>
              </div>
            </div>

            <div className="px-6 pb-6 pt-4 flex gap-3 flex-shrink-0 border-t border-[#cdc3d4]/20">
              <button
                type="button"
                onClick={() => setEditingTech(false)}
                disabled={saveTechMutation.isPending}
                className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] border border-[#cdc3d4] text-[#4b4452] hover:bg-[#f6f5fa] transition-colors disabled:opacity-60 cursor-pointer"
              >
                Atšaukti
              </button>
              <button
                type="button"
                onClick={() => saveTechMutation.mutate()}
                disabled={saveTechMutation.isPending}
                className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] bg-primary text-white hover:bg-primary/80 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-70 cursor-pointer"
              >
                {saveTechMutation.isPending ? (
                  <Loader2 className="animate-spin w-5 h-5" />
                ) : (
                  <>
                    <Save size={15} />
                    Išsaugoti
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Image Annotation Modal ── */}
      {annotatingFile && id && (
        <ImageAnnotator
          siteId={id}
          fileName={annotatingFile.name}
          imageUrl={annotatingFile.url}
          initialPage={annotatingFile.page ?? 1}
          isAdmin={true}
          onClose={() => setAnnotatingFile(null)}
        />
      )}

      {/* ── Image Lightbox (zoom/pan, no annotation tools) ── */}
      {lightboxUrl && (
        <ImageLightbox
          url={lightboxUrl}
          originalFileUrl={lightboxUrl}
          onClose={() => setLightboxUrl(null)}
        />
      )}

      {/* ── PDF Lightbox (full-screen zoom + pagination) ── */}
      {lightboxPdf && (
        <ImageLightbox
          pdfUrl={lightboxPdf.url}
          initialPage={lightboxPdf.page}
          originalFileUrl={lightboxPdf.url}
          onClose={() => setLightboxPdf(null)}
        />
      )}

      {/* ── New blueprint category modal ── */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#cdc3d4]/30">
              <h3 className="text-[16px] font-bold text-[#1d033a]">Nauja kategorija</h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="cursor-pointer text-[#7c7484] hover:text-[#1d033a] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">
                Pavadinimas <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
                placeholder="Pvz.: Vizualizacija"
                autoFocus
                className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] border border-[#cdc3d4] text-[#4b4452] hover:bg-[#f6f5fa] transition-colors cursor-pointer"
              >
                Atšaukti
              </button>
              <button
                onClick={handleAddCategory}
                disabled={!categoryName.trim() || addCategoryMutation.isPending}
                className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] bg-primary text-white hover:bg-primary/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {addCategoryMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Pridėti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
