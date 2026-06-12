import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DraftingCompass, Plus, Trash2, Loader2, FileText, ZoomIn, Pencil, Upload, Image as ImageIcon, X } from 'lucide-react';
import { useConfirm } from '../../../hooks/useConfirm';
import {
  getSiteFiles, deleteSiteFile, uploadBlueprintFile, groupBlueprints,
  addBlueprintCategory, removeBlueprintCategory,
} from '../../../api/sites';
import { isPdf } from '../../../lib/pdf';
import PdfPagePreview from '../../../components/shared/PdfPagePreview';
import { isImage, isPreviewable } from './helpers';
import StringingSection from './StringingSection';

export default function BlueprintsTab({
  siteId,
  blueprintCategories,
  stringingDetails,
  onAnnotate,
  onLightbox,
  onPdfLightbox,
}: {
  siteId: string;
  blueprintCategories: string[];
  stringingDetails: unknown;
  onAnnotate: (file: { name: string; url: string; page?: number }) => void;
  onLightbox: (url: string) => void;
  onPdfLightbox: (file: { url: string; page: number }) => void;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const blueprintInputRef = useRef<HTMLInputElement>(null);

  // Active page per category, so the annotator/lightbox open on the page shown.
  const [pageByCategory, setPageByCategory] = useState<Record<string, number>>({});
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [uploadTargetCategory, setUploadTargetCategory] = useState<string | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryName, setCategoryName] = useState('');

  const { data: files } = useQuery({
    queryKey: ['admin_site_files', siteId],
    queryFn: () => getSiteFiles(siteId),
    enabled: !!siteId,
    staleTime: 30_000,
  });

  const uploadBlueprintMutation = useMutation({
    mutationFn: ({ category, file }: { category: string; file: File }) =>
      uploadBlueprintFile(siteId, category, file),
    onSuccess: () => {
      toast.success('Brėžinys įkeltas!');
      setUploadingCategory(null);
      void queryClient.invalidateQueries({ queryKey: ['admin_site_files', siteId] });
    },
    onError: (err: unknown) => {
      setUploadingCategory(null);
      toast.error(err instanceof Error ? err.message : 'Klaida');
    },
  });

  const addCategoryMutation = useMutation({
    mutationFn: (name: string) => addBlueprintCategory(siteId, name),
    onSuccess: () => {
      setCategoryName('');
      setShowCategoryModal(false);
      void queryClient.invalidateQueries({ queryKey: ['admin_site', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const removeCategoryMutation = useMutation({
    mutationFn: async ({ category, fileName }: { category: string; fileName?: string }) => {
      if (fileName) await deleteSiteFile(siteId, fileName);
      await removeBlueprintCategory(siteId, category);
    },
    onSuccess: () => {
      toast.success('Kategorija pašalinta');
      setDeletingCategory(null);
      void queryClient.invalidateQueries({ queryKey: ['admin_site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['admin_site_files', siteId] });
    },
    onError: (err: unknown) => {
      setDeletingCategory(null);
      toast.error(err instanceof Error ? err.message : 'Klaida');
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileName: string) => deleteSiteFile(siteId, fileName),
    onSuccess: () => {
      toast.success('Failas ištrintas');
      void queryClient.invalidateQueries({ queryKey: ['admin_site_files', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  // Blueprints are stored with a `__` prefix so they stay out of the Files tab.
  const blueprints = groupBlueprints(files ?? []);
  // Categories to render = persisted placeholders ∪ categories derived from
  // uploaded files (deduped). A Set keeps insertion order while removing dupes.
  const displayCategories = [
    ...new Set<string>([
      ...blueprintCategories,
      ...blueprints.map((b) => b.category),
    ]),
  ];
  const blueprintByCategory = (category: string) =>
    blueprints.find((b) => b.category === category)?.file;

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

  return (
    <div className="space-y-6">
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
        <h2 className="text-[16px] font-bold text-[#1d033a] dark:text-gray-100 flex items-center gap-2">
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
        <div className="bg-white dark:bg-[#18181b] rounded-[16px] border border-dashed border-[#cdc3d4]/50 dark:border-white/10 shadow-sm p-10 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-[16px] bg-[#f6f5fa] dark:bg-[#27272a] flex items-center justify-center border border-[#cdc3d4]/30 dark:border-white/10">
            <DraftingCompass size={28} className="text-[#cdc3d4]" />
          </div>
          <p className="font-bold text-[15px] text-[#1d033a] dark:text-gray-100">Brėžinių dar nėra</p>
          <p className="text-[13px] text-[#7c7484] dark:text-gray-400 max-w-sm">
            Sukurk kategoriją (pvz. „Vizualizacija", „El. schema", „Stringavimas") ir įkelk po vieną brėžinį.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {displayCategories.map((category) => {
            const file = blueprintByCategory(category);
            const busy = uploadingCategory === category;
            return (
              <div key={category} className="bg-white dark:bg-[#18181b] rounded-[16px] border border-[#cdc3d4]/20 dark:border-white/10 shadow-sm overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-[#cdc3d4]/20 dark:border-white/10 bg-[#f6f5fa]/50 flex items-center gap-2">
                  <DraftingCompass size={18} className="text-primary shrink-0" />
                  <h3 className="font-semibold text-[#1d033a] dark:text-gray-100 text-[14px] truncate flex-1">{category}</h3>
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
                    <div className="group relative rounded-[12px] overflow-hidden border border-[#cdc3d4]/30 dark:border-white/10 w-full">
                      {isPdf(file.name) ? (
                        <PdfPagePreview
                          url={file.url}
                          page={pageByCategory[category] ?? 1}
                          onPageChange={(p) => setPageByCategory((prev) => ({ ...prev, [category]: p }))}
                          className="w-full aspect-[4/3] object-contain bg-[#f6f5fa] dark:bg-[#27272a]"
                        />
                      ) : isImage(file.name) ? (
                        <img
                          src={file.url}
                          alt={category}
                          className="w-full aspect-[4/3] object-contain bg-[#f6f5fa] dark:bg-[#27272a]"
                        />
                      ) : (
                        <div className="aspect-[4/3] flex flex-col items-center justify-center bg-[#f6f5fa] dark:bg-[#27272a] gap-2">
                          <FileText size={40} className="text-[#cdc3d4]" />
                          <p className="text-[12px] text-[#7c7484] dark:text-gray-400 font-semibold truncate px-4">{category}</p>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                        {isPreviewable(file.name) && (
                          <button
                            onClick={() => isPdf(file.name)
                              ? onPdfLightbox({ url: file.url, page: pageByCategory[category] ?? 1 })
                              : onLightbox(file.url)}
                            className="pointer-events-auto w-9 h-9 rounded-[8px] bg-white dark:bg-[#18181b] text-primary flex items-center justify-center hover:bg-[#f6f5fa] transition-colors cursor-pointer shadow-sm"
                            title="Padidinti"
                          >
                            <ZoomIn size={16} />
                          </button>
                        )}
                        {isPreviewable(file.name) && (
                          <button
                            onClick={() => onAnnotate({ name: file.name, url: file.url, page: pageByCategory[category] ?? 1 })}
                            className="pointer-events-auto w-9 h-9 rounded-[8px] bg-primary text-white flex items-center justify-center hover:bg-primary/80 transition-colors cursor-pointer shadow-sm"
                            title="Žymėti"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => pickBlueprint(category)}
                          className="pointer-events-auto w-9 h-9 rounded-[8px] bg-white/80 text-[#4b4452] dark:text-gray-300 flex items-center justify-center hover:bg-white transition-colors cursor-pointer shadow-sm"
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
                      className="border-2 border-dashed border-[#cdc3d4]/50 dark:border-white/10 rounded-[12px] w-full p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-[#fbf0ff]/30 hover:border-primary/40 transition-colors"
                    >
                      {busy ? (
                        <Loader2 size={32} className="text-primary animate-spin mb-3" />
                      ) : (
                        <ImageIcon size={32} className="text-[#cdc3d4] mb-3" />
                      )}
                      <p className="font-semibold text-[#1d033a] dark:text-gray-100 text-[13px]">
                        {busy ? 'Įkeliama...' : 'Įkelti brėžinį'}
                      </p>
                      <p className="text-[11px] text-[#7c7484] dark:text-gray-400 mt-1">PNG, JPG, PDF, DWG</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* String table */}
      <StringingSection siteId={siteId} stringingDetails={stringingDetails} />

      {/* ── New blueprint category modal ── */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#18181b] rounded-[16px] shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#cdc3d4]/30 dark:border-white/10">
              <h3 className="text-[16px] font-bold text-[#1d033a] dark:text-gray-100">Nauja kategorija</h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="cursor-pointer text-[#7c7484] dark:text-gray-400 hover:text-[#1d033a] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-[13px] font-semibold text-[#4b4452] dark:text-gray-300 uppercase tracking-wider mb-2">
                Pavadinimas <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
                placeholder="Pvz.: Vizualizacija"
                autoFocus
                className="w-full h-[44px] px-3 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4] dark:border-white/10 rounded-[8px] text-[14px] text-[#1d033a] dark:text-gray-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] border border-[#cdc3d4] dark:border-white/10 text-[#4b4452] dark:text-gray-300 hover:bg-[#f6f5fa] transition-colors cursor-pointer"
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
