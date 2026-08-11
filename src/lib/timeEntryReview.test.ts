import { describe, it, expect } from 'vitest';
import {
  isLongOpenTimeEntry,
  isLikelyForgottenTimeEntry,
  isSevereStaleTimeEntry,
  getTimeEntryReviewReason,
} from './timeEntryReview';

const NOW = Date.parse('2026-07-06T12:00:00Z');
const HOUR = 3_600_000;
const openFor = (hours: number) => ({ start_time: new Date(NOW - hours * HOUR).toISOString(), end_time: null });
const closed = { start_time: new Date(NOW - 30 * HOUR).toISOString(), end_time: new Date(NOW - 20 * HOUR).toISOString() };

describe('stale open-timer thresholds', () => {
  it('under 10h: no flags', () => {
    const e = openFor(9);
    expect(isLongOpenTimeEntry(e, NOW)).toBe(false);
    expect(isLikelyForgottenTimeEntry(e, NOW)).toBe(false);
    expect(isSevereStaleTimeEntry(e, NOW)).toBe(false);
  });
  it('>10h: long, not yet forgotten', () => {
    const e = openFor(11);
    expect(isLongOpenTimeEntry(e, NOW)).toBe(true);
    expect(isLikelyForgottenTimeEntry(e, NOW)).toBe(false);
  });
  it('>12h: likely forgotten, not yet severe', () => {
    const e = openFor(13);
    expect(isLikelyForgottenTimeEntry(e, NOW)).toBe(true);
    expect(isSevereStaleTimeEntry(e, NOW)).toBe(false);
  });
  it('>24h: severe', () => {
    expect(isSevereStaleTimeEntry(openFor(25), NOW)).toBe(true);
  });
  it('closed entries never flag, regardless of length', () => {
    expect(isLongOpenTimeEntry(closed, NOW)).toBe(false);
    expect(isSevereStaleTimeEntry(closed, NOW)).toBe(false);
    expect(getTimeEntryReviewReason(closed, NOW)).toBeNull();
  });
});

describe('getTimeEntryReviewReason (worst threshold wins, LT text)', () => {
  it('maps each band to its message', () => {
    expect(getTimeEntryReviewReason(openFor(9), NOW)).toBeNull();
    expect(getTimeEntryReviewReason(openFor(11), NOW)).toBe('Darbas tęsiasi ilgai.');
    expect(getTimeEntryReviewReason(openFor(13), NOW)).toBe('Patikrinkite, ar darbas nebuvo pamirštas sustabdyti.');
    expect(getTimeEntryReviewReason(openFor(25), NOW)).toBe('Ilgas atviras laiko įrašas.');
  });
  it('is null for unparseable start times', () => {
    expect(getTimeEntryReviewReason({ start_time: 'garbage', end_time: null }, NOW)).toBeNull();
  });
});
