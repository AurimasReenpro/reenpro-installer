import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import type { InstallerWorkRole } from '../lib/installerWorkRoles';
export {
  INSTALLER_WORK_ROLE_LABELS,
  INSTALLER_WORK_ROLE_OPTIONS,
  getInstallerWorkRoleLabel,
} from '../lib/installerWorkRoles';

export type InstallerEmploymentStatus = 'active' | 'inactive' | 'invited' | 'suspended' | 'archived';
export type TeamStatus = 'active' | 'inactive' | 'archived';

export interface CreateInstallerData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password?: string;
}

export async function createInstaller(data: CreateInstallerData) {
  // Account creation goes through the admin-only `create-installer` Edge Function,
  // which verifies the caller is an admin (service role) before creating the user.
  // supabase-js automatically attaches the logged-in admin's JWT as the
  // Authorization header, which the function validates.
  const { data: result, error } = (await supabase.functions.invoke('create-installer', {
    body: {
      email: data.email,
      password: data.password || 'TemporaryPassword123!', // 21 chars ≥ 8
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
    },
  })) as {
    data: { user?: { id: string } | null; error?: string } | null;
    error: { message?: string; context?: { json?: () => Promise<unknown> } } | null;
  };

  // (1) invoke-level error (network, or a non-2xx that supabase-js flags). The real
  // message from our function lives in the Response body (error.context), so dig it out.
  if (error) {
    let msg = error.message ?? 'Nepavyko sukurti montuotojo.';
    try {
      const body = (await error.context?.json?.()) as { error?: string } | undefined;
      if (body?.error) msg = body.error;
    } catch { /* keep the generic message */ }
    throw new Error(msg);
  }

  // (2) Our function returned its specific error string in the JSON body (e.g.
  // "Forbidden: admin role required." / "Invalid email format.").
  if (result?.error) {
    throw new Error(result.error);
  }

  // (3) Success must include the created user.
  if (!result?.user) {
    throw new Error('Nepavyko sukurti vartotojo.');
  }

  return result;
}

export async function deleteInstaller(id: string): Promise<void> {
  const { error } = await supabase.from('user_profiles').delete().eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateInstaller(
  id: string,
  data: { firstName: string; lastName: string; phone?: string; teamId?: string | null; workRole?: InstallerWorkRole }
): Promise<void> {
  const { data: updatedData, error } = await supabase
    .from('user_profiles')
    .update({
      full_name: `${data.firstName} ${data.lastName}`.trim(),
      phone: data.phone || null,
      team_id: data.teamId,
      ...(data.workRole ? { work_role: data.workRole } : {}),
    })
    .eq('id', id)
    .select();

  if (error) {
    throw new Error(error.message);
  }

  if (!updatedData || updatedData.length === 0) {
    throw new Error('Nepavyko atnaujinti: įrašas nerastas arba blokuoja RLS taisyklės.');
  }
}

export interface Team {
  id: string;
  name: string;
  created_at?: string | null;
  status?: TeamStatus;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
}

export async function getTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function getActiveTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('status', 'active')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function createTeam(name: string): Promise<Team> {
  const { data, error } = await supabase
    .from('teams')
    .insert({ name })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateTeamStatus(
  teamId: string,
  status: TeamStatus,
  reason?: string,
): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const isArchived = status === 'archived';
  const { data, error } = await supabase
    .from('teams')
    .update({
      status,
      archived_at: isArchived ? new Date().toISOString() : null,
      archived_by: isArchived ? authData.user?.id ?? null : null,
      archive_reason: isArchived ? reason?.trim() || null : null,
    })
    .eq('id', teamId)
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Nepavyko atnaujinti komandos statuso.');
}

export async function archiveTeam(teamId: string, reason?: string): Promise<void> {
  return updateTeamStatus(teamId, 'archived', reason);
}

export async function reactivateTeam(teamId: string): Promise<void> {
  return updateTeamStatus(teamId, 'active');
}

export interface InstallerOption {
  id: string;
  full_name: string | null;
  team_id: string | null;
  employment_status: InstallerEmploymentStatus;
  work_role: InstallerWorkRole | null;
}

/**
 * Active installers only — for OPERATIONAL selectors (Schedule, site/team
 * assignment, filters). Archived/inactive crews must never appear here.
 */
export async function getActiveInstallers(): Promise<InstallerOption[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, team_id, employment_status, work_role')
    .eq('role', 'installer')
    .eq('employment_status', 'active')
    .order('full_name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Full user_profiles row for an installer (all employment statuses). */
export type AdminInstaller = Database['public']['Tables']['user_profiles']['Row'];

/**
 * ALL installers regardless of employment_status — for the Montuotojai
 * management page, so admins can always see and reactivate archived crews.
 * Never filter by employment_status here.
 */
export async function getAdminInstallers(): Promise<AdminInstaller[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('role', 'installer')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateInstallerWorkRole(
  installerId: string,
  workRole: InstallerWorkRole,
): Promise<void> {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ work_role: workRole })
    .eq('id', installerId)
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Nepavyko atnaujinti montuotojo pareigų.');
}

export async function assignInstallerToTeam(installerId: string, teamId: string): Promise<void> {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ team_id: teamId })
    .eq('id', installerId)
    .eq('employment_status', 'active')
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Nepavyko priskirti montuotojo komandai.');
}

export async function removeInstallerFromTeam(installerId: string): Promise<void> {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ team_id: null })
    .eq('id', installerId)
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Nepavyko pašalinti montuotojo iš komandos.');
}

export async function updateInstallerStatus(
  installerId: string,
  status: InstallerEmploymentStatus,
  reason?: string,
): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const isInactiveState = status === 'inactive' || status === 'suspended' || status === 'archived';
  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      employment_status: status,
      deactivated_at: isInactiveState ? new Date().toISOString() : null,
      deactivated_by: isInactiveState ? authData.user?.id ?? null : null,
      deactivation_reason: isInactiveState ? reason?.trim() || null : null,
    })
    .eq('id', installerId)
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Nepavyko atnaujinti montuotojo statuso.');
}

export async function deactivateInstaller(installerId: string, reason?: string): Promise<void> {
  return updateInstallerStatus(installerId, 'inactive', reason);
}

export async function reactivateInstaller(installerId: string): Promise<void> {
  return updateInstallerStatus(installerId, 'active');
}

export interface InstallerActivitySite {
  id: string;
  code: string | null;
  client_name: string | null;
  team_id: string | null;
  scheduled_start: string | null;
}

export interface InstallerActivityTimeEntry {
  id: string;
  installer_id: string;
  site_id: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  site: InstallerActivitySite | null;
}

export async function getInstallerActivityTimeEntries(sinceIso: string): Promise<InstallerActivityTimeEntry[]> {
  const { data, error } = await supabase
    .from('time_entries')
    .select(
      'id, installer_id, site_id, start_time, end_time, duration_minutes, ' +
        'site:sites(id, code, client_name, team_id, scheduled_start)',
    )
    .or(`start_time.gte.${sinceIso},end_time.is.null`)
    .order('start_time', { ascending: false })
    .limit(5000);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InstallerActivityTimeEntry[];
}

export interface InstallerPlannedSiteSummary {
  id: string;
  team_id: string | null;
  scheduled_start: string | null;
  status: string | null;
}

export async function getInstallerTeamPlannedSites(
  weekStartIso: string,
  weekEndIso: string,
): Promise<InstallerPlannedSiteSummary[]> {
  const { data, error } = await supabase
    .from('sites')
    .select('id, team_id, scheduled_start, status')
    .not('team_id', 'is', null)
    .gte('scheduled_start', weekStartIso)
    .lte('scheduled_start', weekEndIso)
    .order('scheduled_start', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}
