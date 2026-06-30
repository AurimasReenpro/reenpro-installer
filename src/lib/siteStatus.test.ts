import { describe, expect, it } from 'vitest';
import {
  isArchivedSiteStatus,
  isCompletedOrArchivedSiteStatus,
  isInstallerVisibleSiteStatus,
  isOperationalSiteStatus,
  isUpcomingInstallerSiteStatus,
} from './siteStatus';

describe('site status helpers', () => {
  it('treats archived as non-operational', () => {
    expect(isArchivedSiteStatus('archived')).toBe(true);
    expect(isOperationalSiteStatus('archived')).toBe(false);
    expect(isOperationalSiteStatus('pending')).toBe(true);
    expect(isOperationalSiteStatus('in_progress')).toBe(true);
  });

  it('excludes archived from installer job lists', () => {
    expect(isInstallerVisibleSiteStatus('archived')).toBe(false);
    expect(isInstallerVisibleSiteStatus('pending')).toBe(true);
    expect(isInstallerVisibleSiteStatus('completed')).toBe(true);
  });

  it('only treats pending or null as upcoming installer work', () => {
    expect(isUpcomingInstallerSiteStatus('pending')).toBe(true);
    expect(isUpcomingInstallerSiteStatus(null)).toBe(true);
    expect(isUpcomingInstallerSiteStatus('archived')).toBe(false);
    expect(isUpcomingInstallerSiteStatus('completed')).toBe(false);
  });

  it('marks completed and archived sites as read-only history states', () => {
    expect(isCompletedOrArchivedSiteStatus('completed')).toBe(true);
    expect(isCompletedOrArchivedSiteStatus('archived')).toBe(true);
    expect(isCompletedOrArchivedSiteStatus('paused')).toBe(false);
  });
});
