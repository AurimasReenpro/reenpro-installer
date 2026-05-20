import { MapPin } from 'lucide-react';

interface HeroSectionProps {
  clientName: string | null;
  address: string | null;
  systemType: string | null;
  status: string | null;
}

export default function HeroSection({ clientName, address, systemType, status }: HeroSectionProps) {
  return (
    <div className="bg-white rounded-b-2xl px-6 py-5 shadow-sm mt-[56px]">
      <h2 className="text-on-surface font-bold text-2xl">{clientName || 'Nepateiktas pavadinimas'}</h2>
      
      <div className="flex items-center gap-1 mt-1">
        <MapPin className="text-primary-light w-4 h-4" />
        <span className="text-primary-light text-sm">{address || 'Adresas nenurodytas'}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="bg-primary text-white rounded-full px-3 py-1 text-xs font-semibold">
          {systemType || 'Nenurodyta'}
        </span>
        
        {status === 'in_progress' && (
          <span className="bg-success-bg text-success px-3 py-1 rounded-full text-xs font-semibold flex items-center">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse mr-1.5 inline-block"></span>
            Vykdomas
          </span>
        )}
        {status === 'pending' && (
          <span className="bg-app-bg text-on-surface-variant px-3 py-1 rounded-full text-xs font-semibold">
            Laukia
          </span>
        )}
      </div>
    </div>
  );
}
