// ============================================================
// LEGACY — fixed-fee payroll model (site_compensation).
//
// Superseded by the rate-card engine in src/api/payroll.ts
// (payroll_rate_cards / payroll_site_snapshots + the *_payroll_*
// RPCs). Kept ONLY so the legacy SiteFeeCard component still
// compiles; it is no longer mounted anywhere in the UI.
//
// Do NOT import this from the payroll page or any new code.
// ============================================================
import { supabase } from '../lib/supabase';

export interface SiteCompensation {
  site_id: string;
  fixed_fee: number;
  currency: string;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
}

export async function getSiteCompensation(siteId: string): Promise<SiteCompensation | null> {
  const { data, error } = await supabase
    .from('site_compensation')
    .select('*')
    .eq('site_id', siteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertSiteCompensation(input: {
  siteId: string;
  fixedFee: number;
  notes: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('site_compensation')
    .upsert(
      { site_id: input.siteId, fixed_fee: input.fixedFee, notes: input.notes },
      { onConflict: 'site_id' },
    );
  if (error) throw new Error(error.message);
}
