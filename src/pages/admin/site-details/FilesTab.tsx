import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2, Upload, FolderOpen, FileText, Image as ImageIcon, ZoomIn, Pencil, Trash2 } from 'lucide-react';
import { useConfirm } from '../../../hooks/useConfirm';
import { getSiteFiles, deleteSiteFile, uploadSiteFile, getSiteInstallerPhotos } from '../../../api/sites';
import { isImage, formatBytes } from './helpers';
import InstallerPhotosSection from './InstallerPhotosSection';

export default function FilesTab({
  siteId,
  onLightbox,
  onAnnotate,
}: {
  siteId: string;
  onLightbox: (url: string) => void;
  onAnnotate: (file: { name: string; url: string; page?: number }) => void;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: files, isLoading: filesLoading } = useQuery({
    queryKey: ['admin_site_files', siteId],
    queryFn: () => getSiteFiles(siteId),
    enabled: !!siteId,
    staleTime: 30_000,
  });

  // Installer photos (uploaded from mobile) — separate from admin site_files
  const { data: installerPhotos, isLoading: photosLoading } = useQuery({
    queryKey: ['admin_site_photos', siteId],
    queryFn: () => getSiteInstallerPhotos(siteId),
    enabled: !!siteId,
    staleTime: 60_000,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadSiteFile(siteId, file),
    onSuccess: () => {
      toast.success('Failas įkeltas!');
      void queryClient.invalidateQueries({ queryKey: ['admin_site_files', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileName: string) => deleteSiteFile(siteId, fileName),
    onSuccess: () => {
      toast.success('Failas ištrintas');
      void queryClient.invalidateQueries({ queryKey: ['admin_site_files', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

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

  // Blueprints are stored with a `__` prefix so they stay out of the Files tab.
  const regularFiles = files?.filter(f => !f.name.startsWith('__'));

  return (
    <div className="flex flex-col gap-6">
      {/* Upload area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="bg-white dark:bg-[#18181b] rounded-[16px] border-2 border-dashed border-[#cdc3d4]/60 dark:border-white/10 hover:border-primary/50 hover:bg-[#fbf0ff]/20 transition-all cursor-pointer p-8 flex flex-col items-center gap-3 group"
      >
        {uploadMutation.isPending ? (
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        ) : (
          <div className="w-12 h-12 rounded-[12px] bg-[#f6f5fa] dark:bg-[#27272a] group-hover:bg-[#ede8f5] transition-colors flex items-center justify-center">
            <Upload size={22} className="text-[#7c7484] dark:text-gray-400 group-hover:text-primary transition-colors" />
          </div>
        )}
        <div className="text-center">
          <p className="font-semibold text-[14px] text-[#1d033a] dark:text-gray-100">
            {uploadMutation.isPending ? 'Įkeliama...' : 'Įkelti failą'}
          </p>
          <p className="text-[13px] text-[#7c7484] dark:text-gray-400 mt-1">Nuotraukos (JPG, PNG), DWG, arba PDF dokumentai</p>
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
        <div className="flex flex-col items-center justify-center py-12 gap-2 bg-white dark:bg-[#18181b] rounded-[16px] border border-[#cdc3d4]/20 dark:border-white/10 shadow-sm">
          <FolderOpen size={32} className="text-[#cdc3d4] mb-2" />
          <p className="text-[#7c7484] dark:text-gray-400 text-[14px]">Failų dar nėra.</p>
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
              className="group relative bg-white dark:bg-[#18181b] rounded-[12px] border border-[#cdc3d4]/20 dark:border-white/10 shadow-sm overflow-hidden hover:border-primary/30 transition-colors"
            >
              {isImage(file.name) ? (
                <div className="aspect-[4/3] overflow-hidden bg-[#f6f5fa] dark:bg-[#27272a]">
                  <img
                    src={file.url}
                    alt={file.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              ) : (
                <div className="aspect-[4/3] flex items-center justify-center bg-[#f6f5fa] dark:bg-[#27272a]">
                  <FileText size={36} className="text-[#cdc3d4]" />
                </div>
              )}

              <div className="p-3">
                <p className="text-[12px] font-semibold text-[#1d033a] dark:text-gray-100 truncate" title={file.name}>
                  {file.name}
                </p>
                <p className="text-[11px] text-[#7c7484] dark:text-gray-400 mt-0.5">{formatBytes(file.size)}</p>
              </div>

              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {isImage(file.name) && (
                  <button
                    onClick={() => onLightbox(file.url)}
                    className="w-9 h-9 rounded-[8px] bg-white dark:bg-[#18181b] text-primary flex items-center justify-center hover:bg-[#f6f5fa] transition-colors cursor-pointer shadow-sm"
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
                    className="w-9 h-9 rounded-[8px] bg-white dark:bg-[#18181b] text-primary flex items-center justify-center hover:bg-[#f6f5fa] transition-colors shadow-sm"
                    title="Atidaryti"
                  >
                    <ImageIcon size={16} />
                  </a>
                )}
                {isImage(file.name) && (
                  <button
                    onClick={() => onAnnotate({ name: file.name, url: file.url })}
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
      <InstallerPhotosSection photos={installerPhotos ?? []} isLoading={photosLoading} siteId={siteId} />
    </div>
  );
}
