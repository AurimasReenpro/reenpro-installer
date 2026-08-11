import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture every rpc(name, args) call; result is always success.
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: mocks.rpc },
}));

import { adminCloseTimeEntry, adminCorrectTimeEntry, markTimeEntryReviewed } from './timeTracking';

describe('admin time-correction API → RPC contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
  });

  it('adminCloseTimeEntry calls admin_close_time_entry with p_* args', async () => {
    await adminCloseTimeEntry('entry-1', '2026-07-06T15:00:00.000Z', 'pamirštas laikas');
    expect(mocks.rpc).toHaveBeenCalledWith('admin_close_time_entry', {
      p_entry_id: 'entry-1',
      p_ended_at: '2026-07-06T15:00:00.000Z',
      p_reason: 'pamirštas laikas',
    });
  });

  it('adminCorrectTimeEntry calls admin_correct_time_entry; markReviewed defaults true', async () => {
    await adminCorrectTimeEntry({
      entryId: 'entry-1',
      startedAt: '2026-07-06T08:00:00.000Z',
      endedAt: '2026-07-06T16:00:00.000Z',
      reason: 'neteisinga pabaiga',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('admin_correct_time_entry', {
      p_entry_id: 'entry-1',
      p_started_at: '2026-07-06T08:00:00.000Z',
      p_ended_at: '2026-07-06T16:00:00.000Z',
      p_reason: 'neteisinga pabaiga',
      p_mark_reviewed: true,
    });
  });

  it('adminCorrectTimeEntry passes markReviewed=false through', async () => {
    await adminCorrectTimeEntry({
      entryId: 'entry-1',
      startedAt: '2026-07-06T08:00:00.000Z',
      endedAt: '2026-07-06T16:00:00.000Z',
      reason: 'neteisinga pabaiga',
      markReviewed: false,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('admin_correct_time_entry',
      expect.objectContaining({ p_mark_reviewed: false }));
  });

  it('markTimeEntryReviewed calls mark_time_entry_reviewed', async () => {
    await markTimeEntryReviewed('entry-1', 'patikrinta');
    expect(mocks.rpc).toHaveBeenCalledWith('mark_time_entry_reviewed', {
      p_entry_id: 'entry-1',
      p_reason: 'patikrinta',
    });
  });

  it('surfaces backend errors as Error with the DB message', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Pabaiga turi būti po pradžios.' } });
    await expect(adminCloseTimeEntry('entry-1', '2026-07-06T15:00:00.000Z', 'testas testas'))
      .rejects.toThrow('Pabaiga turi būti po pradžios.');
  });
});
