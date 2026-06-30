import { supabase } from '../lib/supabase';

// ── Domain types ──────────────────────────────────────────────────────────────
export type PeriodStatus = 'open' | 'review' | 'locked';
export type RuleType =
  | 'base_site_fee'
  | 'kwp_band'
  | 'bess_fixed'
  | 'optimizer_per_unit'
  | 'inverter_extra'
  | 'efficiency_bonus'
  | 'quality_bonus'
  | 'manual_template';
export type RuleUnit = 'fixed' | 'per_unit' | 'percent';
export type ParticipantSource = 'auto' | 'time_entries' | 'assignments' | 'manual';
export type EarningsEntryType = 'site_share' | 'bonus' | 'deduction' | 'adjustment';
export type ManualEntryType = 'bonus' | 'deduction' | 'adjustment';

export interface PayrollRateCard {
  id: string;
  name: string;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface PayrollRateRule {
  id: string;
  rate_card_id: string;
  code: string;
  label: string;
  rule_type: RuleType;
  amount: number;
  unit: RuleUnit | null;
  params: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface PayrollPeriod {
  id: string;
  year: number;
  month: number;
  status: PeriodStatus;
  rate_card_id: string | null;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
}

/** payroll_site_snapshots row + the joined site/team info the table renders. */
export interface PayrollSiteSnapshot {
  id: string;
  period_id: string;
  site_id: string | null;
  included: boolean;
  participant_ids: string[];
  is_manually_excluded: boolean;
  participant_source: ParticipantSource;
  participant_override_ids: string[] | null;
  manual_note: string | null;
  warnings: string[];
  recalculated_at: string | null;
  base_amount: number;
  addon_amount: number;
  bonus_amount: number;
  deduction_amount: number;
  total_pool: number;
  calculation_breakdown: Record<string, unknown>;
  created_at: string;
  site: {
    code: string;
    client_name: string;
    address: string | null;
    system_type: string | null;
    kwp: number | null;
    actual_end: string | null;
    team_id: string | null;
    team: { name: string } | null;
  } | null;
}

/** earnings_entries row + joined installer name/team and the linked site code. */
export interface EarningsEntry {
  id: string;
  period_id: string;
  installer_id: string;
  site_snapshot_id: string | null;
  entry_type: EarningsEntryType;
  amount: number;
  description: string | null;
  source: 'auto' | 'manual';
  created_by: string | null;
  created_at: string;
  // Single, safe left join. The site code/link is resolved client-side from the
  // already-loaded snapshots (keyed by site_snapshot_id) — NOT a nested embed,
  // which previously made the whole earnings query error out and return [].
  installer: { full_name: string | null; team_id: string | null } | null;
}

/** Shape of recalculate_payroll_period()'s jsonb return. */
export interface RecalcSummary {
  period_id: string;
  year: number;
  month: number;
  rate_card_id: string;
  processed_sites: number;
  snapshots_created_or_updated: number;
  auto_earnings_created: number;
  skipped_sites: number;
  total_pool: number;
  total_entries: number;
  warnings: string[];
}

export type RuleOverrideMode = 'auto' | 'force_apply' | 'force_skip';

/** One row from get_payroll_site_rule_state — the per-site rule application state. */
export interface PayrollSiteRuleState {
  rate_rule_id: string;
  code: string;
  label: string;
  rule_type: RuleType;
  amount: number;
  unit: RuleUnit | null;
  params: Record<string, unknown>;
  default_applicable: boolean;
  detected_quantity: number | null;
  mode: RuleOverrideMode;
  quantity_override: number | null;
  amount_override: number | null;
  note: string | null;
  effective_quantity: number | null;
  effective_amount: number;
  effective_applied: boolean;
  reason: string;
  source: 'detected' | 'manual_override' | 'skipped';
}

/** One rule line inside a snapshot's calculation_breakdown.rules array. */
export interface BreakdownRule {
  rule_id: string;
  code: string;
  label: string;
  rule_type: RuleType;
  mode: RuleOverrideMode;
  default_applicable: boolean;
  applied: boolean;
  quantity: number | null;
  unit_amount: number;
  amount: number;
  source: 'detected' | 'manual_override' | 'skipped';
  note: string | null;
}

export interface PayrollSiteEffectiveRateCard {
  effective_rate_card_id: string;
  effective_rate_card_name: string;
  source: 'period_default' | 'site_override';
}

export interface PayrollInstaller {
  id: string;
  full_name: string | null;
  team_id: string | null;
  role: string | null;
}

// ── Rate cards ──────────────────────────────────────────────────────────────
export async function getPayrollRateCards(): Promise<PayrollRateCard[]> {
  const { data, error } = await supabase
    .from('payroll_rate_cards')
    .select('*')
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPayrollRateCardRules(rateCardId: string): Promise<PayrollRateRule[]> {
  const { data, error } = await supabase
    .from('payroll_rate_rules')
    .select('*')
    .eq('rate_card_id', rateCardId)
    .order('rule_type', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PayrollRateRule[];
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function createPayrollRateCard(input: {
  name: string;
  validFrom?: string | null;
  validTo?: string | null;
}): Promise<PayrollRateCard> {
  const created_by = await currentUserId();
  const { data, error } = await supabase
    .from('payroll_rate_cards')
    .insert({
      name: input.name,
      valid_from: input.validFrom ?? null,
      valid_to: input.validTo ?? null,
      ...(created_by ? { created_by } : {}),
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updatePayrollRateCard(
  id: string,
  patch: Partial<Pick<PayrollRateCard, 'name' | 'valid_from' | 'valid_to' | 'is_active'>>,
): Promise<void> {
  const { error } = await supabase.from('payroll_rate_cards').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Deep-copy a card and all its rules into a brand-new (active) card. */
export async function duplicatePayrollRateCard(id: string, newName: string): Promise<PayrollRateCard> {
  const [{ data: src, error: cErr }, rules] = await Promise.all([
    supabase.from('payroll_rate_cards').select('*').eq('id', id).single(),
    getPayrollRateCardRules(id),
  ]);
  if (cErr) throw new Error(cErr.message);
  const created_by = await currentUserId();

  const { data: card, error: insErr } = await supabase
    .from('payroll_rate_cards')
    .insert({
      name: newName,
      valid_from: src.valid_from,
      valid_to: src.valid_to,
      is_active: true,
      ...(created_by ? { created_by } : {}),
    })
    .select('*')
    .single();
  if (insErr) throw new Error(insErr.message);

  if (rules.length > 0) {
    const { error: rErr } = await supabase.from('payroll_rate_rules').insert(
      rules.map((r) => ({
        rate_card_id: card.id,
        code: r.code,
        label: r.label,
        rule_type: r.rule_type,
        amount: r.amount,
        unit: r.unit,
        params: r.params as never,
        is_active: r.is_active,
      })),
    );
    if (rErr) throw new Error(rErr.message);
  }
  return card;
}

export async function createPayrollRateRule(input: {
  rateCardId: string;
  code: string;
  label: string;
  ruleType: RuleType;
  amount: number;
  unit: RuleUnit | null;
  params?: Record<string, unknown>;
}): Promise<PayrollRateRule> {
  const label = input.label.trim();
  if (!label) throw new Error('Įveskite taisyklės pavadinimą.');
  if (label.length < 2) throw new Error('Pavadinimas per trumpas.');
  const { data, error } = await supabase
    .from('payroll_rate_rules')
    .insert({
      rate_card_id: input.rateCardId,
      code: input.code,
      label,
      rule_type: input.ruleType,
      amount: input.amount,
      unit: input.unit,
      params: (input.params ?? {}) as never,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as PayrollRateRule;
}

export async function updatePayrollRateRule(
  id: string,
  patch: { amount?: number; label?: string; unit?: RuleUnit | null; params?: Record<string, unknown>; is_active?: boolean },
): Promise<void> {
  const upd: Record<string, unknown> = {};
  if (patch.amount !== undefined) upd.amount = patch.amount;
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (!label) throw new Error('Įveskite taisyklės pavadinimą.');
    if (label.length < 2) throw new Error('Pavadinimas per trumpas.');
    upd.label = label;
  }
  if (patch.unit !== undefined) upd.unit = patch.unit;
  if (patch.is_active !== undefined) upd.is_active = patch.is_active;
  if (patch.params !== undefined) upd.params = patch.params;
  const { error } = await supabase.from('payroll_rate_rules').update(upd as never).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deactivatePayrollRateRule(id: string, active = false): Promise<void> {
  const { error } = await supabase.from('payroll_rate_rules').update({ is_active: active }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deletePayrollRateRule(id: string): Promise<void> {
  const { error } = await supabase.from('payroll_rate_rules').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * A rule tied to any period or site-level override must stay available for
 * historical payroll context. The UI deactivates it instead of deleting it.
 */
export async function getPayrollRateRuleUsage(ruleId: string, rateCardId: string): Promise<{
  hasOverrides: boolean;
  cardUsedInPeriod: boolean;
}> {
  const [{ count: overrideCount, error: overrideError }, { count: periodCount, error: periodError }] = await Promise.all([
    supabase
      .from('payroll_site_rule_overrides')
      .select('id', { count: 'exact', head: true })
      .eq('rate_rule_id', ruleId),
    supabase
      .from('payroll_periods')
      .select('id', { count: 'exact', head: true })
      .eq('rate_card_id', rateCardId),
  ]);
  if (overrideError) throw new Error(overrideError.message);
  if (periodError) throw new Error(periodError.message);
  return {
    hasOverrides: (overrideCount ?? 0) > 0,
    cardUsedInPeriod: (periodCount ?? 0) > 0,
  };
}

// ── Periods ─────────────────────────────────────────────────────────────────
export async function getPayrollPeriod(year: number, month: number): Promise<PayrollPeriod | null> {
  const { data, error } = await supabase
    .from('payroll_periods')
    .select('id, year, month, status, rate_card_id, locked_by, locked_at, created_at')
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PayrollPeriod | null;
}

/**
 * Recalculate a month against a rate card. The RPC creates/reuses the period,
 * rebuilds snapshots + auto earnings, and moves the period to 'review'.
 */
export async function recalculatePayrollPeriod(
  year: number,
  month: number,
  rateCardId: string,
): Promise<RecalcSummary> {
  const { data, error } = await supabase.rpc('recalculate_payroll_period', {
    p_year: year,
    p_month: month,
    p_rate_card_id: rateCardId,
  });
  if (error) throw error;
  const summary = data as unknown as RecalcSummary;
  if (import.meta.env.DEV) {
    console.debug('[payroll] recalculatePayrollPeriod result', {
      auto_earnings_created: summary.auto_earnings_created,
      snapshots_created_or_updated: summary.snapshots_created_or_updated,
      warnings: summary.warnings,
    });
  }
  return summary;
}

export async function lockPayrollPeriod(periodId: string): Promise<PayrollPeriod> {
  const { data, error } = await supabase.rpc('lock_payroll_period', { p_period_id: periodId });
  if (error) throw error;
  return data as unknown as PayrollPeriod;
}

export async function setPayrollPeriodStatus(periodId: string, status: PeriodStatus): Promise<PayrollPeriod> {
  const { data, error } = await supabase.rpc('set_payroll_period_status', {
    p_period_id: periodId,
    p_status: status,
  });
  if (error) throw error;
  return data as unknown as PayrollPeriod;
}

// ── Snapshots ───────────────────────────────────────────────────────────────
export async function getPayrollSiteSnapshots(periodId: string): Promise<PayrollSiteSnapshot[]> {
  const { data, error } = await supabase
    .from('payroll_site_snapshots')
    .select(
      '*, site:sites(code, client_name, address, system_type, kwp, actual_end, team_id, team:teams(name))',
    )
    .eq('period_id', periodId)
    .order('total_pool', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PayrollSiteSnapshot[];
}

export async function setPayrollSiteIncluded(
  periodId: string,
  siteId: string,
  included: boolean,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_payroll_site_included', {
    p_period_id: periodId,
    p_site_id: siteId,
    p_included: included,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function setPayrollSiteParticipants(
  periodId: string,
  siteId: string,
  participantIds: string[],
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_payroll_site_participants', {
    p_period_id: periodId,
    p_site_id: siteId,
    p_participant_ids: participantIds,
    p_reason: reason,
  });
  if (error) throw error;
}

// ── Per-site rule overrides ──────────────────────────────────────────────────
export async function getPayrollSiteRuleState(
  periodId: string,
  siteId: string,
  rateCardId?: string,
): Promise<PayrollSiteRuleState[]> {
  const args = rateCardId
    ? { p_period_id: periodId, p_site_id: siteId, p_rate_card_id: rateCardId }
    : { p_period_id: periodId, p_site_id: siteId };
  const { data, error } = await supabase.rpc('get_payroll_site_rule_state', args);
  if (error) throw error;
  return (data ?? []) as unknown as PayrollSiteRuleState[];
}

export async function getPayrollSiteEffectiveRateCard(
  periodId: string,
  siteId: string,
): Promise<PayrollSiteEffectiveRateCard> {
  const { data, error } = await supabase.rpc('get_payroll_site_effective_rate_card', {
    p_period_id: periodId,
    p_site_id: siteId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Objekto tarifo kortelė nerasta.');
  return row as unknown as PayrollSiteEffectiveRateCard;
}

export async function setPayrollSiteRateCardOverride(input: {
  periodId: string;
  siteId: string;
  rateCardId: string | null;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('set_payroll_site_rate_card_override', {
    p_period_id: input.periodId,
    p_site_id: input.siteId,
    p_rate_card_id: input.rateCardId,
    p_note: input.note ?? null,
  });
  if (error) throw error;
}

export async function setPayrollSiteRuleOverride(input: {
  periodId: string;
  siteId: string;
  rateRuleId: string;
  mode: RuleOverrideMode;
  quantityOverride?: number | null;
  amountOverride?: number | null;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('set_payroll_site_rule_override', {
    p_period_id: input.periodId,
    p_site_id: input.siteId,
    p_rate_rule_id: input.rateRuleId,
    p_mode: input.mode,
    p_quantity_override: input.quantityOverride ?? null,
    p_amount_override: input.amountOverride ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
}

// ── Earnings ────────────────────────────────────────────────────────────────
export async function getPayrollEarnings(periodId: string): Promise<EarningsEntry[]> {
  const { data, error } = await supabase
    .from('earnings_entries')
    .select(
      'id, period_id, installer_id, site_snapshot_id, entry_type, amount, description, source, created_by, created_at, ' +
        'installer:user_profiles(full_name, team_id)',
    )
    .eq('period_id', periodId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  if (import.meta.env.DEV) {
    console.debug('[payroll] getPayrollEarnings result', {
      periodId,
      rowCount: data?.length ?? 0,
    });
  }
  return (data ?? []) as unknown as EarningsEntry[];
}

/**
 * Add a manual ledger entry. `amount` is the magnitude as entered; the backend
 * stores deductions negative regardless of sign sent. Never updates existing rows.
 */
export async function addManualPayrollEntry(input: {
  periodId: string;
  installerId: string;
  siteSnapshotId: string | null;
  type: ManualEntryType;
  amount: number;
  description: string;
}): Promise<void> {
  const { error } = await supabase.rpc('add_manual_payroll_entry', {
    p_period_id: input.periodId,
    p_installer_id: input.installerId,
    p_site_snapshot_id: input.siteSnapshotId,
    p_entry_type: input.type,
    p_amount: input.amount,
    p_description: input.description,
  });
  if (error) throw error;
}

/** Storno: append a reversing adjustment. The original row is never touched. */
export async function reverseManualPayrollEntry(entryId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reverse_manual_payroll_entry', {
    p_entry_id: entryId,
    p_reason: reason,
  });
  if (error) throw error;
}

// ── Installers (for filters + participant override) ─────────────────────────
export async function getPayrollInstallers(): Promise<PayrollInstaller[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, team_id, role')
    .in('role', ['installer', 'admin'])
    .order('full_name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Rate-card ids referenced by any LOCKED period — those cards are read-only. */
export async function getLockedRateCardIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('payroll_periods')
    .select('rate_card_id')
    .eq('status', 'locked')
    .not('rate_card_id', 'is', null);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => r.rate_card_id).filter((x): x is string => !!x))];
}

// ── Error mapping ─────────────────────────────────────────────────────────────
interface MaybePgError {
  code?: string;
  message?: string;
}

/**
 * Map a Supabase/Postgres error from the payroll RPCs to a friendly Lithuanian
 * message. The append-only / locked-period guards raise SQLSTATE 23001; we
 * disambiguate by the message text the functions emit. Never surfaces raw SQL.
 */
export function payrollErrorMessage(err: unknown): string {
  const e = (err ?? {}) as MaybePgError;
  const code = e.code;
  const msg = (e.message ?? '').toLowerCase();

  if (msg.includes('užrakint') || msg.includes('locked')) {
    return 'Periodas užrakintas. Korekcijos turi būti daromos kitame atvirame periode.';
  }
  if (msg.includes('aprašymas')) {
    return 'Aprašymas privalomas (bent 5 simboliai).';
  }
  if (msg.includes('premijos') || msg.includes('suma turi būti')) {
    return 'Netinkama suma šiam įrašo tipui.';
  }
  if (msg.includes('bent vieno dalyvio')) {
    return 'Reikia pasirinkti bent vieną dalyvį.';
  }
  if (msg.includes('dalyviai neegzistuoja') || msg.includes('montuotojas neegzistuoja')) {
    return 'Kai kurie pasirinkti montuotojai neegzistuoja arba neturi tinkamos rolės.';
  }
  if (msg.includes('momentinė kopija nerasta') || msg.includes('kopija nepriklauso')) {
    return 'Objekto momentinė kopija nerasta. Pirma perskaičiuokite periodą.';
  }
  if (msg.includes('tik rankinius')) {
    return 'Atšaukti (storno) galima tik rankinius įrašus.';
  }
  if (msg.includes('be dalyvių')) {
    return 'Negalima užrakinti: yra įtrauktų objektų be dalyvių. Priskirkite dalyvius arba neįtraukite jų.';
  }
  if (msg.includes('snapshots') || msg.includes('momentinių kopijų')) {
    return 'Negalima užrakinti: periodas dar neperskaičiuotas.';
  }

  switch (code) {
    case '23001':
      return 'Šis veiksmas neleidžiamas šiam periodui.';
    case '23514':
      return 'Netinkami įrašo duomenys.';
    case '23503':
      return 'Nurodytas periodas, objektas arba montuotojas neegzistuoja.';
    case '42501':
      return 'Neturite teisių atlikti šį veiksmą.';
    default:
      return 'Nepavyko atlikti veiksmo. Pabandykite dar kartą.';
  }
}
