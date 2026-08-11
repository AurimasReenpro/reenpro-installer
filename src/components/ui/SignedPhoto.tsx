import { Image, ImageOff } from 'lucide-react';
import { useResolvedSignedUrl } from '../../hooks/useSignedPhotoUrls';

interface SignedPhotoProps {
  storage_path: string;
  className?: string;
  alt: string;
  onClick?: () => void;
}

export default function SignedPhoto({ storage_path, className, alt, onClick }: SignedPhotoProps) {
  const { url, isLoading, error } = useResolvedSignedUrl(storage_path);

  if (isLoading) {
    return (
      <div className={`animate-pulse bg-border flex items-center justify-center ${className || ''}`} onClick={onClick}>
        <Image className="text-subtle" size={24} />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className={`bg-surface-2 flex items-center justify-center border border-border ${className || ''}`} onClick={onClick}>
        <ImageOff className="text-subtle" size={24} />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      onClick={onClick}
    />
  );
}
