import { beforeEach, describe, expect, it } from 'vitest';
import type {
  AreaRecord,
  AreaResult,
  AutoaiApi,
  DeleteTestCaseResult,
  ImportTestCasesResult,
  TestCaseRecord,
  TestCaseResult,
  TestPlan,
} from '../src/shared/ipc-contract';

/**
 * Same shape as the projects-store suite: `autoaiClient` captures
 * `window.autoai` once at module load, so the fake bridge has to be in
 * place before the store is imported - hence the dynamic import below.
 */
interface Bridge {
  list: () => Promise<TestPlan>;
  createArea: () => Promise<AreaResult>;
  renameArea: () => Promise<AreaResult>;
  createCase: () => Promise<TestCaseResult>;
  moveCase: () => Promise<TestCaseResult>;
  deleteCase: () => Promise<DeleteTestCaseResult>;
  importCases: () => Promise<ImportTestCasesResult>;
}

function area(overrides: Partial<AreaRecord> = {}): AreaRecord {
  return {
    id: 'area-1',
    projectId: 'proj-1',
    name: 'Checkout',
    createdAt: '2026-03-10T09:00:00.000Z',
    ...overrides,
  };
}

function testCase(overrides: Partial<TestCaseRecord> = {}): TestCaseRecord {
  return {
    id: 'case-1',
    projectId: 'proj-1',
    areaId: null,
    name: 'Guest can buy one item',
    steps: ['Open the storefront'],
    createdAt: '2026-03-10T09:00:00.000Z',
    script: null,
    ...overrides,
  };
}

const bridge: Bridge = {
  list: async () => ({ areas: [], cases: [] }),
  createArea: async () => ({ ok: true, area: area() }),
  renameArea: async () => ({ ok: true, area: area({ name: 'Checkout renamed' }) }),
  createCase: async () => ({ ok: true, testCase: testCase() }),
  moveCase: async () => ({ ok: true, testCase: testCase({ areaId: 'area-1' }) }),
  deleteCase: async () => ({ ok: true, caseId: 'case-1' }),
  importCases: async () => ({ ok: true, cases: [testCase()] }),
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
  project: {
    pickFolder: async () => null,
    create: async () => {
      throw new Error('not used by these tests');
    },
    list: async () => [],
    setTargetType: async () => {
      throw new Error('not used by these tests');
    },
  },
  testPlan: {
    list: () => bridge.list(),
    createArea: () => bridge.createArea(),
    renameArea: () => bridge.renameArea(),
    createCase: () => bridge.createCase(),
    moveCase: () => bridge.moveCase(),
    deleteCase: () => bridge.deleteCase(),
    importCases: () => bridge.importCases(),
  },
} as unknown as AutoaiApi;

(globalThis as { window?: unknown }).window = { autoai: fakeApi };

const { useTestPlanStore } = await import('../src/renderer/src/state/useTestPlanStore');

function transportFailure(): never {
  throw new Error("No handler registered for 'testplan:list'");
}

describe('useTestPlanStore', () => {
  beforeEach(() => {
    bridge.list = async () => ({ areas: [], cases: [] });
    bridge.createArea = async () => ({ ok: true, area: area() });
    bridge.renameArea = async () => ({ ok: true, area: area({ name: 'Checkout renamed' }) });
    bridge.createCase = async () => ({ ok: true, testCase: testCase() });
    bridge.moveCase = async () => ({ ok: true, testCase: testCase({ areaId: 'area-1' }) });
    bridge.deleteCase = async () => ({ ok: true, caseId: 'case-1' });
    bridge.importCases = async () => ({ ok: true, cases: [testCase()] });
    useTestPlanStore.setState({
      projectId: null,
      areas: [],
      cases: [],
      loaded: false,
      saving: false,
      lastError: null,
      transportFailed: false,
    });
  });

  it('marks itself loaded even when the project has no plan yet', async () => {
    await useTestPlanStore.getState().load('proj-1');

    const state = useTestPlanStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.projectId).toBe('proj-1');
    expect(state.transportFailed).toBe(false);
  });

  /* The screen stays mounted when the route changes from one project to
     another, so without the id check the second project would render the
     first one's cases until its own fetch came back. */
  it('drops the previous project’s plan the moment a different one is asked for', async () => {
    bridge.list = async () => ({ areas: [area()], cases: [testCase()] });
    await useTestPlanStore.getState().load('proj-1');

    let release = (): void => undefined;
    bridge.list = () =>
      new Promise<TestPlan>((resolve) => {
        release = () => resolve({ areas: [], cases: [] });
      });

    const pending = useTestPlanStore.getState().load('proj-2');

    const midFlight = useTestPlanStore.getState();
    expect(midFlight.projectId).toBe('proj-2');
    expect(midFlight.cases).toEqual([]);
    expect(midFlight.loaded).toBe(false);

    release();
    await pending;
  });

  it('reports a rejected call as a transport failure, not as an empty plan', async () => {
    bridge.list = transportFailure;

    await useTestPlanStore.getState().load('proj-1');

    const state = useTestPlanStore.getState();
    expect(state.transportFailed).toBe(true);
    expect(state.loaded).toBe(true);
  });

  it('returns the created case so the screen can open it', async () => {
    const created = await useTestPlanStore.getState().createCase({
      projectId: 'proj-1',
      areaId: null,
      name: 'Guest can buy one item',
      steps: ['Open the storefront'],
    });

    expect(created?.id).toBe('case-1');
    expect(useTestPlanStore.getState().cases).toHaveLength(1);
  });

  it('keeps the list untouched when a write is refused', async () => {
    bridge.createCase = async () => ({ ok: false, error: 'STEPS_REQUIRED' });

    const created = await useTestPlanStore.getState().createCase({
      projectId: 'proj-1',
      areaId: null,
      name: 'Guest can buy one item',
      steps: [],
    });

    const state = useTestPlanStore.getState();
    expect(created).toBeNull();
    expect(state.cases).toEqual([]);
    expect(state.lastError).toBe('STEPS_REQUIRED');
    expect(state.saving).toBe(false);
  });

  /* The move is written to disk first and the row is replaced with what
     main actually stored - the point of the control is that it tells the
     truth about where the case now lives. */
  it('takes the moved case from the result rather than assuming the move landed', async () => {
    useTestPlanStore.setState({ cases: [testCase()] });
    bridge.moveCase = async () => ({ ok: true, testCase: testCase({ areaId: 'area-9' }) });

    await useTestPlanStore.getState().moveCase('case-1', 'area-1');

    expect(useTestPlanStore.getState().cases[0]?.areaId).toBe('area-9');
  });

  it('leaves a case in place when the move is refused', async () => {
    useTestPlanStore.setState({ cases: [testCase()] });
    bridge.moveCase = async () => ({ ok: false, error: 'AREA_NOT_FOUND' });

    const moved = await useTestPlanStore.getState().moveCase('case-1', 'area-1');

    expect(moved).toBe(false);
    expect(useTestPlanStore.getState().cases[0]?.areaId).toBeNull();
  });

  it('removes only the case the delete reported', async () => {
    useTestPlanStore.setState({ cases: [testCase(), testCase({ id: 'case-2' })] });

    await useTestPlanStore.getState().deleteCase('case-1');

    expect(useTestPlanStore.getState().cases.map((c) => c.id)).toEqual(['case-2']);
  });

  it('adds a new area without refetching the plan', async () => {
    const created = await useTestPlanStore.getState().createArea('proj-1', 'Checkout');

    expect(created?.name).toBe('Checkout');
    expect(useTestPlanStore.getState().areas).toHaveLength(1);
  });

  it('replaces a renamed area in place', async () => {
    useTestPlanStore.setState({ areas: [area()] });

    await useTestPlanStore.getState().renameArea('area-1', 'Checkout renamed');

    expect(useTestPlanStore.getState().areas[0]?.name).toBe('Checkout renamed');
  });

  it('clears a transport failure along with the error code', () => {
    useTestPlanStore.setState({ lastError: 'AREA_ALREADY_EXISTS', transportFailed: true });

    useTestPlanStore.getState().clearError();

    const state = useTestPlanStore.getState();
    expect(state.lastError).toBeNull();
    expect(state.transportFailed).toBe(false);
  });

  describe('importCases', () => {
    it('appends the whole batch to the cases already there', async () => {
      useTestPlanStore.setState({ cases: [testCase({ id: 'existing' })] });
      bridge.importCases = async () => ({
        ok: true,
        cases: [testCase({ id: 'new-1' }), testCase({ id: 'new-2' })],
      });

      const imported = await useTestPlanStore.getState().importCases({
        projectId: 'proj-1',
        areaId: null,
        cases: [
          { name: 'One', steps: ['Open'] },
          { name: 'Two', steps: ['Open'] },
        ],
      });

      expect(imported).toHaveLength(2);
      expect(useTestPlanStore.getState().cases.map((c) => c.id)).toEqual([
        'existing',
        'new-1',
        'new-2',
      ]);
    });

    /* The screen navigates back to the project on a non-null answer, so a
       refusal has to come back null - otherwise it leaves for a list that
       does not contain what it just said it imported. */
    it('answers null and adds nothing when the import is refused', async () => {
      bridge.importCases = async () => ({ ok: false, error: 'STEPS_REQUIRED' });

      const imported = await useTestPlanStore.getState().importCases({
        projectId: 'proj-1',
        areaId: null,
        cases: [{ name: 'One', steps: [] }],
      });

      const state = useTestPlanStore.getState();
      expect(imported).toBeNull();
      expect(state.cases).toEqual([]);
      expect(state.lastError).toBe('STEPS_REQUIRED');
      expect(state.saving).toBe(false);
    });

    it('answers null and adds nothing when the call never lands', async () => {
      bridge.importCases = transportFailure;

      const imported = await useTestPlanStore.getState().importCases({
        projectId: 'proj-1',
        areaId: null,
        cases: [{ name: 'One', steps: ['Open'] }],
      });

      const state = useTestPlanStore.getState();
      expect(imported).toBeNull();
      expect(state.cases).toEqual([]);
      expect(state.transportFailed).toBe(true);
    });
  });
});
