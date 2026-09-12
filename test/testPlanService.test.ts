import { beforeEach, describe, expect, it } from 'vitest';
import type { ProjectRepository } from '../src/main/services/ProjectStore';
import type { TestCaseFileMirror } from '../src/main/services/TestCaseFileMirror';
import {
  TestPlanService,
  parseCreateTestCaseInput,
  parseImportTestCasesInput,
  parseMoveTestCaseInput,
} from '../src/main/services/TestPlanService';
import type { TestPlanRepository } from '../src/main/services/TestPlanStore';
import type { AreaRecord, Project, TestCaseRecord, TestStepAction } from '../src/shared/ipc-contract';

/** Records every write/remove it's asked to do, so a test can check the
 *  mirror actually fired (or didn't) rather than only that the case
 *  itself was stored correctly. */
class FakeTestCaseFileMirror implements TestCaseFileMirror {
  public writes: Array<{ folderPath: string; testCase: TestCaseRecord }> = [];
  public removes: Array<{ folderPath: string; testCaseId: string }> = [];

  async writeCase(folderPath: string, testCase: TestCaseRecord): Promise<void> {
    this.writes.push({ folderPath, testCase });
  }

  async removeCase(folderPath: string, testCaseId: string): Promise<void> {
    this.removes.push({ folderPath, testCaseId });
  }
}

/** In-memory stand-ins for the two electron-store-backed stores, so the
 * suite runs under plain Node with no Electron runtime - the same seam as
 * FakeProjectRepository in projectService.test.ts. */
class FakeTestPlanRepository implements TestPlanRepository {
  public areas: AreaRecord[] = [];
  public cases: TestCaseRecord[] = [];

  getAreas(projectId: string): AreaRecord[] {
    return this.areas.filter((a) => a.projectId === projectId);
  }

  getCases(projectId: string): TestCaseRecord[] {
    return this.cases.filter((c) => c.projectId === projectId);
  }

  findArea(areaId: string): AreaRecord | undefined {
    return this.areas.find((a) => a.id === areaId);
  }

  findCase(caseId: string): TestCaseRecord | undefined {
    return this.cases.find((c) => c.id === caseId);
  }

  addArea(area: AreaRecord): void {
    this.areas.push(area);
  }

  addCase(testCase: TestCaseRecord): void {
    this.cases.push(testCase);
  }

  updateArea(area: AreaRecord): void {
    this.areas = this.areas.map((a) => (a.id === area.id ? area : a));
  }

  updateCase(testCase: TestCaseRecord): void {
    this.cases = this.cases.map((c) => (c.id === testCase.id ? testCase : c));
  }

  removeCase(caseId: string): void {
    this.cases = this.cases.filter((c) => c.id !== caseId);
  }

  removeAllForProject(projectId: string): void {
    this.areas = this.areas.filter((a) => a.projectId !== projectId);
    this.cases = this.cases.filter((c) => c.projectId !== projectId);
  }
}

class FakeProjectRepository implements ProjectRepository {
  public projects: Project[] = [];

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

const PROJECT_ID = 'project-1';
const OTHER_PROJECT_ID = 'project-2';

describe('TestPlanService', () => {
  let plan: FakeTestPlanRepository;
  let projects: FakeProjectRepository;
  let service: TestPlanService;

  beforeEach(() => {
    plan = new FakeTestPlanRepository();
    projects = new FakeProjectRepository();
    for (const id of [PROJECT_ID, OTHER_PROJECT_ID]) {
      projects.add({
        id,
        name: id,
        source: { type: 'local', path: `/tmp/${id}` },
        localPath: `/tmp/${id}`,
        detection: null,
        overriddenTargetType: null,
        baseUrl: null,
        testCaseFolderPath: null,
        createdAt: '2026-03-10T09:00:00.000Z',
      });
    }
    service = new TestPlanService(plan, projects);
  });

  function makeArea(name: string, projectId = PROJECT_ID): AreaRecord {
    const result = service.createArea({ projectId, name });
    if (!result.ok) throw new Error(`area setup failed: ${result.error}`);
    return result.area;
  }

  function makeCase(name: string, areaId: string | null = null): TestCaseRecord {
    const result = service.createCase({
      projectId: PROJECT_ID,
      areaId,
      name,
      steps: ['Open the app'],
    });
    if (!result.ok) throw new Error(`case setup failed: ${result.error}`);
    return result.testCase;
  }

  describe('createArea', () => {
    it('stores a trimmed name against the project', () => {
      const result = service.createArea({ projectId: PROJECT_ID, name: '  Checkout  ' });

      expect(result).toMatchObject({ ok: true });
      expect(plan.getAreas(PROJECT_ID)).toHaveLength(1);
      expect(plan.getAreas(PROJECT_ID)[0]?.name).toBe('Checkout');
    });

    it('refuses a name that is only whitespace', () => {
      expect(service.createArea({ projectId: PROJECT_ID, name: '   ' })).toEqual({
        ok: false,
        error: 'NAME_REQUIRED',
      });
    });

    it('refuses a project that does not exist', () => {
      expect(service.createArea({ projectId: 'nope', name: 'Checkout' })).toEqual({
        ok: false,
        error: 'PROJECT_NOT_FOUND',
      });
    });

    it('refuses a duplicate name regardless of case', () => {
      makeArea('Checkout');

      expect(service.createArea({ projectId: PROJECT_ID, name: 'checkout' })).toEqual({
        ok: false,
        error: 'AREA_ALREADY_EXISTS',
      });
    });

    it('allows the same area name in a different project', () => {
      makeArea('Checkout');

      expect(service.createArea({ projectId: OTHER_PROJECT_ID, name: 'Checkout' })).toMatchObject({
        ok: true,
      });
    });
  });

  describe('renameArea', () => {
    it('renames an area in place', () => {
      const area = makeArea('Chekout');

      const result = service.renameArea({ areaId: area.id, name: 'Checkout' });

      expect(result).toMatchObject({ ok: true });
      expect(plan.findArea(area.id)?.name).toBe('Checkout');
    });

    it('lets an area keep its own name (a case-only edit)', () => {
      const area = makeArea('checkout');

      expect(service.renameArea({ areaId: area.id, name: 'Checkout' })).toMatchObject({ ok: true });
    });

    it('refuses a name another area in the project already has', () => {
      makeArea('Checkout');
      const login = makeArea('Login');

      expect(service.renameArea({ areaId: login.id, name: 'Checkout' })).toEqual({
        ok: false,
        error: 'AREA_ALREADY_EXISTS',
      });
    });
  });

  describe('createCase', () => {
    it('drops blank lines from the steps', () => {
      const result = service.createCase({
        projectId: PROJECT_ID,
        areaId: null,
        name: 'Guest can buy one item',
        steps: ['Open the storefront', '  ', '', 'Add a mug to the cart'],
      });

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      expect(result.testCase.steps).toEqual(['Open the storefront', 'Add a mug to the cart']);
    });

    it('refuses a case with no step left after trimming', () => {
      expect(
        service.createCase({
          projectId: PROJECT_ID,
          areaId: null,
          name: 'Guest can buy one item',
          steps: ['   ', ''],
        }),
      ).toEqual({ ok: false, error: 'STEPS_REQUIRED' });
    });

    it('refuses an area that belongs to another project', () => {
      const foreign = makeArea('Checkout', OTHER_PROJECT_ID);

      expect(
        service.createCase({
          projectId: PROJECT_ID,
          areaId: foreign.id,
          name: 'Guest can buy one item',
          steps: ['Open the storefront'],
        }),
      ).toEqual({ ok: false, error: 'AREA_NOT_FOUND' });
    });

    it('accepts a null area as Unsorted', () => {
      const testCase = makeCase('Guest can buy one item');

      expect(testCase.areaId).toBeNull();
    });
  });

  describe('importCases', () => {
    it('writes every case in the batch against the chosen area', () => {
      const area = makeArea('Checkout');

      const result = service.importCases({
        projectId: PROJECT_ID,
        areaId: area.id,
        cases: [
          { name: 'Guest can buy one item', steps: ['Open the shop'] },
          { name: 'Promo code applies', steps: ['Enter SAVE20', 'The total should drop'] },
        ],
      });

      expect(result).toMatchObject({ ok: true });
      const stored = plan.getCases(PROJECT_ID);
      expect(stored).toHaveLength(2);
      expect(stored.every((c) => c.areaId === area.id)).toBe(true);
    });

    /* The person pressed the button while looking at a preview of the
       whole batch. Importing a prefix of what they approved leaves them
       with no way to reason about what landed. */
    it('writes nothing at all when one row in the middle is unusable', () => {
      const result = service.importCases({
        projectId: PROJECT_ID,
        areaId: null,
        cases: [
          { name: 'Good one', steps: ['Open the shop'] },
          { name: '   ', steps: ['Open the shop'] },
          { name: 'Another good one', steps: ['Open the shop'] },
        ],
      });

      expect(result).toEqual({ ok: false, error: 'NAME_REQUIRED' });
      expect(plan.getCases(PROJECT_ID)).toEqual([]);
    });

    it('writes nothing when a row has no usable step', () => {
      const result = service.importCases({
        projectId: PROJECT_ID,
        areaId: null,
        cases: [{ name: 'Good one', steps: ['  ', ''] }],
      });

      expect(result).toEqual({ ok: false, error: 'STEPS_REQUIRED' });
      expect(plan.getCases(PROJECT_ID)).toEqual([]);
    });

    it('refuses an empty batch rather than reporting a silent success', () => {
      expect(service.importCases({ projectId: PROJECT_ID, areaId: null, cases: [] })).toEqual({
        ok: false,
        error: 'NOTHING_TO_IMPORT',
      });
    });

    it('refuses an area from another project, and writes nothing', () => {
      const foreign = makeArea('Checkout', OTHER_PROJECT_ID);

      expect(
        service.importCases({
          projectId: PROJECT_ID,
          areaId: foreign.id,
          cases: [{ name: 'Good one', steps: ['Open the shop'] }],
        }),
      ).toEqual({ ok: false, error: 'AREA_NOT_FOUND' });
      expect(plan.getCases(PROJECT_ID)).toEqual([]);
    });

    it('trims and drops blank steps the same way a hand-written case does', () => {
      const result = service.importCases({
        projectId: PROJECT_ID,
        areaId: null,
        cases: [{ name: '  Guest can buy one item  ', steps: ['  Open the shop  ', '', 'Pay'] }],
      });

      expect(result).toMatchObject({ ok: true });
      const stored = plan.getCases(PROJECT_ID)[0];
      expect(stored?.name).toBe('Guest can buy one item');
      expect(stored?.steps).toEqual(['Open the shop', 'Pay']);
    });

    it('gives every imported case its own id', () => {
      const result = service.importCases({
        projectId: PROJECT_ID,
        areaId: null,
        cases: [
          { name: 'One', steps: ['Open'] },
          { name: 'One', steps: ['Open'] },
        ],
      });

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      expect(result.cases[0]?.id).not.toBe(result.cases[1]?.id);
    });
  });

  describe('moveCase', () => {
    it('moves a case into an area of its own project', () => {
      const area = makeArea('Checkout');
      const testCase = makeCase('Guest can buy one item');

      expect(service.moveCase({ caseId: testCase.id, areaId: area.id })).toMatchObject({ ok: true });
      expect(plan.findCase(testCase.id)?.areaId).toBe(area.id);
    });

    it('moves a case back to Unsorted', () => {
      const area = makeArea('Checkout');
      const testCase = makeCase('Guest can buy one item', area.id);

      expect(service.moveCase({ caseId: testCase.id, areaId: null })).toMatchObject({ ok: true });
      expect(plan.findCase(testCase.id)?.areaId).toBeNull();
    });

    it('refuses to move a case into another project’s area', () => {
      const foreign = makeArea('Checkout', OTHER_PROJECT_ID);
      const testCase = makeCase('Guest can buy one item');

      expect(service.moveCase({ caseId: testCase.id, areaId: foreign.id })).toEqual({
        ok: false,
        error: 'AREA_NOT_FOUND',
      });
      expect(plan.findCase(testCase.id)?.areaId).toBeNull();
    });
  });

  describe('deleteCase', () => {
    it('removes the case and reports which one went', () => {
      const testCase = makeCase('Guest can buy one item');

      expect(service.deleteCase(testCase.id)).toEqual({ ok: true, caseId: testCase.id });
      expect(plan.findCase(testCase.id)).toBeUndefined();
    });

    it('refuses an id that is not there', () => {
      expect(service.deleteCase('nope')).toEqual({ ok: false, error: 'CASE_NOT_FOUND' });
    });
  });

  describe('removeAllForProject', () => {
    it('drops one project\u2019s areas and cases and leaves the other\u2019s', () => {
      const area = makeArea('Checkout');
      makeCase('Guest can buy one item', area.id);
      service.createArea({ projectId: OTHER_PROJECT_ID, name: 'Login' });

      service.removeAllForProject(PROJECT_ID);

      expect(plan.getAreas(PROJECT_ID)).toEqual([]);
      expect(plan.getCases(PROJECT_ID)).toEqual([]);
      expect(plan.getAreas(OTHER_PROJECT_ID)).toHaveLength(1);
    });

    it('is silent about a project that has nothing', () => {
      expect(() => service.removeAllForProject('never-used')).not.toThrow();
    });
  });

  describe('list', () => {
    it('returns only the asked-for project’s plan', () => {
      makeArea('Checkout');
      makeCase('Guest can buy one item');
      service.createArea({ projectId: OTHER_PROJECT_ID, name: 'Login' });

      const result = service.list(PROJECT_ID);

      expect(result.areas).toHaveLength(1);
      expect(result.cases).toHaveLength(1);
    });
  });

  describe('script', () => {
    const SCRIPT: readonly TestStepAction[] = [
      { action: 'goto', value: '/checkout' },
      { action: 'click', selectorKind: 'id', selectorValue: 'submit-btn' },
    ];

    it('defaults a new case’s script to null when omitted', () => {
      const testCase = makeCase('Guest can buy one item');
      expect(testCase.script).toBeNull();
    });

    it('stores an explicit script on createCase', () => {
      const result = service.createCase({
        projectId: PROJECT_ID,
        areaId: null,
        name: 'Guest can buy one item',
        steps: ['Go to checkout'],
        script: SCRIPT,
      });

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      expect(result.testCase.script).toEqual(SCRIPT);
    });

    it('stores an explicit null the same as an omitted script', () => {
      const result = service.createCase({
        projectId: PROJECT_ID,
        areaId: null,
        name: 'Guest can buy one item',
        steps: ['Go to checkout'],
        script: null,
      });

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      expect(result.testCase.script).toBeNull();
    });

    it('always stores null for imported cases, even if a caller tried to smuggle one in via a wider type', () => {
      const result = service.importCases({
        projectId: PROJECT_ID,
        areaId: null,
        cases: [{ name: 'Good one', steps: ['Open the shop'] }],
      });

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      expect(result.cases[0]?.script).toBeNull();
    });
  });

  describe('file mirror', () => {
    let mirror: FakeTestCaseFileMirror;
    let mirroredService: TestPlanService;
    const FOLDER = '/Users/maya/cases';

    beforeEach(() => {
      mirror = new FakeTestCaseFileMirror();
      mirroredService = new TestPlanService(plan, projects, mirror);
      projects.update(PROJECT_ID, { testCaseFolderPath: FOLDER });
    });

    it('mirrors a new case to the project’s folder on createCase', () => {
      const result = mirroredService.createCase({
        projectId: PROJECT_ID,
        areaId: null,
        name: 'Guest can buy one item',
        steps: ['Open the shop'],
      });

      expect(result).toMatchObject({ ok: true });
      expect(mirror.writes).toHaveLength(1);
      expect(mirror.writes[0]?.folderPath).toBe(FOLDER);
      if (!result.ok) return;
      expect(mirror.writes[0]?.testCase.id).toBe(result.testCase.id);
    });

    it('never touches the mirror when the project has no folder set', () => {
      projects.update(OTHER_PROJECT_ID, { testCaseFolderPath: null });
      mirroredService.createCase({
        projectId: OTHER_PROJECT_ID,
        areaId: null,
        name: 'Login works',
        steps: ['Open the login page'],
      });

      expect(mirror.writes).toEqual([]);
    });

    it('mirrors on moveCase', () => {
      const created = mirroredService.createCase({
        projectId: PROJECT_ID,
        areaId: null,
        name: 'Guest can buy one item',
        steps: ['Open the shop'],
      });
      if (!created.ok) throw new Error('setup failed');
      mirror.writes = [];

      mirroredService.moveCase({ caseId: created.testCase.id, areaId: null });

      expect(mirror.writes).toHaveLength(1);
    });

    it('mirrors a removal on deleteCase', () => {
      const created = mirroredService.createCase({
        projectId: PROJECT_ID,
        areaId: null,
        name: 'Guest can buy one item',
        steps: ['Open the shop'],
      });
      if (!created.ok) throw new Error('setup failed');

      mirroredService.deleteCase(created.testCase.id);

      expect(mirror.removes).toEqual([{ folderPath: FOLDER, testCaseId: created.testCase.id }]);
    });

    it('mirrors every row on importCases', () => {
      const result = mirroredService.importCases({
        projectId: PROJECT_ID,
        areaId: null,
        cases: [
          { name: 'One', steps: ['Open'] },
          { name: 'Two', steps: ['Open'] },
        ],
      });

      expect(result).toMatchObject({ ok: true });
      expect(mirror.writes).toHaveLength(2);
    });
  });
});

/** The IPC boundary hands these raw. See parseCreateProjectInput for why a
 * TypeScript annotation on a handler proves nothing about the payload. */
describe('test plan payload parsing', () => {
  it('rejects steps that are not all strings', () => {
    expect(
      parseCreateTestCaseInput({
        projectId: 'p',
        areaId: null,
        name: 'x',
        steps: ['ok', 7],
      }),
    ).toBeNull();
  });

  it('rejects a missing steps array', () => {
    expect(parseCreateTestCaseInput({ projectId: 'p', areaId: null, name: 'x' })).toBeNull();
  });

  it('rejects an import row whose steps are not all strings', () => {
    expect(
      parseImportTestCasesInput({
        projectId: 'p',
        areaId: null,
        cases: [{ name: 'ok', steps: ['fine', 4] }],
      }),
    ).toBeNull();
  });

  it('rejects an import whose cases are not objects', () => {
    expect(parseImportTestCasesInput({ projectId: 'p', areaId: null, cases: ['nope'] })).toBeNull();
  });

  it('accepts an import with an empty batch, leaving the refusal to the service', () => {
    expect(parseImportTestCasesInput({ projectId: 'p', areaId: null, cases: [] })).toEqual({
      projectId: 'p',
      areaId: null,
      cases: [],
    });
  });

  it('accepts a null area on a move but not a numeric one', () => {
    expect(parseMoveTestCaseInput({ caseId: 'c', areaId: null })).toEqual({
      caseId: 'c',
      areaId: null,
    });
    expect(parseMoveTestCaseInput({ caseId: 'c', areaId: 3 })).toBeNull();
  });

  describe('script parsing', () => {
    it('accepts a case with no script field at all', () => {
      const parsed = parseCreateTestCaseInput({ projectId: 'p', areaId: null, name: 'x', steps: ['a'] });
      expect(parsed?.script).toBeUndefined();
    });

    it('accepts an explicit null script', () => {
      const parsed = parseCreateTestCaseInput({ projectId: 'p', areaId: null, name: 'x', steps: ['a'], script: null });
      expect(parsed?.script).toBeNull();
    });

    it('accepts a well-formed script array', () => {
      const parsed = parseCreateTestCaseInput({
        projectId: 'p',
        areaId: null,
        name: 'x',
        steps: ['a'],
        script: [{ action: 'goto', value: '/checkout' }, { action: 'click', selectorKind: 'id', selectorValue: 'go' }],
      });

      expect(parsed?.script).toEqual([
        { action: 'goto', selectorKind: undefined, selectorValue: undefined, value: '/checkout' },
        { action: 'click', selectorKind: 'id', selectorValue: 'go', value: undefined },
      ]);
    });

    it('rejects a script entry with an unknown action', () => {
      expect(
        parseCreateTestCaseInput({
          projectId: 'p',
          areaId: null,
          name: 'x',
          steps: ['a'],
          script: [{ action: 'hover' }],
        }),
      ).toBeNull();
    });

    it('rejects a script entry with an unknown selectorKind', () => {
      expect(
        parseCreateTestCaseInput({
          projectId: 'p',
          areaId: null,
          name: 'x',
          steps: ['a'],
          script: [{ action: 'click', selectorKind: 'class', selectorValue: 'go' }],
        }),
      ).toBeNull();
    });

    it('rejects a script that is not an array', () => {
      expect(
        parseCreateTestCaseInput({ projectId: 'p', areaId: null, name: 'x', steps: ['a'], script: 'nope' }),
      ).toBeNull();
    });
  });
});
