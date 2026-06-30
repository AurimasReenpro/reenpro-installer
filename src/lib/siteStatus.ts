export const ARCHIVED_SITE_STATUS = 'archived';

export const OPERATIONAL_SITE_STATUSES = ['pending', 'in_progress', 'paused'] as const;
export const INSTALLER_VISIBLE_SITE_STATUSES = ['pending', 'in_progress', 'paused', 'completed'] as const;

export const OPERATIONAL_SITE_STATUS_FILTER = 'status.is.null,status.in.(pending,in_progress,paused)';
export const INSTALLER_VISIBLE_SITE_STATUS_FILTER = 'status.is.null,status.in.(pending,in_progress,paused,completed)';

export function isArchivedSiteStatus(status: string | null | undefined): boolean {
  return status === ARCHIVED_SITE_STATUS;
}

export function isOperationalSiteStatus(status: string | null | undefined): boolean {
  return status == null || OPERATIONAL_SITE_STATUSES.includes(status as (typeof OPERATIONAL_SITE_STATUSES)[number]);
}

export function isInstallerVisibleSiteStatus(status: string | null | undefined): boolean {
  return status == null || INSTALLER_VISIBLE_SITE_STATUSES.includes(status as (typeof INSTALLER_VISIBLE_SITE_STATUSES)[number]);
}

export function isUpcomingInstallerSiteStatus(status: string | null | undefined): boolean {
  return status == null || status === 'pending';
}

export function isCompletedOrArchivedSiteStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === ARCHIVED_SITE_STATUS;
}
