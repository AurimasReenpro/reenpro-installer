import { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this to a hashed URL for the worker bundle.
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export function isPdf(name: string): boolean {
  return name.split('.').pop()?.toLowerCase() === 'pdf';
}

// Cache document load promises per URL so flipping pages doesn't refetch/reparse.
const docCache = new Map<string, Promise<pdfjsLib.PDFDocumentProxy>>();

function loadDoc(url: string): Promise<pdfjsLib.PDFDocumentProxy> {
  let promise = docCache.get(url);
  if (!promise) {
    promise = pdfjsLib.getDocument(url).promise;
    docCache.set(url, promise);
  }
  return promise;
}

export interface RenderedPdfPage {
  dataUrl: string;
  numPages: number;
  width: number;
  height: number;
}

// Renders a single PDF page to a PNG data URL. `scale` trades sharpness for memory.
export async function renderPdfPage(url: string, pageNumber: number, scale = 2): Promise<RenderedPdfPage> {
  const doc = await loadDoc(url);
  const page = await doc.getPage(Math.min(Math.max(pageNumber, 1), doc.numPages));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return {
    dataUrl: canvas.toDataURL('image/png'),
    numPages: doc.numPages,
    width: canvas.width,
    height: canvas.height,
  };
}

export interface UsePdfPageResult {
  dataUrl: string | null;
  numPages: number;
  loading: boolean;
  error: boolean;
}

// Renders `pageNumber` of the PDF at `url` to a data URL. Pass url=null to disable.
export function usePdfPage(url: string | null, pageNumber: number, scale = 2): UsePdfPageResult {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    // State updates live inside this async fn (a nested scope) so they run as
    // effects of the render task, not synchronously in the effect body.
    void (async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await renderPdfPage(url, pageNumber, scale);
        if (cancelled) return;
        setDataUrl(res.dataUrl);
        setNumPages(res.numPages);
      } catch {
        if (cancelled) return;
        setDataUrl(null);
        setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [url, pageNumber, scale]);

  return { dataUrl, numPages, loading, error };
}
