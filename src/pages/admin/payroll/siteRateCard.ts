export type RateCardSource = 'period_default' | 'site_override';

export function validateRuleLabel(value: string): string | null {
  if (!value.trim()) return 'Įveskite taisyklės pavadinimą.';
  if (value.trim().length < 2) return 'Pavadinimas per trumpas.';
  return null;
}

export function rateCardSourceLabel(source: RateCardSource): string {
  return source === 'site_override' ? 'Objekto' : 'Periodo';
}

export function resolveEffectiveRateCard(
  periodRateCardId: string,
  siteOverrideRateCardId: string | null,
): { rateCardId: string; source: RateCardSource } {
  return siteOverrideRateCardId
    ? { rateCardId: siteOverrideRateCardId, source: 'site_override' }
    : { rateCardId: periodRateCardId, source: 'period_default' };
}
