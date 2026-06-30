import { describe, expect, it } from 'vitest';
import { formatElapsedWorkTimer, formatStartedLabel } from './dashboardTime';

describe('dashboard time formatting', () => {
  it('formats elapsed work shorter than one hour', () => {
    const start = new Date(2026, 0, 1, 17, 4).toISOString();
    const now = new Date(2026, 0, 1, 17, 46).getTime();

    expect(formatElapsedWorkTimer(start, now)).toBe('42 min');
  });

  it('formats elapsed work longer than one hour', () => {
    const start = new Date(2026, 0, 1, 17, 4).toISOString();
    const now = new Date(2026, 0, 1, 18, 12).getTime();

    expect(formatElapsedWorkTimer(start, now)).toBe('1h 08min');
  });

  it('formats missing start time as a dash', () => {
    expect(formatElapsedWorkTimer(null, Date.now())).toBe('—');
  });

  it('formats started labels with the compact nuo prefix', () => {
    const start = new Date(2026, 0, 1, 17, 4).toISOString();

    expect(formatStartedLabel(start)).toBe('nuo 17:04');
  });
});
