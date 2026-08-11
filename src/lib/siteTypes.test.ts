import { describe, expect, it } from 'vitest';
import {
  buildSiteTypeUpdate,
  categoryMatchesSiteType,
  checklistCategoryMatchesFilter,
  DEFAULT_SITE_TYPE,
  groupChecklistTemplatesForSiteType,
  normalizeSiteType,
  siteTypeLabel,
  type ChecklistTemplateLike,
} from './siteTypes';

const template = (
  id: string,
  category: string | null,
  requires_photo = false,
  phase: string | null = 'pre',
): ChecklistTemplateLike => ({
  id,
  category,
  requires_photo,
  phase,
});

describe('site type helpers', () => {
  it('defaults unknown or missing site types to B2C', () => {
    expect(DEFAULT_SITE_TYPE).toBe('b2c');
    expect(normalizeSiteType(undefined)).toBe('b2c');
    expect(normalizeSiteType('unknown')).toBe('b2c');
    expect(siteTypeLabel(null)).toBe('B2C');
  });

  it('matches checklist categories to site types', () => {
    expect(categoryMatchesSiteType('B2C', 'b2c')).toBe(true);
    expect(categoryMatchesSiteType('b2b', 'b2b')).toBe(true);
    expect(categoryMatchesSiteType('SERVISAS', 'service')).toBe(true);
    expect(categoryMatchesSiteType('Service', 'service')).toBe(true);
    expect(categoryMatchesSiteType('B2C', 'b2b')).toBe(false);
  });

  it('uses required tabs as site-type-aware filters', () => {
    expect(checklistCategoryMatchesFilter('B2B', 'B2B')).toBe(true);
    expect(checklistCategoryMatchesFilter('Service', 'Servisas')).toBe(true);
    expect(checklistCategoryMatchesFilter('Special', 'Special')).toBe(true);
    expect(checklistCategoryMatchesFilter('Special', 'B2C')).toBe(false);
  });

  it('groups only matching checklist template rows for the selected site type', () => {
    const groups = groupChecklistTemplatesForSiteType([
      template('1', 'B2C'),
      template('2', 'B2B', true, 'during'),
      template('3', 'B2B', false, 'post'),
      template('4', 'Servisas'),
      template('5', null),
    ], 'b2b');

    expect(groups).toEqual([
      {
        category: 'B2B',
        label: 'B2B',
        itemCount: 2,
        requiresPhotoCount: 1,
        phases: ['during', 'post'],
      },
    ]);
  });

  it('builds a site type update without touching checklist data', () => {
    expect(buildSiteTypeUpdate('service')).toEqual({ site_type: 'service' });
  });
});
