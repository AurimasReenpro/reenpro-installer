import { describe, it, expect } from 'vitest';
import { parseBreakdown } from './format';

const ruleBreakdown = {
  pool_cents: 49800,
  rules: [
    { rule_id: '1', code: 'BASE', label: 'Bazinis', rule_type: 'base_site_fee', mode: 'auto', default_applicable: true, applied: true, quantity: null, unit_amount: 300, amount: 300, source: 'detected', note: null },
    { rule_id: '2', code: 'BESS', label: 'BESS', rule_type: 'bess_fixed', mode: 'force_apply', default_applicable: false, applied: true, quantity: null, unit_amount: 150, amount: 150, source: 'manual_override', note: 'klientas patvirtino' },
    { rule_id: '3', code: 'OPT', label: 'Opt', rule_type: 'optimizer_per_unit', mode: 'auto', default_applicable: true, applied: true, quantity: 24, unit_amount: 2, amount: 48, source: 'detected', note: null },
    { rule_id: '4', code: 'EFF', label: 'Eff', rule_type: 'efficiency_bonus', mode: 'force_skip', default_applicable: true, applied: false, quantity: null, unit_amount: 50, amount: 0, source: 'skipped', note: 'trūko QC' },
  ],
};

describe('parseBreakdown', () => {
  it('renders one line per rule with AUTO / RANKINIS / PRALEISTA chips', () => {
    const { rules, poolEur, legacy } = parseBreakdown(ruleBreakdown);
    expect(legacy).toEqual([]);
    expect(rules.map((r) => r.chip)).toEqual(['AUTO', 'RANKINIS', 'AUTO', 'PRALEISTA']);
    expect(poolEur).toBe(498);
  });

  it('keeps the custom rule label and builds a per-unit detail', () => {
    const { rules } = parseBreakdown(ruleBreakdown);
    expect(rules[0].label).toBe('Bazinis');
    expect(rules[2].detail).toMatch(/^24 vnt\. ×/);
    expect(rules[3].applied).toBe(false);
    expect(rules[3].note).toBe('trūko QC');
  });

  it('renders a custom manual template label', () => {
    const { rules } = parseBreakdown({
      pool_cents: 2000,
      rules: [{ rule_id: 'manual', code: 'CUSTOM', label: 'Sudėtingas stogas', rule_type: 'manual_template', mode: 'auto', default_applicable: true, applied: true, quantity: null, unit_amount: 20, amount: 20, source: 'detected', note: null }],
    });
    expect(rules[0].label).toBe('Sudėtingas stogas');
  });

  it('falls back to legacy component lines when there is no rules array', () => {
    const legacyBreakdown = { pool_cents: 30000, components_cents: { base_site_fee: 30000 } };
    const { rules, legacy } = parseBreakdown(legacyBreakdown);
    expect(rules).toEqual([]);
    expect(legacy.length).toBeGreaterThan(0);
  });
});
