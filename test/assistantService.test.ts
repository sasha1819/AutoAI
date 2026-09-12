import { describe, expect, it } from 'vitest';
import type { AgentRunner, AgentRunOptions, AgentRunOutcome } from '../src/main/services/AgentRunner';
import type { AssistantToolDeps, CaseGenerator, ScanRunner } from '../src/main/services/AssistantService';
import { AssistantService, buildAssistantTools } from '../src/main/services/AssistantService';
import type { ProjectRepository } from '../src/main/services/ProjectStore';
import type { RunRepository } from '../src/main/services/RunStore';
import type { CaseGenerationResult, Project, RunRecord, ScanRunResult } from '../src/shared/ipc-contract';

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

class FakeScanRunner implements ScanRunner {
  public lastProjectId: string | null = null;
  constructor(private readonly result: ScanRunResult) {}

  async run(projectId: string): Promise<ScanRunResult> {
    this.lastProjectId = projectId;
    return this.result;
  }
}

class FakeCaseGenerator implements CaseGenerator {
  public lastArgs: { projectId: string; prompt: string } | null = null;
  constructor(private readonly result: CaseGenerationResult) {}

  async generate(projectId: string, prompt: string): Promise<CaseGenerationResult> {
    this.lastArgs = { projectId, prompt };
    return this.result;
  }
}

class FakeAgentRunner implements AgentRunner {
  public lastOptions: AgentRunOptions | null = null;

  constructor(private readonly outcome: AgentRunOutcome) {}

  async run(_prompt: string, options: AgentRunOptions): Promise<AgentRunOutcome> {
    this.lastOptions = options;
    return this.outcome;
  }
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

function baseRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 'run-1',
    projectId: 'proj-1',
    caseId: 'case-1',
    caseName: 'Guest checks out',
    status: 'passed',
    steps: [],
    startedAt: '2026-03-10T09:00:00.000Z',
    finishedAt: '2026-03-10T09:01:00.000Z',
    ...overrides,
  };
}

async function toolDeps(overrides: Partial<AssistantToolDeps> = {}): Promise<AssistantToolDeps> {
  return {
    projectRepository: new FakeProjectRepository(),
    runRepository: new FakeRunRepository(),
    scanRunner: new FakeScanRunner({ ok: true, result: { description: 'x', suggestedFlows: [], environmentNotes: [], environment: [], setup: null, generatedAt: '2026-01-01T00:00:00.000Z' } }),
    caseGenerator: new FakeCaseGenerator({ ok: true, flow: { name: 'Checkout', description: 'desc', steps: ['a'] } }),
    ...overrides,
  };
}

describe('buildAssistantTools', () => {
  it('exposes exactly the five documented tools', async () => {
    const { tools } = await buildAssistantTools(await toolDeps());
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['generate_test_case', 'list_projects', 'list_runs', 'open_project_setup', 'run_scan'].sort(),
    );
  });

  it('list_projects maps to projectRepository.list()', async () => {
    const projectRepository = new FakeProjectRepository();
    projectRepository.add(baseProject());
    const { tools } = await buildAssistantTools(await toolDeps({ projectRepository }));

    const result = await tools.find((t) => t.name === 'list_projects')!.handler({}, {});

    const text = (result.content[0] as { text: string }).text;
    expect(JSON.parse(text)).toEqual([{ id: 'proj-1', name: 'Project-Taaza', targetType: 'web', baseUrl: 'http://localhost:8080' }]);
  });

  it('list_runs maps to runRepository.listForProject when given a projectId, listAll otherwise', async () => {
    const runRepository = new FakeRunRepository();
    runRepository.add(baseRun());
    runRepository.add(baseRun({ id: 'run-2', projectId: 'proj-2' }));
    const { tools } = await buildAssistantTools(await toolDeps({ runRepository }));
    const listRuns = tools.find((t) => t.name === 'list_runs')!;

    const scoped = await listRuns.handler({ projectId: 'proj-1' }, {});
    expect(JSON.parse((scoped.content[0] as { text: string }).text)).toHaveLength(1);

    const all = await listRuns.handler({}, {});
    expect(JSON.parse((all.content[0] as { text: string }).text)).toHaveLength(2);
  });

  it('run_scan maps to scanRunner.run with the given projectId', async () => {
    const scanRunner = new FakeScanRunner({
      ok: true,
      result: { description: 'A checkout flow.', suggestedFlows: [], environmentNotes: [], environment: [], setup: null, generatedAt: '2026-01-01T00:00:00.000Z' },
    });
    const { tools } = await buildAssistantTools(await toolDeps({ scanRunner }));

    const result = await tools.find((t) => t.name === 'run_scan')!.handler({ projectId: 'proj-1' }, {});

    expect(scanRunner.lastProjectId).toBe('proj-1');
    expect(result.isError).toBeFalsy();
    expect((result.content[0] as { text: string }).text).toContain('A checkout flow.');
  });

  it('run_scan surfaces a scan failure as an error result', async () => {
    const scanRunner = new FakeScanRunner({ ok: false, error: 'NOT_CONNECTED', detail: 'no session' });
    const { tools } = await buildAssistantTools(await toolDeps({ scanRunner }));

    const result = await tools.find((t) => t.name === 'run_scan')!.handler({ projectId: 'proj-1' }, {});

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('NOT_CONNECTED');
  });

  it('generate_test_case maps to caseGenerator.generate with the given projectId and prompt', async () => {
    const caseGenerator = new FakeCaseGenerator({ ok: true, flow: { name: 'Checkout', description: 'A guest checks out.', steps: ['a'] } });
    const { tools } = await buildAssistantTools(await toolDeps({ caseGenerator }));

    const result = await tools
      .find((t) => t.name === 'generate_test_case')!
      .handler({ projectId: 'proj-1', prompt: 'guest checkout' }, {});

    expect(caseGenerator.lastArgs).toEqual({ projectId: 'proj-1', prompt: 'guest checkout' });
    expect((result.content[0] as { text: string }).text).toContain('Checkout');
  });

  it('open_project_setup records the projectId for getOpenProjectSetupId and never executes anything', async () => {
    const projectRepository = new FakeProjectRepository();
    projectRepository.add(baseProject());
    const { tools, getOpenProjectSetupId } = await buildAssistantTools(await toolDeps({ projectRepository }));

    expect(getOpenProjectSetupId()).toBeNull();

    const result = await tools.find((t) => t.name === 'open_project_setup')!.handler({ projectId: 'proj-1' }, {});

    expect(getOpenProjectSetupId()).toBe('proj-1');
    expect(result.isError).toBeFalsy();
  });

  it('open_project_setup reports an unknown project as an error, without setting the marker', async () => {
    const { tools, getOpenProjectSetupId } = await buildAssistantTools(await toolDeps());

    const result = await tools.find((t) => t.name === 'open_project_setup')!.handler({ projectId: 'no-such-project' }, {});

    expect(result.isError).toBe(true);
    expect(getOpenProjectSetupId()).toBeNull();
  });
});

describe('AssistantService.send', () => {
  it('rejects an empty message without calling the agent', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: 'hi', structuredOutput: undefined, sessionId: 'sess-1' });
    const service = new AssistantService(runner, await toolDeps());

    const result = await service.send('   ', null);

    expect(result).toEqual({ ok: false, error: 'ASSISTANT_FAILED', detail: 'Say something first.' });
    expect(runner.lastOptions).toBeNull();
  });

  it('never offers a built-in tool, only the five mcp-qualified custom tools', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: 'hi', structuredOutput: undefined, sessionId: 'sess-1' });
    const service = new AssistantService(runner, await toolDeps());

    await service.send('what projects do I have?', null);

    const allowedTools = runner.lastOptions?.allowedTools ?? [];
    expect(allowedTools).toEqual([
      'mcp__autoai__list_projects',
      'mcp__autoai__list_runs',
      'mcp__autoai__run_scan',
      'mcp__autoai__generate_test_case',
      'mcp__autoai__open_project_setup',
    ]);
    for (const builtin of ['Read', 'Write', 'Edit', 'Bash']) {
      expect(allowedTools).not.toContain(builtin);
    }
  });

  it('threads a given sessionId through as `resume`, and omits it when null', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: 'hi', structuredOutput: undefined, sessionId: 'sess-2' });
    const service = new AssistantService(runner, await toolDeps());

    await service.send('hello again', 'sess-1');
    expect(runner.lastOptions?.resume).toBe('sess-1');

    await service.send('hello', null);
    expect(runner.lastOptions?.resume).toBeUndefined();
  });

  it('persists the session so it can later be resumed', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: 'hi', structuredOutput: undefined, sessionId: 'sess-1' });
    const service = new AssistantService(runner, await toolDeps());

    await service.send('hello', null);

    expect(runner.lastOptions?.persistSession).toBe(true);
  });

  it('returns the reply text and new sessionId on success', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: 'You have 2 projects.', structuredOutput: undefined, sessionId: 'sess-3' });
    const service = new AssistantService(runner, await toolDeps());

    const result = await service.send('how many projects do I have?', null);

    expect(result).toEqual({
      ok: true,
      reply: { text: 'You have 2 projects.', sessionId: 'sess-3', openProjectSetupId: null },
    });
  });

  it('maps a NOT_LOGGED_IN outcome to NOT_CONNECTED', async () => {
    const runner = new FakeAgentRunner({ ok: false, reason: 'NOT_LOGGED_IN', detail: 'authentication_failed' });
    const service = new AssistantService(runner, await toolDeps());

    const result = await service.send('hello', null);

    expect(result).toEqual({ ok: false, error: 'NOT_CONNECTED', detail: 'authentication_failed' });
  });

  it('maps any other agent failure to ASSISTANT_FAILED', async () => {
    const runner = new FakeAgentRunner({ ok: false, reason: 'ERROR', detail: 'budget exceeded' });
    const service = new AssistantService(runner, await toolDeps());

    const result = await service.send('hello', null);

    expect(result).toEqual({ ok: false, error: 'ASSISTANT_FAILED', detail: 'budget exceeded' });
  });
});
