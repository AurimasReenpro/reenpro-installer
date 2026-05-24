import React, { useRef, useState } from 'react';
import type { SiteChecklist, SitePhoto } from '../../../types/site.types';
import type { ChecklistItemStatus } from '../../../hooks/useChecklistActions';
import {
  Loader2, Camera, Image, X, ChevronDown,
  MessageSquare, CheckCircle2, XCircle, MinusCircle, Circle,
} from 'lucide-react';
import SignedPhoto from '../../../components/ui/SignedPhoto';

// ── Status display configuration ──────────────────────────────────────────────

const STATUS_CFG: Record<ChecklistItemStatus, {
  label: string;
  badgeCls: string;
  borderCls: string;
  Icon: React.ElementType;
  iconCls: string;
  btnActiveCls: string;
  btnInactiveCls: string;
}> = {
  pending: {
    label:        'Laukia',
    badgeCls:     'bg-[#f6f5fa] text-[#7c7484]',
    borderCls:    'border-[#e2d9f0]/50',
    Icon:         Circle,
    iconCls:      'text-[#cdc3d4]',
    btnActiveCls: 'bg-[#6B7280] text-white border-[#6B7280]',
    btnInactiveCls:'bg-[#F3F4F6] text-[#6B7280] border-[#6B7280]/20',
  },
  pass: {
    label:        'Praėjo',
    badgeCls:     'bg-[#ECFDF5] text-[#059669]',
    borderCls:    'border-[#10B981]/30',
    Icon:         CheckCircle2,
    iconCls:      'text-[#10B981]',
    btnActiveCls: 'bg-[#10B981] text-white border-[#10B981]',
    btnInactiveCls:'bg-[#F0FDF4] text-[#10B981] border-[#10B981]/20',
  },
  fail: {
    label:        'Brokas',
    badgeCls:     'bg-[#FEF2F2] text-[#DC2626]',
    borderCls:    'border-[#EF4444]/30',
    Icon:         XCircle,
    iconCls:      'text-[#EF4444]',
    btnActiveCls: 'bg-[#EF4444] text-white border-[#EF4444]',
    btnInactiveCls:'bg-[#FEF2F2] text-[#EF4444] border-[#EF4444]/20',
  },
  n_a: {
    label:        'N/A',
    badgeCls:     'bg-[#FFFBEB] text-[#D97706]',
    borderCls:    'border-[#F59E0B]/30',
    Icon:         MinusCircle,
    iconCls:      'text-[#F59E0B]',
    btnActiveCls: 'bg-[#F59E0B] text-white border-[#F59E0B]',
    btnInactiveCls:'bg-[#FFFBEB] text-[#D97706] border-[#D97706]/20',
  },
};

// ── Photo picker (camera vs gallery bottom sheet) ─────────────────────────────
function PhotoPickerButton({
  checkId,
  onUploadPhoto,
}: {
  checkId: string;
  onUploadPhoto: (e: React.ChangeEvent<HTMLInputElement>, checkId: string) => void;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [showPicker, setShowPicker] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, ref: React.RefObject<HTMLInputElement | null>) => {
    void onUploadPhoto(e, checkId);
    if (ref.current) ref.current.value = '';
  };

  return (
    <>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={(e) => handleFile(e, cameraInputRef)} />
      <input ref={galleryInputRef} type="file" accept="image/*"
        className="hidden" onChange={(e) => handleFile(e, galleryInputRef)} />

      <button
        onClick={() => setShowPicker(true)}
        className="flex items-center gap-2 h-[44px] px-4 rounded-xl bg-[#f6e9ff] active:bg-[#e4cbf8] transition-colors cursor-pointer border border-primary/10"
      >
        <Camera className="text-[#8052b2] w-5 h-5" />
        <span className="text-[#8052b2] font-semibold text-[13px]">Įkelti nuotrauką</span>
      </button>

      {showPicker && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end" onClick={() => setShowPicker(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-t-2xl px-4 pt-4 pb-8 flex flex-col gap-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[#cdc3d4] rounded-full mx-auto mb-2" />
            <p className="text-center text-[#1d033a] font-bold text-base mb-1">Pridėti nuotrauką</p>
            <button
              onClick={() => { setShowPicker(false); setTimeout(() => cameraInputRef.current?.click(), 50); }}
              className="flex items-center gap-4 w-full h-[58px] px-5 rounded-xl bg-primary text-white font-semibold text-base active:scale-95 transition-all shadow-md"
            >
              <Camera className="w-5 h-5 shrink-0" /> Fotografuoti
            </button>
            <button
              onClick={() => { setShowPicker(false); setTimeout(() => galleryInputRef.current?.click(), 50); }}
              className="flex items-center gap-4 w-full h-[58px] px-5 rounded-xl bg-[#f3ebff] text-primary font-semibold text-base active:scale-95 transition-all"
            >
              <Image className="w-5 h-5 shrink-0" /> Pasirinkti iš galerijos
            </button>
            <button
              onClick={() => setShowPicker(false)}
              className="flex items-center justify-center w-full h-[50px] rounded-xl bg-[#f5f0fa] text-[#4b4452] font-semibold text-sm active:scale-95 transition-all mt-1"
            >
              <X className="w-4 h-4 mr-2" /> Atšaukti
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Accordion checklist item card ─────────────────────────────────────────────
interface ItemCardProps {
  item: SiteChecklist;
  photos: SitePhoto[];
  isExpanded: boolean;
  compressingCheckId: string | null;
  uploadingCheckId: string | null;
  onToggleExpand: () => void;
  onSetStatus: (itemId: string, status: ChecklistItemStatus) => void;
  onSaveComment: (itemId: string, comment: string) => Promise<void>;
  onUploadPhoto: (e: React.ChangeEvent<HTMLInputElement>, checkId: string) => void;
  onSelectPhoto: (photo: SitePhoto, checkId: string) => void;
}

function ChecklistItemCard({
  item,
  photos,
  isExpanded,
  compressingCheckId,
  uploadingCheckId,
  onToggleExpand,
  onSetStatus,
  onSaveComment,
  onUploadPhoto,
  onSelectPhoto,
}: ItemCardProps) {
  const currentStatus: ChecklistItemStatus = item.status ?? 'pending';
  const cfg = STATUS_CFG[currentStatus];
  const StatusIcon = cfg.Icon;

  const linkedPhoto = photos?.find((p) => p.storage_path.includes(`/${item.id}/`));
  const hasPhoto   = !!(linkedPhoto ?? item.photo_url);
  const hasComment = !!item.comment?.trim();

  // Local comment — initialised from DB value at mount.
  // After a successful save the query refetches, but localComment already equals
  // the saved value (the user typed it), so no manual sync is needed.
  const [localComment,    setLocalComment]    = useState(item.comment ?? '');
  const [isSavingComment, setIsSavingComment] = useState(false);

  const commentChanged = localComment !== (item.comment ?? '');

  const handleSave = async () => {
    if (!commentChanged || isSavingComment) return;
    setIsSavingComment(true);
    try {
      await onSaveComment(item.id, localComment);
    } finally {
      setIsSavingComment(false);
    }
  };

  const handleStatusTap = (tapped: ChecklistItemStatus) => {
    // Tapping the active status a second time resets to 'pending'
    const next: ChecklistItemStatus = tapped === currentStatus ? 'pending' : tapped;
    onSetStatus(item.id, next);
  };

  return (
    <div className={`bg-white rounded-2xl mb-3 overflow-hidden shadow-sm border transition-shadow ${cfg.borderCls} ${isExpanded ? 'shadow-md' : ''}`}>

      {/* ── Collapsed header (always visible) ── */}
      <button
        onClick={onToggleExpand}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-[#f9f5ff] transition-colors cursor-pointer"
      >
        {/* Status dot icon */}
        <StatusIcon size={20} className={`flex-shrink-0 ${cfg.iconCls}`} />

        {/* Task label */}
        <span className={`flex-1 text-[#1d033a] font-semibold text-[14px] leading-snug ${currentStatus === 'pass' ? 'line-through opacity-60' : ''}`}>
          {item.question_text}
        </span>

        {/* Right side: indicators + status badge + chevron */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasComment && <MessageSquare size={12} className="text-primary opacity-70" />}
          {hasPhoto   && <Camera size={12} className="text-primary opacity-70" />}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${cfg.badgeCls}`}>
            {cfg.label}
          </span>
          <ChevronDown
            size={16}
            className={`text-[#cdc3d4] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* ── Expanded action area ── */}
      {isExpanded && (
        <div className="border-t border-[#f0ebf8] px-4 pb-5 pt-4 space-y-5 animate-in slide-in-from-top-2 fade-in duration-200">

          {/* 1 ▸ Status toggle buttons */}
          <div>
            <p className="text-[11px] font-bold text-[#7c7484] uppercase tracking-wider mb-2">Statusas</p>
            <div className="grid grid-cols-3 gap-2">
              {(['pass', 'fail', 'n_a'] as const).map((s) => {
                const sc = STATUS_CFG[s];
                const isActive = currentStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusTap(s)}
                    className={`h-[52px] rounded-xl font-bold text-[13px] border-2 flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer ${isActive ? sc.btnActiveCls : sc.btnInactiveCls}`}
                  >
                    <sc.Icon size={15} />
                    {sc.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2 ▸ Comment textarea */}
          <div>
            <label className="block text-[11px] font-bold text-[#7c7484] uppercase tracking-wider mb-2">
              Komentaras / Pastaba
            </label>
            <textarea
              value={localComment}
              onChange={(e) => setLocalComment(e.target.value)}
              onBlur={() => { if (commentChanged) void handleSave(); }}
              placeholder="Pridėkite pastabą arba pastebėjimą..."
              rows={2}
              className="w-full px-3 py-2.5 bg-[#f6f5fa] border border-[#cdc3d4]/50 rounded-xl text-[13px] text-[#1d033a] placeholder:text-[#cdc3d4] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none transition-colors"
            />
            {commentChanged && (
              <button
                onClick={() => { void handleSave(); }}
                disabled={isSavingComment}
                className="mt-1.5 flex items-center gap-1.5 h-[30px] px-3 rounded-lg bg-primary text-white font-semibold text-[11px] active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                {isSavingComment && <Loader2 size={11} className="animate-spin" />}
                Išsaugoti pastabą
              </button>
            )}
          </div>

          {/* 3 ▸ Photo area */}
          <div>
            <label className="block text-[11px] font-bold text-[#7c7484] uppercase tracking-wider mb-2">
              Nuotrauka{item.is_required && <span className="text-[#EF4444] ml-0.5">*</span>}
            </label>

            {compressingCheckId === item.id ? (
              <div className="flex items-center gap-2 text-[#8052b2] text-[12px] font-semibold h-[44px]">
                <Loader2 size={14} className="animate-spin" /> Spaudžiama...
              </div>
            ) : uploadingCheckId === item.id ? (
              <div className="flex items-center gap-2 text-[#8052b2] text-[12px] font-semibold h-[44px]">
                <Loader2 size={14} className="animate-spin" /> Keliama į serverį...
              </div>
            ) : hasPhoto ? (
              <div className="flex items-center gap-4">
                <SignedPhoto
                  storage_path={linkedPhoto?.storage_path ?? item.photo_url!}
                  alt="Atlikta užduotis"
                  className="w-[80px] h-[80px] rounded-xl object-cover border border-[#cdc3d4] cursor-pointer flex-shrink-0"
                  onClick={() => { if (linkedPhoto) onSelectPhoto(linkedPhoto, item.id); }}
                />
                <div className="text-[12px] text-[#7c7484] leading-relaxed">
                  Nuotrauka įkelta.<br />
                  <span className="text-primary font-semibold cursor-pointer"
                    onClick={() => { if (linkedPhoto) onSelectPhoto(linkedPhoto, item.id); }}>
                    Palieskite peržiūrėti / ištrinti
                  </span>
                </div>
              </div>
            ) : (
              <PhotoPickerButton checkId={item.id} onUploadPhoto={onUploadPhoto} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Phases ────────────────────────────────────────────────────────────────────
const KNOWN_PHASES = new Set(['pre', 'during', 'post']);

const PHASE_TITLES: Record<string, string> = {
  pre:    'Pasiruošimas (Pre-checklist)',
  during: 'Darbų eiga',
  post:   'Užbaigimas (Post-checklist)',
};

// ── WorkTab props ─────────────────────────────────────────────────────────────
interface WorkTabProps {
  checklists: SiteChecklist[];
  photos: SitePhoto[];
  compressingCheckId: string | null;
  uploadingCheckId: string | null;
  onSetStatus: (itemId: string, status: ChecklistItemStatus) => void;
  onSaveComment: (itemId: string, comment: string) => Promise<void>;
  onUploadPhoto: (e: React.ChangeEvent<HTMLInputElement>, checkId: string) => void;
  onSelectPhoto: (photo: SitePhoto, checkId: string) => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WorkTab({
  checklists,
  photos,
  compressingCheckId,
  uploadingCheckId,
  onSetStatus,
  onSaveComment,
  onUploadPhoto,
  onSelectPhoto,
}: WorkTabProps) {
  // Only one item can be expanded at a time (accordion behaviour)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleItem = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  // Items added by admin with phase=null get their own section at the bottom
  const customItems = checklists?.filter((c) => !KNOWN_PHASES.has(c.phase ?? '')) ?? [];

  const sharedProps: Omit<ItemCardProps, 'item' | 'isExpanded' | 'onToggleExpand'> = {
    photos,
    compressingCheckId,
    uploadingCheckId,
    onSetStatus,
    onSaveComment,
    onUploadPhoto,
    onSelectPhoto,
  };

  return (
    <div className="px-4 pb-[120px] pt-4">

      {/* ── Standard phase sections ── */}
      {['pre', 'during', 'post'].map((phaseCode) => {
        const phaseItems = checklists?.filter((c) => c.phase === phaseCode) ?? [];
        if (phaseItems.length === 0) return null;

        return (
          <div key={phaseCode} className="mb-6">
            <h3 className="text-[#1d033a] font-bold text-[15px] mb-3">
              {PHASE_TITLES[phaseCode] ?? phaseCode}
            </h3>
            {phaseItems.map((item) => (
              <ChecklistItemCard
                key={item.id}
                item={item}
                isExpanded={expandedId === item.id}
                onToggleExpand={() => toggleItem(item.id)}
                {...sharedProps}
              />
            ))}
          </div>
        );
      })}

      {/* ── Custom / additional tasks (admin-added, phase = null) ── */}
      {customItems.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[#1d033a] font-bold text-[15px] mb-3">Papildomi darbai</h3>
          {customItems.map((item) => (
            <ChecklistItemCard
              key={item.id}
              item={item}
              isExpanded={expandedId === item.id}
              onToggleExpand={() => toggleItem(item.id)}
              {...sharedProps}
            />
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {(!checklists || checklists.length === 0) && (
        <div className="text-center text-[#7c7484] py-10 bg-white rounded-2xl shadow-sm border border-[#e2d9f0]/50">
          Užduočių nėra.
        </div>
      )}
    </div>
  );
}
