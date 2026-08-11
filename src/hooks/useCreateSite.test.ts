import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../api/sites', () => ({ assignChecklistToSite: vi.fn() }));

import { buildBlankSiteInsert } from './useCreateSite';

describe('buildBlankSiteInsert', () => {
  it('creates B2C draft sites by default', () => {
    expect(buildBlankSiteInsert('N-1')).toMatchObject({
      code: 'N-1',
      client_name: 'Naujas Objektas',
      address: '',
      system_type: 'PV',
      site_type: 'b2c',
      status: 'pending',
    });
  });

  it('stores the selected site type when provided', () => {
    expect(buildBlankSiteInsert('N-2', 'b2b')).toMatchObject({
      code: 'N-2',
      site_type: 'b2b',
    });
  });
});
