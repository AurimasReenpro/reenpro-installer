/**
 * Objekto galia ir talpa iš medžiagų žiniaraščio.
 *
 * Skaičiuojama iš katalogo savybių (`power_w`, `capacity_kwh`) ir žiniaraščio
 * kiekių — NE iš pavadinimo. Senas kodas galią lukšteno reguliariuoju
 * reiškiniu iš teksto, tad moduliai be „W" pavadinime tyliai iškrisdavo iš
 * sumos, o rezultatas vis tiek atrodydavo teisingas.
 */

import { isBatteryCategory } from '../types/equipment.types';

/** Kategorija, kurios įrašams prasminga galia. */
export function isModuleCategory(category: string | null | undefined): boolean {
  return (category ?? '').toLowerCase().includes('modul');
}

/** Tiek reikia žinoti apie eilutę, kad ją būtų galima susumuoti. */
export interface TotalsLine {
  qty_planned: number | null;
  catalog: {
    category: string;
    power_w?: number | null;
    capacity_kwh?: number | null;
  } | null;
}

/**
 * Naudojamas SUPLANUOTAS kiekis, ne faktas.
 *
 * Objekto galia yra projekto dydis: tiek, kiek suprojektuota. Faktas gali
 * skirtis dėl sugadinto modulio ar likučio, bet sistemos galia nuo to
 * nepasikeičia.
 */
function qty(line: TotalsLine): number | null {
  return line.qty_planned;
}

/** Objekto kWp, arba `null`, jei nė vienas modulis neturi galios. */
export function kwpFromLines(lines: TotalsLine[]): number | null {
  let vatai = 0;
  let rasta = false;
  for (const l of lines) {
    if (!isModuleCategory(l.catalog?.category)) continue;
    const w = l.catalog?.power_w;
    const k = qty(l);
    if (w == null || k == null || !(w > 0) || !(k > 0)) continue;
    vatai += w * k;
    rasta = true;
  }
  return rasta ? parseFloat((vatai / 1000).toFixed(2)) : null;
}

/** Objekto kWh, arba `null`, jei nė vienas kaupiklis neturi talpos. */
export function kwhFromLines(lines: TotalsLine[]): number | null {
  let suma = 0;
  let rasta = false;
  for (const l of lines) {
    if (!isBatteryCategory(l.catalog?.category)) continue;
    const c = l.catalog?.capacity_kwh;
    const k = qty(l);
    if (c == null || k == null || !(c > 0) || !(k > 0)) continue;
    suma += c * k;
    rasta = true;
  }
  return rasta ? parseFloat(suma.toFixed(2)) : null;
}

/**
 * Kiek eilučių dar neturi savo savybės.
 *
 * Be šito suma meluotų tyliai: dešimt modulių, iš kurių dviem galia neįvesta,
 * duotų mažesnį kWp, o ekrane niekas nesiskirtų.
 */
export function missingSpecCount(lines: TotalsLine[]): { moduliai: number; kaupikliai: number } {
  let moduliai = 0;
  let kaupikliai = 0;
  for (const l of lines) {
    const kat = l.catalog?.category;
    if (isModuleCategory(kat) && (l.catalog?.power_w ?? null) == null) moduliai++;
    else if (isBatteryCategory(kat) && (l.catalog?.capacity_kwh ?? null) == null) kaupikliai++;
  }
  return { moduliai, kaupikliai };
}

/** Ar eilutei apskritai prasminga savybė, ir kuri. */
export type SpecKind = 'power' | 'capacity' | null;

export function specKindFor(category: string | null | undefined): SpecKind {
  if (isModuleCategory(category)) return 'power';
  if (isBatteryCategory(category)) return 'capacity';
  return null;
}

/** Ar skaičiuota reikšmė prasmingai skiriasi nuo įrašytos objekte. */
export function differsFromStored(computed: number | null, stored: number | null): boolean {
  if (computed == null) return false;
  if (stored == null) return true;
  return Math.abs(computed - stored) > 0.005;
}
