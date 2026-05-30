import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ImageAnnotator from './ImageAnnotator';
import { useSignedPhotoUrl } from '../../hooks/useSignedPhotoUrl';

interface Props {
  siteId: string;
  storagePath: string;
  onClose: () => void;
}

// Photos live in the private `site-photos` bucket, so they need a signed URL
// before the Konva canvas can load them. This wrapper resolves that URL and
// then hands off to the shared ImageAnnotator, keyed by the storage path.
export default function PhotoAnnotator({ siteId, storagePath, onClose }: Props) {
  const { url, isLoading, error } = useSignedPhotoUrl(storagePath);

  useEffect(() => {
    if (error) {
      toast.error('Nepavyko įkelti nuotraukos žymėjimui.');
      onClose();
    }
  }, [error, onClose]);

  if (isLoading || !url) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black w-screen h-screen">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  return (
    <ImageAnnotator
      siteId={siteId}
      fileName={storagePath}
      imageUrl={url}
      onClose={onClose}
    />
  );
}
