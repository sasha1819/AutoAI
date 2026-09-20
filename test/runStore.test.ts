import { beforeEach, describe, expect, it } from 'vitest';
import type { AutoaiApi, RunRecord, RunResult } from '../src/shared/ipc-contract';

/**
 * Same shape as the other renderer-store suites: `autoaiClient` captures
 * `window.autoai` once at module load, so the fake bridge has to be in
 * place before the store is imported - hence the dynamic import below.
 */
interface Bridge {
  run: (caseId: string) => Promise<RunResult>;
  listForProject: (projectId: string) => Promise<RunRecord[]>;
  listAll: () => Promise<RunRecord[]>;
}

function runRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 'run-1',
    projectId: 'proj-1',
    caseId: 'case-1',
    caseName: 'Guest checks out',
    status: 'passed',
    steps: [{ action: { action: 'goto', value: '/checkout' }, status: 'passed', error: null, durationMs: 5 }],
    startedAt: '2026-03-10T09:00:00.000Z',
    finishedAt: '2026-03-10T09:00:05.000Z',
    ...overrides,
  };
}

const bridge: Bridge = {
  run: async () => ({ ok: true, run: runRecord() }),
  listForProject: async () => [],
  listAll: async () => [],
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
    run: async () => {
      throw new Error('not used by these tests');
    },
  },
  runs: {
    run: (caseId: string) => bridge.run(caseId),
    listForProject: (projectId: string) => bridge.listForProject(projectId),
    listAll: () => bridge.listAll(),
  },
} as unknown as AutoaiApi;

(globalThis as { window?: unknown }).window = { autoai: fakeApi };

const { useRunStore } = await import('../src/renderer/src/state/useRunStore');

function transportFailure(): never {
  throw new Error("No handler registered for 'runs:run'");
}

describe('useRunStore', () => {
  beforeEach(() => {
    bridge.run = async () => ({ ok: true, run: runRecord() });
    bridge.listForProject = async () => [];
    bridge.listAll = async () => [];
    useRunStore.setState({
      runsByCase: {},
      allRuns: [],
      running: false,
      lastError: null,
      lastErrorDetail: null,
    });
  });

  describe('run', () => {
    it('records the run against its case on success', async () => {
      const run = runRecord({ caseId: 'case-9' });
      bridge.run = async () => ({ ok: true, run });

      const result = await useRunStore.getState().run('case-9');

      expect(result).toEqual(run);
      const state = useRunStore.getState();
      expect(state.runsByCase['case-9']).toEqual(run);
      expect(state.running).toBe(false);
    });

    it('replaces whatever run was previously known for that case', async () => {
      const first = runRecord({ caseId: 'case-1', status: 'failed' });
      useRunStore.setState({ runsByCase: { 'case-1': first } });
      const second = runRecord({ caseId: 'case-1', status: 'passed' });
      bridge.run = async () => ({ ok: true, run: second });

      await useRunStore.getState().run('case-1');

      expect(useRunStore.getState().runsByCase['case-1']?.status).toBe('passed');
    });

    it('records a domain error without touching runsByCase', async () => {
      bridge.run = async () => ({ ok: false, error: 'NO_BASE_URL' });

      const result = await useRunStore.getState().run('case-1');

      expect(result).toBeNull();
      const state = useRunStore.getState();
      expect(state.lastError).toBe('NO_BASE_URL');
      expect(state.runsByCase).toEqual({});
    });

    it('answers null and reports a run failure when the call never lands', async () => {
      bridge.run = transportFailure;

      const result = await useRunStore.getState().run('case-1');

      expect(result).toBeNull();
      expect(useRunStore.getState().lastError).toBe('RUN_FAILED');
    });
  });

  describe('loadForProject', () => {
    it('folds every case’s most recent run into runsByCase', async () => {
      const older = runRecord({ id: 'run-a', caseId: 'case-1', finishedAt: '2026-03-10T09:00:00.000Z' });
      const newer = runRecord({ id: 'run-b', caseId: 'case-1', finishedAt: '2026-03-10T10:00:00.000Z' });
      const otherCase = runRecord({ id: 'run-c', caseId: 'case-2' });
      bridge.listForProject = async () => [older, newer, otherCase];

      await useRunStore.getState().loadForProject('proj-1');

      const state = useRunStore.getState();
      expect(state.runsByCase['case-1']?.id).toBe('run-b');
      expect(state.runsByCase['case-2']?.id).toBe('run-c');
    });

    it('leaves the previous state in place when the call fails', async () => {
      useRunStore.setState({ runsByCase: { 'case-1': runRecord() } });
      bridge.listForProject = transportFailure;

      await useRunStore.getState().loadForProject('proj-1');

      expect(useRunStore.getState().runsByCase['case-1']).toBeDefined();
    });
  });

  describe('loadAll', () => {
    it('sorts every run newest first', async () => {
      const earlier = runRecord({ id: 'run-a', finishedAt: '2026-03-10T09:00:00.000Z' });
      const later = runRecord({ id: 'run-b', finishedAt: '2026-03-10T11:00:00.000Z' });
      bridge.listAll = async () => [earlier, later];

      await useRunStore.getState().loadAll();

      expect(useRunStore.getState().allRuns.map((r) => r.id)).toEqual(['run-b', 'run-a']);
    });
  });

  it('clears the error', () => {
    useRunStore.setState({ lastError: 'RUN_FAILED', lastErrorDetail: 'boom' });

    useRunStore.getState().clearError();

    const state = useRunStore.getState();
    expect(state.lastError).toBeNull();
    expect(state.lastErrorDetail).toBeNull();
  });
});
