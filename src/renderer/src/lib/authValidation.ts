/**
 * Client-side, instant pre-checks for the login/register forms - purely a
 * UX improvement over waiting on a round-trip to main to learn "that's not
 * an email." This is NOT the security boundary: AuthService.ts's own
 * EMAIL_PATTERN/length check is the real enforcement, unchanged by this
 * file, and still runs on every request regardless of what the renderer
 * already checked. If the two ever drift, the server is what's authoritative
 * - this file only ever saves a round-trip, it never grants one.
 *
 * Messages intentionally match authErrors.ts's wording for the same
 * condition, so a person never sees two different phrasings of "that's not
 * a valid email" depending on whether the check happened locally or on the
 * server.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/** Null means valid - matches the convention FormField's `error` prop
 *  expects (no message shown when there's nothing to show). */
export function validateEmailFormat(email: string): string | null {
  const trimmed = email.trim();
  if (trimmed.length === 0) return 'Please enter your email.';
  if (!EMAIL_PATTERN.test(trimmed)) return 'That doesn’t look like a valid email address.';
  return null;
}

export function validateRequired(value: string, fieldLabel: string): string | null {
  return value.trim().length === 0 ? `Please enter your ${fieldLabel}.` : null;
}

export function validatePasswordLength(password: string): string | null {
  if (password.length === 0) return 'Please enter a password.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password needs to be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}
