import type { ElementType } from 'react';
import {
  Zap, Wrench, Home, Layers, Ruler,
  User, UserCheck, MapPin, Navigation, Phone, AlertTriangle,
} from 'lucide-react';
import type { SiteDetailData } from '../../../types/site.types';

interface InfoTabProps {
  site: SiteDetailData;
}

interface SpecCellProps {
  icon: ElementType;
  label: string;
  value: string | number | null | undefined;
}

function SpecCell({ icon: Icon, label, value }: SpecCellProps) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon size={13} className="text-primary flex-shrink-0" />
        <span className="text-[10px] text-[#574f61] font-bold uppercase tracking-wider leading-none">
          {label}
        </span>
      </div>
      <span className="text-[15px] font-bold text-[#1d033a] leading-snug break-words">
        {value != null
          ? value
          : <span className="text-[#cdc3d4] font-normal text-[13px]">—</span>}
      </span>
    </div>
  );
}

function FieldLabel({ icon: Icon, text }: { icon: ElementType; text: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-0.5">
      <Icon size={13} className="text-primary flex-shrink-0" />
      <p className="text-[10px] text-[#574f61] font-bold uppercase tracking-wider leading-none">
        {text}
      </p>
    </div>
  );
}

export default function InfoTab({ site }: InfoTabProps) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}`;

  return (
    <div className="px-4 pb-[120px] pt-4 flex flex-col gap-3">

      {/* ── Card 1: Techniniai duomenys ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#e2d9f0]/50 overflow-hidden">
        <div className="bg-[#f6f5fa] px-4 py-2.5 border-b border-[#e2d9f0]/40">
          <p className="font-bold text-[#1d033a] text-[13px] uppercase tracking-wide">
            Techniniai duomenys
          </p>
        </div>
        <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-4">
          <SpecCell icon={Zap}    label="Galia"       value={site.kwp != null ? `${site.kwp} kWp` : null} />
          <SpecCell icon={Wrench} label="Tipas"       value={site.system_type} />
          <SpecCell icon={Home}   label="Stogo tipas" value={site.roof_type} />
          <SpecCell icon={Layers} label="Danga"       value={site.roof_material} />
          <SpecCell icon={Ruler}  label="Nuolydis"    value={site.roof_angle} />
        </div>
      </div>

      {/* ── Card 2: Kontaktai ir Navigacija ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#e2d9f0]/50 overflow-hidden">
        <div className="bg-[#f6f5fa] px-4 py-2.5 border-b border-[#e2d9f0]/40">
          <p className="font-bold text-[#1d033a] text-[13px] uppercase tracking-wide">
            Kontaktai ir Navigacija
          </p>
        </div>
        <div className="p-4 flex flex-col gap-3">

          {/* Client name */}
          <div>
            <FieldLabel icon={User} text="Klientas" />
            <p className="text-[16px] font-bold text-[#1d033a]">{site.client_name}</p>
          </div>

          {/* Contact person */}
          {site.contact_person && (
            <div>
              <FieldLabel icon={UserCheck} text="Kontaktinis asmuo" />
              <p className="text-[14px] font-semibold text-[#1d033a]">{site.contact_person}</p>
            </div>
          )}

          {/* Address + navigate button */}
          <div>
            <FieldLabel icon={MapPin} text="Adresas" />
            <div className="flex items-start gap-3 mt-1">
              <p className="flex-1 text-[14px] font-semibold text-[#1d033a] leading-snug">
                {site.address}
              </p>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-1.5 h-[40px] px-3 rounded-xl bg-primary active:bg-primary/80 text-white font-bold text-[12px] transition-colors"
              >
                <Navigation size={14} />
                Naviguoti
              </a>
            </div>
          </div>

          {/* Phone call button */}
          {site.client_phone && (
            <a
              href={`tel:${site.client_phone}`}
              className="flex items-center justify-center gap-2 h-[52px] rounded-xl bg-[#16a34a] active:bg-[#15803d] text-white font-bold text-[16px] transition-colors shadow-sm"
            >
              <Phone size={18} />
              <span>Skambinti</span>
              <span className="font-normal text-[14px] opacity-90">{site.client_phone}</span>
            </a>
          )}
        </div>
      </div>

      {/* ── Card 3: Svarbios pastabos ── */}
      {site.notes && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 overflow-hidden shadow-sm">
          <div className="bg-amber-100 px-4 py-2.5 border-b border-amber-300 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-700 flex-shrink-0" />
            <p className="font-bold text-amber-800 text-[13px] uppercase tracking-wide">
              Svarbios pastabos iš ofiso
            </p>
          </div>
          <div className="px-4 py-4">
            <p className="text-[14px] text-amber-900 font-medium leading-relaxed whitespace-pre-wrap">
              {site.notes}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
