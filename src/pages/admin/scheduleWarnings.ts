import { parseEquipmentDetails, isBatteryCategory } from '../../types/equipment.types';
import { normalizeInstallerWorkRole, type InstallerWorkRole } from '../../lib/installerWorkRoles';

export interface ScheduleWarningSite {
  team_id: string | null;
  kwh?: number | null;
  system_type?: string | null;
  equipment_details?: unknown;
}

export interface ScheduleWarningInstaller {
  team_id: string | null;
  work_role?: string | null;
}

export type ScheduleWarning = 'no_electrician' | 'no_site_manager';

export function siteClearlyHasBess(site: ScheduleWarningSite): boolean {
  return (site.kwh ?? 0) > 0
    || (site.system_type ?? '').toUpperCase().includes('BESS')
    || parseEquipmentDetails(site.equipment_details).some((item) => isBatteryCategory(item.category));
}

export function buildTeamWorkRoleMap(installers: ScheduleWarningInstaller[]): Map<string, Set<InstallerWorkRole>> {
  const map = new Map<string, Set<InstallerWorkRole>>();
  for (const installer of installers) {
    if (!installer.team_id) continue;
    const roles = map.get(installer.team_id) ?? new Set<InstallerWorkRole>();
    roles.add(normalizeInstallerWorkRole(installer.work_role));
    map.set(installer.team_id, roles);
  }
  return map;
}

export function getScheduleWarnings(
  site: ScheduleWarningSite,
  teamWorkRoles: Map<string, Set<InstallerWorkRole>>,
): ScheduleWarning[] {
  if (!site.team_id) return [];
  const roles = teamWorkRoles.get(site.team_id);
  if (!roles || roles.size === 0) return [];

  const warnings: ScheduleWarning[] = [];
  if (siteClearlyHasBess(site) && !roles.has('electrician')) warnings.push('no_electrician');
  if (!roles.has('site_manager')) warnings.push('no_site_manager');
  return warnings;
}

export function getScheduleWarningLabel(warning: ScheduleWarning): string {
  if (warning === 'no_electrician') return 'Nėra elektriko';
  return 'Nėra darbų vadovo';
}
