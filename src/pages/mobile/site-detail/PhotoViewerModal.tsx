import SignedPhoto from '../../../components/ui/SignedPhoto';
import { Trash2 } from 'lucide-react';

interface PhotoViewerModalProps {
  storagePath: string;
  onClose: () => void;
  onDelete: () => void;
}

export default function PhotoViewerModal({ storagePath, onClose, onDelete }: PhotoViewerModalProps) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center animate-in fade-in duration-200">
      <SignedPhoto
        storage_path={storagePath}
        alt="Full size view"
        className="w-full max-h-[70vh] object-contain"
      />
      <div className="absolute bottom-10 left-0 right-0 flex flex-col gap-3 px-6">
        <button 
          onClick={onDelete}
          className="w-full h-[50px] bg-[#ba1a1a] text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#93000a] transition-colors"
        >
          <Trash2 className="w-5 h-5" />
          Ištrinti nuotrauką
        </button>
        <button 
          onClick={onClose}
          className="w-full h-[50px] bg-white text-[#1d033a] rounded-xl font-bold flex items-center justify-center hover:bg-gray-100 transition-colors"
        >
          Uždaryti
        </button>
      </div>
    </div>
  );
}
