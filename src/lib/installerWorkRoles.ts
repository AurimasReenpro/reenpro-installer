export const INSTALLER_WORK_ROLES = [
  'installer',
  'electrician',
  'site_manager',
  'project_manager',
] as const;

export type InstallerWorkRole = (typeof INSTALLER_WORK_ROLES)[number];

export const INSTALLER_WORK_ROLE_LABELS: Record<InstallerWorkRole, string> = {
  installer: 'Montuotojas',
  electrician: 'Elektrikas',
  site_manager: 'Darbų vadovas',
  project_manager: 'Projektų vadovas',
};

const INSTALLER_WORK_ROLE_COUNT_LABELS: Record<InstallerWorkRole, { one: string; many: string }> = {
  installer: { one: 'montuotojas', many: 'montuotojai' },
  electrician: { one: 'elektrikas', many: 'elektrikai' },
  site_manager: { one: 'darbų vadovas', many: 'darbų vadovai' },
  project_manager: { one: 'projektų vadovas', many: 'projektų vadovai' },
};

export const INSTALLER_WORK_ROLE_OPTIONS = INSTALLER_WORK_ROLES.map((value) => ({
  value,
  label: INSTALLER_WORK_ROLE_LABELS[value],
}));

export function normalizeInstallerWorkRole(value: string | null | undefined): InstallerWorkRole {
  return INSTALLER_WORK_ROLES.includes(value as InstallerWorkRole)
    ? value as InstallerWorkRole
    : 'installer';
}

export function getInstallerWorkRoleLabel(value: string | null | undefined): string {
  return INSTALLER_WORK_ROLE_LABELS[normalizeInstallerWorkRole(value)];
}

export function getInstallerWorkRoleCountLabel(role: InstallerWorkRole, count: number): string {
  const labels = INSTALLER_WORK_ROLE_COUNT_LABELS[role];
  return `${count} ${count === 1 ? labels.one : labels.many}`;
}
