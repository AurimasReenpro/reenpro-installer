import { useState, useReducer, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Stage, Layer, Line, Group,
  Arrow as KonvaArrow,
  Rect as KonvaRect,
  Ellipse as KonvaEllipse,
  Image as KonvaImage,
  Circle as KonvaCircle,
  Text as KonvaText,
  Path as KonvaPath,
} from 'react-konva';
import type Konva from 'konva';
import useImage from 'use-image';
import { v4 as uuidv4 } from 'uuid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  X, MousePointer, Pencil, CheckCircle2, AlertTriangle, Save, Trash2, Loader2,
  ArrowUpRight, Square, Circle as CircleIcon, Type, Eraser, Undo2, Redo2,
  Camera, ArrowLeft, Image as ImageIcon, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { getFileAnnotations, saveFileAnnotations } from '../../api/annotations';
import type { Annotation } from '../../api/annotations';
import { uploadAnnotationAttachment, deleteAnnotationAttachment } from '../../api/sites';
import { isPdf, usePdfPage } from '../../lib/pdf';
import ImageLightbox from './ImageLightbox';

type Tool = 'pointer' | 'draw' | 'check' | 'warning' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'eraser';

const CHECK_COLOR = '#16a34a';
const WARN_COLOR  = '#d97706';

// Hard cap on photos per annotation pin (keeps the UI uncluttered + DB small).
const MAX_ATTACHMENTS = 5;

// Premium marker fills (rendered on the Konva canvas)
const CHECK_BG = '#22c55e';
const WARN_BG  = '#f59e0b';

// lucide-react SVG paths (24×24 viewBox) used for crisp on-canvas icons
const CHECK_PATH  = 'M20 6 9 17l-5-5';                     // lucide "Check"
const CAMERA_BODY = 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z'; // lucide "Camera"

function markerColor(t: 'check' | 'warning') { return t === 'check' ? CHECK_COLOR : WARN_COLOR; }

const PALETTE = [
  { color: '#ef4444', label: 'Raudona'   },
  { color: '#3b82f6', label: 'Mėlyna'    },
  { color: '#22c55e', label: 'Žalia'     },
  { color: '#eab308', label: 'Geltona'   },
  { color: '#1d033a', label: 'Juoda'     },
  { color: '#ffffff', label: 'Balta'     },
  { color: '#490891', label: 'Violetinė' },
] as const;

const STROKE_OPTIONS = [
  { value: 2, label: 'Plona'    },
  { value: 4, label: 'Vidutinė' },
  { value: 8, label: 'Stora'    },
] as const;

// ── History reducer ────────────────────────────────────────────────────────────
interface HistoryState {
  past:    Annotation[][];
  present: Annotation[];
  future:  Annotation[][];
}

type HistoryAction =
  | { type: 'commit'; payload: (prev: Annotation[]) => Annotation[] }
  | { type: 'mutate'; payload: (prev: Annotation[]) => Annotation[] }
  | { type: 'undo' }
  | { type: 'redo' };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'commit':
      return { past: [...state.past, state.present], present: action.payload(state.present), future: [] };
    case 'mutate':
      return { ...state, present: action.payload(state.present) };
    case 'undo':
      if (state.past.length === 0) return state;
      return {
        past:    state.past.slice(0, -1),
        present: state.past[state.past.length - 1]!,
        future:  [state.present, ...state.future],
      };
    case 'redo':
      if (state.future.length === 0) return state;
      return {
        past:    [...state.past, state.present],
        present: state.future[0]!,
        future:  state.future.slice(1),
      };
  }
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
interface Props {
  siteId: string;
  fileName: string;
  imageUrl: string;
  onClose: () => void;
  // For multi-page PDFs: the page to open on (1-based). Defaults to 1.
  initialPage?: number;
  // Admin gets the right-side annotation registry; installers use the bottom card.
  isAdmin?: boolean;
}

interface AnnotatorCanvasProps extends Props {
  initialAnnotations: Annotation[];
}

function fitImage(imgW: number, imgH: number, canvasW: number, canvasH: number) {
  const scale = Math.min(canvasW / imgW, canvasH / imgH, 1);
  return { scale, x: (canvasW - imgW * scale) / 2, y: (canvasH - imgH * scale) / 2 };
}

function stageToImage(stageX: number, stageY: number, fit: { scale: number; x: number; y: number }) {
  return { x: (stageX - fit.x) / fit.scale, y: (stageY - fit.y) / fit.scale };
}

const MIN_STAGE_SCALE = 0.5;
const MAX_STAGE_SCALE = 8;
function clampStageScale(s: number) {
  return Math.max(MIN_STAGE_SCALE, Math.min(MAX_STAGE_SCALE, s));
}

// ─── Inner canvas ─────────────────────────────────────────────────────────────
function AnnotatorCanvas({ siteId, fileName, imageUrl, onClose, initialAnnotations, initialPage = 1, isAdmin = false }: AnnotatorCanvasProps) {
  const queryClient = useQueryClient();

  // ── PDF paging ────────────────────────────────────────────────────────────
  const pdfMode = isPdf(fileName);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const pdf = usePdfPage(pdfMode ? imageUrl : null, currentPage, 2.5);
  const numPages = pdf.numPages;

  // ── Tool & style state ──────────────────────────────────────────────────
  // Admins open in select mode so clicking a shape immediately opens it in the
  // registry; installers open ready to draw.
  const [tool,              setTool]              = useState<Tool>(isAdmin ? 'pointer' : 'draw');
  const [activeColor,       setActiveColor]       = useState<string>('#ef4444');
  const [activeStrokeWidth, setActiveStrokeWidth] = useState<number>(3);
  const [selectedId,        setSelectedId]        = useState<string | null>(null);
  const [draft,             setDraft]             = useState<Annotation | null>(null);
  const [canvasSize,        setCanvasSize]        = useState({ w: 800, h: 600 });

  // ── Stage zoom / pan (touch pinch, two-finger pan, wheel) ─────────────────
  const [stageScale, setStageScale] = useState(1);
  const [stagePos,   setStagePos]   = useState({ x: 0, y: 0 });
  // Refs mirror the transform so rapid touch/wheel handlers read fresh values
  const scaleRef = useRef(1);
  const posRef   = useRef({ x: 0, y: 0 });
  // Tracks an active multi-touch gesture so single-touch drawing is suppressed
  const gestureRef = useRef<{ active: boolean; lastDist: number; lastCenter: { x: number; y: number } | null }>({
    active: false, lastDist: 0, lastCenter: null,
  });

  const applyTransform = useCallback((scale: number, pos: { x: number; y: number }) => {
    scaleRef.current = scale;
    posRef.current = pos;
    setStageScale(scale);
    setStagePos(pos);
  }, []);

  const resetZoom = useCallback(() => applyTransform(1, { x: 0, y: 0 }), [applyTransform]);

  // Tracks whether the pointer is hovering an annotation — drives cursor style
  const [annHovered, setAnnHovered] = useState(false);

  // Attachment state
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  // Open gallery lightbox: list of urls + which one to show first
  const [galleryView, setGalleryView] = useState<{ urls: string[]; index: number } | null>(null);

  // Text tool — opens a centered modal at the tapped image coordinates
  const [textDraft, setTextDraft] = useState<{ imgX: number; imgY: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const dragStartImg  = useRef({ x: 0, y: 0 });

  // ── History ─────────────────────────────────────────────────────────────
  const [histState, dispatch] = useReducer(historyReducer, {
    past: [], present: initialAnnotations, future: [],
  });
  const annotations = histState.present;
  const canUndo = histState.past.length   > 0;
  const canRedo = histState.future.length > 0;

  // Stable helpers — updater runs inside the reducer against current state
  const commitFn = useCallback((updater: (prev: Annotation[]) => Annotation[]) => {
    dispatch({ type: 'commit', payload: updater });
  }, []);

  const mutateFn = useCallback((updater: (prev: Annotation[]) => Annotation[]) => {
    dispatch({ type: 'mutate', payload: updater });
  }, []);

  const undo = useCallback(() => { dispatch({ type: 'undo' }); setSelectedId(null); }, []);
  const redo = useCallback(() => { dispatch({ type: 'redo' }); setSelectedId(null); }, []);

  // Only annotations on the active page are shown/editable; the rest stay in
  // `present` untouched so a single save persists every page's markup.
  const visibleAnnotations = useMemo(
    () => (pdfMode ? annotations.filter(a => (a.page_number ?? 1) === currentPage) : annotations),
    [annotations, pdfMode, currentPage],
  );

  const goToPage = useCallback((page: number) => {
    const next = Math.min(Math.max(page, 1), numPages);
    // Unsaved markup for every page lives in `present` and is untouched here —
    // only the visible-page filter changes, so flipping back/forth is lossless.
    setCurrentPage(prev => (next === prev ? prev : next));
    setSelectedId(null);
    setDraft(null);
  }, [numPages]);

  // ── Image & canvas ──────────────────────────────────────────────────────
  // For PDFs the background is the rendered page (data URL); images load directly.
  const bgUrl = pdfMode ? (pdf.dataUrl ?? '') : imageUrl;
  const [image] = useImage(bgUrl, 'anonymous');

  useEffect(() => {
    function measure() {
      if (!containerRef.current) return;
      setCanvasSize({ w: containerRef.current.clientWidth, h: containerRef.current.clientHeight });
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const saveMutation = useMutation({
    mutationFn: () => saveFileAnnotations(siteId, fileName, annotations),
    onSuccess: () => {
      toast.success('Žymėjimai išsaugoti');
      void queryClient.invalidateQueries({ queryKey: ['annotations', siteId, fileName] });
      onClose();
    },
    onError: () => toast.error('Nepavyko išsaugoti žymėjimų'),
  });

  const imgFit = useMemo(
    () => (image ? fitImage(image.width, image.height, canvasSize.w, canvasSize.h) : { scale: 1, x: 0, y: 0 }),
    [image, canvasSize.w, canvasSize.h],
  );

  // ── Text confirmation ────────────────────────────────────────────────────
  const confirmText = useCallback(() => {
    const trimmed = textValue.trim();
    if (trimmed && textDraft) {
      commitFn(prev => [...prev, {
        id: uuidv4(), type: 'text',
        x: textDraft.imgX, y: textDraft.imgY,
        text: trimmed, color: activeColor, strokeWidth: activeStrokeWidth,
        page_number: currentPage,
      }]);
    }
    setTextDraft(null);
    setTextValue('');
  }, [textValue, textDraft, activeColor, activeStrokeWidth, commitFn, currentPage]);

  const cancelText = useCallback(() => {
    setTextDraft(null);
    setTextValue('');
  }, []);

  // ── Mouse handlers ───────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = e.target.getStage();
      const screenPos  = stage?.getPointerPosition();          // container-space (for HTML overlays)
      const contentPos = stage?.getRelativePointerPosition();  // content-space (zoom/pan aware)
      if (!screenPos || !contentPos) return;
      const { x: imgX, y: imgY } = stageToImage(contentPos.x, contentPos.y, imgFit);

      if (tool === 'pointer' || tool === 'eraser') { setSelectedId(null); return; }

      if (tool === 'check' || tool === 'warning') {
        commitFn(prev => [...prev, {
          id: uuidv4(), type: 'marker',
          x: imgX, y: imgY, color: markerColor(tool), icon: tool,
          page_number: currentPage,
        }]);
        return;
      }

      if (tool === 'text') {
        setTextValue('');
        setTextDraft({ imgX, imgY });
        return;
      }

      dragStartImg.current = { x: imgX, y: imgY };

      if (tool === 'draw') {
        setDraft({ id: uuidv4(), type: 'path', points: [imgX, imgY], color: activeColor, strokeWidth: activeStrokeWidth, page_number: currentPage });
        return;
      }

      setDraft({
        id: uuidv4(), type: tool,
        x: imgX, y: imgY, x2: imgX, y2: imgY,
        width: 0, height: 0, radiusX: 0, radiusY: 0,
        color: activeColor, strokeWidth: activeStrokeWidth,
        page_number: currentPage,
      });
    },
    [tool, imgFit, activeColor, activeStrokeWidth, commitFn, currentPage],
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!draft) return;
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const { x: imgX, y: imgY } = stageToImage(pos.x, pos.y, imgFit);
      const sx = dragStartImg.current.x;
      const sy = dragStartImg.current.y;

      if (draft.type === 'path') {
        setDraft(prev => prev ? { ...prev, points: [...(prev.points ?? []), imgX, imgY] } : null);
        return;
      }
      if (draft.type === 'arrow') {
        setDraft(prev => prev ? { ...prev, x2: imgX, y2: imgY } : null);
        return;
      }
      if (draft.type === 'rect') {
        setDraft(prev => prev ? {
          ...prev,
          x: Math.min(sx, imgX), y: Math.min(sy, imgY),
          width: Math.abs(imgX - sx), height: Math.abs(imgY - sy),
        } : null);
        return;
      }
      if (draft.type === 'ellipse') {
        setDraft(prev => prev ? {
          ...prev,
          x: (sx + imgX) / 2, y: (sy + imgY) / 2,
          radiusX: Math.abs(imgX - sx) / 2, radiusY: Math.abs(imgY - sy) / 2,
        } : null);
      }
    },
    [draft, imgFit],
  );

  const handleMouseUp = useCallback(() => {
    if (!draft) return;
    if (draft.type === 'path') {
      if ((draft.points ?? []).length >= 4) commitFn(prev => [...prev, draft]);
      setDraft(null); return;
    }
    if (draft.type === 'arrow') {
      const dx = (draft.x2 ?? 0) - (draft.x ?? 0);
      const dy = (draft.y2 ?? 0) - (draft.y ?? 0);
      if (Math.sqrt(dx * dx + dy * dy) > 3) commitFn(prev => [...prev, draft]);
      setDraft(null); return;
    }
    if (draft.type === 'rect') {
      if ((draft.width ?? 0) > 3 && (draft.height ?? 0) > 3) commitFn(prev => [...prev, draft]);
      setDraft(null); return;
    }
    if (draft.type === 'ellipse') {
      if ((draft.radiusX ?? 0) > 2 || (draft.radiusY ?? 0) > 2) commitFn(prev => [...prev, draft]);
      setDraft(null); return;
    }
    setDraft(null);
  }, [draft, commitFn]);

  // ── Touch gestures: pinch-to-zoom + two-finger pan ─────────────────────────
  // Single touch falls through to the drawing handlers; ≥2 touches drive zoom/pan.
  const handleTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length >= 2) {
      e.evt.preventDefault();
      gestureRef.current = { active: true, lastDist: 0, lastCenter: null };
      setDraft(null);
      return;
    }
    gestureRef.current.active = false;
    handleMouseDown(e);
  };

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length >= 2) {
      e.evt.preventDefault();
      gestureRef.current.active = true;
      const stage = e.target.getStage();
      if (!stage) return;
      const box = stage.container().getBoundingClientRect();
      const t1 = touches[0]!;
      const t2 = touches[1]!;
      const center = {
        x: (t1.clientX + t2.clientX) / 2 - box.left,
        y: (t1.clientY + t2.clientY) / 2 - box.top,
      };
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const g = gestureRef.current;
      if (g.lastCenter === null || g.lastDist === 0) {
        g.lastCenter = center;
        g.lastDist = dist;
        return;
      }
      const prevScale = scaleRef.current;
      const prevPos = posRef.current;
      const pointTo = {
        x: (center.x - prevPos.x) / prevScale,
        y: (center.y - prevPos.y) / prevScale,
      };
      const newScale = clampStageScale(prevScale * (dist / g.lastDist));
      const panDx = center.x - g.lastCenter.x;
      const panDy = center.y - g.lastCenter.y;
      applyTransform(newScale, {
        x: center.x - pointTo.x * newScale + panDx,
        y: center.y - pointTo.y * newScale + panDy,
      });
      g.lastDist = dist;
      g.lastCenter = center;
      return;
    }
    if (!gestureRef.current.active) handleMouseMove(e);
  };

  const handleTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length === 0) {
      if (!gestureRef.current.active) handleMouseUp();
      gestureRef.current = { active: false, lastDist: 0, lastCenter: null };
    } else {
      // A finger lifted mid-gesture — drop the baseline so the survivor doesn't jump
      gestureRef.current.lastCenter = null;
      gestureRef.current.lastDist = 0;
    }
  };

  // ── Desktop wheel zoom (anchored at cursor) ────────────────────────────────
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    const prevScale = scaleRef.current;
    const prevPos = posRef.current;
    const pointTo = {
      x: (pointer.x - prevPos.x) / prevScale,
      y: (pointer.y - prevPos.y) / prevScale,
    };
    const newScale = clampStageScale(e.evt.deltaY > 0 ? prevScale / 1.1 : prevScale * 1.1);
    applyTransform(newScale, {
      x: pointer.x - pointTo.x * newScale,
      y: pointer.y - pointTo.y * newScale,
    });
  };

  // ── Delete helpers ───────────────────────────────────────────────────────
  const eraseById = useCallback((id: string) => {
    commitFn(prev => prev.filter(a => a.id !== id));
    setSelectedId(s => s === id ? null : s);
  }, [commitFn]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commitFn(prev => prev.filter(a => a.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, commitFn]);

  // ── Attachment helpers ───────────────────────────────────────────────────
  // Remove a single attachment URL from the selected pin, and best-effort
  // delete the underlying file from storage.
  const removeAttachmentUrl = useCallback((url: string) => {
    if (!selectedId) return;
    mutateFn(prev => prev.map(a => a.id === selectedId
      ? { ...a, attachment_urls: (a.attachment_urls ?? []).filter(u => u !== url) }
      : a));
    void deleteAnnotationAttachment(url).catch(() => { /* non-fatal */ });
  }, [selectedId, mutateFn]);

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    // Multi-select: convert the FileList to an array so every chosen photo uploads.
    // The gallery input has no `accept` filter (to keep Android multi-select), so
    // ignore anything that isn't an image.
    const allFiles = Array.from(input.files ?? []);
    const files = allFiles.filter(f => f.type.startsWith('image/'));
    if (files.length === 0 || !selectedId) {
      if (allFiles.length > 0) toast.error('Pasirinkite nuotraukas (tik vaizdo failai).');
      input.value = '';
      return;
    }
    const capturedId = selectedId;

    // ── Enforce the 5-photo cap BEFORE any upload ──────────────────────────
    const currentCount = annotations.find(a => a.id === capturedId)?.attachment_urls?.length ?? 0;
    const slotsLeft = MAX_ATTACHMENTS - currentCount;
    if (slotsLeft <= 0) {
      toast.error(`Maksimaliai galima prisegti ${MAX_ATTACHMENTS} nuotraukas.`);
      input.value = '';
      return;
    }
    let filesToUpload = files;
    if (files.length > slotsLeft) {
      filesToUpload = files.slice(0, slotsLeft);
      toast.warning(`Prisegama tik ${slotsLeft} iš ${files.length} pasirinktų nuotraukų (limitas: ${MAX_ATTACHMENTS} nuotraukos).`);
    }

    setAttachmentUploading(true);
    try {
      // Upload SEQUENTIALLY (not Promise.all): uploading many large phone photos
      // in parallel holds every file in memory at once, which on mobile spikes RAM
      // hard enough that Android kills & reloads the page. One-at-a-time keeps the
      // footprint flat. Each file is appended as soon as it lands so progress shows.
      let uploadedCount = 0;
      for (const file of filesToUpload) {
        try {
          const url = await uploadAnnotationAttachment(siteId, capturedId, file);
          uploadedCount += 1;
          mutateFn(prev => prev.map(a => a.id === capturedId
            ? { ...a, attachment_urls: [...(a.attachment_urls ?? []), url] }
            : a));
        } catch {
          /* skip this file, keep going */
        }
        // Yield so the browser can paint and release transient memory between files.
        await new Promise(r => setTimeout(r, 0));
      }
      const failed = filesToUpload.length - uploadedCount;
      if (uploadedCount === 0) {
        toast.error('Nepavyko prisegti nuotraukos');
      } else if (failed > 0) {
        toast.warning(`Prisegta ${uploadedCount} iš ${filesToUpload.length} nuotraukų`);
      } else {
        toast.success(uploadedCount > 1 ? 'Nuotraukos prisegtos' : 'Nuotrauka prisegta');
      }
    } catch {
      toast.error('Nepavyko prisegti nuotraukos');
    } finally {
      setAttachmentUploading(false);
      input.value = ''; // reset whichever input (camera/gallery) fired so the same files can be re-picked
    }
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault(); redo(); return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); return; }
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, onClose, undo, redo]);

  // ── Rendering helpers ─────────────────────────────────────────────────────
  function toStageX(v: number) { return v * imgFit.scale + imgFit.x; }
  function toStageY(v: number) { return v * imgFit.scale + imgFit.y; }

  function renderAnnotation(ann: Annotation, isDraft = false) {
    const sel = ann.id === selectedId;
    const sw = ann.strokeWidth ?? 3;
    const strokeWidth = sel ? sw + 1.5 : sw;
    const opacity = isDraft ? 0.7 : 1;

    const handleClick = () => {
      if (tool === 'pointer') setSelectedId(ann.id);
      else if (tool === 'eraser') eraseById(ann.id);
    };
    const canInteract = !isDraft && (tool === 'pointer' || tool === 'eraser');
    const hoverProps = canInteract ? {
      onMouseEnter: () => setAnnHovered(true),
      onMouseLeave: () => setAnnHovered(false),
    } : {};
    const interactProps = isDraft ? {} : { onClick: handleClick, onTap: handleClick, ...hoverProps };

    if (ann.type === 'path' && ann.points) {
      const pts = ann.points.map((p, i) => i % 2 === 0 ? toStageX(p) : toStageY(p));
      return (
        <Line key={ann.id} points={pts} stroke={ann.color} strokeWidth={strokeWidth}
          tension={0.5} lineCap="round" lineJoin="round" opacity={opacity} {...interactProps} />
      );
    }

    if (ann.type === 'arrow' && ann.x != null && ann.y != null && ann.x2 != null && ann.y2 != null) {
      return (
        <KonvaArrow key={ann.id}
          points={[toStageX(ann.x), toStageY(ann.y), toStageX(ann.x2), toStageY(ann.y2)]}
          stroke={ann.color} fill={ann.color} strokeWidth={strokeWidth}
          pointerLength={Math.max(8, sw * 2.5)} pointerWidth={Math.max(6, sw * 2)}
          opacity={opacity} {...interactProps} />
      );
    }

    if (ann.type === 'rect' && ann.x != null && ann.y != null) {
      return (
        <KonvaRect key={ann.id}
          x={toStageX(ann.x)} y={toStageY(ann.y)}
          width={(ann.width ?? 0) * imgFit.scale} height={(ann.height ?? 0) * imgFit.scale}
          stroke={ann.color} strokeWidth={strokeWidth} fill="transparent"
          dash={sel ? [6, 3] : undefined} opacity={opacity} {...interactProps} />
      );
    }

    if (ann.type === 'ellipse' && ann.x != null && ann.y != null) {
      return (
        <KonvaEllipse key={ann.id}
          x={toStageX(ann.x)} y={toStageY(ann.y)}
          radiusX={(ann.radiusX ?? 0) * imgFit.scale} radiusY={(ann.radiusY ?? 0) * imgFit.scale}
          stroke={ann.color} strokeWidth={strokeWidth} fill="transparent"
          dash={sel ? [6, 3] : undefined} opacity={opacity} {...interactProps} />
      );
    }

    if (ann.type === 'text' && ann.x != null && ann.y != null) {
      const fontSize = Math.max(12, sw * 4);
      return (
        <KonvaText key={ann.id}
          x={toStageX(ann.x)} y={toStageY(ann.y)}
          text={ann.text ?? ''}
          fill={ann.color} fontSize={fontSize} fontStyle="bold"
          stroke={sel ? '#000' : undefined} strokeWidth={sel ? 0.3 : 0}
          opacity={opacity} {...interactProps} />
      );
    }

    if (ann.type === 'marker' && ann.x != null && ann.y != null) {
      const sx = toStageX(ann.x);
      const sy = toStageY(ann.y);
      const r = sel ? 16 : 13;
      const isCheck = ann.icon === 'check';
      const s = r / 11; // scale for the 24×24 icon space
      return (
        <Group key={ann.id} x={sx} y={sy} opacity={opacity}>
          {/* Background pill */}
          <KonvaCircle radius={r} fill={isCheck ? CHECK_BG : WARN_BG}
            stroke={sel ? '#ffffff' : undefined} strokeWidth={sel ? 2 : 0}
            shadowColor="black" shadowBlur={5} shadowOpacity={0.3} shadowOffsetY={1}
            {...interactProps} />
          {isCheck ? (
            <KonvaPath data={CHECK_PATH}
              stroke="white" strokeWidth={3} lineCap="round" lineJoin="round"
              scaleX={s} scaleY={s} x={-12 * s} y={-11.5 * s} listening={false} />
          ) : (
            <>
              {/* Exclamation: stem + dot */}
              <KonvaPath data="M12 6 L12 13"
                stroke="white" strokeWidth={3} lineCap="round"
                scaleX={s} scaleY={s} x={-12 * s} y={-12 * s} listening={false} />
              <KonvaCircle y={5 * s} radius={1.6 * s} fill="white" listening={false} />
            </>
          )}
        </Group>
      );
    }
    return null;
  }

  // Returns the canvas anchor point for a given annotation (used for the attachment dot indicator).
  function getAnchorPosition(ann: Annotation): { x: number; y: number } | null {
    if (ann.type === 'marker' && ann.x != null && ann.y != null)
      return { x: toStageX(ann.x) + 15, y: toStageY(ann.y) - 15 };
    if (ann.type === 'path' && ann.points && ann.points.length >= 2)
      return { x: toStageX(ann.points[0]!), y: toStageY(ann.points[1]!) };
    if (ann.type === 'arrow' && ann.x != null && ann.y != null)
      return { x: toStageX(ann.x), y: toStageY(ann.y) };
    if (ann.type === 'rect' && ann.x != null && ann.y != null)
      return { x: toStageX(ann.x) + (ann.width ?? 0) * imgFit.scale, y: toStageY(ann.y) };
    if (ann.type === 'ellipse' && ann.x != null && ann.y != null)
      return { x: toStageX(ann.x) + (ann.radiusX ?? 0) * imgFit.scale, y: toStageY(ann.y) - (ann.radiusY ?? 0) * imgFit.scale };
    if (ann.type === 'text' && ann.x != null && ann.y != null)
      return { x: toStageX(ann.x), y: toStageY(ann.y) - 8 };
    return null;
  }

  function renderAttachmentIndicator(ann: Annotation) {
    const pos = getAnchorPosition(ann);
    if (!pos) return null;
    const badgeR = 9;
    const cs = (badgeR * 1.5) / 24; // scale lucide 24×24 camera into the badge
    return (
      <Group key={`${ann.id}-att`} x={pos.x + 6} y={pos.y - 6} listening={false}>
        <KonvaCircle radius={badgeR} fill="#18181b" stroke="#ffffff" strokeWidth={1.4}
          shadowColor="black" shadowBlur={3} shadowOpacity={0.4} />
        <KonvaPath data={CAMERA_BODY}
          stroke="white" strokeWidth={2} strokeScaleEnabled={false}
          scaleX={cs} scaleY={cs} x={-12 * cs} y={-12 * cs} listening={false} />
        {/* Camera lens */}
        <KonvaCircle y={cs} radius={3 * cs} stroke="white" strokeWidth={2} strokeScaleEnabled={false} listening={false} />
      </Group>
    );
  }

  const selectedAnnotation = annotations.find(a => a.id === selectedId);

  // Comment + photo editor, shared by the mobile bottom card and the admin
  // registry accordion. Only ever rendered for the currently-selected pin, so
  // the attachment handlers (keyed on `selectedId`) operate on this annotation.
  function renderEditorBody(ann: Annotation) {
    return (
      <>
        <p className="text-white/60 text-[11px] uppercase tracking-wider font-bold">Komentaras</p>
        <textarea
          className="flex-1 min-h-[100px] bg-white/10 text-white text-[13px] rounded-lg p-2.5 border border-white/20 resize-none focus:outline-none focus:border-primary/60 placeholder:text-white/30"
          placeholder="Įrašyti pastabą..."
          value={ann.comment ?? ''}
          onChange={(e) => {
            const comment = e.target.value;
            mutateFn(prev => prev.map(a => a.id === ann.id ? { ...a, comment } : a));
          }}
        />

        {/* Photo attachments — gallery grid + always-visible upload box */}
        <div className="border-t border-white/10 pt-3 flex flex-col gap-2">
          <p className="text-white/60 text-[11px] uppercase tracking-wider font-bold">
            Nuotraukos{(ann.attachment_urls?.length ?? 0) > 0 ? ` (${ann.attachment_urls!.length})` : ''}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(ann.attachment_urls ?? []).map((url, i) => (
              <div key={url} className="relative rounded-lg overflow-hidden ring-1 ring-white/20 aspect-square">
                <img
                  src={url}
                  alt="Prisegta nuotrauka"
                  className="w-full h-full object-cover block cursor-pointer active:opacity-80 transition-opacity"
                  onClick={() => setGalleryView({ urls: ann.attachment_urls ?? [], index: i })}
                />
                <button
                  onClick={() => removeAttachmentUrl(url)}
                  title="Pašalinti nuotrauką"
                  className="absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-danger transition-colors cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Split action — native <label htmlFor> mapping (NOT a programmatic
              ref.click()). Triggering the picker through a real label keeps the
              browser's full file-picker privileges, so mobile honours `multiple`.
              Hidden entirely once the 5-photo cap is reached so the picker can't
              even be opened when the slots are full. */}
          {(ann.attachment_urls?.length ?? 0) >= MAX_ATTACHMENTS ? (
            <p className="text-[12px] text-white/40 italic text-center py-1">
              Pasiektas {MAX_ATTACHMENTS} nuotraukų limitas.
            </p>
          ) : (
            <div className="flex gap-2">
              {/* Camera: single capture */}
              <label htmlFor={`camera-upload-${ann.id}`} title="Nufotografuoti"
                className={`flex-1 h-10 rounded-card bg-primary text-white font-semibold text-[13px] flex items-center justify-center gap-2 active:scale-95 transition-transform cursor-pointer ${attachmentUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {attachmentUploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                Nufotografuoti
              </label>
              <input
                id={`camera-upload-${ann.id}`}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { void handleAttachmentUpload(e); }}
              />

              {/* Gallery: multi-select. Deliberately NO `accept` filter — on Android,
                  `accept="image/*"` routes the picker to Google Photos, which ignores
                  `multiple` and returns a single image. Omitting it makes Chrome open
                  the Documents/Files picker that honours multi-select. Non-image files
                  are filtered out in handleAttachmentUpload. */}
              <label htmlFor={`gallery-upload-${ann.id}`} title="Galerija"
                className={`flex-1 h-10 rounded-card bg-white/10 text-white font-semibold text-[13px] flex items-center justify-center gap-2 hover:bg-white/15 active:scale-95 transition-all cursor-pointer ${attachmentUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                <ImageIcon size={16} />
                Galerija
              </label>
              <input
                id={`gallery-upload-${ann.id}`}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { void handleAttachmentUpload(e); }}
              />
            </div>
          )}
        </div>

        <button onClick={deleteSelected}
          className="flex items-center justify-center gap-2 h-9 rounded-lg bg-danger/80 text-white text-[13px] font-semibold hover:bg-danger transition-colors cursor-pointer">
          <Trash2 size={14} />
          Ištrinti
        </button>
      </>
    );
  }

  // Registry list shows EVERY annotation on the active page (markers, text, shapes).
  const registryItems = visibleAnnotations;

  // Icon, tint and fallback label for a registry row.
  function registryMeta(ann: Annotation): { Icon: React.ElementType; tint: string; label: string } {
    switch (ann.type) {
      case 'marker':
        return ann.icon === 'check'
          ? { Icon: CheckCircle2, tint: 'text-success', label: 'Gerai' }
          : { Icon: AlertTriangle, tint: 'text-warning', label: 'Dėmesio' };
      case 'text':    return { Icon: Type,        tint: 'text-info',  label: 'Tekstas' };
      case 'arrow':   return { Icon: ArrowUpRight, tint: 'text-white/70', label: 'Rodyklė' };
      case 'rect':    return { Icon: Square,       tint: 'text-white/70', label: 'Stačiakampis' };
      case 'ellipse': return { Icon: CircleIcon,   tint: 'text-white/70', label: 'Elipsė' };
      case 'path':    return { Icon: Pencil,       tint: 'text-white/70', label: 'Piešinys' };
      default:        return { Icon: Pencil,       tint: 'text-white/70', label: 'Žymėjimas' };
    }
  }

  const TOOLS: { id: Tool; Icon: React.ElementType; label: string }[] = [
    { id: 'pointer', Icon: MousePointer, label: 'Žymiklis'       },
    { id: 'draw',    Icon: Pencil,       label: 'Piešti laisvai' },
    { id: 'arrow',   Icon: ArrowUpRight, label: 'Rodyklė'        },
    { id: 'rect',    Icon: Square,       label: 'Stačiakampis'   },
    { id: 'ellipse', Icon: CircleIcon,   label: 'Elipsė'         },
    { id: 'text',    Icon: Type,         label: 'Tekstas'        },
    { id: 'eraser',  Icon: Eraser,       label: 'Trintukas'      },
  ];
  const MARKERS: { id: Tool; Icon: React.ElementType; label: string }[] = [
    { id: 'check',   Icon: CheckCircle2,  label: 'Gerai'   },
    { id: 'warning', Icon: AlertTriangle, label: 'Dėmesio' },
  ];

  const stageCursor =
    annHovered && (tool === 'pointer' || tool === 'eraser') ? 'pointer'
    : tool === 'eraser'  ? 'cell'
    : tool === 'draw'    ? 'crosshair'
    : tool === 'text'    ? 'text'
    : tool === 'pointer' ? 'default'
    : 'crosshair';

  const showColorBar = ['draw', 'arrow', 'rect', 'ellipse', 'text'].includes(tool);

  return (
    <div className="fixed inset-0 z-[9999] w-full h-full bg-surface overflow-hidden">
      {/* ── Island 1: floating top navigation ───────────────────────────── */}
      <button onClick={onClose} title="Atgal"
        className="pointer-events-auto absolute top-4 left-4 z-50 flex items-center gap-2 bg-surface/90 backdrop-blur-md text-white shadow-xl rounded-full pl-3 pr-4 py-2 active:scale-95 transition-transform">
        <ArrowLeft size={18} strokeWidth={2.4} />
        <span className="font-semibold text-sm">Atgal</span>
      </button>
      <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} title="Išsaugoti"
        className="pointer-events-auto absolute top-4 right-4 z-50 flex items-center gap-2 bg-surface/90 backdrop-blur-md text-white shadow-xl rounded-full px-4 py-2 active:scale-95 transition-transform disabled:opacity-60">
        {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} strokeWidth={2.4} />}
        <span className="font-semibold text-sm">Išsaugoti</span>
      </button>

      {/* Zoom level / reset — appears when the canvas is scaled.
          Shifts down on multi-page PDFs to clear the pagination island. */}
      {Math.abs(stageScale - 1) > 0.01 && (
        <button onClick={resetZoom} title="Atstatyti mastelį"
          className={`pointer-events-auto absolute left-1/2 -translate-x-1/2 z-50 h-9 px-3 rounded-full bg-surface/90 backdrop-blur-md text-white text-[12px] font-mono font-bold shadow-xl active:scale-95 cursor-pointer ${
            pdfMode && numPages > 1 ? 'top-[4.5rem]' : 'top-4'
          }`}>
          {Math.round(stageScale * 100)}%
        </button>
      )}

      {/* ── PDF pagination island ──────────────────────────────────────────── */}
      {pdfMode && numPages > 1 && (
        <div className="pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-surface/90 backdrop-blur-md text-white shadow-2xl rounded-full px-1.5 py-1.5 ring-1 ring-white/10">
          <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}
            title="Ankstesnis lapas"
            className="w-11 h-11 flex items-center justify-center rounded-full transition-colors disabled:opacity-30 enabled:active:bg-white/15 enabled:hover:bg-white/10">
            <ChevronLeft size={24} strokeWidth={2.6} />
          </button>
          <span className="px-2 min-w-[92px] text-center text-[13px] font-bold tabular-nums select-none">
            Lapas {currentPage} iš {numPages}
          </span>
          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages}
            title="Kitas lapas"
            className="w-11 h-11 flex items-center justify-center rounded-full transition-colors disabled:opacity-30 enabled:active:bg-white/15 enabled:hover:bg-white/10">
            <ChevronRight size={24} strokeWidth={2.6} />
          </button>
        </div>
      )}

      {/* PDF page render spinner */}
      {pdfMode && pdf.loading && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-white/80 animate-spin" />
        </div>
      )}

      {/* ── Island 2: floating vertical tool palette ────────────────────── */}
      <div className="pointer-events-auto absolute left-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2 bg-surface/90 backdrop-blur-md p-2 rounded-full shadow-2xl ring-1 ring-white/10">
        {[...TOOLS.filter(t => t.id !== 'eraser'), ...MARKERS].map(({ id, Icon, label }) => (
          <button key={id} onClick={() => setTool(id)} title={label}
            className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
              tool === id ? 'bg-primary text-white' : 'text-subtle hover:text-white hover:bg-white/10'
            }`}>
            <Icon size={22} strokeWidth={2.1} />
          </button>
        ))}
      </div>

      {/* ── Base layer: fullscreen canvas ────────────────────────────────── */}
      <div ref={containerRef} className="absolute inset-0 z-0 overflow-hidden" style={{ cursor: stageCursor, touchAction: 'none' }}>
        <Stage
          width={canvasSize.w} height={canvasSize.h}
          scaleX={stageScale} scaleY={stageScale}
          x={stagePos.x} y={stagePos.y}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        >
          <Layer>
            {image && (
              <KonvaImage image={image}
                x={imgFit.x} y={imgFit.y}
                width={image.width * imgFit.scale} height={image.height * imgFit.scale} />
            )}
            {visibleAnnotations.map(ann => renderAnnotation(ann))}
            {visibleAnnotations.map(ann => (ann.attachment_urls?.length ?? 0) > 0 ? renderAttachmentIndicator(ann) : null)}
            {draft && renderAnnotation(draft, true)}
          </Layer>
        </Stage>
      </div>

      {/* File inputs now live inside renderEditorBody, mapped to their visible
          <label> controls via htmlFor — no programmatic ref.click() needed. */}

      {/* ── Admin: right-side annotation registry ─────────────────────────── */}
      {isAdmin && (
        <div className="pointer-events-auto absolute right-4 top-20 bottom-6 w-[350px] z-[9999] flex flex-col bg-surface/95 backdrop-blur-xl rounded-card shadow-2xl overflow-hidden border border-border">
          <div className="px-4 py-3 border-b border-border shrink-0">
            <p className="text-white font-bold text-sm">Pastabų registras</p>
            <p className="text-white/50 text-[11px]">
              {registryItems.length > 0 ? `${registryItems.length} žym. šiame lape` : 'Žymėjimų šiame lape nėra'}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {registryItems.length === 0 ? (
              <p className="text-white/40 text-[12px] text-center px-4 py-8">
                Pažymėkite ką nors brėžinyje, kad jis atsirastų sąraše.
              </p>
            ) : (
              registryItems.map((ann) => {
                const isSel = ann.id === selectedId;
                const { Icon, tint, label } = registryMeta(ann);
                const note = ann.type === 'text' ? ann.text?.trim() : ann.comment?.trim();
                const primary = note || label;
                const photoCount = ann.attachment_urls?.length ?? 0;
                return (
                  <div key={ann.id}
                    className={`rounded-card border transition-colors ${isSel ? 'border-primary/60 bg-white/[0.06]' : 'border-white/10 hover:border-white/20'}`}>
                    <button
                      onClick={() => { setTool('pointer'); setSelectedId(isSel ? null : ann.id); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer">
                      <Icon size={20} className={`shrink-0 ${tint}`} />
                      <span className={`flex-1 truncate text-[13px] ${note ? 'text-white' : 'text-white/40 italic'}`}>
                        {primary}
                      </span>
                      {photoCount > 0 && (
                        <span className="shrink-0 flex items-center gap-1 text-white/60 text-[11px] font-semibold">
                          <Camera size={12} />{photoCount}
                        </span>
                      )}
                    </button>
                    {isSel && (
                      <div className="px-3 pb-3 pt-3 border-t border-white/10 flex flex-col gap-3">
                        {renderEditorBody(ann)}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Mobile: floating properties card — comment + photos ───────────── */}
      {!isAdmin && tool === 'pointer' && selectedAnnotation && (
        <div className="pointer-events-auto absolute z-50 inset-x-3 bottom-24 max-h-[55%] md:inset-x-auto md:right-4 md:top-20 md:bottom-24 md:w-[300px] md:max-h-[calc(100vh-7rem)] overflow-y-auto rounded-3xl bg-surface/95 backdrop-blur-md shadow-2xl ring-1 ring-white/10 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-white/60 text-[11px] uppercase tracking-wider font-bold">Žymėjimas</p>
            <button
              onClick={() => setSelectedId(null)}
              className="text-white/60 hover:text-white p-1 -mr-1 cursor-pointer"
              title="Uždaryti"
            >
              <X size={16} />
            </button>
          </div>
          {renderEditorBody(selectedAnnotation)}
        </div>
      )}

      {/* ── Island 3: contextual colors + stroke (drawing/text tools only) ─ */}
      {showColorBar && (
        <div className="pointer-events-auto absolute bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 max-w-[calc(100vw-2rem)] overflow-x-auto scrollbar-hide bg-surface/90 backdrop-blur-md p-3 rounded-full shadow-2xl ring-1 ring-white/10">
          {PALETTE.map(({ color, label }) => (
            <button key={color} title={label} onClick={() => setActiveColor(color)}
              style={{ background: color }}
              className={`shrink-0 w-8 h-8 rounded-full transition-transform active:scale-95 cursor-pointer ${
                activeColor === color ? 'ring-[3px] ring-white ring-offset-2 ring-offset-zinc-950' : 'ring-1 ring-white/25'
              }`} />
          ))}
          <div className="shrink-0 w-px h-7 bg-white/15" />
          {STROKE_OPTIONS.map(({ value, label }) => (
            <button key={value} title={label} onClick={() => setActiveStrokeWidth(value)}
              className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                activeStrokeWidth === value ? 'bg-surface-2 ring-1 ring-white/40' : 'bg-white/5 hover:bg-white/10'
              }`}>
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                <line x1="2" y1="7" x2="16" y2="7" stroke="white"
                  strokeWidth={value === 2 ? 1.5 : value === 4 ? 2.8 : 4.5} strokeLinecap="round" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* ── Island 4: action bar (Undo / Redo / Eraser) ───────────────────── */}
      {!(!isAdmin && tool === 'pointer' && selectedAnnotation) && (
        <div className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-stretch gap-1.5 bg-surface/90 backdrop-blur-md rounded-full shadow-2xl px-2.5 py-2 ring-1 ring-white/10">
          <button onClick={undo} disabled={!canUndo} title="Atšaukti"
            className={`flex flex-col items-center justify-center gap-0.5 w-[68px] py-2 rounded-card transition-colors ${
              canUndo ? 'text-white active:bg-white/15' : 'text-white/25'
            }`}>
            <Undo2 size={22} strokeWidth={2.4} />
            <span className="text-[11px] font-bold leading-none">Atšaukti</span>
          </button>

          <button onClick={redo} disabled={!canRedo} title="Grąžinti"
            className={`flex flex-col items-center justify-center gap-0.5 w-[68px] py-2 rounded-card transition-colors ${
              canRedo ? 'text-white active:bg-white/15' : 'text-white/25'
            }`}>
            <Redo2 size={22} strokeWidth={2.4} />
            <span className="text-[11px] font-bold leading-none">Grąžinti</span>
          </button>

          <div className="w-px bg-white/15 my-1.5" />

          <button onClick={() => setTool('eraser')} title="Trintukas"
            className={`flex flex-col items-center justify-center gap-0.5 w-[68px] py-2 rounded-card transition-colors ${
              tool === 'eraser' ? 'bg-primary text-white' : 'text-white active:bg-white/15'
            }`}>
            <Eraser size={22} strokeWidth={2.4} />
            <span className="text-[11px] font-bold leading-none">Trintukas</span>
          </button>
        </div>
      )}

      {/* ── Text entry modal — centered, keyboard-safe ───────────────────── */}
      {textDraft && (
        <div
          className="pointer-events-auto absolute inset-0 z-[200] flex items-start justify-center pt-[14vh] px-4 bg-black/60 backdrop-blur-sm"
          onClick={cancelText}
        >
          <div
            className="w-full max-w-sm rounded-card bg-surface ring-1 ring-white/10 shadow-2xl p-4 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white font-bold text-base">Pridėti tekstą</p>
            <textarea
              ref={textareaRef}
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="Įveskite tekstą..."
              rows={3}
              className="w-full resize-none rounded-card bg-white/10 text-white text-[15px] p-3 border border-white/20 focus:outline-none focus:border-primary placeholder:text-white/40"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); confirmText(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelText(); }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={cancelText}
                className="flex-1 h-11 rounded-card bg-white/10 text-white font-semibold text-sm active:scale-95 transition-transform"
              >
                Atšaukti
              </button>
              <button
                onClick={confirmText}
                disabled={!textValue.trim()}
                className="flex-1 h-11 rounded-card bg-primary text-white font-bold text-sm active:scale-95 transition-transform disabled:opacity-40"
              >
                Pridėti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox for attachment photos — supports cycling through the gallery */}
      {galleryView && (
        <ImageLightbox
          urls={galleryView.urls}
          index={galleryView.index}
          alt="Prisegta nuotrauka"
          onClose={() => setGalleryView(null)}
        />
      )}
    </div>
  );
}

// ─── Outer loader shell ───────────────────────────────────────────────────────
export default function ImageAnnotator({ siteId, fileName, imageUrl, onClose, initialPage = 1, isAdmin = false }: Props) {
  const { isLoading, data } = useQuery({
    queryKey: ['annotations', siteId, fileName],
    queryFn: () => getFileAnnotations(siteId, fileName),
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black w-screen h-screen">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  return (
    <AnnotatorCanvas
      siteId={siteId} fileName={fileName} imageUrl={imageUrl}
      onClose={onClose} initialAnnotations={data ?? []} initialPage={initialPage} isAdmin={isAdmin} />
  );
}
