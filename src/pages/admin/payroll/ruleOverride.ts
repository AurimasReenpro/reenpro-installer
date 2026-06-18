import type { PayrollSiteRuleState, RuleOverrideMode } from '../../../api/payroll';

/** One row's unsaved edit state in the SiteRulesModal. */
export interface RuleEdit {
  mode: RuleOverrideMode;
  quantity: string;
  amount: string;
  note: string;
}

/** Parse a decimal string (comma or dot) to a number, or null if invalid. */
export const parseNum = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};

const nullableNumber = (value: number | string | null | undefined): number | null => {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return parseNum(value);
};

/** Initial editable state for one backend rule-state row. */
export function initialRuleEdit(r: PayrollSiteRuleState): RuleEdit {
  return {
    mode: r.mode,
    quantity: r.quantity_override != null ? String(r.quantity_override) : '',
    amount: r.amount_override != null ? String(r.amount_override) : '',
    note: r.note ?? '',
  };
}

/** True when an edit should be persisted through set_payroll_site_rule_override. */
export function hasRuleEditChanged(r: PayrollSiteRuleState, e: RuleEdit): boolean {
  return e.mode !== r.mode
    || (parseNum(e.quantity) ?? null) !== nullableNumber(r.quantity_override)
    || (parseNum(e.amount) ?? null) !== nullableNumber(r.amount_override)
    || (e.mode !== 'auto' && e.note.trim() !== (r.note ?? ''));
}

/** Live preview of a rule's effective applied/amount given an unsaved edit. */
export function effectivePreview(r: PayrollSiteRuleState, e: RuleEdit): { applied: boolean; amount: number } {
  const applied = e.mode === 'force_apply' ? true : e.mode === 'force_skip' ? false : r.default_applicable;
  if (!applied) return { applied, amount: 0 };
  const unitAmount = parseNum(e.amount) ?? r.amount;
  if (r.unit === 'per_unit') {
    const qty = parseNum(e.quantity) ?? r.detected_quantity ?? 0;
    return { applied, amount: unitAmount * qty };
  }
  return { applied, amount: unitAmount };
}

/** Validate one edited row. Returns an error string, or null when valid. */
export function validateEdit(r: PayrollSiteRuleState, e: RuleEdit): string | null {
  if (e.mode === 'auto') return null;
  if (e.note.trim().length < 5) return 'Pastaba privaloma (≥5 simb.)';
  if (e.mode === 'force_apply' && r.unit === 'per_unit') {
    const hasQty = parseNum(e.quantity) != null || (r.detected_quantity != null && r.detected_quantity > 0);
    if (!hasQty) return 'Reikia kiekio';
  }
  return null;
}
