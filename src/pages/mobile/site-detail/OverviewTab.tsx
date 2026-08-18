import { useQuery } from '@tanstack/react-query';
import {
  LayoutGrid, Cpu, BatteryCharging, Wrench, Cable, ShieldCheck, Package,
  Zap, Battery, Loader2, Lock,
} from 'lucide-react';
import { getSiteMaterialList, lineLabel, lineIsEquipment, type MaterialLine } from '../../../api/materials';
import {
  asMaterialStatus, STATUS_LABELS, statusTone, showsIssued,
} from '../../../lib/materialFlow';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Inverteris': Cpu,
  'Moduliai': LayoutGrid,
  'BESS': BatteryCharging,
  'Energijos kaupiklis': BatteryCharging,
  'Konstrukcija': Wrench,
  'Kabeliai': Cable,
  'Apsauga': ShieldCheck,
};

const TONE_CLASSES = {
  neutral: 'bg-surface-2 text-muted border-border',
  info:    'bg-info-bg text-info border-info/30',
  warning: 'bg-warning-bg text-warning border-warning/30',
  success: 'bg-success-bg text-success border-success/30',
} as const;

interface OverviewTabProps {
  siteId: string;
  kwp: number | null;
  kwh: number | null;
}

function kiekis(v: number | null): string {
  if (v == null) return '—';
  return String(parseFloat(v.toFixed(3)));
}

/** Viena žiniaraščio eilutė montuotojui: kas tai ir kiek. */
function Eilute({ line, rodytiIsduota, paskutine }: {
  line: MaterialLine;
  rodytiIsduota: boolean;
  paskutine: boolean;
}) {
  const Icon = CATEGORY_ICONS[line.catalog?.category ?? ''] ?? Package;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${paskutine ? '' : 'border-b border-border'}`}>
      <div className="w-9 h-9 rounded-card bg-surface-2 flex items-center justify-center shrink-0">
        <Icon className="w-[18px] h-[18px] text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-text text-[14px] truncate">{lineLabel(line)}</p>
        <p className="text-[12px] text-subtle truncate">
          {line.catalog?.category ?? 'Be kategorijos'}
          {line.catalog?.code ? ` · ${line.catalog.code}` : ''}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[13px] font-semibold text-muted whitespace-nowrap">
          {kiekis(line.qty_planned)} {line.unit}
        </p>
        {/* Išduotas kiekis rodomas tik tada, kai jis apskritai gali būti —
            kitaip montuotojas matytų brūkšnį ir nesuprastų, ko laukti. */}
        {rodytiIsduota && (
          <p className="text-[11px] text-subtle whitespace-nowrap">
            išduota {kiekis(line.qty_issued)}
          </p>
        )}
      </div>
    </div>
  );
}

function Sekcija({ pavadinimas, eilutes, rodytiIsduota }: {
  pavadinimas: string;
  eilutes: MaterialLine[];
  rodytiIsduota: boolean;
}) {
  if (eilutes.length === 0) return null;
  return (
    <div>
      <h3 className="text-[12px] font-bold text-subtle uppercase tracking-wider mb-2 px-1 flex items-center gap-2">
        {pavadinimas}
        <span className="text-subtle font-semibold normal-case tracking-normal">{eilutes.length}</span>
      </h3>
      <div className="bg-surface rounded-[20px] border border-border shadow-card overflow-hidden">
        {eilutes.map((l, i) => (
          <Eilute key={l.id} line={l} rodytiIsduota={rodytiIsduota} paskutine={i === eilutes.length - 1} />
        ))}
      </div>
    </div>
  );
}

export default function OverviewTab({ siteId, kwp, kwh }: OverviewTabProps) {
  // Skaitoma iš žiniaraščio, ne iš `sites.equipment_details`. Nuo įrangos
  // sujungimo su medžiagomis (2026-08-17) tas jsonb laukas nebeatnaujinamas,
  // tad montuotojai matydavo užšaldytą momentinę kopiją.
  const { data: list, isLoading } = useQuery({
    queryKey: ['site_material_list', siteId],
    queryFn: () => getSiteMaterialList(siteId),
    enabled: !!siteId,
  });

  const eilutes = list?.lines ?? [];
  const busena = asMaterialStatus(list?.status);
  const rodytiIsduota = showsIssued(busena);

  const iranga    = eilutes.filter((l) => lineIsEquipment(l));
  const medziagos = eilutes.filter((l) => !lineIsEquipment(l));

  return (
    <div className="px-4 pb-[140px] pt-4 flex flex-col gap-4">

      {/* ── Capacity summary ── */}
      <div className="bg-surface rounded-[20px] border border-border shadow-card p-4 flex items-center">
        <div className="flex-1 flex flex-col items-center gap-1">
          <Zap size={18} className="text-subtle" />
          <p className="text-[20px] font-bold text-text leading-none">
            {kwp ?? '—'} <span className="text-[12px] text-subtle font-semibold">kWp</span>
          </p>
          <p className="text-[11px] text-subtle font-medium">Sistemos galia</p>
        </div>
        <div className="w-px self-stretch bg-border mx-1" />
        <div className="flex-1 flex flex-col items-center gap-1">
          <Battery size={18} className="text-subtle" />
          <p className="text-[20px] font-bold text-text leading-none">
            {kwh != null ? kwh : '—'} <span className="text-[12px] text-subtle font-semibold">kWh</span>
          </p>
          <p className="text-[11px] text-subtle font-medium">Baterija</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : eilutes.length === 0 ? (
        <div className="bg-surface rounded-[20px] border border-border shadow-card py-10 flex flex-col items-center gap-2">
          <Package className="w-9 h-9 text-subtle" />
          <p className="text-[14px] text-subtle">Žiniaraštis dar nesudarytas.</p>
        </div>
      ) : (
        <>
          {/* Būsena rodo, ar tuo, kas surašyta, jau galima remtis. */}
          <div className={`inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full border text-[12px] font-semibold ${TONE_CLASSES[statusTone(busena)]}`}>
            {busena !== 'rengiamas' && <Lock size={11} />}
            {STATUS_LABELS[busena]}
          </div>
          {busena === 'rengiamas' && (
            <p className="text-[12px] text-subtle -mt-2 px-1">
              Žiniaraštis dar pildomas — kiekiai gali keistis.
            </p>
          )}

          <Sekcija pavadinimas="Įranga" eilutes={iranga} rodytiIsduota={rodytiIsduota} />
          <Sekcija pavadinimas="Medžiagos" eilutes={medziagos} rodytiIsduota={rodytiIsduota} />
        </>
      )}
    </div>
  );
}
