/**
 * How a target type is written wherever it is shown to a person. This is
 * the shared contract's own `TARGET_TYPE_LABEL`, re-exported from here so
 * every screen that formats project display data keeps importing from one
 * place - the contract stays the single source of truth (and the only spot
 * that has to remember a fifth `unknown` member if one is ever added).
 */
export { TARGET_TYPE_LABEL } from '@shared/ipc-contract';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "12 min ago" / "yesterday" / "3 Feb" - the timestamps the design puts at
 * the end of a project row.
 *
 * `now` is a parameter rather than a call to `Date.now()` inside so this is
 * a pure function: the same two inputs always produce the same string,
 * which is what makes it testable without freezing the clock.
 *
 * An unparseable timestamp returns an em dash rather than "Invalid Date".
 * Nothing in the app should ever store one, but a row that quietly says
 * nothing beats a row that shouts a JavaScript error at someone.
 */
export function relativeTime(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';

  const elapsed = now - then;
  if (elapsed < 0) return 'just now';
  if (elapsed < MINUTE) return 'just now';

  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} min ago`;
  }

  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }

  if (elapsed < 2 * DAY) return 'yesterday';

  if (elapsed < 7 * DAY) {
    const days = Math.floor(elapsed / DAY);
    return `${days} days ago`;
  }

  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
