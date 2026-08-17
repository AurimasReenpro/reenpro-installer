import { parseEquipmentDetails } from '../types/equipment.types';

/**
 * Šablono eilutės kiekio skaičiavimas.
 *
 * Dalis medžiagų fiksuotos (pvz., viena apsauga objektui), dalis auga su
 * sistema (kabelis pagal galią, spaustukai pagal modulių skaičių). Be to
 * šablonas duotų sąrašą, kurį vis tiek tektų taisyti ranka.
 *
 * Žr. `supabase/MEDZIAGU-EIGA.md`.
 */

export const TEMPLATE_BASES = ['fixed', 'per_kwp', 'per_panel', 'per_inverter'] as const;
export type TemplateBasis = (typeof TEMPLATE_BASES)[number];

export const BASIS_LABELS: Record<TemplateBasis, string> = {
  fixed:        'Fiksuotas',
  per_kwp:      'Už kWp',
  per_panel:    'Už modulį',
  per_inverter: 'Už inverterį',
};

/** Kategorijų vardai, pagal kuriuos atpažįstami moduliai ir inverteriai. */
const MODULIU_KATEGORIJA   = 'moduliai';
const INVERTERIO_KATEGORIJA = 'inverteris';

export interface SiteMetrics {
  kwp: number | null;
  panels: number;
  inverters: number;
}

/**
 * Ištraukia dydžius, pagal kuriuos skaičiuojami šablono kiekiai.
 *
 * `equipment_details` dalyje objektų yra masyvas, dalyje — tuščias objektas ar
 * senas raktas-reikšmė formatas, todėl naudojamas jau esamas
 * `parseEquipmentDetails`, kuris visus tris atvejus suvienodina.
 */
export function siteMetricsFrom(site: {
  kwp?: number | string | null;
  equipment_details?: unknown;
}): SiteMetrics {
  const items = parseEquipmentDetails(site.equipment_details);

  const sumBy = (raktas: string) => items
    .filter((i) => i.category.trim().toLowerCase().includes(raktas))
    .reduce((sum, i) => sum + (Number.isFinite(i.quantity) ? i.quantity : 0), 0);

  const kwpRaw = site.kwp;
  const kwp = kwpRaw == null || kwpRaw === '' ? null : Number(kwpRaw);

  return {
    kwp: kwp != null && Number.isFinite(kwp) ? kwp : null,
    panels:    sumBy(MODULIU_KATEGORIJA),
    inverters: sumBy(INVERTERIO_KATEGORIJA),
  };
}

/**
 * Kiekis eilutei pagal pasirinktą pagrindą.
 *
 * Grąžina `null`, kai skaičiuoti nėra iš ko — pavyzdžiui, kabelis pagal kWp,
 * o objekto galia dar nesuvesta. Tai NE klaida: `null` žiniaraštyje reiškia
 * „reikės, bet kiek dar nežinome“, ir montuotojas kiekį suves pagal faktą.
 * Būtent tam ta reikšmė duomenų modelyje ir atskirta nuo nulio.
 *
 * Nesuapvalinama iki sveiko sąmoningai: 12 m/kWp × 5,55 kWp = 66,6 m yra
 * teisingesnis atspirties taškas inžinieriui nei „apie 67“.
 */
export function resolveTemplateQty(
  qty: number,
  basis: TemplateBasis,
  m: SiteMetrics,
): number | null {
  if (!Number.isFinite(qty)) return null;

  const daugiklis = (() => {
    switch (basis) {
      case 'fixed':        return 1;
      case 'per_kwp':      return m.kwp;
      case 'per_panel':    return m.panels    > 0 ? m.panels    : null;
      case 'per_inverter': return m.inverters > 0 ? m.inverters : null;
    }
  })();

  if (daugiklis == null) return null;
  return Math.round(qty * daugiklis * 100) / 100;
}
