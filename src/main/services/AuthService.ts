import { randomUUID } from 'node:crypto';
import type {
  AuthResult,
  LoginInput,
  OnboardingResult,
  RegisterInput,
  SessionState,
  UserRole,
} from '@shared/ipc-contract';
import { PasswordHasher } from './PasswordHasher';
import type { ProfileRepository, StoredProfile } from './ProfileStore';

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toSessionState(profile: StoredProfile): SessionState {
  // Deliberately excludes passwordHash/passwordSalt - this is the only
  // shape allowed to cross the IPC boundary back to the renderer.
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    onboardingCompleted: profile.onboardingCompleted,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Owns the local-only auth flow end to end: validation, hashing, and the
 * profile lifecycle. Everything here assumes a single local machine and a
 * single profile per install - there is no server, no network call, no
 * token to leak. If AutoAI later needs real multi-device accounts, this is
 * the seam to swap for a hosted-auth-backed implementation of the same
 * interface shape (register/login/logout/getCurrentSession/setRole).
 */
export class AuthService {
  private readonly hasher = new PasswordHasher();

  constructor(private readonly profileStore: ProfileRepository) {}

  public hasProfile(): boolean {
    return this.profileStore.getRaw() !== undefined;
  }

  public getCurrentSession(): SessionState | null {
    const profile = this.profileStore.getRaw();
    if (!profile || !profile.loggedIn) return null;
    return toSessionState(profile);
  }

  public async register(input: RegisterInput): Promise<AuthResult> {
    if (this.hasProfile()) {
      return { ok: false, error: 'PROFILE_ALREADY_EXISTS' };
    }
    if (input.name.trim().length === 0) {
      return { ok: false, error: 'NAME_REQUIRED' };
    }
    if (!EMAIL_PATTERN.test(input.email.trim())) {
      return { ok: false, error: 'INVALID_EMAIL' };
    }
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: 'WEAK_PASSWORD' };
    }

    const { hash, salt } = await this.hasher.hash(input.password);
    const profile: StoredProfile = {
      id: randomUUID(),
      name: input.name.trim(),
      email: normalizeEmail(input.email),
      passwordHash: hash,
      passwordSalt: salt,
      role: null,
      onboardingCompleted: false,
      loggedIn: true,
    };

    this.profileStore.save(profile);
    return { ok: true, session: toSessionState(profile) };
  }

  public async login(input: LoginInput): Promise<AuthResult> {
    const profile = this.profileStore.getRaw();
    if (!profile) {
      return { ok: false, error: 'PROFILE_NOT_FOUND' };
    }
    if (normalizeEmail(input.email) !== profile.email) {
      return { ok: false, error: 'INVALID_CREDENTIALS' };
    }

    const valid = await this.hasher.verify(input.password, profile.passwordHash, profile.passwordSalt);
    if (!valid) {
      return { ok: false, error: 'INVALID_CREDENTIALS' };
    }

    this.profileStore.setLoggedIn(true);
    return { ok: true, session: toSessionState({ ...profile, loggedIn: true }) };
  }

  public async logout(): Promise<void> {
    this.profileStore.setLoggedIn(false);
  }

  public async setRole(role: UserRole): Promise<OnboardingResult> {
    this.profileStore.setRole(role);
    const profile = this.profileStore.getRaw();
    if (!profile) {
      throw new Error('setRole called with no active profile - this should be unreachable from the UI flow.');
    }
    return { ok: true, session: toSessionState(profile) };
  }
}
