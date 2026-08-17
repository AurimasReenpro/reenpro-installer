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

/**
 * Užrašai sudėti taip, kad eilutė skaitytųsi kaip formulė: kiekio stulpelis
 * plius šis tekstas duoda „12 × objekto galią (kWp)“. Ankstesni trumpiniai
 * („Už kWp“) nepasakė, kad tai daugyba, ir buvo nesuprantami.
 */
export const BASIS_LABELS: Record<TemplateBasis, string> = {
  fixed:        'tiek, kiek nurodyta',
  per_kwp:      '× objekto galią (kWp)',
  per_panel:    '× modulių skaičių',
  per_inverter: '× inverterių skaičių',
};

/** Trumpas paaiškinimas, ką reikšmė daro. Rodomas prie pasirinkimo. */
export const BASIS_HINTS: Record<TemplateBasis, string> = {
  fixed:        'Kiekis nesikeičia, koks objektas bebūtų.',
  per_kwp:      'Kiekis dauginamas iš objekto galios kilovatais.',
  per_panel:    'Kiekis dauginamas iš objekto modulių skaičiaus.',
  per_inverter: 'Kiekis dauginamas iš objekto inverterių skaičiaus.',
};

/**
 * Pavyzdys žmogui: „12 × objekto galią (kWp) → 5,55 kWp objektui bus 66,6“.
 * Rodomas prie formos, kad nereikėtų spėlioti, ką pasirinkimas reiškia.
 */
export function basisExample(qty: number, basis: TemplateBasis): string {
  if (!Number.isFinite(qty)) return '';
  if (basis === 'fixed') return `Bus visada ${qty}.`;

  const pvz: Record<Exclude<TemplateBasis, 'fixed'>, { tekstas: string; reiksme: number }> = {
    per_kwp:      { tekstas: '5,55 kWp objektui', reiksme: 5.55 },
    per_panel:    { tekstas: '10 modulių objektui', reiksme: 10 },
    per_inverter: { tekstas: '2 inverterių objektui', reiksme: 2 },
  };
  const p = pvz[basis];
  const rezultatas = Math.round(qty * p.reiksme * 100) / 100;
  return `Pvz.: ${p.tekstas} bus ${String(rezultatas).replace('.', ',')}.`;
}

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
