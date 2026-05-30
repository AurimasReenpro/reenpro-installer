import { ChevronLeft, ChevronRight, Loader2, FileText } from 'lucide-react';
import { usePdfPage } from '../../lib/pdf';

interface PdfPagePreviewProps {
  url: string;
  page: number;
  onPageChange: (page: number) => void;
  // Classes applied to the rendered <img> (sizing/aspect handled by parent).
  className?: string;
}

// Renders one page of a PDF as an image plus a touch-friendly pagination island.
// Controlled: the parent owns the current `page` so it can pass it to the annotator.
export default function PdfPagePreview({ url, page, onPageChange, className }: PdfPagePreviewProps) {
  const { dataUrl, numPages, loading, error } = usePdfPage(url, page, 2);

  const go = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), numPages);
    if (clamped !== page) onPageChange(clamped);
  };

  return (
    <>
      {error ? (
        <div className={`flex flex-col items-center justify-center gap-2 text-[#7c7484] ${className ?? ''}`}>
          <FileText className="w-8 h-8" />
          <span className="text-xs font-medium">Nepavyko atvaizduoti PDF</span>
        </div>
      ) : dataUrl ? (
        <img src={dataUrl} alt={`PDF lapas ${page}`} className={className} />
      ) : (
        <div className={`flex items-center justify-center ${className ?? ''}`}>
          <Loader2 className="w-7 h-7 text-primary animate-spin" />
        </div>
      )}

      {/* Loading overlay while flipping to an already-sized page */}
      {loading && dataUrl && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
          <Loader2 className="w-7 h-7 text-primary animate-spin" />
        </div>
      )}

      {numPages > 1 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 bg-zinc-950/90 backdrop-blur-md text-white shadow-xl rounded-full px-1 py-1 ring-1 ring-white/10 transition-opacity duration-200 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
          <button onClick={() => go(page - 1)} disabled={page <= 1}
            title="Ankstesnis lapas"
            className="w-9 h-9 flex items-center justify-center rounded-full transition-colors disabled:opacity-30 enabled:active:bg-white/20 enabled:hover:bg-white/10">
            <ChevronLeft size={20} strokeWidth={2.6} />
          </button>
          <span className="px-2 min-w-[78px] text-center text-[12px] font-bold tabular-nums select-none">
            Lapas {page} iš {numPages}
          </span>
          <button onClick={() => go(page + 1)} disabled={page >= numPages}
            title="Kitas lapas"
            className="w-9 h-9 flex items-center justify-center rounded-full transition-colors disabled:opacity-30 enabled:active:bg-white/20 enabled:hover:bg-white/10">
            <ChevronRight size={20} strokeWidth={2.6} />
          </button>
        </div>
      )}
    </>
  );
}
