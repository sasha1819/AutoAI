import Store from 'electron-store';
import type { AreaRecord, TestCaseRecord } from '@shared/ipc-contract';

interface StoreSchema {
  areas: AreaRecord[];
  cases: TestCaseRecord[];
}

/**
 * What TestPlanService depends on, kept separate from the electron-store
 * class so the service can be tested without an Electron runtime - the
 * same seam as ProfileRepository/ProfileStore and ProjectRepository.
 *
 * Areas and cases live behind one interface because every write to either
 * has to be able to see the other: a case can only join an area in its own
 * project, so there is no useful boundary between them.
 */
export interface TestPlanRepository {
  getAreas(projectId: string): AreaRecord[];
  getCases(projectId: string): TestCaseRecord[];
  findArea(areaId: string): AreaRecord | undefined;
  findCase(caseId: string): TestCaseRecord | undefined;
  addArea(area: AreaRecord): void;
  addCase(testCase: TestCaseRecord): void;
  updateArea(area: AreaRecord): void;
  updateCase(testCase: TestCaseRecord): void;
  removeCase(caseId: string): void;
  /** Drops every area and case belonging to a project, for when the
   * project itself is deleted. */
  removeAllForProject(projectId: string): void;
}

/**
 * The test plan on its own JSON file, separate from projects and from auth
 * data. A project record is a handful of fields that rarely change; a test
 * plan is the part that grows with use, so it gets its own file rather
 * than making every project read rewrite the cases with it.
 *
 * No validation happens here - see TestPlanService.
 */
export class TestPlanStore implements TestPlanRepository {
  private readonly store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'autoai-testplan',
      defaults: { areas: [], cases: [] },
    });
  }

  public getAreas(projectId: string): AreaRecord[] {
    return this.store.get('areas').filter((a) => a.projectId === projectId);
  }

  public getCases(projectId: string): TestCaseRecord[] {
    return this.store.get('cases').filter((c) => c.projectId === projectId);
  }

  public findArea(areaId: string): AreaRecord | undefined {
    return this.store.get('areas').find((a) => a.id === areaId);
  }

  public findCase(caseId: string): TestCaseRecord | undefined {
    return this.store.get('cases').find((c) => c.id === caseId);
  }

  public addArea(area: AreaRecord): void {
    this.store.set('areas', [...this.store.get('areas'), area]);
  }

  public addCase(testCase: TestCaseRecord): void {
    this.store.set('cases', [...this.store.get('cases'), testCase]);
  }

  public updateArea(area: AreaRecord): void {
    this.store.set(
      'areas',
      this.store.get('areas').map((a) => (a.id === area.id ? area : a)),
    );
  }

  public updateCase(testCase: TestCaseRecord): void {
    this.store.set(
      'cases',
      this.store.get('cases').map((c) => (c.id === testCase.id ? testCase : c)),
    );
  }

  public removeCase(caseId: string): void {
    this.store.set(
      'cases',
      this.store.get('cases').filter((c) => c.id !== caseId),
    );
  }

  public removeAllForProject(projectId: string): void {
    this.store.set(
      'areas',
      this.store.get('areas').filter((a) => a.projectId !== projectId),
    );
    this.store.set(
      'cases',
      this.store.get('cases').filter((c) => c.projectId !== projectId),
    );
  }
}
