import { beforeEach, describe, expect, it } from 'vitest';
import type { AutoaiApi, SessionState } from '../src/shared/ipc-contract';

/**
 * The renderer reaches main through `window.autoai`, captured once by
 * `autoaiClient` at module load. So the fake bridge has to be in place
 * before the store is imported - hence the dynamic import below rather
 * than a normal top-of-file one.
 */
const state: { hasProfile: boolean; session: SessionState | null } = {
  hasProfile: false,
  session: null,
};

const fakeApi = {
  auth: {
    hasProfile: async () => state.hasProfile,
    register: async () => ({ ok: true as const, session: state.session as SessionState }),
    login: async () => ({ ok: true as const, session: state.session as SessionState }),
    logout: async () => undefined,
  },
  session: {
    getCurrent: async () => state.session,
  },
  /* These suites are about the session, not about projects or the test
     plan - but `satisfies AutoaiApi` means the whole bridge has to be
     here, which is what makes this file notice a channel being added. */
  projects: {
    addFromGit: async () => ({ ok: false as const, error: 'INVALID_GIT_URL' as const }),
    addFromLocalPath: async () => ({ ok: false as const, error: 'PATH_NOT_FOUND' as const }),
    pickLocalFolder: async () => null,
    list: async () => [],
    remove: async () => undefined,
    setOverride: async () => null,
    runDetection: async () => null,
  },
  testPlan: {
    list: async () => ({ areas: [], cases: [] }),
    createArea: async () => ({ ok: false as const, error: 'PROJECT_NOT_FOUND' as const }),
    renameArea: async () => ({ ok: false as const, error: 'AREA_NOT_FOUND' as const }),
    createCase: async () => ({ ok: false as const, error: 'PROJECT_NOT_FOUND' as const }),
    moveCase: async () => ({ ok: false as const, error: 'CASE_NOT_FOUND' as const }),
    deleteCase: async () => ({ ok: false as const, error: 'CASE_NOT_FOUND' as const }),
    importCases: async () => ({ ok: false as const, error: 'NOTHING_TO_IMPORT' as const }),
  },
  claude: {
    checkConnection: async () => ({ connected: false as const, reason: 'NOT_LOGGED_IN' as const }),
    getModelPreference: async () => ({ model: null, effort: null }),
    setModelPreference: async (preference) => preference,
  },
  scan: {
    run: async () => ({ ok: false as const, error: 'PROJECT_NOT_FOUND' as const }),
    getLast: async () => null,
  },
} satisfies AutoaiApi;

(globalThis as { window?: unknown }).window = { autoai: fakeApi };

const { useSessionStore } = await import('../src/renderer/src/state/useSessionStore');

function profile(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: 'p1',
    name: 'Alex Rivera',
    email: 'alex@example.com',
    ...overrides,
  };
}

describe('useSessionStore flow gate', () => {
  beforeEach(() => {
    state.hasProfile = false;
    state.session = null;
    useSessionStore.setState({ stage: 'loading', session: null, lastError: null });
  });

  it('opens at the welcome screen when the machine has no profile yet', async () => {
    await useSessionStore.getState().bootstrap();
    expect(useSessionStore.getState().stage).toBe('welcome');
  });

  it('moves welcome -> registration and back again', async () => {
    await useSessionStore.getState().bootstrap();

    useSessionStore.getState().startRegistration();
    expect(useSessionStore.getState().stage).toBe('needs-registration');

    useSessionStore.getState().backToWelcome();
    expect(useSessionStore.getState().stage).toBe('welcome');
  });

  it('clears a failed-registration error when stepping back to welcome', () => {
    useSessionStore.setState({ stage: 'needs-registration', lastError: 'WEAK_PASSWORD' });

    useSessionStore.getState().backToWelcome();

    expect(useSessionStore.getState().lastError).toBeNull();
  });

  it('sends an existing profile with no live session to login, not welcome', async () => {
    state.hasProfile = true;
    state.session = null;

    await useSessionStore.getState().bootstrap();

    expect(useSessionStore.getState().stage).toBe('needs-login');
  });

  it('goes straight to ready for a registered profile with a live session', async () => {
    state.hasProfile = true;
    state.session = profile();

    await useSessionStore.getState().bootstrap();

    expect(useSessionStore.getState().stage).toBe('ready');
  });
});
