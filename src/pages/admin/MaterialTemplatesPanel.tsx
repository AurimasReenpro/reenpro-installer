import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Loader2, Plus, Trash2, Search, FileSpreadsheet, ChevronRight, EyeOff, Eye,
} from 'lucide-react';
import { useConfirm } from '../../hooks/useConfirm';
import {
  getAllMaterialTemplates, createMaterialTemplate, updateMaterialTemplate, deleteMaterialTemplate,
  getTemplateLines, addTemplateLine, updateTemplateLine, deleteTemplateLine,
  getMaterialCatalog, catalogItemLabel,
} from '../../api/materials';
import {
  TEMPLATE_BASES, BASIS_LABELS, BASIS_HINTS, basisExample, type TemplateBasis,
} from '../../lib/materialTemplates';

/** Vieno šablono eilutės — atskiras komponentas, kad užklausa keltųsi tik išskleidus. */
function TemplateLines({ templateId }: { templateId: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [katalogoId, setKatalogoId] = useState('');
  const [kiekis, setKiekis] = useState('');
  const [basis, setBasis] = useState<TemplateBasis>('fixed');

  const { data: lines, isLoading } = useQuery({
    queryKey: ['material_template_lines', templateId],
    queryFn: () => getTemplateLines(templateId),
  });

  const { data: katalogas } = useQuery({
    queryKey: ['material_catalog'],
    queryFn: getMaterialCatalog,
  });

  const atnaujinti = () => qc.invalidateQueries({ queryKey: ['material_template_lines', templateId] });

  const prideti = useMutation({
    mutationFn: () => {
      const qty = Number(kiekis.replace(',', '.'));
      if (!Number.isFinite(qty) || qty < 0) throw new Error('Neteisingas kiekis.');
      if (!katalogoId) throw new Error('Pasirinkite katalogo įrašą.');
      return addTemplateLine(templateId, { catalog_item_id: katalogoId, qty, basis });
    },
    onSuccess: () => { void atnaujinti(); setKatalogoId(''); setKiekis(''); setBasis('fixed'); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  const keisti = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { qty?: number; basis?: TemplateBasis } }) =>
      updateTemplateLine(id, patch),
    onSuccess: () => void atnaujinti(),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  const trinti = useMutation({
    mutationFn: (id: string) => deleteTemplateLine(id),
    onSuccess: () => void atnaujinti(),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  if (isLoading) {
    return (
      <div className="px-5 py-6 flex items-center gap-2 text-subtle text-[13px]">
        <Loader2 size={14} className="animate-spin" /> Kraunamos eilutės…
      </div>
    );
  }

  return (
    <div className="border-t border-border">
      {/* Eilutė skaitosi kaip formulė: kiekis × pagrindas. Be šio paaiškinimo
          „Už kWp" niekam nieko nesako. */}
      <p className="px-5 py-2.5 text-[12px] text-muted bg-info-bg/40 border-b border-border">
        Kiekvienos eilutės kiekis skaitomas kaip <span className="font-semibold">skaičius × pagrindas</span>.
        Pvz. <span className="font-semibold">12 × objekto galią (kWp)</span> reiškia, kad 5,55 kWp
        objektui bus įrašyta 66,6.
      </p>

      {(lines ?? []).length > 0 ? (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-surface-2/40 text-[11px] uppercase tracking-wider text-subtle">
              <th className="text-left font-bold px-5 py-2">Įrašas</th>
              <th className="text-right font-bold px-3 py-2 w-[110px]">Kiekis</th>
              <th className="text-left font-bold px-3 py-2 w-[200px]">Kiekis skaičiuojamas</th>
              <th className="text-left font-bold px-3 py-2 w-[70px]">Vnt.</th>
              <th className="w-[52px]" />
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((l) => (
              <tr key={l.id} className="border-b border-border/60 last:border-none">
                <td className="px-5 py-2 text-text">
                  {l.catalog ? catalogItemLabel(l.catalog) : '—'}
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="text"
                    defaultValue={String(l.qty)}
                    onBlur={(e) => {
                      const v = Number(e.target.value.replace(',', '.'));
                      if (Number.isFinite(v) && v !== Number(l.qty)) keisti.mutate({ id: l.id, patch: { qty: v } });
                    }}
                    className="w-full h-[30px] px-2 text-right tabular-nums bg-surface-2 border border-border rounded-input text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={l.basis}
                    onChange={(e) => keisti.mutate({ id: l.id, patch: { basis: e.target.value as TemplateBasis } })}
                    className="w-full h-[30px] px-1.5 bg-surface-2 border border-border rounded-input text-text focus:outline-none focus:border-primary cursor-pointer"
                  >
                    {TEMPLATE_BASES.map((b) => <option key={b} value={b}>{BASIS_LABELS[b]}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-subtle">{l.catalog?.unit ?? '—'}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => void (async () => {
                      if (await confirm({ title: 'Pašalinti eilutę?', message: 'Šablonas bus be šios medžiagos.', variant: 'danger' })) {
                        trinti.mutate(l.id);
                      }
                    })()}
                    className="w-7 h-7 flex items-center justify-center rounded-btn text-subtle hover:text-danger hover:bg-danger-bg transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-5 py-4 text-[13px] text-subtle italic">Šablonas tuščias.</p>
      )}

      {/* Nauja eilutė */}
      <div className="px-5 py-3 bg-surface-2/30 border-t border-border flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-semibold text-subtle mb-1">Katalogo įrašas</label>
          <select
            value={katalogoId}
            onChange={(e) => {
              setKatalogoId(e.target.value);
              const k = katalogas?.find((x) => x.id === e.target.value);
              // Įranga skaičiuojama vienetais, medžiagos dažniau pagal dydį —
              // pradinė reikšmė parenkama pagal rūšį, bet keičiama laisvai.
              if (k) setBasis(k.kind === 'equipment' ? 'fixed' : 'per_kwp');
            }}
            className="w-full h-[34px] px-2 bg-surface border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="">— pasirinkti —</option>
            {(katalogas ?? []).map((k) => (
              <option key={k.id} value={k.id}>{catalogItemLabel(k)} ({k.unit})</option>
            ))}
          </select>
        </div>
        <div className="w-[100px]">
          <label className="block text-[11px] font-semibold text-subtle mb-1">Kiekis</label>
          <input
            type="text"
            value={kiekis}
            onChange={(e) => setKiekis(e.target.value)}
            placeholder="0"
            className="w-full h-[34px] px-2 text-right tabular-nums bg-surface border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary"
          />
        </div>
        <div className="w-[210px]">
          <label className="block text-[11px] font-semibold text-subtle mb-1">Kiekis skaičiuojamas</label>
          <select
            value={basis}
            onChange={(e) => setBasis(e.target.value as TemplateBasis)}
            title={BASIS_HINTS[basis]}
            className="w-full h-[34px] px-2 bg-surface border border-border rounded-input text-[13px] text-text focus:outline-none focus:border-primary cursor-pointer"
          >
            {TEMPLATE_BASES.map((b) => <option key={b} value={b}>{BASIS_LABELS[b]}</option>)}
          </select>
        </div>
        <button
          onClick={() => prideti.mutate()}
          disabled={!katalogoId || kiekis.trim() === '' || prideti.isPending}
          className="h-[34px] px-4 rounded-btn bg-primary text-white font-semibold text-[13px] flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
        >
          {prideti.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Pridėti
        </button>

        {/* Gyvas pavyzdys su įvestu skaičiumi — greičiausias būdas suprasti,
            ką pasirinkimas padarys, nepridėjus eilutės ir netikrinant. */}
        {kiekis.trim() !== '' && Number.isFinite(Number(kiekis.replace(',', '.'))) && (
          <p className="w-full text-[12px] text-muted -mt-0.5">
            {BASIS_HINTS[basis]}{' '}
            <span className="font-semibold text-text">
              {basisExample(Number(kiekis.replace(',', '.')), basis)}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

export default function MaterialTemplatesPanel() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [paieska, setPaieska] = useState('');
  const [atidarytas, setAtidarytas] = useState<string | null>(null);
  const [naujoVardas, setNaujoVardas] = useState('');

  const { data: templates, isLoading } = useQuery({
    queryKey: ['material_templates_all'],
    queryFn: getAllMaterialTemplates,
  });

  const atnaujinti = () => {
    void qc.invalidateQueries({ queryKey: ['material_templates_all'] });
    void qc.invalidateQueries({ queryKey: ['material_templates'] });
  };

  const kurti = useMutation({
    mutationFn: () => createMaterialTemplate({ name: naujoVardas.trim() }),
    onSuccess: (t) => { atnaujinti(); setNaujoVardas(''); setAtidarytas(t.id); toast.success('Šablonas sukurtas.'); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  const keisti = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateMaterialTemplate>[1] }) =>
      updateMaterialTemplate(id, patch),
    onSuccess: () => atnaujinti(),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  const trinti = useMutation({
    mutationFn: (id: string) => deleteMaterialTemplate(id),
    onSuccess: () => { atnaujinti(); toast.success('Šablonas ištrintas.'); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  const rasti = (templates ?? []).filter((t) =>
    !paieska || t.name.toLowerCase().includes(paieska.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* Paieška + naujas */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            value={paieska}
            onChange={(e) => setPaieska(e.target.value)}
            placeholder="Ieškoti šablono..."
            className="w-full h-[40px] pl-9 pr-4 bg-surface border border-border rounded-card text-[14px] text-text placeholder-subtle focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary transition-all"
          />
        </div>
        <input
          type="text"
          value={naujoVardas}
          onChange={(e) => setNaujoVardas(e.target.value)}
          placeholder="Naujo šablono pavadinimas"
          className="h-[40px] px-3 min-w-[220px] bg-surface border border-border rounded-card text-[14px] text-text placeholder-subtle focus:outline-none focus:border-primary"
        />
        <button
          onClick={() => kurti.mutate()}
          disabled={!naujoVardas.trim() || kurti.isPending}
          className="h-[40px] px-4 rounded-card bg-primary text-white font-medium flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
        >
          {kurti.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Sukurti
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : rasti.length === 0 ? (
        <div className="bg-surface border border-border rounded-card py-14 flex flex-col items-center gap-2">
          <FileSpreadsheet size={36} className="text-subtle" />
          <p className="text-[14px] text-subtle font-semibold">
            {(templates ?? []).length === 0 ? 'Šablonų dar nėra.' : 'Nerasta atitikmenų.'}
          </p>
          {(templates ?? []).length === 0 && (
            <p className="text-[13px] text-subtle max-w-[420px] text-center">
              Šablonas leidžia vienu paspaudimu užpildyti objekto žiniaraštį. Kiekiai gali būti
              fiksuoti arba skaičiuojami pagal galią, modulių ar inverterių skaičių.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {rasti.map((t) => {
            const isOpen = atidarytas === t.id;
            return (
              <div key={t.id} className="bg-surface border border-border rounded-card shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3">
                  <button
                    onClick={() => setAtidarytas(isOpen ? null : t.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <ChevronRight
                      size={16}
                      className={`text-subtle transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                    />
                    <span className={`font-semibold text-[14px] truncate ${t.is_active ? 'text-text' : 'text-subtle line-through'}`}>
                      {t.name}
                    </span>
                  </button>

                  <button
                    onClick={() => keisti.mutate({ id: t.id, patch: { is_active: !t.is_active } })}
                    title={t.is_active ? 'Paslėpti iš pasirinkimo' : 'Grąžinti į pasirinkimą'}
                    className="w-8 h-8 flex items-center justify-center rounded-btn text-subtle hover:text-primary hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    {t.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>

                  <button
                    onClick={() => void (async () => {
                      if (await confirm({
                        title: 'Ištrinti šabloną?',
                        message: `„${t.name}" ir jo eilutės bus pašalinti. Jau sukurti žiniaraščiai nepasikeis.`,
                        variant: 'danger',
                      })) trinti.mutate(t.id);
                    })()}
                    className="w-8 h-8 flex items-center justify-center rounded-btn text-subtle hover:text-danger hover:bg-danger-bg transition-colors cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {isOpen && <TemplateLines templateId={t.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
