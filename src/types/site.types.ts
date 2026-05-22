import type { QueryData } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export const getSiteDetailQuery = (id: string) => supabase
  .from('sites')
  .select('*, equipment_details, team:teams(name), time_entries(*), site_checklists(*), photos(*)')
  .eq('id', id)
  .single();

export type SiteDetailData = QueryData<ReturnType<typeof getSiteDetailQuery>>;
export type SiteChecklist = SiteDetailData['site_checklists'][number];
export type SitePhoto = SiteDetailData['photos'][number];
