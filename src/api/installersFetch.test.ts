import { beforeEach, describe, expect, it, vi } from 'vitest';

// A chainable select-query stub: from→select→eq…→order resolves to {data,error}.
// We record every .eq(column, value) so we can assert which filters were applied.
const state = vi.hoisted(() => ({
  result: { data: [] as Record<string, unknown>[], error: null as { message: string } | null },
  eqCalls: [] as [string, unknown][],
  fromTable: '' as string,
}));

vi.mock('../lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((col: string, val: unknown) => { state.eqCalls.push([col, val]); return builder; });
  builder.order = vi.fn(() => Promise.resolve(state.result));
  return {
    supabase: {
      from: vi.fn((table: string) => { state.fromTable = table; return builder; }),
    },
  };
});

import { getActiveInstallers, getAdminInstallers } from './installers';

beforeEach(() => {
  state.result = { data: [], error: null };
  state.eqCalls = [];
  state.fromTable = '';
});

describe('getActiveInstallers (operational)', () => {
  it('excludes archived by filtering employment_status = active', async () => {
    state.result = { data: [{ id: 'a', employment_status: 'active' }], error: null };
    const rows = await getActiveInstallers();

    expect(state.fromTable).toBe('user_profiles');
    expect(state.eqCalls).toContainEqual(['role', 'installer']);
    expect(state.eqCalls).toContainEqual(['employment_status', 'active']);
    expect(rows).toHaveLength(1);
  });
});

describe('getAdminInstallers (management)', () => {
  it('includes archived installers and never filters by employment_status', async () => {
    state.result = {
      data: [
        { id: 'a', employment_status: 'active' },
        { id: 'b', employment_status: 'archived' },
      ],
      error: null,
    };
    const rows = await getAdminInstallers();

    expect(state.fromTable).toBe('user_profiles');
    expect(state.eqCalls).toContainEqual(['role', 'installer']);
    expect(state.eqCalls.some(([col]) => col === 'employment_status')).toBe(false);
    expect(rows.map((r) => r.employment_status)).toContain('archived');
  });
});
