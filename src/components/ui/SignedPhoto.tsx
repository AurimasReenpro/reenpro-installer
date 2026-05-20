import { Image, ImageOff } from 'lucide-react';
import { useSignedPhotoUrl } from '../../hooks/useSignedPhotoUrl';

interface SignedPhotoProps {
  storage_path: string;
  className?: string;
  alt: string;
  onClick?: () => void;
}

export default function SignedPhoto({ storage_path, className, alt, onClick }: SignedPhotoProps) {
  const { url, isLoading, error } = useSignedPhotoUrl(storage_path);

  if (isLoading) {
    return (
      <div className={`animate-pulse bg-gray-200 flex items-center justify-center ${className || ''}`} onClick={onClick}>
        <Image className="text-gray-400" size={24} />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className={`bg-gray-100 flex items-center justify-center border border-gray-300 ${className || ''}`} onClick={onClick}>
        <ImageOff className="text-gray-400" size={24} />
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
