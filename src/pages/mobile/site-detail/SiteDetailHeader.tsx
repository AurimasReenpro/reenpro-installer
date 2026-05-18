interface SiteDetailHeaderProps {
  code: string;
  onBack: () => void;
  onOpenMaps: () => void;
}

export default function SiteDetailHeader({ code, onBack, onOpenMaps }: SiteDetailHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-[56px] bg-surface-bright border-b border-outline-variant flex items-center justify-between px-4 z-[70]">
      <button onClick={onBack} className="min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2">
        <span className="material-symbols-outlined text-primary">arrow_back</span>
      </button>
      <span className="text-primary-light text-sm font-bold">{code}</span>
      <button onClick={onOpenMaps} className="min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2">
        <span className="material-symbols-outlined text-primary">map</span>
      </button>
    </header>
  );
}
