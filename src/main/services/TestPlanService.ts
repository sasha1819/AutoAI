import { randomUUID } from 'node:crypto';
import type {
  AreaRecord,
  ImportedCase,
  AreaResult,
  CreateAreaInput,
  CreateTestCaseInput,
  DeleteTestCaseResult,
  ImportTestCasesInput,
  ImportTestCasesResult,
  MoveTestCaseInput,
  RenameAreaInput,
  TestCaseRecord,
  TestCaseResult,
  TestPlan,
  TestStepAction,
} from '@shared/ipc-contract';
import type { ProjectDataOwner } from './ProjectService';
import type { ProjectRepository } from './ProjectStore';
import { NoopTestCaseFileMirror } from './TestCaseFileMirror';
import type { TestCaseFileMirror } from './TestCaseFileMirror';
import { parseTestStepAction } from './TestFlowSchema';
import type { TestPlanRepository } from './TestPlanStore';

/**
 * The renderer is sandboxed but not trusted, so every payload is parsed
 * before use - see the note on parseCreateProjectInput for why the
 * TypeScript annotation on an IPC handler proves nothing.
 */
export function parseCreateAreaInput(raw: unknown): CreateAreaInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  const projectId = candidate['projectId'];
  const name = candidate['name'];

  if (typeof projectId !== 'string') return null;
  if (typeof name !== 'string') return null;

  return { projectId, name };
}

export function parseRenameAreaInput(raw: unknown): RenameAreaInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  const areaId = candidate['areaId'];
  const name = candidate['name'];

  if (typeof areaId !== 'string') return null;
  if (typeof name !== 'string') return null;

  return { areaId, name };
}

export function parseCreateTestCaseInput(raw: unknown): CreateTestCaseInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  const projectId = candidate['projectId'];
  const areaId = candidate['areaId'];
  const name = candidate['name'];
  const steps = candidate['steps'];
  const scriptRaw = candidate['script'];

  if (typeof projectId !== 'string') return null;
  if (areaId !== null && typeof areaId !== 'string') return null;
  if (typeof name !== 'string') return null;
  if (!Array.isArray(steps)) return null;
  if (!steps.every((step) => typeof step === 'string')) return null;

  let script: readonly TestStepAction[] | null | undefined;
  if (scriptRaw !== undefined) {
    if (scriptRaw === null) {
      script = null;
    } else {
      if (!Array.isArray(scriptRaw)) return null;
      const parsed: TestStepAction[] = [];
      for (const entry of scriptRaw) {
        const step = parseTestStepAction(entry);
        if (!step) return null;
        parsed.push(step);
      }
      script = parsed;
    }
  }

  return { projectId, areaId, name, steps: steps as string[], script };
}

export function parseMoveTestCaseInput(raw: unknown): MoveTestCaseInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  const caseId = candidate['caseId'];
  const areaId = candidate['areaId'];

  if (typeof caseId !== 'string') return null;
  if (areaId !== null && typeof areaId !== 'string') return null;

  return { caseId, areaId };
}

export function parseImportTestCasesInput(raw: unknown): ImportTestCasesInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  const projectId = candidate['projectId'];
  const areaId = candidate['areaId'];
  const cases = candidate['cases'];

  if (typeof projectId !== 'string') return null;
  if (areaId !== null && typeof areaId !== 'string') return null;
  if (!Array.isArray(cases)) return null;

  const parsed: ImportedCase[] = [];
  for (const entry of cases) {
    if (typeof entry !== 'object' || entry === null) return null;
    const row = entry as Record<string, unknown>;
    const name = row['name'];
    const steps = row['steps'];
    if (typeof name !== 'string') return null;
    if (!Array.isArray(steps)) return null;
    if (!steps.every((step) => typeof step === 'string')) return null;
    parsed.push({ name, steps: steps as string[] });
  }

  return { projectId, areaId, cases: parsed };
}

/** Blank lines are how someone separates steps while typing, not steps of
 * their own, so they are dropped rather than stored as empty rows. */
function normaliseSteps(steps: readonly string[]): string[] {
  return steps.map((step) => step.trim()).filter((step) => step.length > 0);
}

/**
 * Owns areas and test cases: what they are, what makes one valid, and the
 * rule that keeps them consistent - a case belongs to an area only if that
 * area is in the same project.
 *
 * Nothing here runs a test. A case is a written description of what should
 * happen, which is exactly what a manual tester already has; turning one
 * into a run is the engine work that isn't built.
 */
export class TestPlanService implements ProjectDataOwner {
  constructor(
    private readonly testPlanRepository: TestPlanRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly fileMirror: TestCaseFileMirror = new NoopTestCaseFileMirror(),
  ) {}

  public list(projectId: string): TestPlan {
    return {
      areas: this.testPlanRepository.getAreas(projectId),
      cases: this.testPlanRepository.getCases(projectId),
    };
  }

  public createArea(input: CreateAreaInput): AreaResult {
    if (!this.projectRepository.find(input.projectId)) {
      return { ok: false, error: 'PROJECT_NOT_FOUND' };
    }

    const name = input.name.trim();
    if (name.length === 0) {
      return { ok: false, error: 'NAME_REQUIRED' };
    }
    if (this.areaNameTaken(input.projectId, name, null)) {
      return { ok: false, error: 'AREA_ALREADY_EXISTS' };
    }

    const area: AreaRecord = {
      id: randomUUID(),
      projectId: input.projectId,
      name,
      createdAt: new Date().toISOString(),
    };

    this.testPlanRepository.addArea(area);
    return { ok: true, area };
  }

  public renameArea(input: RenameAreaInput): AreaResult {
    const existing = this.testPlanRepository.findArea(input.areaId);
    if (!existing) {
      return { ok: false, error: 'AREA_NOT_FOUND' };
    }

    const name = input.name.trim();
    if (name.length === 0) {
      return { ok: false, error: 'NAME_REQUIRED' };
    }
    if (this.areaNameTaken(existing.projectId, name, existing.id)) {
      return { ok: false, error: 'AREA_ALREADY_EXISTS' };
    }

    const area: AreaRecord = { ...existing, name };
    this.testPlanRepository.updateArea(area);
    return { ok: true, area };
  }

  public createCase(input: CreateTestCaseInput): TestCaseResult {
    if (!this.projectRepository.find(input.projectId)) {
      return { ok: false, error: 'PROJECT_NOT_FOUND' };
    }

    const name = input.name.trim();
    if (name.length === 0) {
      return { ok: false, error: 'NAME_REQUIRED' };
    }

    const steps = normaliseSteps(input.steps);
    if (steps.length === 0) {
      return { ok: false, error: 'STEPS_REQUIRED' };
    }

    if (!this.areaBelongsToProject(input.areaId, input.projectId)) {
      return { ok: false, error: 'AREA_NOT_FOUND' };
    }

    const testCase: TestCaseRecord = {
      id: randomUUID(),
      projectId: input.projectId,
      areaId: input.areaId,
      name,
      steps,
      createdAt: new Date().toISOString(),
      script: input.script ?? null,
    };

    this.testPlanRepository.addCase(testCase);
    this.mirrorWrite(testCase);
    return { ok: true, testCase };
  }

  /**
   * Writes a batch of cases, or none of them.
   *
   * Every row is validated before a single one is stored, so a bad row
   * halfway down a file cannot leave the first half imported. The caller
   * is looking at a preview of the whole batch when they press the
   * button; importing a prefix of what they approved is the one outcome
   * they have no way to reason about.
   */
  public importCases(input: ImportTestCasesInput): ImportTestCasesResult {
    if (!this.projectRepository.find(input.projectId)) {
      return { ok: false, error: 'PROJECT_NOT_FOUND' };
    }
    if (!this.areaBelongsToProject(input.areaId, input.projectId)) {
      return { ok: false, error: 'AREA_NOT_FOUND' };
    }
    if (input.cases.length === 0) {
      return { ok: false, error: 'NOTHING_TO_IMPORT' };
    }

    const prepared: TestCaseRecord[] = [];
    const createdAt = new Date().toISOString();

    for (const row of input.cases) {
      const name = row.name.trim();
      if (name.length === 0) {
        return { ok: false, error: 'NAME_REQUIRED' };
      }

      const steps = normaliseSteps(row.steps);
      if (steps.length === 0) {
        return { ok: false, error: 'STEPS_REQUIRED' };
      }

      prepared.push({
        id: randomUUID(),
        projectId: input.projectId,
        areaId: input.areaId,
        name,
        steps,
        createdAt,
        // Imported rows are always plain-language-only - see the type's
        // own doc on why only chat-generated and scan-suggested cases ever
        // get a script.
        script: null,
      });
    }

    for (const testCase of prepared) {
      this.testPlanRepository.addCase(testCase);
      this.mirrorWrite(testCase);
    }

    return { ok: true, cases: prepared };
  }

  public moveCase(input: MoveTestCaseInput): TestCaseResult {
    const existing = this.testPlanRepository.findCase(input.caseId);
    if (!existing) {
      return { ok: false, error: 'CASE_NOT_FOUND' };
    }
    if (!this.areaBelongsToProject(input.areaId, existing.projectId)) {
      return { ok: false, error: 'AREA_NOT_FOUND' };
    }

    const testCase: TestCaseRecord = { ...existing, areaId: input.areaId };
    this.testPlanRepository.updateCase(testCase);
    this.mirrorWrite(testCase);
    return { ok: true, testCase };
  }

  /** ProjectDataOwner: the plan goes when the project it describes does. */
  public removeAllForProject(projectId: string): void {
    this.testPlanRepository.removeAllForProject(projectId);
  }

  public deleteCase(caseId: string): DeleteTestCaseResult {
    const existing = this.testPlanRepository.findCase(caseId);
    if (!existing) {
      return { ok: false, error: 'CASE_NOT_FOUND' };
    }

    this.testPlanRepository.removeCase(caseId);
    this.mirrorRemove(existing);
    return { ok: true, caseId };
  }

  /**
   * Best-effort, fire-and-forget: mirrors a written/moved case into the
   * project's chosen folder, if it has one. Never awaited by the caller -
   * a case is fully saved in the app's own store the moment this method is
   * reached, and the mirror (see TestCaseFileMirror) already swallows its
   * own failures, so there is nothing here worth blocking a response on.
   */
  private mirrorWrite(testCase: TestCaseRecord): void {
    const project = this.projectRepository.find(testCase.projectId);
    if (!project?.testCaseFolderPath) return;
    void this.fileMirror.writeCase(project.testCaseFolderPath, testCase);
  }

  private mirrorRemove(testCase: TestCaseRecord): void {
    const project = this.projectRepository.find(testCase.projectId);
    if (!project?.testCaseFolderPath) return;
    void this.fileMirror.removeCase(project.testCaseFolderPath, testCase.id);
  }

  /**
   * Area names are compared case-insensitively. Two folders called
   * "Checkout" and "checkout" in the same sidebar are a mistake every
   * time, and the sidebar gives no way to tell which case you are
   * looking at once they are both there.
   */
  private areaNameTaken(projectId: string, name: string, exceptAreaId: string | null): boolean {
    const wanted = name.toLowerCase();
    return this.testPlanRepository
      .getAreas(projectId)
      .some((area) => area.id !== exceptAreaId && area.name.toLowerCase() === wanted);
  }

  /** Null means Unsorted, which every project has and nobody owns. */
  private areaBelongsToProject(areaId: string | null, projectId: string): boolean {
    if (areaId === null) return true;
    const area = this.testPlanRepository.findArea(areaId);
    return area !== undefined && area.projectId === projectId;
  }
}
