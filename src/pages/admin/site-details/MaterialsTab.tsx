import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Package, FileSpreadsheet, Info, Search, ChevronRight, Lock, Zap, TriangleAlert } from 'lucide-react';
import {
  getSiteMaterialList, ensureSiteMaterialList, getMaterialCatalog, getMaterialTemplates,
  addMaterialLine, updateMaterialLine, deleteMaterialLine, applyTemplateToList,
  updateCatalogSpec, updateSiteCapacity,
  catalogItemLabel, lineLabel, lineIsEquipment,
  type MaterialLine,
} from '../../../api/materials';
import {
  asMaterialStatus, STATUS_LABELS, STATUS_HINTS, statusTone, flowPosition,
  isPlannedEditable, showsIssued, showsActual, compareQty, qtyDelta,
} from '../../../lib/materialFlow';
import {
  kwpFromLines, kwhFromLines, missingSpecCount, specKindFor, differsFromStored,
} from '../../../lib/materialTotals';
import { normalizeSiteType, siteTypeLabel } from '../../../lib/siteTypes';
import type { SiteWithTeam } from './types';

/** Kiekis rodymui. `null` yra „dar nežinome", ne nulis, tad brūkšnys. */
function kiekis(v: number | null): string {
  if (v == null) return '—';
  return String(parseFloat(v.toFixed(3)));
}

const TONE_CLASSES = {
  neutral: 'bg-surface-2 text-muted border-border',
  info:    'bg-info-bg text-info border-info/30',
  warning: 'bg-warning-bg text-warning border-warning/30',
  success: 'bg-success-bg text-success border-success/30',
} as const;

export default function MaterialsTab({ site, siteId }: { site: SiteWithTeam; siteId: string }) {
  const qc = useQueryClient();
  const [naujasVardas, setNaujasVardas] = useState('');
  const [naujasKatalogas, setNaujasKatalogas] = useState('');
  const [naujasKiekis, setNaujasKiekis] = useState('');
  const [sablonas, setSablonas] = useState('');
  const [rusis, setRusis] = useState<'all' | 'equipment' | 'material'>('all');
  const [paieska, setPaieska] = useState('');
  const [suskleistos, setSuskleistos] = useState<Set<string>>(new Set());

  const { data: list, isLoading } = useQuery({
    queryKey: ['site_material_list', siteId],
    queryFn: () => getSiteMaterialList(siteId),
    enabled: !!siteId,
  });

  const { data: katalogas } = useQuery({
    queryKey: ['material_catalog'],
    queryFn: getMaterialCatalog,
  });

  const { data: sablonai } = useQuery({
    queryKey: ['material_templates'],
    queryFn: getMaterialTemplates,
  });

  const atnaujinti = () => qc.invalidateQueries({ queryKey: ['site_material_list', siteId] });

  const sukurti = useMutation({
    mutationFn: () => ensureSiteMaterialList(siteId),
    onSuccess: () => { void atnaujinti(); toast.success('Žiniaraštis sukurtas.'); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  const isSablono = useMutation({
    mutationFn: async () => {
      const l = list ?? await ensureSiteMaterialList(siteId);
      return applyTemplateToList(l.id, sablonas, site, l.lines);
    },
    onSuccess: (r) => {
      void atnaujinti();
      setSablonas('');
      toast.success(
        r.beKiekio > 0
          ? `Pridėta ${r.pridėta} eilučių, iš jų ${r.beKiekio} be kiekio — juos suves montuotojas.`
          : `Pridėta ${r.pridėta} eilučių.`,
      );
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  const pridetiEilute = useMutation({
    mutationFn: async () => {
      const l = list ?? await ensureSiteMaterialList(siteId);
      const katalogoIrasas = katalogas?.find((k) => k.id === naujasKatalogas);
      const qty = naujasKiekis.trim() === '' ? null : Number(naujasKiekis.replace(',', '.'));
      if (qty != null && !Number.isFinite(qty)) throw new Error('Neteisingas kiekis.');

      await addMaterialLine(l.id, {
        catalog_item_id: katalogoIrasas?.id ?? null,
        name: katalogoIrasas ? null : naujasVardas.trim(),
        unit: katalogoIrasas?.unit ?? 'vnt.',
        qty_planned: qty,
      });
    },
    onSuccess: () => {
      void atnaujinti();
      setNaujasVardas(''); setNaujasKatalogas(''); setNaujasKiekis('');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  const keistiKieki = useMutation({
    mutationFn: ({ id, v }: { id: string; v: string }) => {
      const qty = v.trim() === '' ? null : Number(v.replace(',', '.'));
      if (qty != null && !Number.isFinite(qty)) throw new Error('Neteisingas kiekis.');
      return updateMaterialLine(id, { qty_planned: qty });
    },
    onSuccess: () => void atnaujinti(),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  const trinti = useMutation({
    mutationFn: (id: string) => deleteMaterialLine(id),
    onSuccess: () => void atnaujinti(),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  /**
   * Galia arba talpa — rašoma į KATALOGĄ, ne į šią eilutę.
   *
   * Modulio galia visur ta pati, tad vedama vieną kartą. Kadangi pakeitimas
   * paliečia visus objektus, sąsaja tai pasako garsiai.
   */
  const keistiSpec = useMutation({
    mutationFn: ({ catalogId, kind, v }: { catalogId: string; kind: 'power' | 'capacity'; v: string }) => {
      const n = v.trim() === '' ? null : Number(v.replace(',', '.'));
      if (n != null && (!Number.isFinite(n) || n <= 0)) throw new Error('Reikšmė turi būti teigiama.');
      return updateCatalogSpec(catalogId, kind === 'power' ? { power_w: n } : { capacity_kwh: n });
    },
    onSuccess: () => {
      void atnaujinti();
      void qc.invalidateQueries({ queryKey: ['material_catalog'] });
      void qc.invalidateQueries({ queryKey: ['equipment_catalog'] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  const irasytiGalia = useMutation({
    mutationFn: (patch: { kwp?: number | null; kwh?: number | null }) => updateSiteCapacity(siteId, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['site', siteId] });
      void qc.invalidateQueries({ queryKey: ['sites'] });
      toast.success('Įrašyta į objektą.');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
      </div>
    );
  }

  const visosEilutes: MaterialLine[] = list?.lines ?? [];
  const galimaPridėti = naujasKatalogas !== '' || naujasVardas.trim() !== '';
  const beKiekio = visosEilutes.filter((l) => l.qty_planned == null).length;

  const busena = asMaterialStatus(list?.status);
  const redaguojama = isPlannedEditable(busena);
  const rodytiIsduota = showsIssued(busena);
  const rodytiFakta = showsActual(busena);
  const zingsnis = flowPosition(busena);

  // Galia ir talpa iš žiniaraščio — iš katalogo savybių, ne iš pavadinimo.
  const skaiciuotasKwp = kwpFromLines(visosEilutes);
  const skaiciuotasKwh = kwhFromLines(visosEilutes);
  const truksta = missingSpecCount(visosEilutes);
  const kwpSkiriasi = differsFromStored(skaiciuotasKwp, site.kwp);
  const kwhSkiriasi = differsFromStored(skaiciuotasKwh, site.kwh);

  // Nukrypimai skaičiuojami tik tada, kai faktas apskritai yra.
  const nukrypimai = rodytiFakta
    ? visosEilutes.filter((l) => {
        const p = compareQty(l.qty_planned, l.qty_actual);
        return p === 'daugiau' || p === 'maziau';
      }).length
    : 0;

  const eilutes = visosEilutes.filter((l) => {
    const pagalRusi =
      rusis === 'all' ||
      (rusis === 'equipment' ? lineIsEquipment(l) : !lineIsEquipment(l));
    const p = paieska.trim().toLowerCase();
    const pagalPaieska = !p
      || lineLabel(l).toLowerCase().includes(p)
      || (l.catalog?.code ?? '').toLowerCase().includes(p);
    return pagalRusi && pagalPaieska;
  });

  // Šablonai skiriami į tinkamus šiam objektui ir kitus. Netinkami nedingsta,
  // bet nustumiami į atskirą grupę — tipas turi apsaugoti nuo klaidingo
  // pasirinkimo, o ne tik gražiai sudėlioti sąrašą.
  const objektoTipas = normalizeSiteType(site.site_type);
  const tinkami   = (sablonai ?? []).filter((s) => s.site_type == null || s.site_type === objektoTipas);
  const netinkami = (sablonai ?? []).filter((s) => s.site_type != null && s.site_type !== objektoTipas);

  // Grupuojama pagal kategoriją: su 60 eilučių matai 6 antraštes, ne 60 eilučių.
  const grupes = new Map<string, MaterialLine[]>();
  for (const l of eilutes) {
    const k = l.catalog?.category ?? 'Be kategorijos';
    grupes.set(k, [...(grupes.get(k) ?? []), l]);
  }

  // Katalogo rinkiklis skirstomas į kategorijas — 346 įrašų plokščias sąrašas
  // nebenaršomas.
  const katalogoGrupes = new Map<string, typeof katalogas>();
  for (const k of katalogas ?? []) {
    katalogoGrupes.set(k.category, [...(katalogoGrupes.get(k.category) ?? []), k]);
  }

  /** Stulpelių skaičius — reikia tuščios eilutės tarpui per visą plotį. */
  const stulpeliu = 4 + (rodytiIsduota ? 1 : 0) + (rodytiFakta ? 2 : 0);

  return (
    <div className="space-y-5">
      <div className="bg-surface rounded-card border border-border shadow-sm overflow-hidden">
        {/* ── Antraštė su būsena ── */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5 flex-wrap">
            <FileSpreadsheet size={18} className="text-primary" />
            <h3 className="font-semibold text-[15px] text-text">Medžiagų žiniaraštis</h3>

            {list && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[12px] font-semibold ${TONE_CLASSES[statusTone(busena)]}`}>
                {!redaguojama && <Lock size={11} />}
                {STATUS_LABELS[busena]}
              </span>
            )}
            {zingsnis && (
              <span className="text-[12px] text-subtle tabular-nums">
                {zingsnis.step} iš {zingsnis.total}
              </span>
            )}

            <span className="ml-auto text-[12px] text-subtle">
              {visosEilutes.length} eilut{visosEilutes.length === 1 ? 'ė' : 'ės'}
              {beKiekio > 0 && <span className="text-warning font-semibold"> · {beKiekio} be kiekio</span>}
              {nukrypimai > 0 && <span className="text-warning font-semibold"> · {nukrypimai} nukrypo</span>}
            </span>
          </div>

          {list && (
            <p className="text-[12px] text-subtle mt-1.5">{STATUS_HINTS[busena]}</p>
          )}

          {/* Galia ir talpa pagal žiniaraštį.
              Sąmoningai NEPERRAŠOMA automatiškai: nepilnas žiniaraštis duotų
              mažesnį kWp ir tyliai ištrintų ranka suvestą teisingą reikšmę.
              Skirtumas rodomas, o įrašo žmogus vienu paspaudimu. */}
          {list && (skaiciuotasKwp != null || skaiciuotasKwh != null
                    || truksta.moduliai > 0 || truksta.kaupikliai > 0) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
              {(skaiciuotasKwp != null || skaiciuotasKwh != null) && (
                <span className="text-subtle">
                  Pagal žiniaraštį:{' '}
                  {skaiciuotasKwp != null && (
                    <span className={kwpSkiriasi ? 'font-bold text-warning' : 'font-semibold text-text'}>
                      {skaiciuotasKwp} kWp
                    </span>
                  )}
                  {skaiciuotasKwp != null && skaiciuotasKwh != null && ' · '}
                  {skaiciuotasKwh != null && (
                    <span className={kwhSkiriasi ? 'font-bold text-warning' : 'font-semibold text-text'}>
                      {skaiciuotasKwh} kWh
                    </span>
                  )}
                </span>
              )}

              {(kwpSkiriasi || kwhSkiriasi) && (
                <>
                  <span className="text-subtle">
                    objekte {site.kwp ?? '—'} kWp · {site.kwh ?? '—'} kWh
                  </span>
                  <button
                    onClick={() => irasytiGalia.mutate({
                      ...(kwpSkiriasi ? { kwp: skaiciuotasKwp } : {}),
                      ...(kwhSkiriasi ? { kwh: skaiciuotasKwh } : {}),
                    })}
                    disabled={irasytiGalia.isPending}
                    className="h-[26px] px-2.5 rounded-btn bg-surface-2 border border-border text-primary font-semibold text-[12px] flex items-center gap-1 hover:bg-surface-2/70 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    {irasytiGalia.isPending ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                    Įrašyti į objektą
                  </button>
                </>
              )}

              {(truksta.moduliai > 0 || truksta.kaupikliai > 0) && (
                <span className="inline-flex items-center gap-1.5 text-warning font-semibold">
                  <TriangleAlert size={13} />
                  {truksta.moduliai > 0 && `${truksta.moduliai} modul. be galios`}
                  {truksta.moduliai > 0 && truksta.kaupikliai > 0 && ', '}
                  {truksta.kaupikliai > 0 && `${truksta.kaupikliai} kaup. be talpos`}
                </span>
              )}
            </div>
          )}
        </div>

        {!list ? (
          <div className="px-5 py-10 flex flex-col items-center gap-3">
            <Package size={32} className="text-subtle" />
            <p className="text-[14px] text-subtle">Žiniaraštis dar nesukurtas.</p>
            <button
              onClick={() => sukurti.mutate()}
              disabled={sukurti.isPending}
              className="h-[38px] px-4 rounded-btn bg-primary text-white font-semibold text-[13px] flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
            >
              {sukurti.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Sukurti žiniaraštį
            </button>
          </div>
        ) : (
          <>
            {/* Filtras ir paieška — tas pats raštas kaip Kataloge. */}
            {visosEilutes.length > 0 && (
              <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-card bg-surface-2 p-1 shrink-0">
                  {([['all', 'Visi'], ['equipment', 'Įranga'], ['material', 'Medžiagos']] as const).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setRusis(id)}
                      className={`h-[28px] px-3 rounded-btn text-[12px] font-semibold transition-colors cursor-pointer ${
                        rusis === id ? 'bg-surface text-primary dark:text-primary-ink shadow-sm' : 'text-subtle hover:text-text'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[160px]">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
                  <input
                    type="text"
                    value={paieska}
                    onChange={(e) => setPaieska(e.target.value)}
                    placeholder="Ieškoti eilutės ar kodo..."
                    className="w-full h-[32px] pl-8 pr-2 bg-surface-2 border border-border rounded-input text-[13px] text-text placeholder-subtle focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}

            {eilutes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[640px]">
                  {/* Stulpelių antraštės buvo pagrindinis trūkumas: skaičiai
                      stovėjo be paaiškinimo, o su faktu jų bus keturi. */}
                  <thead>
                    <tr className="border-b border-border bg-surface-2/50">
                      <th className="text-left pl-5 pr-3 py-2 text-[11px] font-bold text-subtle uppercase tracking-wider">Pavadinimas</th>
                      <th className="text-left px-3 py-2 text-[11px] font-bold text-subtle uppercase tracking-wider w-[120px]">Kodas</th>
                      <th className="text-right px-3 py-2 text-[11px] font-bold text-subtle uppercase tracking-wider w-[110px]">Planuota</th>
                      {rodytiIsduota && (
                        <th className="text-right px-3 py-2 text-[11px] font-bold text-subtle uppercase tracking-wider w-[90px]">Išduota</th>
                      )}
                      {rodytiFakta && (
                        <>
                          <th className="text-right px-3 py-2 text-[11px] font-bold text-subtle uppercase tracking-wider w-[90px]">Faktas</th>
                          <th className="text-right px-3 py-2 text-[11px] font-bold text-subtle uppercase tracking-wider w-[80px]">Skirtumas</th>
                        </>
                      )}
                      <th className="px-3 py-2 w-[48px]" />
                    </tr>
                  </thead>

                  {[...grupes.entries()].map(([kategorija, grupesEilutes]) => {
                    const suskleista = suskleistos.has(kategorija);
                    return (
                      <tbody key={kategorija} className="border-b border-border last:border-none">
                        <tr>
                          <td colSpan={stulpeliu} className="p-0">
                            <button
                              onClick={() => setSuskleistos((s) => {
                                const n = new Set(s);
                                if (n.has(kategorija)) n.delete(kategorija); else n.add(kategorija);
                                return n;
                              })}
                              className="w-full flex items-center gap-2 px-5 py-2 bg-surface-2/50 hover:bg-surface-2 transition-colors cursor-pointer text-left"
                            >
                              <ChevronRight size={14} className={`text-subtle transition-transform ${suskleista ? '' : 'rotate-90'}`} />
                              <span className="text-[12px] font-bold text-muted uppercase tracking-wider">{kategorija}</span>
                              <span className="ml-auto text-[12px] text-subtle">{grupesEilutes.length}</span>
                            </button>
                          </td>
                        </tr>

                        {!suskleista && grupesEilutes.map((l) => {
                          const palyginimas = compareQty(l.qty_planned, l.qty_actual);
                          const delta = qtyDelta(l.qty_planned, l.qty_actual);
                          return (
                            <tr key={l.id} className="border-t border-border/50 hover:bg-surface-2/40 transition-colors">
                              <td className="pl-11 pr-3 py-1.5 text-text">
                                {lineLabel(l)}
                                {lineIsEquipment(l) && (
                                  <span className="ml-2 text-[10px] font-bold text-subtle uppercase">įranga</span>
                                )}
                                {/* Moduliams ir kaupikliams — savybė čia pat.
                                    Rašoma į katalogą, tad įvedus vieną kartą
                                    ji atsiranda visuose objektuose. */}
                                {(() => {
                                  const spec = specKindFor(l.catalog?.category);
                                  if (!spec || !l.catalog_item_id) return null;
                                  const dabartine = spec === 'power' ? l.catalog?.power_w : l.catalog?.capacity_kwh;
                                  const vienetas = spec === 'power' ? 'W' : 'kWh';
                                  return (
                                    <span className="inline-flex items-center gap-1 ml-2 align-middle">
                                      <input
                                        type="text"
                                        defaultValue={dabartine == null ? '' : String(dabartine)}
                                        placeholder="?"
                                        title={`${spec === 'power' ? 'Galia' : 'Talpa'} vienam vienetui — įrašoma į katalogą ir galioja visiems objektams`}
                                        onBlur={(e) => {
                                          const v = e.target.value;
                                          const dabar = dabartine == null ? '' : String(dabartine);
                                          if (v !== dabar && l.catalog_item_id) {
                                            keistiSpec.mutate({ catalogId: l.catalog_item_id, kind: spec, v });
                                          }
                                        }}
                                        className={`w-[58px] h-[24px] px-1.5 text-right tabular-nums rounded-input text-[12px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors ${
                                          dabartine == null
                                            ? 'bg-warning-bg border border-warning/40'
                                            : 'bg-surface-2 border border-border'
                                        }`}
                                      />
                                      <span className="text-[11px] text-subtle">{vienetas}</span>
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className="px-3 py-1.5 text-subtle tabular-nums">{l.catalog?.code ?? '—'}</td>

                              <td className="px-3 py-1">
                                {redaguojama ? (
                                  <input
                                    type="text"
                                    defaultValue={l.qty_planned == null ? '' : String(l.qty_planned)}
                                    placeholder="—"
                                    onBlur={(e) => {
                                      const v = e.target.value;
                                      const dabar = l.qty_planned == null ? '' : String(l.qty_planned);
                                      if (v !== dabar) keistiKieki.mutate({ id: l.id, v });
                                    }}
                                    className="w-full h-[30px] px-2 text-right tabular-nums bg-surface-2 border border-border rounded-input text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors"
                                  />
                                ) : (
                                  <div className="text-right tabular-nums text-text pr-2">
                                    {kiekis(l.qty_planned)} <span className="text-subtle text-[11px]">{l.unit}</span>
                                  </div>
                                )}
                              </td>

                              {rodytiIsduota && (
                                <td className="px-3 py-1.5 text-right tabular-nums text-muted">{kiekis(l.qty_issued)}</td>
                              )}

                              {rodytiFakta && (
                                <>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-text font-semibold">{kiekis(l.qty_actual)}</td>
                                  <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${
                                    palyginimas === 'daugiau' ? 'text-warning'
                                    : palyginimas === 'maziau' ? 'text-info'
                                    : 'text-subtle'
                                  }`}>
                                    {delta == null ? '—' : delta > 0 ? `+${delta}` : delta}
                                  </td>
                                </>
                              )}

                              <td className="px-3 py-1.5">
                                {redaguojama ? (
                                  <button
                                    onClick={() => trinti.mutate(l.id)}
                                    title="Pašalinti eilutę"
                                    className="w-7 h-7 flex items-center justify-center rounded-btn text-subtle hover:text-danger hover:bg-danger-bg transition-colors cursor-pointer"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                ) : (
                                  <span className="block w-7" />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            ) : visosEilutes.length > 0 ? (
              <p className="px-5 py-6 text-[13px] text-subtle italic">Pagal filtrą nieko nerasta.</p>
            ) : null}

            {/* Nauja eilutė — tik kol žiniaraštis atviras. */}
            {redaguojama ? (
              <div className="px-5 py-3.5 border-t border-border bg-surface-2/30 flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-semibold text-subtle mb-1">Iš katalogo</label>
                  <select
                    value={naujasKatalogas}
                    onChange={(e) => { setNaujasKatalogas(e.target.value); if (e.target.value) setNaujasVardas(''); }}
                    className="w-full h-[36px] px-2 bg-surface border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="">— pasirinkti —</option>
                    {[...katalogoGrupes.entries()].map(([kat, irasai]) => (
                      <optgroup key={kat} label={kat}>
                        {(irasai ?? []).map((k) => (
                          <option key={k.id} value={k.id}>{catalogItemLabel(k)} ({k.unit})</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="flex-1 min-w-[160px]">
                  <label className="block text-[11px] font-semibold text-subtle mb-1">arba savas pavadinimas</label>
                  <input
                    type="text"
                    value={naujasVardas}
                    onChange={(e) => { setNaujasVardas(e.target.value); if (e.target.value) setNaujasKatalogas(''); }}
                    placeholder="Pvz.: DC kabelis 6 mm²"
                    className="w-full h-[36px] px-2 bg-surface border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="w-[110px]">
                  <label className="block text-[11px] font-semibold text-subtle mb-1">Kiekis</label>
                  <input
                    type="text"
                    value={naujasKiekis}
                    onChange={(e) => setNaujasKiekis(e.target.value)}
                    placeholder="nežinomas"
                    className="w-full h-[36px] px-2 text-right tabular-nums bg-surface border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary"
                  />
                </div>

                <button
                  onClick={() => pridetiEilute.mutate()}
                  disabled={!galimaPridėti || pridetiEilute.isPending}
                  className="h-[36px] px-4 rounded-btn bg-primary text-white font-semibold text-[13px] flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
                >
                  {pridetiEilute.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Pridėti
                </button>
              </div>
            ) : (
              <div className="px-5 py-3 border-t border-border bg-surface-2/30 flex items-center gap-2 text-[13px] text-subtle">
                <Lock size={14} className="shrink-0" />
                Žiniaraštis užrakintas — būsena „{STATUS_LABELS[busena]}". Keisti galima tik grąžinus taisyti.
              </div>
            )}
          </>
        )}
      </div>

      {/* Šablonai — tik kol dar pildoma. */}
      {redaguojama && (sablonai ?? []).length > 0 && (
        <div className="bg-surface rounded-card border border-border shadow-sm p-5">
          <h3 className="font-semibold text-[15px] text-text mb-1">Pildyti iš šablono</h3>
          <p className="text-[12px] text-subtle mb-3">
            Eilutės pridedamos prie esamų. Kiekiai apskaičiuojami pagal objekto galią ir įrangą,
            o ko apskaičiuoti negalima — paliekama tuščia.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <select
              value={sablonas}
              onChange={(e) => setSablonas(e.target.value)}
              className="flex-1 min-w-[220px] h-[36px] px-2 bg-surface-2 border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="">— pasirinkti šabloną —</option>
              {tinkami.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.system_type ? ` · ${s.system_type}` : ''}
                </option>
              ))}
              {netinkami.length > 0 && (
                <optgroup label="Kitiems objektų tipams">
                  {netinkami.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {siteTypeLabel(s.site_type)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              onClick={() => isSablono.mutate()}
              disabled={!sablonas || isSablono.isPending}
              className="h-[36px] px-4 rounded-btn bg-surface-2 border border-border text-primary font-semibold text-[13px] flex items-center gap-1.5 hover:bg-surface-2/70 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {isSablono.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
              Pildyti
            </button>
          </div>
        </div>
      )}

      {redaguojama && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-card bg-info-bg border border-info/30 text-[13px] text-text">
          <Info size={15} className="text-info shrink-0 mt-0.5" />
          <span>
            Tuščias kiekis reiškia <span className="font-semibold">„reikės, bet kiek — dar nežinome"</span>,
            o ne nulį. Tokias eilutes montuotojas užpildys pagal faktą.
          </span>
        </div>
      )}
    </div>
  );
}
