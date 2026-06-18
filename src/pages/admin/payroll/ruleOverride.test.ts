import { describe, it, expect } from 'vitest';
import {
  effectivePreview,
  hasRuleEditChanged,
  validateEdit,
  parseNum,
  type RuleEdit,
} from './ruleOverride';
import type { PayrollSiteRuleState } from '../../../api/payroll';

function rule(p: Partial<PayrollSiteRuleState>): PayrollSiteRuleState {
  return {
    rate_rule_id: 'r', code: 'C', label: 'L', rule_type: 'bess_fixed', amount: 150, unit: null,
    params: {}, default_applicable: false, detected_quantity: null, mode: 'auto',
    quantity_override: null, amount_override: null, note: null,
    effective_quantity: null, effective_amount: 0, effective_applied: false,
    reason: '', source: 'detected', ...p,
  };
}
const edit = (p: Partial<RuleEdit>): RuleEdit => ({ mode: 'auto', quantity: '', amount: '', note: '', ...p });

describe('parseNum', () => {
  it('parses dot and comma decimals, rejects junk', () => {
    expect(parseNum('2.5')).toBe(2.5);
    expect(parseNum('2,5')).toBe(2.5);
    expect(parseNum('  10 ')).toBe(10);
    expect(parseNum('abc')).toBeNull();
    expect(parseNum('')).toBeNull();
  });
});

describe('validateEdit', () => {
  it('auto needs no note', () => {
    expect(validateEdit(rule({}), edit({ mode: 'auto' }))).toBeNull();
  });
  it('force_apply / force_skip require a ≥5 char note', () => {
    expect(validateEdit(rule({}), edit({ mode: 'force_apply', note: 'abc' }))).toMatch(/Pastaba/);
    expect(validateEdit(rule({}), edit({ mode: 'force_skip', note: 'be QC dok.' }))).toBeNull();
  });
  it('per_unit force_apply requires a quantity when none is detected', () => {
    const r = rule({ rule_type: 'optimizer_per_unit', unit: 'per_unit', detected_quantity: null });
    expect(validateEdit(r, edit({ mode: 'force_apply', note: 'pagal aktą' }))).toMatch(/kiekio/);
    expect(validateEdit(r, edit({ mode: 'force_apply', note: 'pagal aktą', quantity: '24' }))).toBeNull();
  });
  it('per_unit force_apply is ok when a quantity is detected', () => {
    const r = rule({ rule_type: 'optimizer_per_unit', unit: 'per_unit', detected_quantity: 12 });
    expect(validateEdit(r, edit({ mode: 'force_apply', note: 'auto kiekis' }))).toBeNull();
  });
});

describe('hasRuleEditChanged', () => {
  it('Auto → Taikyti is a change', () => {
    expect(hasRuleEditChanged(
      rule({ mode: 'auto' }),
      edit({ mode: 'force_apply', note: 'pagal aktą' }),
    )).toBe(true);
  });

  it('quantity change is a change', () => {
    expect(hasRuleEditChanged(
      rule({ mode: 'force_apply', quantity_override: 1, note: 'pagal aktą' }),
      edit({ mode: 'force_apply', quantity: '2', note: 'pagal aktą' }),
    )).toBe(true);
  });

  it('amount change is a change', () => {
    expect(hasRuleEditChanged(
      rule({ mode: 'force_apply', amount_override: 1, note: 'pagal aktą' }),
      edit({ mode: 'force_apply', amount: '2', note: 'pagal aktą' }),
    )).toBe(true);
  });

  it('note change is a change', () => {
    expect(hasRuleEditChanged(
      rule({ mode: 'force_apply', note: 'sena pastaba' }),
      edit({ mode: 'force_apply', note: 'nauja pastaba' }),
    )).toBe(true);
  });
});

describe('effectivePreview', () => {
  it('force_skip → not applied, 0', () => {
    expect(effectivePreview(rule({ default_applicable: true }), edit({ mode: 'force_skip', note: 'x' }))).toEqual({ applied: false, amount: 0 });
  });
  it('auto uses default applicability + base amount', () => {
    expect(effectivePreview(rule({ default_applicable: true, amount: 150 }), edit({ mode: 'auto' }))).toEqual({ applied: true, amount: 150 });
    expect(effectivePreview(rule({ default_applicable: false, amount: 150 }), edit({ mode: 'auto' }))).toEqual({ applied: false, amount: 0 });
  });
  it('per_unit force_apply multiplies quantity × unit amount (with override)', () => {
    const r = rule({ rule_type: 'optimizer_per_unit', unit: 'per_unit', amount: 2 });
    expect(effectivePreview(r, edit({ mode: 'force_apply', note: 'x', quantity: '24' }))).toEqual({ applied: true, amount: 48 });
  });
  it('force_apply optimizer quantity 2 × amount 2 = 4', () => {
    const r = rule({ rule_type: 'optimizer_per_unit', unit: 'per_unit', amount: 2 });
    expect(effectivePreview(r, edit({ mode: 'force_apply', note: 'pagal aktą', quantity: '2', amount: '2' }))).toEqual({ applied: true, amount: 4 });
  });
  it('amount_override (via edit.amount) replaces the rule amount', () => {
    expect(effectivePreview(rule({ default_applicable: true, amount: 150 }), edit({ mode: 'force_apply', note: 'x', amount: '200' }))).toEqual({ applied: true, amount: 200 });
  });
});
