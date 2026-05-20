import type { SitePhoto } from '../../../types/site.types';
import { Images } from 'lucide-react';

interface PhotosTabProps {
  photos: SitePhoto[];
}

export default function PhotosTab({ photos }: PhotosTabProps) {
  return (
    <div className="px-4 pb-[120px] pt-4">
      <div className="bg-[#fbf0ff] rounded-xl p-8 text-center border border-[#490891]/20">
        <div className="w-16 h-16 bg-[#e4cbf8] text-[#490891] rounded-full flex items-center justify-center mx-auto mb-4">
          <Images className="w-8 h-8" />
        </div>
        <h3 className="text-[#1d033a] font-bold text-lg mb-2">Nuotraukų galerija</h3>
        <p className="text-[#4b4452] text-sm leading-relaxed mb-4">
          Šiuo metu objekte yra {photos?.length || 0} nuotraukų. 
          Pilna nuotraukų galerija su peržiūros funkcija atsiras netrukus!
        </p>
      </div>
    </div>
  );
}
