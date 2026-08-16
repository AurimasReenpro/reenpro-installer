import { supabase } from '../lib/supabase';

export const SETTINGS_ROW_ID = '00000000-0000-0000-0000-000000000001';

export interface CompanySettings {
  id: string;
  company_name: string | null;
  company_code: string | null;
  vat_code: string | null;
  iban: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  primary_color: string | null;
  base_lat: number | null;
  base_lng: number | null;
  created_at: string;
  updated_at: string;
}

export async function getCompanySettings(): Promise<CompanySettings | null> {
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .eq('id', SETTINGS_ROW_ID)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateCompanySettings(
  updates: Partial<Omit<CompanySettings, 'id' | 'created_at' | 'updated_at'>>
): Promise<CompanySettings> {
  const { data, error } = await supabase
    .from('company_settings')
    .upsert({ id: SETTINGS_ROW_ID, ...updates })
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Nustatymai neišsaugoti: serveris atmetė užklausą (RLS).');
  return data;
}
