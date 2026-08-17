import { describe, it, expect } from 'vitest';
import { siteMetricsFrom, resolveTemplateQty } from './materialTemplates';

describe('siteMetricsFrom', () => {
  it('sums panels and inverters from the new array format', () => {
    const m = siteMetricsFrom({
      kwp: 5.55,
      equipment_details: [
        { category: 'Moduliai',   model: 'P7 555W',  quantity: 10, unit: 'vnt.', notes: '' },
        { category: 'Inverteris', model: 'SUN2000',  quantity: 1,  unit: 'vnt.', notes: '' },
        { category: 'Moduliai',   model: 'Trina',    quantity: 4,  unit: 'vnt.', notes: '' },
      ],
    });
    expect(m).toEqual({ kwp: 5.55, panels: 14, inverters: 1 });
  });

  it('survives the empty-object shape some sites still carry', () => {
    // Dalis objektų turi `{}` vietoj masyvo — tai realus bazės atvejis.
    expect(siteMetricsFrom({ kwp: null, equipment_details: {} }))
      .toEqual({ kwp: null, panels: 0, inverters: 0 });
  });

  it('reads kwp arriving as a numeric string from Postgres', () => {
    expect(siteMetricsFrom({ kwp: '13.88', equipment_details: null }).kwp).toBe(13.88);
  });

  it('treats a missing kwp as unknown, not zero', () => {
    expect(siteMetricsFrom({ kwp: null, equipment_details: null }).kwp).toBeNull();
  });
});

describe('resolveTemplateQty', () => {
  const m = { kwp: 5.55, panels: 10, inverters: 2 };

  it('leaves fixed quantities untouched', () => {
    expect(resolveTemplateQty(3, 'fixed', m)).toBe(3);
  });

  it('scales by kWp and rounds to two decimals', () => {
    expect(resolveTemplateQty(12, 'per_kwp', m)).toBe(66.6);
  });

  it('scales by panel and inverter counts', () => {
    expect(resolveTemplateQty(2, 'per_panel', m)).toBe(20);
    expect(resolveTemplateQty(1, 'per_inverter', m)).toBe(2);
  });

  // Svarbiausias atvejis: nezinomas dydis duoda `null`, ne nuli. Ziniarastyje
  // tai reiskia "reikes, bet kiek dar nezinome", ir montuotojas suves faktą.
  it('returns null — not zero — when the basis cannot be computed', () => {
    const tuscias = { kwp: null, panels: 0, inverters: 0 };
    expect(resolveTemplateQty(12, 'per_kwp', tuscias)).toBeNull();
    expect(resolveTemplateQty(2, 'per_panel', tuscias)).toBeNull();
    expect(resolveTemplateQty(1, 'per_inverter', tuscias)).toBeNull();
  });

  it('still resolves fixed lines when the site has no metrics at all', () => {
    expect(resolveTemplateQty(5, 'fixed', { kwp: null, panels: 0, inverters: 0 })).toBe(5);
  });
});
