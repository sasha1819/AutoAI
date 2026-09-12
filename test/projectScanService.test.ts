import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentRunner, AgentRunOptions, AgentRunOutcome } from '../src/main/services/AgentRunner';
import type { EnvironmentChecker } from '../src/main/services/EnvironmentCheckService';
import { ProjectScanService } from '../src/main/services/ProjectScanService';
import type { ProjectRepository } from '../src/main/services/ProjectStore';
import type { ScanRepository } from '../src/main/services/ScanStore';
import type { EnvironmentCheckItem, Project, ProjectScanResult } from '../src/shared/ipc-contract';

/** Same in-memory stand-in shape as FakeProjectRepository in
 * projectService.test.ts. */
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

class FakeScanRepository implements ScanRepository {
  private scans = new Map<string, ProjectScanResult>();

  get(projectId: string): ProjectScanResult | null {
    return this.scans.get(projectId) ?? null;
  }

  set(projectId: string, result: ProjectScanResult): void {
    this.scans.set(projectId, result);
  }

  remove(projectId: string): void {
    this.scans.delete(projectId);
  }
}

class FakeEnvironmentChecker implements EnvironmentChecker {
  public calls: Array<{ targetType: string; projectRoot: string }> = [];

  constructor(private readonly items: EnvironmentCheckItem[] = []) {}

  async check(targetType: string, projectRoot: string): Promise<EnvironmentCheckItem[]> {
    this.calls.push({ targetType, projectRoot });
    return this.items;
  }
}

class FakeAgentRunner implements AgentRunner {
  public lastPrompt = '';
  public lastOptions: AgentRunOptions | null = null;

  constructor(private readonly outcome: AgentRunOutcome) {}

  async run(prompt: string, options: AgentRunOptions): Promise<AgentRunOutcome> {
    this.lastPrompt = prompt;
    this.lastOptions = options;
    return this.outcome;
  }
}

const VALID_STRUCTURED_OUTPUT = {
  description: 'A small PHP restaurant site with a checkout flow.',
  suggestedFlows: [
    {
      name: 'Guest places an order',
      description: 'A guest browses the menu and checks out without an account.',
      steps: ['Open the storefront', 'Add an item to the cart', 'Submit the checkout form'],
      targetSelectors: ['checkout-form'],
    },
  ],
  environmentNotes: ['Checkout expects a MySQL connection.'],
};

describe('ProjectScanService.run', () => {
  let projectRoot: string;
  let projectRepository: FakeProjectRepository;
  let scanRepository: FakeScanRepository;
  let environmentChecker: FakeEnvironmentChecker;
  let project: Project;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'autoai-scan-project-'));
    projectRepository = new FakeProjectRepository();
    scanRepository = new FakeScanRepository();
    environmentChecker = new FakeEnvironmentChecker([{ name: 'Node.js', present: true, installHint: null }]);

    project = {
      id: 'proj-1',
      name: 'Project-Taaza',
      source: { type: 'local', path: projectRoot },
      localPath: projectRoot,
      createdAt: '2026-03-10T09:00:00.000Z',
      detection: null,
      overriddenTargetType: 'web',
      baseUrl: null,
      testCaseFolderPath: null,
    };
    projectRepository.add(project);
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function makeService(agentRunner: AgentRunner): ProjectScanService {
    return new ProjectScanService(scanRepository, projectRepository, agentRunner, environmentChecker);
  }

  it('returns PROJECT_NOT_FOUND for an id that does not exist, without calling the agent', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: '', structuredOutput: VALID_STRUCTURED_OUTPUT });
    const service = makeService(runner);

    const result = await service.run('no-such-project');

    expect(result).toEqual({ ok: false, error: 'PROJECT_NOT_FOUND' });
    expect(runner.lastOptions).toBeNull();
  });

  it('maps a NOT_LOGGED_IN agent outcome to NOT_CONNECTED', async () => {
    const runner = new FakeAgentRunner({ ok: false, reason: 'NOT_LOGGED_IN', detail: 'authentication_failed' });
    const service = makeService(runner);

    const result = await service.run(project.id);

    expect(result).toEqual({ ok: false, error: 'NOT_CONNECTED', detail: 'authentication_failed' });
  });

  it('maps any other agent failure to SCAN_FAILED', async () => {
    const runner = new FakeAgentRunner({ ok: false, reason: 'ERROR', detail: 'budget exceeded' });
    const service = makeService(runner);

    const result = await service.run(project.id);

    expect(result).toEqual({ ok: false, error: 'SCAN_FAILED', detail: 'budget exceeded' });
  });

  it('treats malformed structured output as SCAN_FAILED rather than persisting garbage', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: 'whatever', structuredOutput: { not: 'the right shape' } });
    const service = makeService(runner);

    const result = await service.run(project.id);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('SCAN_FAILED');
    expect(scanRepository.get(project.id)).toBeNull();
  });

  it('persists a successful scan, folding in the environment checklist', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: 'whatever', structuredOutput: VALID_STRUCTURED_OUTPUT });
    const service = makeService(runner);

    const result = await service.run(project.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.description).toBe(VALID_STRUCTURED_OUTPUT.description);
    expect(result.result.suggestedFlows).toEqual(VALID_STRUCTURED_OUTPUT.suggestedFlows);
    expect(result.result.environmentNotes).toEqual(VALID_STRUCTURED_OUTPUT.environmentNotes);
    expect(result.result.environment).toEqual([{ name: 'Node.js', present: true, installHint: null }]);

    expect(scanRepository.get(project.id)).toEqual(result.result);
  });

  it('getLast returns what run() persisted, and null before any scan has run', async () => {
    const service = makeService(new FakeAgentRunner({ ok: true, text: '', structuredOutput: VALID_STRUCTURED_OUTPUT }));

    expect(service.getLast(project.id)).toBeNull();

    await service.run(project.id);

    expect(service.getLast(project.id)?.description).toBe(VALID_STRUCTURED_OUTPUT.description);
  });

  it('removeAllForProject drops the stored scan - the ProjectDataOwner cascade', async () => {
    const service = makeService(new FakeAgentRunner({ ok: true, text: '', structuredOutput: VALID_STRUCTURED_OUTPUT }));
    await service.run(project.id);
    expect(service.getLast(project.id)).not.toBeNull();

    service.removeAllForProject(project.id);

    expect(service.getLast(project.id)).toBeNull();
  });

  it('runs the agent scoped to the project, read-only, with a budget cap', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: '', structuredOutput: VALID_STRUCTURED_OUTPUT });
    const service = makeService(runner);

    await service.run(project.id);

    expect(runner.lastOptions).toMatchObject({
      cwd: projectRoot,
      allowedTools: ['Read', 'Grep', 'Glob'],
    });
    expect(runner.lastOptions?.maxBudgetUsd).toBeGreaterThan(0);
    expect(runner.lastOptions?.outputFormat).toMatchObject({ type: 'json_schema' });
  });

  it('asks the environment checker for this project\'s effective target type and root', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: '', structuredOutput: VALID_STRUCTURED_OUTPUT });
    const service = makeService(runner);

    await service.run(project.id);

    expect(environmentChecker.calls).toEqual([{ targetType: 'web', projectRoot }]);
  });
});
