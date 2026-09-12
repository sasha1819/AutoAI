import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectDataOwner } from '../src/main/services/ProjectService';
import { ProjectService } from '../src/main/services/ProjectService';
import type { ProjectRepository } from '../src/main/services/ProjectStore';
import type { Project } from '../src/shared/ipc-contract';

/** In-memory stand-in for the electron-store-backed ProjectStore, so these
 * tests run under plain Node/vitest with no Electron runtime required -
 * same seam as FakeProfileRepository in authService.test.ts. */
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

/** Stands in for the test plan (and, later, runs and reports): records what
 * it was told to let go of, so a test can check the cascade fired rather
 * than only that the project row disappeared. */
class FakeDataOwner implements ProjectDataOwner {
  public cleared: string[] = [];

  removeAllForProject(projectId: string): void {
    this.cleared.push(projectId);
  }
}

describe('ProjectService.addFromLocalPath', () => {
  let repo: FakeProjectRepository;
  let service: ProjectService;
  let workspaceRoot: string;
  let realDir: string;
  let realFile: string;

  beforeEach(() => {
    repo = new FakeProjectRepository();
    workspaceRoot = mkdtempSync(join(tmpdir(), 'autoai-workspace-'));
    service = new ProjectService(repo, workspaceRoot);
    // Path validation hits the real filesystem (see ProjectService), so
    // these tests use real temp entries rather than mocking fs.
    realDir = mkdtempSync(join(tmpdir(), 'autoai-project-test-'));
    realFile = join(realDir, 'not-a-directory.txt');
    writeFileSync(realFile, 'placeholder');
  });

  afterEach(() => {
    rmSync(realDir, { recursive: true, force: true });
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('adds a project for an existing folder', () => {
    const result = service.addFromLocalPath({ path: realDir });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.source).toEqual({ type: 'local', path: realDir });
    expect(result.project.localPath).toBe(realDir);
    expect(result.project.overriddenTargetType).toBeNull();
    expect(service.list()).toHaveLength(1);
  });

  it('names the project from the folder when no name is given', () => {
    const result = service.addFromLocalPath({ path: realDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.name).toBe(realDir.split('/').filter(Boolean).pop());
  });

  it('prefers an explicit name over the folder name', () => {
    const result = service.addFromLocalPath({ path: realDir, name: 'My App' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.name).toBe('My App');
  });

  it('rejects an empty path', () => {
    const result = service.addFromLocalPath({ path: '  ' });
    expect(result).toEqual({ ok: false, error: 'INVALID_LOCAL_PATH' });
  });

  it('rejects a path that does not exist', () => {
    const result = service.addFromLocalPath({ path: join(realDir, 'does-not-exist') });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('PATH_NOT_FOUND');
  });

  it('rejects a path that is a file, not a directory', () => {
    const result = service.addFromLocalPath({ path: realFile });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('PATH_NOT_FOUND');
  });

  it('lists projects in creation order', () => {
    const otherDir = mkdtempSync(join(tmpdir(), 'autoai-project-test-2-'));
    service.addFromLocalPath({ path: realDir, name: 'First' });
    service.addFromLocalPath({ path: otherDir, name: 'Second' });

    expect(service.list().map((p) => p.name)).toEqual(['First', 'Second']);
    rmSync(otherDir, { recursive: true, force: true });
  });
});

describe('ProjectService.addFromGit validation', () => {
  // Only the validation path is exercised here - a real clone needs the
  // git binary and network access, which is DetectionService/GitService's
  // own test file's job, not this one's.
  let service: ProjectService;
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'autoai-workspace-'));
    service = new ProjectService(new FakeProjectRepository(), workspaceRoot);
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('rejects a URL that is not a valid git remote', async () => {
    const result = await service.addFromGit({ url: 'not a url at all' });
    expect(result).toMatchObject({ ok: false, error: 'INVALID_GIT_URL' });
  });

  it('rejects a URL with embedded credentials', async () => {
    const result = await service.addFromGit({ url: 'https://user:pass@github.com/org/repo.git' });
    expect(result).toMatchObject({ ok: false, error: 'INVALID_GIT_URL' });
  });
});

describe('ProjectService.setOverride / remove', () => {
  let repo: FakeProjectRepository;
  let service: ProjectService;
  let workspaceRoot: string;
  let realDir: string;

  beforeEach(() => {
    repo = new FakeProjectRepository();
    workspaceRoot = mkdtempSync(join(tmpdir(), 'autoai-workspace-'));
    service = new ProjectService(repo, workspaceRoot);
    realDir = mkdtempSync(join(tmpdir(), 'autoai-target-type-test-'));
  });

  afterEach(() => {
    rmSync(realDir, { recursive: true, force: true });
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function addProject(): Project {
    const created = service.addFromLocalPath({ path: realDir, name: 'Checkout' });
    if (!created.ok) throw new Error('fixture project failed to create');
    return created.project;
  }

  it('sets an override on a project that has none', () => {
    const project = addProject();
    expect(project.overriddenTargetType).toBeNull();

    const updated = service.setOverride(project.id, 'web');

    expect(updated?.overriddenTargetType).toBe('web');
    expect(repo.find(project.id)?.overriddenTargetType).toBe('web');
  });

  it('clears an override back to unset', () => {
    const project = addProject();
    service.setOverride(project.id, 'mobile');

    const updated = service.setOverride(project.id, null);

    expect(updated?.overriddenTargetType).toBeNull();
  });

  it('leaves every other field untouched', () => {
    const project = addProject();

    service.setOverride(project.id, 'desktop');

    const stored = repo.find(project.id);
    expect(stored?.name).toBe(project.name);
    expect(stored?.localPath).toBe(project.localPath);
    expect(stored?.createdAt).toBe(project.createdAt);
  });

  it('returns null for an unknown project rather than throwing', () => {
    expect(service.setOverride('no-such-id', 'web')).toBeNull();
  });

  it('forgets the project on remove', () => {
    const project = addProject();

    service.remove(project.id);

    expect(repo.list()).toEqual([]);
  });

  it('tells every data owner to let go of a removed project’s data', () => {
    const plan = new FakeDataOwner();
    const runs = new FakeDataOwner();
    service = new ProjectService(repo, workspaceRoot, [plan, runs]);
    const project = addProject();

    service.remove(project.id);

    expect(plan.cleared).toEqual([project.id]);
    expect(runs.cleared).toEqual([project.id]);
  });

  it('does nothing, and clears nothing, for an id that is not there', () => {
    const plan = new FakeDataOwner();
    service = new ProjectService(repo, workspaceRoot, [plan]);

    expect(() => service.remove('nope')).not.toThrow();
    expect(plan.cleared).toEqual([]);
  });

  /* The folder is the user's, not AutoAI's. Removing a local-path project
     forgets what AutoAI remembered about it and nothing else. */
  it('leaves a local folder on disk alone', () => {
    const project = addProject();

    service.remove(project.id);

    expect(existsSync(realDir)).toBe(true);
  });

  it('frees the path so the same folder can be added again', () => {
    const first = addProject();
    service.remove(first.id);

    expect(service.addFromLocalPath({ path: realDir, name: 'Checkout' })).toMatchObject({ ok: true });
  });

  it('starts with no base URL and no test case folder', () => {
    const project = addProject();
    expect(project.baseUrl).toBeNull();
    expect(project.testCaseFolderPath).toBeNull();
  });

  it('sets a base URL, mirroring setOverride exactly', () => {
    const project = addProject();

    const updated = service.setBaseUrl(project.id, 'http://localhost:8080');

    expect(updated?.baseUrl).toBe('http://localhost:8080');
    expect(repo.find(project.id)?.baseUrl).toBe('http://localhost:8080');
  });

  it('trims a base URL before storing it', () => {
    const project = addProject();

    const updated = service.setBaseUrl(project.id, '  http://localhost:8080  ');

    expect(updated?.baseUrl).toBe('http://localhost:8080');
  });

  it('stores an empty or whitespace-only base URL as null, not as an empty string', () => {
    const project = addProject();
    service.setBaseUrl(project.id, 'http://localhost:8080');

    const cleared = service.setBaseUrl(project.id, '   ');

    expect(cleared?.baseUrl).toBeNull();
  });

  it('clears a base URL back to null when given null directly', () => {
    const project = addProject();
    service.setBaseUrl(project.id, 'http://localhost:8080');

    const cleared = service.setBaseUrl(project.id, null);

    expect(cleared?.baseUrl).toBeNull();
  });

  it('sets and clears a test case folder path', () => {
    const project = addProject();

    const withFolder = service.setTestCaseFolder(project.id, '/Users/maya/cases');
    expect(withFolder?.testCaseFolderPath).toBe('/Users/maya/cases');

    const cleared = service.setTestCaseFolder(project.id, null);
    expect(cleared?.testCaseFolderPath).toBeNull();
  });
});
