import { describe, expect, it } from 'vitest';
import { TargetType } from '../src/shared/ipc-contract';
import { TARGET_TYPE_LABEL, relativeTime } from '../src/renderer/src/lib/projectDisplay';

/** A fixed "now" so every case reads as an absolute distance from one
 * point rather than from whenever the suite happens to run. */
const NOW = Date.parse('2026-03-10T12:00:00.000Z');

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  it('calls anything under a minute "just now"', () => {
    expect(relativeTime(ago(0), NOW)).toBe('just now');
    expect(relativeTime(ago(59 * SECOND), NOW)).toBe('just now');
  });

  it('counts minutes, then hours, then days', () => {
    expect(relativeTime(ago(12 * MINUTE), NOW)).toBe('12 min ago');
    expect(relativeTime(ago(1 * HOUR), NOW)).toBe('1 hour ago');
    expect(relativeTime(ago(5 * HOUR), NOW)).toBe('5 hours ago');
    expect(relativeTime(ago(3 * DAY), NOW)).toBe('3 days ago');
  });

  it('names the day before "yesterday" rather than "1 days ago"', () => {
    expect(relativeTime(ago(26 * HOUR), NOW)).toBe('yesterday');
  });

  it('falls back to a date once a week has passed', () => {
    // Not asserting the exact string: the format follows the machine's
    // locale. What matters is that it stops counting and names a day.
    const formatted = relativeTime(ago(40 * DAY), NOW);
    expect(formatted).not.toMatch(/ago|yesterday|just now/);
    expect(formatted).toMatch(/\d/);
  });

  it('does not count backwards for a clock that ran ahead', () => {
    // A project created "in the future" is possible after a clock change
    // or a timezone-naive write. "-3 min ago" would be nonsense on screen.
    expect(relativeTime(new Date(NOW + 5 * MINUTE).toISOString(), NOW)).toBe('just now');
  });

  it('returns an em dash for a timestamp it cannot read', () => {
    expect(relativeTime('not a date', NOW)).toBe('—');
  });
});

describe('TARGET_TYPE_LABEL', () => {
  /* Asserted by membership rather than a literal object, so this stays
   * true if TargetType ever grows a fifth value - the exact bug this
   * label map already had once, when it was a second, hand-kept copy
   * that never learned about `unknown`. */
  it('covers every target type the contract defines', () => {
    for (const value of Object.values(TargetType)) {
      expect(TARGET_TYPE_LABEL[value]).toEqual(expect.any(String));
    }
  });

  it('gives every label some readable text, not a blank string', () => {
    for (const label of Object.values(TARGET_TYPE_LABEL)) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });
});
