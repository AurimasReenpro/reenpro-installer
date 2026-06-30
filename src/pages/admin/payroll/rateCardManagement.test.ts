import { describe, expect, it } from 'vitest';
import { filterRateRules, getRuleRemovalAction, validateRateCardName } from './rateCardManagement';

describe('validateRateCardName', () => {
  it('requires a trimmed name of at least two characters', () => {
    expect(validateRateCardName('   ')).toMatch(/privalomas/);
    expect(validateRateCardName(' A ')).toMatch(/bent 2/);
    expect(validateRateCardName(' B2C bonusai ')).toBeNull();
  });
});

describe('getRuleRemovalAction', () => {
  it('deletes only unused, unreferenced rules', () => {
    expect(getRuleRemovalAction({ cardLocked: false, hasOverrides: false, cardUsedInPeriod: false })).toBe('delete');
  });

  it('deactivates rules retained by payroll history or overrides', () => {
    expect(getRuleRemovalAction({ cardLocked: false, hasOverrides: true, cardUsedInPeriod: false })).toBe('deactivate');
    expect(getRuleRemovalAction({ cardLocked: false, hasOverrides: false, cardUsedInPeriod: true })).toBe('deactivate');
  });

  it('blocks direct removal for locked cards', () => {
    expect(getRuleRemovalAction({ cardLocked: true, hasOverrides: false, cardUsedInPeriod: false })).toBe('blocked');
  });
});

describe('filterRateRules', () => {
  const rules = [{ is_active: true }, { is_active: false }];

  it('hides inactive rules by default', () => {
    expect(filterRateRules(rules, false)).toEqual([{ is_active: true }]);
  });

  it('shows inactive rules when requested', () => {
    expect(filterRateRules(rules, true)).toEqual(rules);
  });
});
