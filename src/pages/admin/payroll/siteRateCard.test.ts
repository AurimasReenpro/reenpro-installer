import { describe, expect, it } from 'vitest';
import { rateCardSourceLabel, resolveEffectiveRateCard, validateRuleLabel } from './siteRateCard';

describe('validateRuleLabel', () => {
  it('requires a non-empty custom label', () => {
    expect(validateRuleLabel('  ')).toBe('Įveskite taisyklės pavadinimą.');
    expect(validateRuleLabel('A')).toBe('Pavadinimas per trumpas.');
    expect(validateRuleLabel(' B2C rankinis bonusas ')).toBeNull();
  });
});

describe('rateCardSourceLabel', () => {
  it('distinguishes the period default from a site override', () => {
    expect(rateCardSourceLabel('period_default')).toBe('Periodo');
    expect(rateCardSourceLabel('site_override')).toBe('Objekto');
  });
});

describe('resolveEffectiveRateCard', () => {
  it('uses the period default when the site has no override', () => {
    expect(resolveEffectiveRateCard('period-card', null)).toEqual({ rateCardId: 'period-card', source: 'period_default' });
  });

  it('uses the site override when one exists', () => {
    expect(resolveEffectiveRateCard('period-card', 'site-card')).toEqual({ rateCardId: 'site-card', source: 'site_override' });
  });
});
