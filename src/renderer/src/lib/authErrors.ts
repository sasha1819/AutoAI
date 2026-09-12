import type { AuthErrorCode } from '@shared/ipc-contract';

const MESSAGES: Record<AuthErrorCode, string> = {
  PROFILE_ALREADY_EXISTS: 'A profile already exists on this machine - try logging in instead.',
  PROFILE_NOT_FOUND: 'No profile found on this machine yet. Register first.',
  INVALID_CREDENTIALS: 'That email or password is incorrect.',
  WEAK_PASSWORD: 'Password needs to be at least 8 characters.',
  INVALID_EMAIL: 'That doesn’t look like a valid email address.',
  NAME_REQUIRED: 'Please enter your name.',
};

export function describeAuthError(code: AuthErrorCode): string {
  return MESSAGES[code];
}
