import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentRunner, AgentRunOptions, AgentRunOutcome } from '../src/main/services/AgentRunner';
import { CaseGenerationService } from '../src/main/services/CaseGenerationService';
import type { ProjectRepository } from '../src/main/services/ProjectStore';
import type { Project } from '../src/shared/ipc-contract';

/** Same in-memory stand-in shape as FakeProjectRepository elsewhere. */
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

const VALID_FLOW = {
  name: 'Guest places an order',
  description: 'A guest browses the menu and checks out without an account.',
  steps: ['Open the storefront', 'Add an item to the cart', 'Submit the checkout form'],
  targetSelectors: ['checkout-form'],
  script: [
    { action: 'goto', value: '/menu' },
    { action: 'click', selectorKind: 'id', selectorValue: 'checkout-form' },
  ],
};

describe('CaseGenerationService.generate', () => {
  let projectRoot: string;
  let projectRepository: FakeProjectRepository;
  let project: Project;

  beforeEach(() => {
    projectRoot = '/fake/project/root';
    projectRepository = new FakeProjectRepository();
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

  function makeService(agentRunner: AgentRunner): CaseGenerationService {
    return new CaseGenerationService(projectRepository, agentRunner);
  }

  it('returns PROJECT_NOT_FOUND for an id that does not exist, without calling the agent', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: '', structuredOutput: VALID_FLOW });
    const service = makeService(runner);

    const result = await service.generate('no-such-project', 'a guest can check out');

    expect(result).toEqual({ ok: false, error: 'PROJECT_NOT_FOUND' });
    expect(runner.lastOptions).toBeNull();
  });

  it('rejects an empty prompt without calling the agent', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: '', structuredOutput: VALID_FLOW });
    const service = makeService(runner);

    const result = await service.generate(project.id, '   ');

    expect(result).toEqual({ ok: false, error: 'PROMPT_REQUIRED' });
    expect(runner.lastOptions).toBeNull();
  });

  it('maps a NOT_LOGGED_IN agent outcome to NOT_CONNECTED', async () => {
    const runner = new FakeAgentRunner({ ok: false, reason: 'NOT_LOGGED_IN', detail: 'authentication_failed' });
    const service = makeService(runner);

    const result = await service.generate(project.id, 'a guest can check out');

    expect(result).toEqual({ ok: false, error: 'NOT_CONNECTED', detail: 'authentication_failed' });
  });

  it('maps any other agent failure to GENERATION_FAILED', async () => {
    const runner = new FakeAgentRunner({ ok: false, reason: 'ERROR', detail: 'budget exceeded' });
    const service = makeService(runner);

    const result = await service.generate(project.id, 'a guest can check out');

    expect(result).toEqual({ ok: false, error: 'GENERATION_FAILED', detail: 'budget exceeded' });
  });

  it('treats malformed structured output as GENERATION_FAILED rather than returning garbage', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: 'whatever', structuredOutput: { not: 'the right shape' } });
    const service = makeService(runner);

    const result = await service.generate(project.id, 'a guest can check out');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('GENERATION_FAILED');
  });

  it('returns the parsed flow, script included, on success', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: 'whatever', structuredOutput: VALID_FLOW });
    const service = makeService(runner);

    const result = await service.generate(project.id, 'a guest can check out');

    expect(result).toEqual({ ok: true, flow: VALID_FLOW });
  });

  it('runs the agent scoped to the project, read-only, with the prompt folded in', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: '', structuredOutput: VALID_FLOW });
    const service = makeService(runner);

    await service.generate(project.id, 'a guest can check out with a promo code');

    expect(runner.lastOptions).toMatchObject({
      cwd: projectRoot,
      allowedTools: ['Read', 'Grep', 'Glob'],
    });
    expect(runner.lastOptions?.maxBudgetUsd).toBeGreaterThan(0);
    expect(runner.lastOptions?.outputFormat).toMatchObject({ type: 'json_schema' });
    expect(runner.lastPrompt).toContain('a guest can check out with a promo code');
  });

  it('uses a smaller turn/budget cap than a full project scan', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: '', structuredOutput: VALID_FLOW });
    const service = makeService(runner);

    await service.generate(project.id, 'a guest can check out');

    // ProjectScanService uses maxTurns: 40, maxBudgetUsd: 2 - this is a
    // single targeted flow, not an open-ended project read.
    expect(runner.lastOptions?.maxTurns).toBeLessThan(40);
    expect(runner.lastOptions?.maxBudgetUsd).toBeLessThan(2);
  });
});
