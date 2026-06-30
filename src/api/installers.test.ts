import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

import {
  assignInstallerToTeam,
  archiveTeam,
  deactivateInstaller,
  reactivateTeam,
  reactivateInstaller,
  removeInstallerFromTeam,
  updateInstallerStatus,
  updateInstallerWorkRole,
} from './installers';

describe('installer status API payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-25T09:30:00.000Z'));

    mocks.single.mockResolvedValue({ data: { id: 'installer-1' }, error: null });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.eq.mockReturnValue({ eq: mocks.eq, select: mocks.select });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deactivateInstaller writes inactive lifecycle fields', async () => {
    await deactivateInstaller('installer-1', 'Nebedirba');

    expect(mocks.from).toHaveBeenCalledWith('user_profiles');
    expect(mocks.update).toHaveBeenCalledWith({
      employment_status: 'inactive',
      deactivated_at: '2026-06-25T09:30:00.000Z',
      deactivated_by: 'admin-1',
      deactivation_reason: 'Nebedirba',
    });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'installer-1');
  });

  it('reactivateInstaller clears lifecycle fields', async () => {
    await reactivateInstaller('installer-1');

    expect(mocks.update).toHaveBeenCalledWith({
      employment_status: 'active',
      deactivated_at: null,
      deactivated_by: null,
      deactivation_reason: null,
    });
  });

  it('updateInstallerStatus trims blank reasons for inactive-like statuses', async () => {
    await updateInstallerStatus('installer-1', 'archived', '   ');

    expect(mocks.update).toHaveBeenCalledWith({
      employment_status: 'archived',
      deactivated_at: '2026-06-25T09:30:00.000Z',
      deactivated_by: 'admin-1',
      deactivation_reason: null,
    });
  });

  it('updateInstallerWorkRole writes the separate work_role field', async () => {
    await updateInstallerWorkRole('installer-1', 'electrician');

    expect(mocks.from).toHaveBeenCalledWith('user_profiles');
    expect(mocks.update).toHaveBeenCalledWith({ work_role: 'electrician' });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'installer-1');
  });

  it('assignInstallerToTeam writes team_id for active installers only', async () => {
    await assignInstallerToTeam('installer-1', 'team-1');

    expect(mocks.from).toHaveBeenCalledWith('user_profiles');
    expect(mocks.update).toHaveBeenCalledWith({ team_id: 'team-1' });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'installer-1');
    expect(mocks.eq).toHaveBeenCalledWith('employment_status', 'active');
  });

  it('removeInstallerFromTeam sets team_id to null', async () => {
    await removeInstallerFromTeam('installer-1');

    expect(mocks.from).toHaveBeenCalledWith('user_profiles');
    expect(mocks.update).toHaveBeenCalledWith({ team_id: null });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'installer-1');
  });

  it('archiveTeam writes archived lifecycle fields', async () => {
    await archiveTeam('team-1', 'Sena brigada');

    expect(mocks.from).toHaveBeenCalledWith('teams');
    expect(mocks.update).toHaveBeenCalledWith({
      status: 'archived',
      archived_at: '2026-06-25T09:30:00.000Z',
      archived_by: 'admin-1',
      archive_reason: 'Sena brigada',
    });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'team-1');
  });

  it('reactivateTeam restores active status and clears archive fields', async () => {
    await reactivateTeam('team-1');

    expect(mocks.from).toHaveBeenCalledWith('teams');
    expect(mocks.update).toHaveBeenCalledWith({
      status: 'active',
      archived_at: null,
      archived_by: null,
      archive_reason: null,
    });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'team-1');
  });

  it('reactivateInstaller restores active status and clears deactivation fields', async () => {
    await reactivateInstaller('installer-1');

    expect(mocks.from).toHaveBeenCalledWith('user_profiles');
    expect(mocks.update).toHaveBeenCalledWith({
      employment_status: 'active',
      deactivated_at: null,
      deactivated_by: null,
      deactivation_reason: null,
    });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'installer-1');
  });
});
