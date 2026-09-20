import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/main/services/AuthService';
import type { ProfileRepository, StoredProfile } from '../src/main/services/ProfileStore';

/** In-memory stand-in for the electron-store-backed ProfileStore, so these
 * tests run under plain Node/vitest with no Electron runtime required. */
class FakeProfileRepository implements ProfileRepository {
  private profile: StoredProfile | undefined;

  getRaw(): StoredProfile | undefined {
    return this.profile;
  }

  save(profile: StoredProfile): void {
    this.profile = profile;
  }

  setLoggedIn(loggedIn: boolean): void {
    if (!this.profile) return;
    this.profile = { ...this.profile, loggedIn };
  }
}

describe('AuthService', () => {
  let repo: FakeProfileRepository;
  let auth: AuthService;

  beforeEach(() => {
    repo = new FakeProfileRepository();
    auth = new AuthService(repo);
  });

  it('registers a first profile and returns a session with no password material', async () => {
    const result = await auth.register({ name: 'Alex', email: 'Alex@Example.com', password: 'password123' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.email).toBe('alex@example.com'); // normalized
    expect(result.session).not.toHaveProperty('passwordHash');
  });

  it('refuses a second registration on the same machine', async () => {
    await auth.register({ name: 'Alex', email: 'alex@example.com', password: 'password123' });
    const second = await auth.register({ name: 'Sam', email: 'sam@example.com', password: 'password123' });

    expect(second).toEqual({ ok: false, error: 'PROFILE_ALREADY_EXISTS' });
  });

  it('rejects a weak password on registration', async () => {
    const result = await auth.register({ name: 'Alex', email: 'alex@example.com', password: 'short' });
    expect(result).toEqual({ ok: false, error: 'WEAK_PASSWORD' });
  });

  it('rejects registration with an invalid email', async () => {
    const result = await auth.register({ name: 'Alex', email: 'not-an-email', password: 'password123' });
    expect(result).toEqual({ ok: false, error: 'INVALID_EMAIL' });
  });

  it('logs in with correct credentials after registering', async () => {
    await auth.register({ name: 'Alex', email: 'alex@example.com', password: 'password123' });
    await auth.logout();

    const result = await auth.login({ email: 'alex@example.com', password: 'password123' });
    expect(result.ok).toBe(true);
  });

  it('rejects login with the wrong password without leaking which field was wrong', async () => {
    await auth.register({ name: 'Alex', email: 'alex@example.com', password: 'password123' });
    await auth.logout();

    const result = await auth.login({ email: 'alex@example.com', password: 'wrong-password' });
    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
  });

  it('rejects login when no profile has been created yet', async () => {
    const result = await auth.login({ email: 'nobody@example.com', password: 'password123' });
    expect(result).toEqual({ ok: false, error: 'PROFILE_NOT_FOUND' });
  });

  it('has no session after logout', async () => {
    await auth.register({ name: 'Alex', email: 'alex@example.com', password: 'password123' });
    await auth.logout();

    expect(auth.getCurrentSession()).toBeNull();
  });
});
