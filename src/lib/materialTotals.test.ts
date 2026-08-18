import { describe, it, expect } from 'vitest';
import {
  isModuleCategory, kwpFromLines, kwhFromLines, missingSpecCount,
  specKindFor, differsFromStored, type TotalsLine,
} from './materialTotals';

const line = (
  category: string,
  qty_planned: number | null,
  spec: { power_w?: number | null; capacity_kwh?: number | null } = {},
): TotalsLine => ({ qty_planned, catalog: { category, ...spec } });

describe('materialTotals', () => {
  it('recognises the module category regardless of how it was renamed', () => {
    // Kategorijas naudotojas gali pervadinti pats, tad rišame prie šaknies.
    expect(isModuleCategory('Moduliai')).toBe(true);
    expect(isModuleCategory('PV moduliai')).toBe(true);
    expect(isModuleCategory('Inverteris')).toBe(false);
    expect(isModuleCategory(null)).toBe(false);
  });

  it('sums kWp from catalog power, not from the name', () => {
    // „Modulis P7-555-COM" pavadinime galios neturi — būtent dėl to laukas ir
    // atsirado.
    expect(kwpFromLines([
      line('Moduliai', 10, { power_w: 555 }),
      line('Moduliai', 4, { power_w: 460 }),
    ])).toBe(7.39);
  });

  it('sums kWh as capacity per unit times quantity', () => {
    expect(kwhFromLines([line('Energijos kaupiklis', 3, { capacity_kwh: 9 })])).toBe(27);
  });

  it('returns null when nothing in the list carries the spec', () => {
    // `null` reiškia „neturime iš ko skaičiuoti" — ne nulį, kuris atrodytų
    // kaip išmatuota reikšmė.
    expect(kwpFromLines([line('Moduliai', 10)])).toBeNull();
    expect(kwpFromLines([line('Inverteris', 1, { power_w: 5000 })])).toBeNull();
    expect(kwhFromLines([])).toBeNull();
  });

  it('skips lines whose quantity is still unknown', () => {
    expect(kwpFromLines([
      line('Moduliai', null, { power_w: 555 }),
      line('Moduliai', 2, { power_w: 500 }),
    ])).toBe(1);
  });

  it('counts lines whose spec is still missing', () => {
    // Be šito suma meluotų tyliai.
    expect(missingSpecCount([
      line('Moduliai', 10, { power_w: 555 }),
      line('Moduliai', 4),
      line('Energijos kaupiklis', 2),
      line('Kabeliai', 100),
    ])).toEqual({ moduliai: 1, kaupikliai: 1 });
  });

  it('tells which spec a category needs', () => {
    expect(specKindFor('Moduliai')).toBe('power');
    expect(specKindFor('Energijos kaupiklis')).toBe('capacity');
    expect(specKindFor('Kabeliai')).toBeNull();
  });

  it('treats a missing stored value as a difference worth showing', () => {
    expect(differsFromStored(5.55, null)).toBe(true);
    expect(differsFromStored(5.55, 5.55)).toBe(false);
    expect(differsFromStored(5.55, 5.5)).toBe(true);
    // Skaičiuoti nėra iš ko — tylime, o ne siūlome perrašyti rankinę reikšmę.
    expect(differsFromStored(null, 5.55)).toBe(false);
  });

  it('ignores rounding dust below a hundredth', () => {
    expect(differsFromStored(5.5501, 5.55)).toBe(false);
  });
});
