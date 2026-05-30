import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Camera, ZoomIn, Plus, X, DraftingCompass } from 'lucide-react';
import { toast } from 'sonner';
import { getSiteFiles, uploadBlueprintFile, groupBlueprints, addBlueprintCategory } from '../../../api/sites';
import ImageAnnotator from '../../../components/shared/ImageAnnotator';
import ImageLightbox from '../../../components/shared/ImageLightbox';
import PdfPagePreview from '../../../components/shared/PdfPagePreview';
import { isPdf } from '../../../lib/pdf';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
const isImage = (name: string) => IMAGE_EXTS.includes(name.split('.').pop()?.toLowerCase() ?? '');
const isPreviewable = (name: string) => isImage(name) || isPdf(name);

interface BlueprintsTabProps {
  siteId: string;
  categories?: string[] | null;
}

interface BlueprintFile {
  name: string;
  url: string;
  page?: number;
}

export default function BlueprintsTab({ siteId, categories }: BlueprintsTabProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [annotatingFile, setAnnotatingFile] = useState<BlueprintFile | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxPdf, setLightboxPdf] = useState<{ url: string; page: number } | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [uploadTargetCategory, setUploadTargetCategory] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  // Active page per category, so the annotator/lightbox open on the page shown.
  const [pageByCategory, setPageByCategory] = useState<Record<string, number>>({});

  const { data: files, isLoading } = useQuery({
    queryKey: ['site_files', siteId],
    queryFn: () => getSiteFiles(siteId),
    enabled: !!siteId,
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: ({ category, file }: { category: string; file: File }) =>
      uploadBlueprintFile(siteId, category, file),
    onSuccess: () => {
      toast.success('Brėžinys įkeltas!');
      setUploadingCategory(null);
      void queryClient.invalidateQueries({ queryKey: ['site_files', siteId] });
    },
    onError: (err: unknown) => {
      setUploadingCategory(null);
      toast.error(err instanceof Error ? err.message : 'Nepavyko įkelti failo.');
    },
  });

  const addCategoryMutation = useMutation({
    mutationFn: (name: string) => addBlueprintCategory(siteId, name),
    onSuccess: () => {
      setCategoryName('');
      setShowCategoryModal(false);
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const blueprints = groupBlueprints(files ?? []);
  // Persisted placeholder categories (from admin) ∪ categories derived from
  // uploaded files, deduped so installers see empty slots ready to fill.
  const displayCategories = [
    ...new Set<string>([
      ...(categories ?? []),
      ...blueprints.map((b) => b.category),
    ]),
  ];
  const blueprintByCategory = (category: string) =>
    blueprints.find((b) => b.category === category)?.file;

  const pickBlueprint = (category: string) => {
    setUploadTargetCategory(category);
    fileInputRef.current?.click();
  };

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const category = uploadTargetCategory;
    e.target.value = '';
    if (!file || !category) return;
    setUploadingCategory(category);
    uploadMutation.mutate({ category, file });
  };

  const handleAddCategory = () => {
    const name = categoryName.trim();
    if (!name) return;
    if (displayCategories.includes(name)) {
      toast.error('Tokia kategorija jau egzistuoja.');
      return;
    }
    addCategoryMutation.mutate(name);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pb-[140px] pt-4 flex flex-col gap-4">
      {/* Hidden file picker shared by every category card */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handlePick}
      />

      {/* New category button */}
      <button
        onClick={() => { setCategoryName(''); setShowCategoryModal(true); }}
        className="w-full h-12 rounded-2xl bg-primary text-white flex items-center justify-center gap-2 font-semibold text-sm shadow-sm active:scale-[0.99] transition-transform"
      >
        <Plus className="w-5 h-5" />
        Nauja kategorija
      </button>

      {displayCategories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#cdc3d4]/60 bg-white p-8 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <DraftingCompass className="w-6 h-6 text-primary" />
          </div>
          <p className="font-semibold text-[#1d033a] text-sm">Brėžinių dar nėra</p>
          <p className="text-[#574f61] text-xs max-w-xs">
            Sukurk kategoriją ir įkelk po vieną brėžinį (pvz. „Vizualizacija", „El. schema").
          </p>
        </div>
      ) : (
        displayCategories.map((category) => {
          const file = blueprintByCategory(category);
          const busy = uploadingCategory === category;
          return (
            <div key={category} className="rounded-2xl border border-[#cdc3d4]/40 bg-white overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 px-4 py-3 bg-[#f8f3ff] border-b border-[#cdc3d4]/30">
                <DraftingCompass className="w-4 h-4 text-primary shrink-0" />
                <span className="font-semibold text-[#1d033a] text-sm truncate">{category}</span>
              </div>

              <div className="p-3">
                {file && isPreviewable(file.name) ? (
                  <div className="group relative rounded-xl overflow-hidden border border-[#cdc3d4]/30 bg-[#f6f5fa]">
                    {isPdf(file.name) ? (
                      <PdfPagePreview
                        url={file.url}
                        page={pageByCategory[category] ?? 1}
                        onPageChange={(p) => setPageByCategory((prev) => ({ ...prev, [category]: p }))}
                        className="w-full aspect-[4/3] object-contain"
                      />
                    ) : (
                      <img src={file.url} alt={category} className="w-full aspect-[4/3] object-contain" />
                    )}
                    <div className="absolute bottom-2 right-2 flex gap-2">
                      <button
                        onClick={() => isPdf(file.name)
                          ? setLightboxPdf({ url: file.url, page: pageByCategory[category] ?? 1 })
                          : setLightboxUrl(file.url)}
                        className="w-11 h-11 rounded-xl bg-white/90 text-primary flex items-center justify-center shadow-md active:scale-95 transition-all"
                        title="Padidinti"
                      >
                        <ZoomIn className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setAnnotatingFile({ name: file.name, url: file.url, page: pageByCategory[category] ?? 1 })}
                        className="h-11 px-4 rounded-xl bg-primary text-white flex items-center justify-center gap-2 font-semibold text-sm shadow-md active:scale-95 transition-all"
                        title="Žymėti"
                      >
                        <Pencil className="w-4 h-4" />
                        Žymėti
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => !busy && pickBlueprint(category)}
                    disabled={busy}
                    className="w-full rounded-xl border-2 border-dashed border-[#cdc3d4]/70 bg-[#f6f5fa] flex flex-col items-center justify-center gap-2 py-10 px-4 text-center active:bg-[#efeaf6] transition-colors disabled:opacity-70"
                  >
                    {busy ? (
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Camera className="w-6 h-6 text-primary" />
                      </div>
                    )}
                    <span className="font-semibold text-[#1d033a] text-sm">
                      {busy ? 'Įkeliama…' : 'Įkelti brėžinį'}
                    </span>
                    {!busy && <span className="text-[#574f61] text-xs">PNG, JPG · spausk norėdamas įkelti</span>}
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* Fullscreen annotation modal — only entered via the Žymėti button */}
      {annotatingFile && (
        <ImageAnnotator
          siteId={siteId}
          fileName={annotatingFile.name}
          imageUrl={annotatingFile.url}
          initialPage={annotatingFile.page ?? 1}
          onClose={() => setAnnotatingFile(null)}
        />
      )}

      {lightboxUrl && (
        <ImageLightbox url={lightboxUrl} originalFileUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      {lightboxPdf && (
        <ImageLightbox
          pdfUrl={lightboxPdf.url}
          initialPage={lightboxPdf.page}
          originalFileUrl={lightboxPdf.url}
          onClose={() => setLightboxPdf(null)}
        />
      )}

      {/* New category modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#cdc3d4]/30">
              <h3 className="text-[15px] font-bold text-[#1d033a]">Nauja kategorija</h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="text-[#574f61] active:text-[#1d033a] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <input
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
                placeholder="Pvz.: Vizualizacija"
                autoFocus
                className="w-full h-12 px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-xl text-[15px] text-[#1d033a] focus:outline-none focus:border-primary"
              />
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="flex-1 h-12 font-semibold text-sm rounded-xl border border-[#cdc3d4] text-[#39323f] active:bg-[#f6f5fa] transition-colors"
              >
                Atšaukti
              </button>
              <button
                onClick={handleAddCategory}
                disabled={!categoryName.trim() || addCategoryMutation.isPending}
                className="flex-1 h-12 font-semibold text-sm rounded-xl bg-primary text-white flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.99] transition-transform"
              >
                {addCategoryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Pridėti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
