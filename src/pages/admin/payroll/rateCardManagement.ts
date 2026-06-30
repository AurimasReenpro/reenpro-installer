export type RuleRemovalAction = 'delete' | 'deactivate' | 'blocked';

export function validateRateCardName(value: string): string | null {
  if (!value.trim()) return 'Kortelės pavadinimas privalomas.';
  if (value.trim().length < 2) return 'Kortelės pavadinimą turi sudaryti bent 2 simboliai.';
  return null;
}

export function getRuleRemovalAction(input: {
  cardLocked: boolean;
  hasOverrides: boolean;
  cardUsedInPeriod: boolean;
}): RuleRemovalAction {
  if (input.cardLocked) return 'blocked';
  return input.hasOverrides || input.cardUsedInPeriod ? 'deactivate' : 'delete';
}

export function filterRateRules<T extends { is_active: boolean }>(rules: T[], showInactive: boolean): T[] {
  return showInactive ? rules : rules.filter((rule) => rule.is_active);
}
