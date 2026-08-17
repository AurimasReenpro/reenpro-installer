import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Package, FileSpreadsheet, Info } from 'lucide-react';
import {
  getSiteMaterialList, ensureSiteMaterialList, getMaterialCatalog, getMaterialTemplates,
  addMaterialLine, updateMaterialLine, deleteMaterialLine, applyTemplateToList,
  catalogItemLabel, lineLabel,
  type MaterialLine,
} from '../../../api/materials';
import type { SiteWithTeam } from './types';

export default function MaterialsTab({ site, siteId }: { site: SiteWithTeam; siteId: string }) {
  const qc = useQueryClient();
  const [naujasVardas, setNaujasVardas] = useState('');
  const [naujasKatalogas, setNaujasKatalogas] = useState('');
  const [naujasKiekis, setNaujasKiekis] = useState('');
  const [sablonas, setSablonas] = useState('');

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
      return applyTemplateToList(l.id, sablonas, site);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
      </div>
    );
  }

  const eilutes: MaterialLine[] = list?.lines ?? [];
  const galimaPridėti = naujasKatalogas !== '' || naujasVardas.trim() !== '';
  const beKiekio = eilutes.filter((l) => l.qty_planned == null).length;

  return (
    <div className="space-y-5">
      <div className="bg-surface rounded-card border border-border shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
          <FileSpreadsheet size={18} className="text-primary" />
          <h3 className="font-semibold text-[15px] text-text">Medžiagų žiniaraštis</h3>
          <span className="ml-auto text-[12px] text-subtle">
            {eilutes.length} eilut{eilutes.length === 1 ? 'ė' : 'ės'}
            {beKiekio > 0 && <span className="text-warning font-semibold"> · {beKiekio} be kiekio</span>}
          </span>
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
            {eilutes.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/60 text-[11px] uppercase tracking-wider text-subtle">
                      <th className="text-left font-bold px-5 py-2.5">Medžiaga</th>
                      <th className="text-left font-bold px-3 py-2.5 w-[110px]">Kodas</th>
                      <th className="text-right font-bold px-3 py-2.5 w-[130px]">Planuojama</th>
                      <th className="text-left font-bold px-3 py-2.5 w-[70px]">Vnt.</th>
                      <th className="w-[52px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {eilutes.map((l) => (
                      <tr key={l.id} className="border-b border-border/60 last:border-none hover:bg-surface-2/40 transition-colors">
                        <td className="px-5 py-2.5 text-text">{lineLabel(l)}</td>
                        <td className="px-3 py-2.5 text-subtle tabular-nums">{l.catalog?.code ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            defaultValue={l.qty_planned == null ? '' : String(l.qty_planned)}
                            placeholder="—"
                            onBlur={(e) => {
                              const v = e.target.value;
                              const dabar = l.qty_planned == null ? '' : String(l.qty_planned);
                              if (v !== dabar) keistiKieki.mutate({ id: l.id, v });
                            }}
                            className="w-full h-[32px] px-2 text-right tabular-nums bg-surface-2 border border-border rounded-input text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-subtle">{l.unit}</td>
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => trinti.mutate(l.id)}
                            title="Pašalinti eilutę"
                            className="w-7 h-7 flex items-center justify-center rounded-btn text-subtle hover:text-danger hover:bg-danger-bg transition-colors cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Nauja eilutė */}
            <div className="px-5 py-3.5 border-t border-border bg-surface-2/30 flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[11px] font-semibold text-subtle mb-1">Iš katalogo</label>
                <select
                  value={naujasKatalogas}
                  onChange={(e) => { setNaujasKatalogas(e.target.value); if (e.target.value) setNaujasVardas(''); }}
                  className="w-full h-[36px] px-2 bg-surface border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="">— pasirinkti —</option>
                  {(katalogas ?? []).map((k) => (
                    <option key={k.id} value={k.id}>{catalogItemLabel(k)} ({k.unit})</option>
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
          </>
        )}
      </div>

      {/* Šablonai */}
      {(sablonai ?? []).length > 0 && (
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
              {(sablonai ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
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

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-card bg-info-bg border border-info/30 text-[13px] text-text">
        <Info size={15} className="text-info shrink-0 mt-0.5" />
        <span>
          Tuščias kiekis reiškia <span className="font-semibold">„reikės, bet kiek — dar nežinome"</span>,
          o ne nulį. Tokias eilutes montuotojas užpildys pagal faktą.
        </span>
      </div>
    </div>
  );
}
