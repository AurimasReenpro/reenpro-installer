import { supabase } from '../lib/supabase';
import { resolveTemplateQty, siteMetricsFrom, type TemplateBasis } from '../lib/materialTemplates';

/**
 * Medžiagų žiniaraštis: katalogas, eilutės ir šablonai.
 *
 * 1 etapas — tik duomenys. Būsenų eigos, pranešimų ir atsargų čia nėra;
 * atsargų ir nebus, nes likučius seka Rivilė. Žr. `supabase/MEDZIAGU-EIGA.md`.
 */

// ── Katalogas ────────────────────────────────────────────────────────────────

export interface MaterialCatalogItem {
  id: string;
  category: string;
  brand: string;
  model: string;
  unit: string;
  code: string | null;
  kind: 'equipment' | 'material';
  is_active: boolean;
}

/** Katalogo įrašai rinkikliui. Neaktyvūs nerodomi, bet senose eilutėse lieka. */
export async function getMaterialCatalog(): Promise<MaterialCatalogItem[]> {
  const { data, error } = await supabase
    .from('equipment_catalog')
    .select('id, category, brand, model, unit, code, kind, is_active')
    .eq('is_active', true)
    .order('category')
    .order('brand');
  if (error) throw error;
  return (data ?? []) as MaterialCatalogItem[];
}

/** Katalogo įrašo pavadinimas vienoje eilutėje. */
export function catalogItemLabel(item: Pick<MaterialCatalogItem, 'brand' | 'model'>): string {
  return [item.brand, item.model].filter(Boolean).join(' ').trim();
}

// ── Žiniaraštis ──────────────────────────────────────────────────────────────

export interface MaterialLine {
  id: string;
  list_id: string;
  catalog_item_id: string | null;
  /** Laisvas vardas — naudojamas tik tada, kai katalogo įrašo nėra. */
  name: string | null;
  unit: string;
  /** `null` reiškia „reikės, bet kiek dar nežinome“ — NE nulį. */
  qty_planned: number | null;
  qty_issued: number | null;
  qty_actual: number | null;
  qty_returned: number | null;
  note: string | null;
  sort_order: number;
  catalog: { brand: string; model: string; category: string; code: string | null } | null;
}

export interface MaterialList {
  id: string;
  site_id: string;
  status: string;
  version: number;
  template_id: string | null;
  lines: MaterialLine[];
}

/** Eilutės pavadinimas rodymui: katalogo įrašas arba ranka įvestas vardas. */
export function lineLabel(line: MaterialLine): string {
  if (line.catalog) return catalogItemLabel(line.catalog);
  return line.name?.trim() || 'Be pavadinimo';
}

/**
 * Naujausias objekto žiniaraštis su eilutėmis, arba `null`, jei dar nesukurtas.
 *
 * Versijų gali būti kelios (taisant po pateikimo kuriama nauja), tad imama
 * didžiausia.
 */
export async function getSiteMaterialList(siteId: string): Promise<MaterialList | null> {
  const { data: list, error } = await supabase
    .from('site_material_lists')
    .select('id, site_id, status, version, template_id')
    .eq('site_id', siteId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!list) return null;

  const { data: lines, error: linesErr } = await supabase
    .from('site_material_lines')
    .select(`
      id, list_id, catalog_item_id, name, unit,
      qty_planned, qty_issued, qty_actual, qty_returned, note, sort_order,
      catalog:equipment_catalog(brand, model, category, code)
    `)
    .eq('list_id', list.id)
    .order('sort_order')
    .order('created_at');
  if (linesErr) throw linesErr;

  return { ...list, lines: (lines ?? []) as unknown as MaterialLine[] };
}

/** Sukuria žiniaraštį, jei objektas jo dar neturi. Grąžina esamą arba naują. */
export async function ensureSiteMaterialList(siteId: string): Promise<MaterialList> {
  const esamas = await getSiteMaterialList(siteId);
  if (esamas) return esamas;

  const { data, error } = await supabase
    .from('site_material_lists')
    .insert({ site_id: siteId })
    .select('id, site_id, status, version, template_id')
    .single();
  if (error) throw error;
  return { ...data, lines: [] };
}

export interface MaterialLineInput {
  catalog_item_id?: string | null;
  name?: string | null;
  unit: string;
  qty_planned?: number | null;
  note?: string | null;
  sort_order?: number;
}

export async function addMaterialLine(listId: string, input: MaterialLineInput): Promise<void> {
  const { error } = await supabase
    .from('site_material_lines')
    .insert({ list_id: listId, ...input });
  if (error) throw error;
}

export async function updateMaterialLine(
  id: string,
  patch: Partial<Omit<MaterialLineInput, 'unit'> & { unit: string }>,
): Promise<void> {
  const { error } = await supabase.from('site_material_lines').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteMaterialLine(id: string): Promise<void> {
  const { error } = await supabase.from('site_material_lines').delete().eq('id', id);
  if (error) throw error;
}

// ── Šablonai ─────────────────────────────────────────────────────────────────

export interface MaterialTemplate {
  id: string;
  name: string;
  site_type: string | null;
  system_type: string | null;
  is_active: boolean;
}

export async function getMaterialTemplates(): Promise<MaterialTemplate[]> {
  const { data, error } = await supabase
    .from('material_templates')
    .select('id, name, site_type, system_type, is_active')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/** Visi šablonai, įskaitant neaktyvius — valdymo ekranui. */
export async function getAllMaterialTemplates(): Promise<MaterialTemplate[]> {
  const { data, error } = await supabase
    .from('material_templates')
    .select('id, name, site_type, system_type, is_active')
    .order('is_active', { ascending: false })
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/**
 * Šablonų turinio rodyklė paieškai: `templateId → "Sunpower P7 555W Huawei…"`.
 *
 * Reikalinga tam, kad įvedus „Sigenergy" būtų randami šablonai, kuriuose ta
 * įranga YRA eilutėse, o ne tik tie, kurių pavadinime toks žodis. Įranga
 * keičiasi dažniau nei objektų tipai, tad ieškoti turinyje praktiškiau nei
 * kurti jai atskirą klasifikaciją.
 *
 * Viena užklausa visiems šablonams — jų dešimtys, ne tūkstančiai.
 */
export async function getTemplateContentsIndex(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('material_template_lines')
    .select('template_id, catalog:equipment_catalog(brand, model, code)');
  if (error) throw error;

  const rodykle: Record<string, string> = {};
  for (const row of data ?? []) {
    const c = row.catalog as unknown as { brand: string; model: string; code: string | null } | null;
    if (!c) continue;
    const tekstas = [c.brand, c.model, c.code].filter(Boolean).join(' ').toLowerCase();
    rodykle[row.template_id] = `${rodykle[row.template_id] ?? ''} ${tekstas}`.trim();
  }
  return rodykle;
}

export async function createMaterialTemplate(
  input: { name: string; site_type?: string | null; system_type?: string | null },
): Promise<MaterialTemplate> {
  const { data, error } = await supabase
    .from('material_templates')
    .insert(input)
    .select('id, name, site_type, system_type, is_active')
    .single();
  if (error) throw error;
  return data;
}

export async function updateMaterialTemplate(
  id: string,
  patch: Partial<Pick<MaterialTemplate, 'name' | 'site_type' | 'system_type' | 'is_active'>>,
): Promise<void> {
  const { error } = await supabase.from('material_templates').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteMaterialTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('material_templates').delete().eq('id', id);
  if (error) throw error;
}

// ── Šablono eilutės ──────────────────────────────────────────────────────────

export interface TemplateLine {
  id: string;
  template_id: string;
  catalog_item_id: string;
  qty: number;
  basis: TemplateBasis;
  sort_order: number;
  catalog: { brand: string; model: string; unit: string; kind: string } | null;
}

export async function getTemplateLines(templateId: string): Promise<TemplateLine[]> {
  const { data, error } = await supabase
    .from('material_template_lines')
    .select(`
      id, template_id, catalog_item_id, qty, basis, sort_order,
      catalog:equipment_catalog(brand, model, unit, kind)
    `)
    .eq('template_id', templateId)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as unknown as TemplateLine[];
}

export async function addTemplateLine(
  templateId: string,
  input: { catalog_item_id: string; qty: number; basis: TemplateBasis },
): Promise<void> {
  const { error } = await supabase
    .from('material_template_lines')
    .insert({ template_id: templateId, ...input });
  if (error) throw error;
}

export async function updateTemplateLine(
  id: string,
  patch: Partial<{ qty: number; basis: TemplateBasis }>,
): Promise<void> {
  const { error } = await supabase.from('material_template_lines').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteTemplateLine(id: string): Promise<void> {
  const { error } = await supabase.from('material_template_lines').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Sugeneruoja žiniaraščio eilutes iš šablono.
 *
 * Kiekiai atsiejami nuo šablono iš karto: vėlesnis šablono keitimas jau
 * sukurtų žiniaraščių neliečia. Todėl čia įrašomos apskaičiuotos reikšmės, o
 * ne nuoroda į šabloną.
 *
 * Eilutės, kurių kiekio apskaičiuoti neįmanoma (pvz., kabelis pagal kWp, o
 * galia dar nesuvesta), įrašomos su `qty_planned = null`. Tai teisinga būsena,
 * ne klaida — montuotojas kiekį suves pagal faktą.
 */
export async function applyTemplateToList(
  listId: string,
  templateId: string,
  site: { kwp?: number | string | null; equipment_details?: unknown },
  esamosEilutes?: MaterialLine[],
): Promise<{ pridėta: number; beKiekio: number }> {
  const { data: tLines, error } = await supabase
    .from('material_template_lines')
    .select(`
      qty, basis, sort_order,
      catalog:equipment_catalog(id, unit)
    `)
    .eq('template_id', templateId)
    .order('sort_order');
  if (error) throw error;

  // Dydžiai imami iš jau esamų žiniaraščio eilučių: sujungus įrangą su
  // medžiagomis, moduliai ir inverteriai gyvena būtent ten.
  const metrics = siteMetricsFrom(site, esamosEilutes);
  const eilutes = (tLines ?? []).flatMap((t) => {
    const catalog = t.catalog as unknown as { id: string; unit: string } | null;
    if (!catalog) return [];
    const qty = resolveTemplateQty(Number(t.qty), t.basis as TemplateBasis, metrics);
    return [{
      list_id: listId,
      catalog_item_id: catalog.id,
      unit: catalog.unit,
      qty_planned: qty,
      sort_order: t.sort_order,
    }];
  });

  if (eilutes.length > 0) {
    const { error: insErr } = await supabase.from('site_material_lines').insert(eilutes);
    if (insErr) throw insErr;
  }

  await supabase.from('site_material_lists').update({ template_id: templateId }).eq('id', listId);

  return {
    pridėta: eilutes.length,
    beKiekio: eilutes.filter((e) => e.qty_planned == null).length,
  };
}
