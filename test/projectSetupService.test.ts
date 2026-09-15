import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DetachedProcessHandle, ProcessSpawner, RunToCompletionResult } from '../src/main/services/ProjectSetupService';
import { buildBaseUrlMismatchNote, extractStartUrl, ProjectSetupService } from '../src/main/services/ProjectSetupService';
import { ProjectService } from '../src/main/services/ProjectService';
import type { ProjectRepository } from '../src/main/services/ProjectStore';
import type { ScanRepository } from '../src/main/services/ScanStore';
import type { Project, ProjectScanResult, ProjectSetupProposal } from '../src/shared/ipc-contract';

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

class FakeDetachedProcessHandle implements DetachedProcessHandle {
  public killed = false;
  public output = '';

  constructor(
    public readonly pid: number | undefined,
    private readonly crashes: boolean,
  ) {}

  async waitForCrash(): Promise<boolean> {
    if (this.crashes) this.output = 'listen EADDRINUSE: address already in use';
    return this.crashes;
  }

  kill(): void {
    this.killed = true;
  }
}

/** Records every command it was asked to run/spawn, and returns canned
 *  results per command (or throws, for the INSTALL_FAILED path) - no real
 *  process ever spawned. */
class FakeProcessSpawner implements ProcessSpawner {
  public completedCommands: string[] = [];
  public detachedCommands: string[] = [];
  private pidCounter = 1000;

  constructor(
    private readonly completionResults: Record<string, RunToCompletionResult | Error> = {},
    private readonly detachedCrashes: Record<string, boolean> = {},
  ) {}

  async runToCompletion(command: string): Promise<RunToCompletionResult> {
    this.completedCommands.push(command);
    const result = this.completionResults[command] ?? { exitCode: 0, stdout: '', stderr: '' };
    if (result instanceof Error) throw result;
    return result;
  }

  spawnDetached(command: string): DetachedProcessHandle {
    this.detachedCommands.push(command);
    return new FakeDetachedProcessHandle(this.pidCounter++, this.detachedCrashes[command] ?? false);
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
    baseUrl: null,
    testCaseFolderPath: null,
    ...overrides,
  };
}

function baseScan(setup: ProjectSetupProposal | null): ProjectScanResult {
  return {
    description: 'A small PHP site.',
    suggestedFlows: [],
    environmentNotes: [],
    environment: [],
    setup,
    generatedAt: '2026-03-10T09:00:00.000Z',
  };
}

describe('extractStartUrl', () => {
  it('extracts host:port from a recognized php -S pattern', () => {
    expect(extractStartUrl('php -S localhost:8000 -t .')).toBe('http://localhost:8000');
  });

  it('extracts localhost:8000 from a bare python http.server command', () => {
    expect(extractStartUrl('python3 -m http.server')).toBe('http://localhost:8000');
    expect(extractStartUrl('python -m http.server 9000')).toBe('http://localhost:9000');
  });

  it('returns null for a command with no recognized pattern', () => {
    expect(extractStartUrl('npm run dev')).toBeNull();
    expect(extractStartUrl('yarn start')).toBeNull();
  });
});

describe('buildBaseUrlMismatchNote', () => {
  it('names both the expected path and the resolved URL when both are known', () => {
    const note = buildBaseUrlMismatchNote('/taaza', 'http://localhost:8000');
    expect(note).toContain('/taaza');
    expect(note).toContain('http://localhost:8000');
  });

  it('is null when there is no expected path', () => {
    expect(buildBaseUrlMismatchNote(null, 'http://localhost:8000')).toBeNull();
  });

  it('is null when no start URL was resolved', () => {
    expect(buildBaseUrlMismatchNote('/taaza', null)).toBeNull();
  });

  it('is null when neither is known', () => {
    expect(buildBaseUrlMismatchNote(null, null)).toBeNull();
  });
});

describe('ProjectSetupService.run', () => {
  let projects: FakeProjectRepository;
  let scans: FakeScanRepository;
  let projectService: ProjectService;
  let project: Project;
  let workspaceRoot: string;

  beforeEach(() => {
    projects = new FakeProjectRepository();
    scans = new FakeScanRepository();
    workspaceRoot = mkdtempSync(join(tmpdir(), 'autoai-setup-workspace-'));
    projectService = new ProjectService(projects, workspaceRoot);
    project = baseProject();
    projects.add(project);
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function makeService(spawner: ProcessSpawner): ProjectSetupService {
    return new ProjectSetupService(scans, projects, projectService, spawner);
  }

  it('returns PROJECT_NOT_FOUND for an id that does not exist', async () => {
    const service = makeService(new FakeProcessSpawner());
    const result = await service.run('no-such-project');
    expect(result).toEqual({ ok: false, error: 'PROJECT_NOT_FOUND' });
  });

  it('returns NO_PROPOSAL when the project has never been scanned', async () => {
    const service = makeService(new FakeProcessSpawner());
    const result = await service.run(project.id);
    expect(result).toEqual({ ok: false, error: 'NO_PROPOSAL' });
  });

  it('returns NO_PROPOSAL when the last scan had no setup proposal', async () => {
    scans.set(project.id, baseScan(null));
    const service = makeService(new FakeProcessSpawner());
    const result = await service.run(project.id);
    expect(result).toEqual({ ok: false, error: 'NO_PROPOSAL' });
  });

  it('returns COMMAND_REJECTED, running nothing, when every proposed command fails the allowlist', async () => {
    scans.set(project.id, baseScan({ installCommands: ['rm -rf /'], startCommand: null, startCommandExplanation: null, expectedBasePath: null }));
    const spawner = new FakeProcessSpawner();
    const service = makeService(spawner);

    const result = await service.run(project.id);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('COMMAND_REJECTED');
    expect(spawner.completedCommands).toEqual([]);
  });

  it('surfaces a rejected command in the result rather than silently dropping it, and stops there', async () => {
    scans.set(
      project.id,
      baseScan({
        installCommands: ['npm install', 'rm -rf /', 'npm run build'],
        startCommand: null,
        startCommandExplanation: null,
        expectedBasePath: null,
      }),
    );
    const spawner = new FakeProcessSpawner();
    const service = makeService(spawner);

    const result = await service.run(project.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.installResults).toEqual([
      { command: 'npm install', status: 'passed', exitCode: 0, stdout: '', stderr: '' },
      {
        command: 'rm -rf /',
        status: 'failed',
        exitCode: null,
        stdout: '',
        stderr: "Claude suggested this, AutoAI won't run it automatically.",
      },
      { command: 'npm run build', status: 'skipped', exitCode: null, stdout: '', stderr: '' },
    ]);
    // Only the one allowlisted command before the rejection actually ran.
    expect(spawner.completedCommands).toEqual(['npm install']);
  });

  it('stops at the first non-zero exit, same convention as TestRunnerService', async () => {
    scans.set(
      project.id,
      baseScan({
        installCommands: ['npm install', 'npm run build'],
        startCommand: null,
        startCommandExplanation: null,
        expectedBasePath: null,
      }),
    );
    const spawner = new FakeProcessSpawner({
      'npm install': { exitCode: 1, stdout: 'installing…', stderr: 'peer dependency conflict' },
    });
    const service = makeService(spawner);

    const result = await service.run(project.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.installResults.map((r) => r.status)).toEqual(['failed', 'skipped']);
    expect(spawner.completedCommands).toEqual(['npm install']);
  });

  it('returns INSTALL_FAILED when the spawn call itself throws', async () => {
    scans.set(project.id, baseScan({ installCommands: ['npm install'], startCommand: null, startCommandExplanation: null, expectedBasePath: null }));
    const spawner = new FakeProcessSpawner({ 'npm install': new Error('spawn EPERM') });
    const service = makeService(spawner);

    const result = await service.run(project.id);

    expect(result).toEqual({ ok: false, error: 'INSTALL_FAILED', detail: 'spawn EPERM' });
  });

  it('starts the start command once installs all pass, tracks the pid, and auto-fills baseUrl on a recognized pattern', async () => {
    scans.set(
      project.id,
      baseScan({ installCommands: [], startCommand: 'php -S localhost:8000 -t .', startCommandExplanation: null, expectedBasePath: null }),
    );
    const spawner = new FakeProcessSpawner();
    const service = makeService(spawner);

    const result = await service.run(project.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.start).toEqual({ command: 'php -S localhost:8000 -t .', status: 'started', output: '' });
    expect(result.result.baseUrlAutoFilled).toBe('http://localhost:8000');
    expect(spawner.detachedCommands).toEqual(['php -S localhost:8000 -t .']);
    expect(projects.find(project.id)?.baseUrl).toBe('http://localhost:8000');
  });

  it('reports a base-path mismatch when the scan found one and a start URL was resolved', async () => {
    scans.set(
      project.id,
      baseScan({
        installCommands: [],
        startCommand: 'php -S localhost:8000 -t .',
        startCommandExplanation: null,
        expectedBasePath: '/taaza',
      }),
    );
    const service = makeService(new FakeProcessSpawner());

    const result = await service.run(project.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.baseUrlMismatchNote).toContain('/taaza');
    expect(result.result.baseUrlMismatchNote).toContain('http://localhost:8000');
  });

  it('does not report a mismatch when the scan found no expected base path', async () => {
    scans.set(
      project.id,
      baseScan({ installCommands: [], startCommand: 'php -S localhost:8000 -t .', startCommandExplanation: null, expectedBasePath: null }),
    );
    const service = makeService(new FakeProcessSpawner());

    const result = await service.run(project.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.baseUrlMismatchNote).toBeNull();
  });

  it('does not report a mismatch when no start URL could be resolved, even with an expected path', async () => {
    scans.set(
      project.id,
      baseScan({ installCommands: [], startCommand: 'npm run dev', startCommandExplanation: null, expectedBasePath: '/taaza' }),
    );
    const service = makeService(new FakeProcessSpawner());

    const result = await service.run(project.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.baseUrlMismatchNote).toBeNull();
  });

  it('does not auto-fill baseUrl when the start command has no recognized pattern', async () => {
    scans.set(project.id, baseScan({ installCommands: [], startCommand: 'npm run dev', startCommandExplanation: null, expectedBasePath: null }));
    const service = makeService(new FakeProcessSpawner());

    const result = await service.run(project.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.start?.status).toBe('started');
    expect(result.result.baseUrlAutoFilled).toBeNull();
    expect(projects.find(project.id)?.baseUrl).toBeNull();
  });

  it('reports a crash-on-boot within the grace period and does not track the process', async () => {
    scans.set(
      project.id,
      baseScan({ installCommands: [], startCommand: 'php -S localhost:8000 -t .', startCommandExplanation: null, expectedBasePath: null }),
    );
    const spawner = new FakeProcessSpawner({}, { 'php -S localhost:8000 -t .': true });
    const service = makeService(spawner);

    const result = await service.run(project.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.start).toEqual({
      command: 'php -S localhost:8000 -t .',
      status: 'crashed',
      output: 'listen EADDRINUSE: address already in use',
    });
    expect(result.result.baseUrlAutoFilled).toBeNull();

    // Not tracked as running, so a second call is allowed to try again.
    const second = await service.run(project.id);
    expect(second.ok).toBe(true);
  });

  it('rejects a disallowed start command without running it, and leaves nothing tracked', async () => {
    scans.set(
      project.id,
      baseScan({ installCommands: [], startCommand: 'node server.js', startCommandExplanation: null, expectedBasePath: null }),
    );
    const spawner = new FakeProcessSpawner();
    const service = makeService(spawner);

    const result = await service.run(project.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.start).toEqual({
      command: 'node server.js',
      status: 'rejected',
      output: "Claude suggested this, AutoAI won't run it automatically.",
    });
    expect(spawner.detachedCommands).toEqual([]);
  });

  it('skips the start command entirely when an install failed', async () => {
    scans.set(
      project.id,
      baseScan({ installCommands: ['npm install'], startCommand: 'npm run dev', startCommandExplanation: null, expectedBasePath: null }),
    );
    const spawner = new FakeProcessSpawner({ 'npm install': { exitCode: 1, stdout: '', stderr: 'boom' } });
    const service = makeService(spawner);

    const result = await service.run(project.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.start).toEqual({ command: 'npm run dev', status: 'skipped', output: '' });
    expect(spawner.detachedCommands).toEqual([]);
  });

  it('returns ALREADY_RUNNING for a project with a tracked process, until stop() is called', async () => {
    scans.set(
      project.id,
      baseScan({ installCommands: [], startCommand: 'php -S localhost:8000 -t .', startCommandExplanation: null, expectedBasePath: null }),
    );
    const spawner = new FakeProcessSpawner();
    const service = makeService(spawner);

    await service.run(project.id);
    const second = await service.run(project.id);
    expect(second).toEqual({ ok: false, error: 'ALREADY_RUNNING' });

    service.stop(project.id);
    const third = await service.run(project.id);
    expect(third.ok).toBe(true);
  });

  it('stop() kills the tracked process and is a no-op when nothing is tracked', async () => {
    scans.set(
      project.id,
      baseScan({ installCommands: [], startCommand: 'php -S localhost:8000 -t .', startCommandExplanation: null, expectedBasePath: null }),
    );
    const spawner = new FakeProcessSpawner();
    const service = makeService(spawner);
    await service.run(project.id);

    expect(() => service.stop(project.id)).not.toThrow();
    expect(() => service.stop('no-such-project')).not.toThrow();
  });

  it('stopAll stops every tracked process, freeing every project to run again', async () => {
    scans.set(
      project.id,
      baseScan({ installCommands: [], startCommand: 'php -S localhost:8000 -t .', startCommandExplanation: null, expectedBasePath: null }),
    );
    const secondProject = baseProject({ id: 'proj-2' });
    projects.add(secondProject);
    scans.set(
      secondProject.id,
      baseScan({ installCommands: [], startCommand: 'php -S localhost:8001 -t .', startCommandExplanation: null, expectedBasePath: null }),
    );

    const spawner = new FakeProcessSpawner();
    const service = makeService(spawner);
    await service.run(project.id);
    await service.run(secondProject.id);

    service.stopAll();

    expect((await service.run(project.id)).ok).toBe(true);
    expect((await service.run(secondProject.id)).ok).toBe(true);
  });
});
