import type { PeriodStatus, RuleType, ParticipantSource, EarningsEntryType, BreakdownRule } from '../../../api/payroll';

// ── Money ─────────────────────────────────────────────────────────────────────
const eur = new Intl.NumberFormat('lt-LT', { style: 'currency', currency: 'EUR' });
/** Convert a 2dp money number to integer cents (use for SUMMING — never float-add). */
export const toCents = (n: number) => Math.round(n * 100);
/** Format integer cents as EUR. */
export const fmtCents = (cents: number) => eur.format(cents / 100);
/** Format a money number as EUR (display only). */
export const fmtEur = (n: number) => eur.format(n);

export const monthName = (year: number, month: number) =>
  new Intl.DateTimeFormat('lt-LT', { year: 'numeric', month: 'long' }).format(new Date(year, month - 1, 1));

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('lt-LT') : '—';

// ── Period status chips ─────────────────────────────────────────────────────
export const STATUS_CHIP: Record<PeriodStatus, { label: string; cls: string }> = {
  open:   { label: 'Atviras',    cls: 'bg-info-bg text-info border-info/20' },
  review: { label: 'Peržiūra',   cls: 'bg-warning-bg text-warning border-warning/20' },
  locked: { label: 'Užrakintas', cls: 'bg-surface-2 text-subtle border-border dark:bg-white/10 dark:border-white/10' },
};

// ── Rate-rule metadata ──────────────────────────────────────────────────────
export const RULE_LABELS: Record<RuleType, string> = {
  base_site_fee:      'Bazinis objektas',
  bess_fixed:         'BESS montavimas',
  optimizer_per_unit: 'Optimizatorius už vnt.',
  efficiency_bonus:   'Efektyvumo bonusas',
  quality_bonus:      'Kokybės bonusas',
  inverter_extra:     'Papildomas inverteris',
  kwp_band:           'kWp riba',
  manual_template:    'Rankinis šablonas',
};

/** Rule types the recalc engine applies automatically (others are stored only). */
export const AUTO_RULE_TYPES: ReadonlySet<RuleType> = new Set<RuleType>([
  'base_site_fee', 'bess_fixed', 'optimizer_per_unit', 'efficiency_bonus',
]);

export const RULE_UNIT_LABELS: Record<string, string> = {
  fixed: 'fiksuota',
  per_unit: 'už vnt.',
  percent: 'procentai',
};

// ── Participant source chips ────────────────────────────────────────────────
export const PARTICIPANT_SOURCE: Record<ParticipantSource, { label: string; cls: string }> = {
  time_entries: { label: 'Laiko įrašai', cls: 'bg-success-bg text-success border-success/20' },
  assignments:  { label: 'Priskyrimai', cls: 'bg-info-bg text-info border-info/20' },
  manual:       { label: 'Rankinis',     cls: 'bg-primary-fixed text-on-primary-fixed border-primary/30' },
  auto:         { label: 'Nenustatyta',  cls: 'bg-surface-2 text-subtle border-border dark:bg-white/10 dark:border-white/10' },
};

export const ENTRY_TYPE_LABELS: Record<EarningsEntryType, string> = {
  site_share: 'Objekto dalis',
  bonus:      'Bonusas',
  deduction:  'Atskaitymas',
  adjustment: 'Korekcija',
};

// ── Calculation breakdown → human-readable Lithuanian lines ──────────────────
const COMPONENT_LABELS: Record<string, string> = {
  base_site_fee:      'Bazinis objektas',
  bess_fixed:         'BESS montavimas',
  optimizer_per_unit: 'Optimizatoriai',
  efficiency_bonus:   'Efektyvumo bonusas',
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Render `calculation_breakdown` JSON as readable LT "label: value" lines. */
export function renderBreakdown(breakdown: Record<string, unknown>): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  const comp = (breakdown.components_cents ?? {}) as Record<string, unknown>;

  for (const [key, label] of Object.entries(COMPONENT_LABELS)) {
    const cents = num(comp[key]);
    if (cents == null) continue;
    if (key === 'optimizer_per_unit') {
      const n = num(breakdown.optimizer_count) ?? 0;
      lines.push({ label: `${label} (${n} vnt.)`, value: fmtCents(cents) });
    } else if (key === 'efficiency_bonus') {
      const applies = breakdown.efficiency_applies === true;
      const actual = num(breakdown.actual_hours);
      const target = num(breakdown.target_hours);
      const detail = actual != null && target != null
        ? ` (faktinės ${actual} h ${actual <= target ? '≤' : '>'} tikslas ${target} h)`
        : '';
      lines.push({ label, value: applies ? `${fmtCents(cents)}${detail}` : `netaikoma${detail}` });
    } else {
      lines.push({ label, value: fmtCents(cents) });
    }
  }

  const pool = num(breakdown.pool_cents);
  if (pool != null) lines.push({ label: 'Bendras fondas', value: fmtCents(pool) });

  return lines;
}

// ── Rule-based breakdown (new `rules` array from the override-aware recalc) ───
export type BreakdownChip = 'AUTO' | 'RANKINIS' | 'PRALEISTA';
export interface BreakdownLine {
  ruleId: string;
  label: string;
  ruleType: RuleType;
  applied: boolean;
  chip: BreakdownChip;
  detail: string | null;   // e.g. "24 vnt. × 2,00 €"
  amountEur: number;
  note: string | null;
}

function chipFor(r: BreakdownRule): BreakdownChip {
  if (!r.applied) return 'PRALEISTA';
  if (r.source === 'manual_override' || r.mode !== 'auto') return 'RANKINIS';
  return 'AUTO';
}

/**
 * Parse a snapshot's calculation_breakdown into rule lines + the pool total.
 * Prefers the new `rules` array; falls back to the legacy component lines so
 * pre-migration snapshots still render something.
 */
export function parseBreakdown(breakdown: Record<string, unknown>): { rules: BreakdownLine[]; poolEur: number | null; legacy: { label: string; value: string }[] } {
  const poolCents = num(breakdown.pool_cents);
  const poolEur = poolCents != null ? poolCents / 100 : null;

  const raw = breakdown.rules;
  if (Array.isArray(raw)) {
    const rules: BreakdownLine[] = raw.map((r) => {
      const rule = r as BreakdownRule;
      const qty = num(rule.quantity);
      const detail = qty != null && qty > 0 ? `${qty} vnt. × ${fmtEur(rule.unit_amount)}` : null;
      return {
        ruleId: rule.rule_id,
        label: rule.label || RULE_LABELS[rule.rule_type],
        ruleType: rule.rule_type,
        applied: rule.applied,
        chip: chipFor(rule),
        detail,
        amountEur: rule.amount,
        note: rule.note,
      };
    });
    return { rules, poolEur, legacy: [] };
  }

  return { rules: [], poolEur, legacy: renderBreakdown(breakdown) };
}
