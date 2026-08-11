import { describe, expect, it } from 'vitest';
import { DashboardLoadError, DASHBOARD_SITE_SELECT } from './dashboard';

describe('dashboard data source contract', () => {
  it('uses the installer relationship when embedding time entry profiles', () => {
    expect(DASHBOARD_SITE_SELECT).toContain('installer:user_profiles!time_entries_installer_id_fkey');
  });

  it('keeps section and Supabase diagnostics for dashboard load errors', () => {
    const error = new DashboardLoadError('scheduled sites', {
      code: 'PGRST201',
      message: "Could not embed because more than one relationship was found for 'time_entries' and 'user_profiles'",
      details: [{ relationship: 'time_entries_installer_id_fkey' }],
      hint: "Try changing 'user_profiles' to 'user_profiles!time_entries_installer_id_fkey'.",
    });

    expect(error.section).toBe('scheduled sites');
    expect(error.code).toBe('PGRST201');
    expect(error.isMissingMigration()).toBe(true);
    expect(error.toDevMessage()).toContain('time_entries_installer_id_fkey');
  });
});
