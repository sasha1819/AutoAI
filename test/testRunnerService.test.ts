import { beforeEach, describe, expect, it } from 'vitest';
import type { EnvironmentProbe } from '../src/main/services/EnvironmentCheckService';
import type { ProjectRepository } from '../src/main/services/ProjectStore';
import type { RunRepository } from '../src/main/services/RunStore';
import type { BrowserDriver } from '../src/main/services/TestRunnerService';
import { buildSelector, TestRunnerService } from '../src/main/services/TestRunnerService';
import type { TestPlanRepository } from '../src/main/services/TestPlanStore';
import type {
  AreaRecord,
  Project,
  RunRecord,
  RunStepResult,
  TestCaseRecord,
  TestStepAction,
} from '../src/shared/ipc-contract';

class FakeProjectRepository implements ProjectRepository {
  private projects: Project[] = [];

  list(): Project[] {
    return this.projects;
  }

  find(id: string): Project | null {
    return this.projects.find((p) => p.id === id) ?? null;
  }

  add(project: Project): void {
    this.projects.push(project);
  }

  update(id: string, patch: Partial<Project>): Project | null {
    let updated: Project | null = null;
    this.projects = this.projects.map((p) => {
      if (p.id !== id) return p;
      updated = { ...p, ...patch };
      return updated;
    });
    return updated;
  }

  remove(id: string): void {
    this.projects = this.projects.filter((p) => p.id !== id);
  }
}

/** Minimal fake - TestRunnerService only ever calls findCase. */
class FakeTestPlanRepository implements TestPlanRepository {
  public cases: TestCaseRecord[] = [];

  getAreas(): AreaRecord[] {
    return [];
  }

  getCases(projectId: string): TestCaseRecord[] {
    return this.cases.filter((c) => c.projectId === projectId);
  }

  findArea(): AreaRecord | undefined {
    return undefined;
  }

  findCase(caseId: string): TestCaseRecord | undefined {
    return this.cases.find((c) => c.id === caseId);
  }

  addArea(): void {
    // unused by these tests
  }

  addCase(testCase: TestCaseRecord): void {
    this.cases.push(testCase);
  }

  updateArea(): void {
    // unused by these tests
  }

  updateCase(): void {
    // unused by these tests
  }

  removeCase(): void {
    // unused by these tests
  }

  removeAllForProject(): void {
    // unused by these tests
  }
}

class FakeRunRepository implements RunRepository {
  public runs: RunRecord[] = [];

  add(run: RunRecord): void {
    this.runs.push(run);
  }

  listForProject(projectId: string): RunRecord[] {
    return this.runs.filter((r) => r.projectId === projectId);
  }

  listAll(): RunRecord[] {
    return this.runs;
  }

  removeAllForProject(projectId: string): void {
    this.runs = this.runs.filter((r) => r.projectId !== projectId);
  }
}

class FakeProbe implements EnvironmentProbe {
  constructor(private readonly browsersPresent: boolean) {}

  async commandAvailable(): Promise<boolean> {
    return true;
  }

  async pathExists(): Promise<boolean> {
    return this.browsersPresent;
  }
}

/** Records what it was asked to run, and returns canned per-step results
 *  (or throws, for the RUN_FAILED path) - no real browser. */
class FakeBrowserDriver implements BrowserDriver {
  public lastScript: readonly TestStepAction[] | null = null;
  public lastBaseUrl: string | null = null;

  constructor(private readonly outcome: RunStepResult[] | Error) {}

  async run(script: readonly TestStepAction[], baseUrl: string): Promise<RunStepResult[]> {
    this.lastScript = script;
    this.lastBaseUrl = baseUrl;
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

const SCRIPT: readonly TestStepAction[] = [
  { action: 'goto', value: '/checkout' },
  { action: 'click', selectorKind: 'id', selectorValue: 'submit-btn' },
];

function passedSteps(script: readonly TestStepAction[]): RunStepResult[] {
  return script.map((action) => ({ action, status: 'passed', error: null, durationMs: 5 }));
}

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Project-Taaza',
    source: { type: 'local', path: '/fake/project' },
    localPath: '/fake/project',
    createdAt: '2026-03-10T09:00:00.000Z',
    detection: null,
    overriddenTargetType: 'web',
    baseUrl: 'http://localhost:8080',
    testCaseFolderPath: null,
    ...overrides,
  };
}

function baseCase(overrides: Partial<TestCaseRecord> = {}): TestCaseRecord {
  return {
    id: 'case-1',
    projectId: 'proj-1',
    areaId: null,
    name: 'Guest checks out',
    steps: ['Go to checkout', 'Submit the order'],
    createdAt: '2026-03-10T09:00:00.000Z',
    script: [...SCRIPT],
    ...overrides,
  };
}

describe('buildSelector', () => {
  it('builds an attribute selector for any kind', () => {
    expect(buildSelector('id', 'checkout-form')).toBe('[id="checkout-form"]');
    expect(buildSelector('data-testid', 'submit-btn')).toBe('[data-testid="submit-btn"]');
    expect(buildSelector('aria-label', 'Item quantity')).toBe('[aria-label="Item quantity"]');
  });
});

describe('TestRunnerService.run', () => {
  let projects: FakeProjectRepository;
  let plan: FakeTestPlanRepository;
  let runs: FakeRunRepository;

  beforeEach(() => {
    projects = new FakeProjectRepository();
    plan = new FakeTestPlanRepository();
    runs = new FakeRunRepository();
  });

  function makeService(driver: BrowserDriver, browsersPresent = true): TestRunnerService {
    return new TestRunnerService(plan, projects, runs, driver, new FakeProbe(browsersPresent));
  }

  it('returns CASE_NOT_FOUND for an id that does not exist, without launching a browser', async () => {
    const driver = new FakeBrowserDriver([]);
    const service = makeService(driver);

    const result = await service.run('no-such-case');

    expect(result).toEqual({ ok: false, error: 'CASE_NOT_FOUND' });
    expect(driver.lastScript).toBeNull();
  });

  it('returns NO_SCRIPT for a case with a null script', async () => {
    projects.add(baseProject());
    plan.addCase(baseCase({ script: null }));
    const driver = new FakeBrowserDriver([]);
    const service = makeService(driver);

    const result = await service.run('case-1');

    expect(result).toEqual({ ok: false, error: 'NO_SCRIPT' });
    expect(driver.lastScript).toBeNull();
  });

  it('returns NO_SCRIPT for a case with an empty script array', async () => {
    projects.add(baseProject());
    plan.addCase(baseCase({ script: [] }));
    const service = makeService(new FakeBrowserDriver([]));

    expect(await service.run('case-1')).toEqual({ ok: false, error: 'NO_SCRIPT' });
  });

  it('returns NO_BASE_URL when the project has no base URL set', async () => {
    projects.add(baseProject({ baseUrl: null }));
    plan.addCase(baseCase());
    const driver = new FakeBrowserDriver([]);
    const service = makeService(driver);

    const result = await service.run('case-1');

    expect(result).toEqual({ ok: false, error: 'NO_BASE_URL' });
    expect(driver.lastScript).toBeNull();
  });

  it('returns UNSUPPORTED_TARGET for a non-web project', async () => {
    projects.add(baseProject({ overriddenTargetType: 'mobile' }));
    plan.addCase(baseCase());
    const driver = new FakeBrowserDriver([]);
    const service = makeService(driver);

    const result = await service.run('case-1');

    expect(result).toEqual({ ok: false, error: 'UNSUPPORTED_TARGET' });
    expect(driver.lastScript).toBeNull();
  });

  it('returns BROWSER_NOT_READY when the environment probe says the browsers are missing', async () => {
    projects.add(baseProject());
    plan.addCase(baseCase());
    const driver = new FakeBrowserDriver([]);
    const service = makeService(driver, false);

    const result = await service.run('case-1');

    expect(result).toEqual({ ok: false, error: 'BROWSER_NOT_READY' });
    expect(driver.lastScript).toBeNull();
  });

  it('returns RUN_FAILED, without persisting a run, when the driver itself throws', async () => {
    projects.add(baseProject());
    plan.addCase(baseCase());
    const driver = new FakeBrowserDriver(new Error('browser crashed'));
    const service = makeService(driver);

    const result = await service.run('case-1');

    expect(result).toEqual({ ok: false, error: 'RUN_FAILED', detail: 'browser crashed' });
    expect(runs.runs).toEqual([]);
  });

  it('runs the script against the project base URL and persists a passing run', async () => {
    const project = baseProject();
    projects.add(project);
    const testCase = baseCase();
    plan.addCase(testCase);
    const driver = new FakeBrowserDriver(passedSteps(SCRIPT));
    const service = makeService(driver);

    const result = await service.run('case-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.status).toBe('passed');
    expect(result.run.projectId).toBe(project.id);
    expect(result.run.caseId).toBe(testCase.id);
    expect(result.run.caseName).toBe(testCase.name);
    expect(result.run.steps).toEqual(passedSteps(SCRIPT));
    expect(driver.lastScript).toEqual(SCRIPT);
    expect(driver.lastBaseUrl).toBe(project.baseUrl);
    expect(runs.runs).toEqual([result.run]);
  });

  it('marks the run failed and stops at the first failed step, skipping the rest', async () => {
    projects.add(baseProject());
    const threeStepScript: readonly TestStepAction[] = [
      { action: 'goto', value: '/checkout' },
      { action: 'click', selectorKind: 'id', selectorValue: 'submit-btn' },
      { action: 'assertText', selectorKind: 'id', selectorValue: 'confirmation', value: 'Thank you' },
    ];
    plan.addCase(baseCase({ script: threeStepScript }));

    const stepResults: RunStepResult[] = [
      { action: threeStepScript[0]!, status: 'passed', error: null, durationMs: 5 },
      { action: threeStepScript[1]!, status: 'failed', error: 'element not found', durationMs: 5 },
      { action: threeStepScript[2]!, status: 'skipped', error: null, durationMs: 0 },
    ];
    const driver = new FakeBrowserDriver(stepResults);
    const service = makeService(driver);

    const result = await service.run('case-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.status).toBe('failed');
    expect(result.run.steps.map((s) => s.status)).toEqual(['passed', 'failed', 'skipped']);
  });

  describe('removeAllForProject - the ProjectDataOwner cascade', () => {
    it('drops only the given project’s runs', async () => {
      projects.add(baseProject());
      projects.add(baseProject({ id: 'proj-2' }));
      plan.addCase(baseCase());
      plan.addCase(baseCase({ id: 'case-2', projectId: 'proj-2' }));

      const service = makeService(new FakeBrowserDriver(passedSteps(SCRIPT)));
      await service.run('case-1');
      await service.run('case-2');
      expect(runs.runs).toHaveLength(2);

      service.removeAllForProject('proj-1');

      expect(runs.runs).toHaveLength(1);
      expect(runs.runs[0]?.projectId).toBe('proj-2');
    });
  });

  describe('listForProject / listAll', () => {
    it('lists runs scoped to a project, and all runs across every project', async () => {
      projects.add(baseProject());
      projects.add(baseProject({ id: 'proj-2' }));
      plan.addCase(baseCase());
      plan.addCase(baseCase({ id: 'case-2', projectId: 'proj-2' }));
      const service = makeService(new FakeBrowserDriver(passedSteps(SCRIPT)));

      await service.run('case-1');
      await service.run('case-2');

      expect(service.listForProject('proj-1')).toHaveLength(1);
      expect(service.listAll()).toHaveLength(2);
    });
  });
});
