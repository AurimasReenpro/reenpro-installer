import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Loader2, Download } from 'lucide-react';
import { usePdfPage } from '../../lib/pdf';

interface Props {
  /** Single-image mode (back-compat). */
  url?: string;
  /** Gallery mode — cycle through multiple images with arrows. */
  urls?: string[];
  /** Initial index when in gallery mode. */
  index?: number;
  /** PDF mode — render & paginate this PDF in full screen. */
  pdfUrl?: string;
  /** PDF mode starting page (1-based). */
  initialPage?: number;
  /** Original storage URL of the file (the real PDF/image, not a rendered page) — used for the download button. */
  originalFileUrl?: string;
  alt?: string;
  onClose: () => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.5;

export default function ImageLightbox({ url, urls, index = 0, pdfUrl, initialPage = 1, originalFileUrl, alt, onClose }: Props) {
  const isPdfMode = !!pdfUrl;

  const images = useMemo(() => (urls && urls.length ? urls : url ? [url] : []), [urls, url]);
  const [cur, setCur] = useState(() => Math.min(Math.max(index, 0), Math.max(images.length - 1, 0)));

  // PDF mode renders pages on demand (higher scale for crisp full-screen zoom).
  const [page, setPage] = useState(() => Math.max(initialPage, 1));
  const pdf = usePdfPage(pdfUrl ?? null, page, 3);
  const numPages = pdf.numPages;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragOrigin = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const showNav = isPdfMode ? numPages > 1 : images.length > 1;
  const currentUrl = isPdfMode ? (pdf.dataUrl ?? '') : (images[Math.min(cur, images.length - 1)] ?? '');

  const clamp = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

  const goPrev = useCallback(() => {
    if (isPdfMode) {
      setPage(p => Math.max(1, p - 1));
      setZoom(1); setPan({ x: 0, y: 0 });
      return;
    }
    if (images.length < 2) return;
    setCur(c => (c - 1 + images.length) % images.length);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [isPdfMode, images.length]);

  const goNext = useCallback(() => {
    if (isPdfMode) {
      setPage(p => Math.min(numPages, p + 1));
      setZoom(1); setPan({ x: 0, y: 0 });
      return;
    }
    if (images.length < 2) return;
    setCur(c => (c + 1) % images.length);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [isPdfMode, numPages, images.length]);

  const changeZoom = useCallback((delta: number) => {
    setZoom(z => {
      const next = clamp(z + delta);
      // Pan is meaningless at base zoom — reset it together with the zoom setter
      // so both state updates land in the same React batch.
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Download the ORIGINAL file (real PDF/image), never the rendered PDF page data URL.
  const downloadUrl = originalFileUrl ?? (isPdfMode ? pdfUrl : currentUrl);
  const handleDownload = useCallback(async () => {
    if (!downloadUrl) return;
    const fileName = downloadUrl.split('?')[0]?.split('/').pop() || 'download';
    try {
      const res = await fetch(downloadUrl);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // CORS or network failure — open in a new tab so the user can save manually.
      window.open(downloadUrl, '_blank', 'noopener');
    }
  }, [downloadUrl]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if ((e.key === '+' || e.key === '=') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); changeZoom(ZOOM_STEP); }
      if (e.key === '-' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); changeZoom(-ZOOM_STEP); }
      if (e.key === '0') resetView();
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, changeZoom, resetView, goPrev, goNext]);

  // Non-passive wheel handler so we can control zoom without triggering page scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(z => clamp(z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    dragging.current = true;
    dragOrigin.current = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y };
    e.preventDefault();
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPan({
      x: dragOrigin.current.panX + (e.clientX - dragOrigin.current.mouseX),
      y: dragOrigin.current.panY + (e.clientY - dragOrigin.current.mouseY),
    });
  };

  const stopDrag = () => { dragging.current = false; };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center overflow-hidden"
      onClick={onClose}
    >
      {/* Image — click does NOT propagate to backdrop */}
      <div
        className="relative select-none"
        style={{ cursor: zoom > 1 ? 'grab' : 'default' }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      >
        {isPdfMode && !currentUrl ? (
          <div className="flex items-center justify-center w-[80vw] h-[80vh]">
            <Loader2 size={40} className="text-white/80 animate-spin" />
          </div>
        ) : (
          <img
            src={currentUrl}
            alt={alt ?? ''}
            draggable={false}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              maxHeight: '90vh',
              maxWidth: '90vw',
              display: 'block',
            }}
          />
        )}
      </div>

      {/* Toolbar — top right */}
      <div
        className="absolute top-4 right-4 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => changeZoom(-ZOOM_STEP)}
          title="Sumažinti (−)"
          className="w-9 h-9 rounded-[8px] bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/25 transition-colors cursor-pointer"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={resetView}
          title="Atstatyti rodinį (0)"
          className="h-9 px-3 rounded-[8px] bg-white/10 backdrop-blur-sm text-white text-[13px] font-mono hover:bg-white/25 transition-colors min-w-[52px] text-center cursor-pointer"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => changeZoom(ZOOM_STEP)}
          title="Padidinti (+)"
          className="w-9 h-9 rounded-[8px] bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/25 transition-colors cursor-pointer"
        >
          <ZoomIn size={16} />
        </button>
        <div className="w-px h-6 bg-white/20 mx-1" />
        {downloadUrl && (
          <button
            onClick={() => void handleDownload()}
            title="Atsisiųsti"
            className="w-9 h-9 rounded-[8px] bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/25 transition-colors cursor-pointer"
          >
            <Download size={16} />
          </button>
        )}
        <button
          onClick={onClose}
          title="Uždaryti (Esc)"
          className="w-9 h-9 rounded-[8px] bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/25 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      {/* Gallery navigation — only when more than one image */}
      {showNav && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            title="Ankstesnė (←)"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/25 transition-colors cursor-pointer"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            title="Kita (→)"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/25 transition-colors cursor-pointer"
          >
            <ChevronRight size={24} />
          </button>
          <div
            className="absolute bottom-12 left-1/2 -translate-x-1/2 px-3 h-7 rounded-full bg-white/10 backdrop-blur-sm text-white text-[12px] font-semibold flex items-center pointer-events-none select-none whitespace-nowrap"
          >
            {isPdfMode ? `Lapas ${page} iš ${numPages}` : `${cur + 1} / ${images.length}`}
          </div>
        </>
      )}

      {/* Hint bar */}
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/25 text-[11px] pointer-events-none select-none whitespace-nowrap">
        Scroll — zoom &nbsp;·&nbsp; Drag — pan{showNav ? ' · ←/→ — naršyti' : ''} &nbsp;·&nbsp; Esc — uždaryti
      </p>
    </div>
  );
}
