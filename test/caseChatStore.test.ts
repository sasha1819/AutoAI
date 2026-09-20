import { beforeEach, describe, expect, it } from 'vitest';
import type { AutoaiApi, CaseGenerationResult, SuggestedFlow } from '../src/shared/ipc-contract';

interface Bridge {
  run: (projectId: string, prompt: string) => Promise<CaseGenerationResult>;
}

function flow(overrides: Partial<SuggestedFlow> = {}): SuggestedFlow {
  return {
    name: 'Guest checks out',
    description: 'A guest adds an item and checks out.',
    steps: ['Open the storefront', 'Add an item', 'Check out'],
    ...overrides,
  };
}

const bridge: Bridge = {
  run: async () => ({ ok: true, flow: flow() }),
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
    setBaseUrl: async () => null,
    setTestCaseFolder: async () => null,
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
    checkConnection: async () => {
      throw new Error('not used by these tests');
    },
  },
  scan: {
    run: async () => {
      throw new Error('not used by these tests');
    },
    getLast: async () => null,
  },
  caseGeneration: {
    run: (projectId: string, prompt: string) => bridge.run(projectId, prompt),
  },
  runs: {
    run: async () => {
      throw new Error('not used by these tests');
    },
    listForProject: async () => [],
    listAll: async () => [],
  },
} as unknown as AutoaiApi;

(globalThis as { window?: unknown }).window = { autoai: fakeApi };

const { useCaseChatStore } = await import('../src/renderer/src/state/useCaseChatStore');

function transportFailure(): never {
  throw new Error("No handler registered for 'case-generation:run'");
}

describe('useCaseChatStore', () => {
  beforeEach(() => {
    bridge.run = async () => ({ ok: true, flow: flow() });
    useCaseChatStore.setState({
      pendingFlow: null,
      generating: false,
      lastError: null,
      lastErrorDetail: null,
    });
  });

  describe('generate', () => {
    it('holds the returned flow as a preview on success', async () => {
      const generated = flow({ name: 'Promo code applies' });
      bridge.run = async () => ({ ok: true, flow: generated });

      const ok = await useCaseChatStore.getState().generate('proj-1', 'apply a promo code');

      expect(ok).toBe(true);
      const state = useCaseChatStore.getState();
      expect(state.pendingFlow?.name).toBe('Promo code applies');
      expect(state.generating).toBe(false);
    });

    it('leaves any previous preview in place and records the error when generation is refused', async () => {
      useCaseChatStore.setState({ pendingFlow: flow({ name: 'Previous preview' }) });
      bridge.run = async () => ({ ok: false, error: 'NOT_CONNECTED', detail: 'authentication_failed' });

      const ok = await useCaseChatStore.getState().generate('proj-1', 'apply a promo code');

      expect(ok).toBe(false);
      const state = useCaseChatStore.getState();
      expect(state.lastError).toBe('NOT_CONNECTED');
      expect(state.lastErrorDetail).toBe('authentication_failed');
      expect(state.pendingFlow?.name).toBe('Previous preview');
      expect(state.generating).toBe(false);
    });

    it('answers false and marks a generation failure when the call never lands', async () => {
      bridge.run = transportFailure;

      const ok = await useCaseChatStore.getState().generate('proj-1', 'apply a promo code');

      expect(ok).toBe(false);
      expect(useCaseChatStore.getState().lastError).toBe('GENERATION_FAILED');
    });
  });

  it('clearPending drops the preview', () => {
    useCaseChatStore.setState({ pendingFlow: flow() });

    useCaseChatStore.getState().clearPending();

    expect(useCaseChatStore.getState().pendingFlow).toBeNull();
  });

  it('clearError clears the error and its detail', () => {
    useCaseChatStore.setState({ lastError: 'GENERATION_FAILED', lastErrorDetail: 'boom' });

    useCaseChatStore.getState().clearError();

    const state = useCaseChatStore.getState();
    expect(state.lastError).toBeNull();
    expect(state.lastErrorDetail).toBeNull();
  });
});
