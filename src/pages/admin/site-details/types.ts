import type { EquipmentItem } from '../../../types/equipment.types';

/** Site row enriched with the joined team name, as loaded by the admin detail page. */
export interface SiteWithTeam {
  id: string;
  code: string;
  client_name: string;
  address: string;
  status: string | null;
  scheduled_start: string | null;
  system_type: string;
  team_id: string | null;
  equipment_details: EquipmentItem[] | Record<string, string> | null;
  notes: string | null;
  stringing_details: unknown;
  blueprint_categories: string[] | null;
  team: { name: string } | null;
  kwp: number | null;
  kwh: number | null;
  client_phone: string | null;
  contact_person: string | null;
  client_email: string | null;
  roof_type: string | null;
  roof_material: string | null;
  roof_angle: string | null;
}

export type TabId = 'info' | 'equip' | 'blueprints' | 'files' | 'check' | 'history';

/** One row in the PV string-parameters table (stored as `sites.stringing_details`). */
export interface StringRow {
  name: string;
  modules: string;
  power: string;
  mppt: string;
  orientation: string;
  angle: string;
}

export type ItemStatus = 'pending' | 'pass' | 'fail' | 'n_a';
