import { ArrowLeft, Map } from 'lucide-react';

interface SiteDetailHeaderProps {
  code: string;
  onBack: () => void;
  onOpenMaps: () => void;
}

export default function SiteDetailHeader({ code, onBack, onOpenMaps }: SiteDetailHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-[56px] bg-white flex items-center justify-between px-4 z-[70]">
      <button onClick={onBack} className="min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2">
        <ArrowLeft className="text-primary w-6 h-6" />
      </button>
      <span className="text-primary-light text-sm font-bold">{code}</span>
      <button onClick={onOpenMaps} className="min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2">
        <Map className="text-primary w-6 h-6" />
      </button>
    </header>
  );
}
