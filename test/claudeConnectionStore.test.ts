import { beforeEach, describe, expect, it } from 'vitest';
import type { AutoaiApi, ClaudeConnectionStatus } from '../src/shared/ipc-contract';

/**
 * Same shape as the other renderer-store suites: `autoaiClient` captures
 * `window.autoai` once at module load, so the fake bridge has to be in
 * place before the store is imported - hence the dynamic import below.
 */
interface Bridge {
  checkConnection: () => Promise<ClaudeConnectionStatus>;
}

const bridge: Bridge = {
  checkConnection: async () => ({ connected: true }),
};

const fakeApi = {
  auth: {
    hasProfile: async () => true,
    login: async () => ({ ok: false as const, error: 'INVALID_CREDENTIALS' as const }),
    register: async () => ({ ok: false as const, error: 'PROFILE_ALREADY_EXISTS' as const }),
    logout: async () => undefined,
  },
  session: {
    getCurrent: async () => null,
  },
  projects: {
    pickLocalFolder: async () => null,
    addFromGit: async () => {
      throw new Error('not used by these tests');
    },
    addFromLocalPath: async () => {
      throw new Error('not used by these tests');
    },
    list: async () => [],
    remove: async () => undefined,
    setOverride: async () => null,
    runDetection: async () => null,
  },
  testPlan: {
    list: async () => ({ areas: [], cases: [] }),
    createArea: async () => {
      throw new Error('not used by these tests');
    },
    renameArea: async () => {
      throw new Error('not used by these tests');
    },
    createCase: async () => {
      throw new Error('not used by these tests');
    },
    moveCase: async () => {
      throw new Error('not used by these tests');
    },
    deleteCase: async () => {
      throw new Error('not used by these tests');
    },
    importCases: async () => {
      throw new Error('not used by these tests');
    },
  },
  claude: {
    checkConnection: () => bridge.checkConnection(),
  },
  scan: {
    run: async () => {
      throw new Error('not used by these tests');
    },
    getLast: async () => null,
  },
} as unknown as AutoaiApi;

(globalThis as { window?: unknown }).window = { autoai: fakeApi };

const { useClaudeConnectionStore } = await import('../src/renderer/src/state/useClaudeConnectionStore');

function transportFailure(): never {
  throw new Error("No handler registered for 'claude:check-connection'");
}

describe('useClaudeConnectionStore', () => {
  beforeEach(() => {
    bridge.checkConnection = async () => ({ connected: true });
    useClaudeConnectionStore.setState({
      connected: false,
      checking: false,
      lastCheckedAt: null,
      lastReason: null,
      lastDetail: null,
    });
  });

  it('is unconnected before any check has run', () => {
    expect(useClaudeConnectionStore.getState().connected).toBe(false);
  });

  it('marks itself connected when the probe query succeeds', async () => {
    const ok = await useClaudeConnectionStore.getState().check();

    expect(ok).toBe(true);
    const state = useClaudeConnectionStore.getState();
    expect(state.connected).toBe(true);
    expect(state.checking).toBe(false);
    expect(state.lastCheckedAt).not.toBeNull();
    expect(state.lastReason).toBeNull();
  });

  it('reports NOT_LOGGED_IN with its detail when the SDK says so', async () => {
    bridge.checkConnection = async () => ({
      connected: false,
      reason: 'NOT_LOGGED_IN',
      detail: 'authentication_failed',
    });

    const ok = await useClaudeConnectionStore.getState().check();

    expect(ok).toBe(false);
    const state = useClaudeConnectionStore.getState();
    expect(state.connected).toBe(false);
    expect(state.lastReason).toBe('NOT_LOGGED_IN');
    expect(state.lastDetail).toBe('authentication_failed');
  });

  it('treats a rejected call as an SDK_ERROR rather than leaving connected stale', async () => {
    useClaudeConnectionStore.setState({ connected: true });
    bridge.checkConnection = transportFailure;

    const ok = await useClaudeConnectionStore.getState().check();

    expect(ok).toBe(false);
    const state = useClaudeConnectionStore.getState();
    expect(state.connected).toBe(false);
    expect(state.lastReason).toBe('SDK_ERROR');
  });
});
