import { beforeEach, describe, expect, it } from 'vitest';
import type { AddProjectResult, AutoaiApi, Project, TargetType } from '../src/shared/ipc-contract';

/**
 * Same shape as the session-store suite: `autoaiClient` captures
 * `window.autoai` once at module load, so the fake bridge has to be in
 * place before the store is imported - hence the dynamic import below.
 */
interface Bridge {
  list: () => Promise<Project[]>;
  addFromLocalPath: () => Promise<AddProjectResult>;
  setOverride: () => Promise<Project | null>;
  setBaseUrl: () => Promise<Project | null>;
  setTestCaseFolder: () => Promise<Project | null>;
  pickLocalFolder: () => Promise<string | null>;
  remove: () => Promise<void>;
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'checkout-web',
    source: { type: 'local', path: '/Users/maya/dev/checkout-web' },
    localPath: '/Users/maya/dev/checkout-web',
    detection: null,
    overriddenTargetType: null,
    baseUrl: null,
    testCaseFolderPath: null,
    createdAt: '2026-03-10T09:00:00.000Z',
    ...overrides,
  };
}

const bridge: Bridge = {
  list: async () => [],
  addFromLocalPath: async () => ({ ok: true, project: project() }),
  setOverride: async () => project({ overriddenTargetType: 'web' as TargetType }),
  setBaseUrl: async () => project({ baseUrl: 'http://localhost:8080' }),
  setTestCaseFolder: async () => project({ testCaseFolderPath: '/Users/maya/cases' }),
  pickLocalFolder: async () => null,
  remove: async () => undefined,
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
    addFromGit: async () => ({ ok: false as const, error: 'INVALID_GIT_URL' as const }),
    addFromLocalPath: () => bridge.addFromLocalPath(),
    pickLocalFolder: () => bridge.pickLocalFolder(),
    list: () => bridge.list(),
    remove: () => bridge.remove(),
    setOverride: () => bridge.setOverride(),
    setBaseUrl: () => bridge.setBaseUrl(),
    setTestCaseFolder: () => bridge.setTestCaseFolder(),
    runDetection: async () => null,
  },
} as unknown as AutoaiApi;

(globalThis as { window?: unknown }).window = { autoai: fakeApi };

const { useProjectsStore } = await import('../src/renderer/src/state/useProjectsStore');

/** Every call the store makes goes through ipcRenderer.invoke, which
 * rejects rather than returning a failure when the handler throws or the
 * channel was never registered. */
function transportFailure(): never {
  throw new Error("No handler registered for 'projects:list'");
}

describe('useProjectsStore', () => {
  beforeEach(() => {
    bridge.list = async () => [];
    bridge.addFromLocalPath = async () => ({ ok: true, project: project() });
    bridge.setOverride = async () => project({ overriddenTargetType: 'web' as TargetType });
    bridge.setBaseUrl = async () => project({ baseUrl: 'http://localhost:8080' });
    bridge.setTestCaseFolder = async () => project({ testCaseFolderPath: '/Users/maya/cases' });
    bridge.pickLocalFolder = async () => null;
    bridge.remove = async () => undefined;
    useProjectsStore.setState({
      projects: [],
      loaded: false,
      loading: false,
      lastError: null,
      lastErrorDetail: null,
      transportFailed: false,
    });
  });

  it('marks itself loaded even when there are no projects', async () => {
    await useProjectsStore.getState().load();

    const state = useProjectsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.projects).toEqual([]);
    expect(state.transportFailed).toBe(false);
  });

  it('reports a rejected call as a transport failure, not as an empty list', async () => {
    bridge.list = transportFailure;

    await useProjectsStore.getState().load();

    const state = useProjectsStore.getState();
    expect(state.transportFailed).toBe(true);
    // Still loaded: the screen has to stop waiting and show the notice.
    expect(state.loaded).toBe(true);
  });

  it('returns the created project so the caller can open it', async () => {
    const created = await useProjectsStore.getState().addFromLocalPath({
      path: '/Users/maya/dev/checkout-web',
    });

    expect(created?.id).toBe('proj-1');
    expect(useProjectsStore.getState().projects).toHaveLength(1);
  });

  it('returns null and keeps the list untouched when adding is refused', async () => {
    bridge.addFromLocalPath = async () => ({ ok: false, error: 'PATH_NOT_FOUND' });

    const created = await useProjectsStore.getState().addFromLocalPath({ path: '/Users/maya/dev/gone' });

    expect(created).toBeNull();
    expect(useProjectsStore.getState().projects).toEqual([]);
    expect(useProjectsStore.getState().lastError).toBe('PATH_NOT_FOUND');
    expect(useProjectsStore.getState().loading).toBe(false);
  });

  it('takes the override from what main stored, not from what was asked for', async () => {
    useProjectsStore.setState({ projects: [project()], loaded: true });
    // Main is the authority here: this is the field standing in for
    // detection, so the row must show what will actually be used.
    bridge.setOverride = async () => project({ overriddenTargetType: 'desktop' as TargetType });

    await useProjectsStore.getState().setOverride('proj-1', 'web' as TargetType);

    expect(useProjectsStore.getState().projects[0]?.overriddenTargetType).toBe('desktop');
  });

  it('reports false, and touches nothing, when the override call never lands', async () => {
    useProjectsStore.setState({ projects: [project()], loaded: true });
    bridge.setOverride = transportFailure;

    const ok = await useProjectsStore.getState().setOverride('proj-1', 'web' as TargetType);

    expect(ok).toBe(false);
    expect(useProjectsStore.getState().transportFailed).toBe(true);
    expect(useProjectsStore.getState().projects[0]?.overriddenTargetType).toBeNull();
  });

  it('takes the base URL from what main stored', async () => {
    useProjectsStore.setState({ projects: [project()], loaded: true });

    const ok = await useProjectsStore.getState().setBaseUrl('proj-1', 'http://localhost:8080');

    expect(ok).toBe(true);
    expect(useProjectsStore.getState().projects[0]?.baseUrl).toBe('http://localhost:8080');
  });

  it('takes the test case folder from what main stored', async () => {
    useProjectsStore.setState({ projects: [project()], loaded: true });

    const ok = await useProjectsStore.getState().setTestCaseFolder('proj-1', '/Users/maya/cases');

    expect(ok).toBe(true);
    expect(useProjectsStore.getState().projects[0]?.testCaseFolderPath).toBe('/Users/maya/cases');
  });

  describe('remove', () => {
    it('drops the removed project from the list', async () => {
      useProjectsStore.setState({ projects: [project(), project({ id: 'proj-2' })] });

      const removed = await useProjectsStore.getState().remove('proj-1');

      expect(removed).toBe(true);
      expect(useProjectsStore.getState().projects.map((p) => p.id)).toEqual(['proj-2']);
    });

    /* The caller navigates away on a true, so a failed call must come
       back false - otherwise the screen leaves for a list that still has
       the project it just claimed to remove. */
    it('answers false and keeps the project when the call never lands', async () => {
      useProjectsStore.setState({ projects: [project()] });
      bridge.remove = transportFailure;

      const removed = await useProjectsStore.getState().remove('proj-1');

      const state = useProjectsStore.getState();
      expect(removed).toBe(false);
      expect(state.projects).toHaveLength(1);
      expect(state.transportFailed).toBe(true);
      expect(state.loading).toBe(false);
    });
  });
});
