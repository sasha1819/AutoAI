import { beforeEach, describe, expect, it } from 'vitest';
import type { AutoaiApi, ProjectScanResult, ScanRunResult } from '../src/shared/ipc-contract';

/**
 * Same shape as the other renderer-store suites: `autoaiClient` captures
 * `window.autoai` once at module load, so the fake bridge has to be in
 * place before the store is imported - hence the dynamic import below.
 */
interface Bridge {
  run: () => Promise<ScanRunResult>;
  getLast: () => Promise<ProjectScanResult | null>;
}

function scanResult(overrides: Partial<ProjectScanResult> = {}): ProjectScanResult {
  return {
    description: 'A small PHP restaurant site.',
    suggestedFlows: [
      { name: 'Guest orders food', description: 'End to end checkout.', steps: ['Open site', 'Checkout'] },
    ],
    environmentNotes: ['Needs a MySQL connection.'],
    environment: [{ name: 'Node.js', present: true, installHint: null, installableBinary: null }],
    setup: null,
    generatedAt: '2026-03-10T09:00:00.000Z',
    ...overrides,
  };
}

const bridge: Bridge = {
  run: async () => ({ ok: true, result: scanResult() }),
  getLast: async () => null,
};

const fakeApi = {
  auth: {
    hasProfile: async () => true,
    login: async () => ({ ok: false as const, error: 'INVALID_CREDENTIALS' as const }),
    register: async () => ({ ok: false as const, error: 'PROFILE_ALREADY_EXISTS' as const }),
    logout: async () => undefined,
  },
  onboarding: {
    setRole: async () => {
      throw new Error('not used by these tests');
    },
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
    checkConnection: async () => {
      throw new Error('not used by these tests');
    },
  },
  scan: {
    run: () => bridge.run(),
    getLast: () => bridge.getLast(),
  },
} as unknown as AutoaiApi;

(globalThis as { window?: unknown }).window = { autoai: fakeApi };

const { useScanStore } = await import('../src/renderer/src/state/useScanStore');

function transportFailure(): never {
  throw new Error("No handler registered for 'scan:run'");
}

describe('useScanStore', () => {
  beforeEach(() => {
    bridge.run = async () => ({ ok: true, result: scanResult() });
    bridge.getLast = async () => null;
    useScanStore.setState({
      projectId: null,
      result: null,
      scanning: false,
      lastError: null,
      lastErrorDetail: null,
      transportFailed: false,
    });
  });

  describe('loadLast', () => {
    it('loads whatever was last persisted for the project', async () => {
      bridge.getLast = async () => scanResult();

      await useScanStore.getState().loadLast('proj-1');

      const state = useScanStore.getState();
      expect(state.projectId).toBe('proj-1');
      expect(state.result?.description).toBe('A small PHP restaurant site.');
      expect(state.transportFailed).toBe(false);
    });

    it('is null, not an error, for a project that has never been scanned', async () => {
      bridge.getLast = async () => null;

      await useScanStore.getState().loadLast('proj-1');

      expect(useScanStore.getState().result).toBeNull();
    });

    /* The project screen stays mounted across a navigation between two
       projects, so without the id check the second project would render
       the first one's scan until its own fetch came back. */
    it('drops the previous project\'s scan the moment a different one is asked for', async () => {
      bridge.getLast = async () => scanResult();
      await useScanStore.getState().loadLast('proj-1');

      let release = (): void => undefined;
      bridge.getLast = () =>
        new Promise<ProjectScanResult | null>((resolve) => {
          release = () => resolve(null);
        });

      const pending = useScanStore.getState().loadLast('proj-2');

      const midFlight = useScanStore.getState();
      expect(midFlight.projectId).toBe('proj-2');
      expect(midFlight.result).toBeNull();

      release();
      await pending;
    });

    it('reports a rejected call as a transport failure', async () => {
      bridge.getLast = transportFailure;

      await useScanStore.getState().loadLast('proj-1');

      expect(useScanStore.getState().transportFailed).toBe(true);
    });
  });

  describe('run', () => {
    it('replaces the result with a fresh scan on success', async () => {
      const fresh = scanResult({ description: 'Freshly scanned.' });
      bridge.run = async () => ({ ok: true, result: fresh });

      const ok = await useScanStore.getState().run('proj-1');

      expect(ok).toBe(true);
      const state = useScanStore.getState();
      expect(state.projectId).toBe('proj-1');
      expect(state.result?.description).toBe('Freshly scanned.');
      expect(state.scanning).toBe(false);
    });

    it('leaves the previous result in place and records the error when the scan is refused', async () => {
      useScanStore.setState({ projectId: 'proj-1', result: scanResult() });
      bridge.run = async () => ({ ok: false, error: 'NOT_CONNECTED', detail: 'authentication_failed' });

      const ok = await useScanStore.getState().run('proj-1');

      expect(ok).toBe(false);
      const state = useScanStore.getState();
      expect(state.lastError).toBe('NOT_CONNECTED');
      expect(state.lastErrorDetail).toBe('authentication_failed');
      expect(state.result?.description).toBe('A small PHP restaurant site.');
      expect(state.scanning).toBe(false);
    });

    it('answers false and marks a transport failure when the call never lands', async () => {
      bridge.run = transportFailure;

      const ok = await useScanStore.getState().run('proj-1');

      expect(ok).toBe(false);
      expect(useScanStore.getState().transportFailed).toBe(true);
    });
  });

  it('clears the error and transport failure together', () => {
    useScanStore.setState({ lastError: 'SCAN_FAILED', lastErrorDetail: 'boom', transportFailed: true });

    useScanStore.getState().clearError();

    const state = useScanStore.getState();
    expect(state.lastError).toBeNull();
    expect(state.lastErrorDetail).toBeNull();
    expect(state.transportFailed).toBe(false);
  });

  describe('markToolInstalled', () => {
    it('flips the matching checklist row to present without a fresh scan', () => {
      useScanStore.setState({
        projectId: 'proj-1',
        result: scanResult({
          environment: [
            { name: 'Node.js', present: true, installHint: null, installableBinary: null },
            { name: 'PHP', present: false, installHint: 'Install PHP, then check again.', installableBinary: 'php' },
          ],
        }),
      });

      useScanStore.getState().markToolInstalled('php');

      const state = useScanStore.getState();
      expect(state.result?.environment).toEqual([
        { name: 'Node.js', present: true, installHint: null, installableBinary: null },
        { name: 'PHP', present: true, installHint: null, installableBinary: null },
      ]);
    });

    it('does nothing when there is no scan result yet', () => {
      useScanStore.setState({ projectId: null, result: null });

      expect(() => useScanStore.getState().markToolInstalled('php')).not.toThrow();
      expect(useScanStore.getState().result).toBeNull();
    });

    it('leaves every row alone when the binary does not match any of them', () => {
      const withPhp = scanResult({
        environment: [{ name: 'PHP', present: false, installHint: 'Install PHP.', installableBinary: 'php' }],
      });
      useScanStore.setState({ projectId: 'proj-1', result: withPhp });

      useScanStore.getState().markToolInstalled('ruby');

      expect(useScanStore.getState().result).toEqual(withPhp);
    });
  });
});
