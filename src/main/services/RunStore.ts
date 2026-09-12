import Store from 'electron-store';
import type { RunRecord } from '@shared/ipc-contract';

interface StoreSchema {
  runs: RunRecord[];
}

export interface RunRepository {
  add(run: RunRecord): void;
  listForProject(projectId: string): RunRecord[];
  listAll(): RunRecord[];
  removeAllForProject(projectId: string): void;
}

/** Same dumb-persistence pattern as ProjectStore/TestPlanStore/ScanStore:
 *  one file, no business logic. Every run is kept (not just the latest per
 *  case), so RunsScreen's "newest first" list has real history to show. */
export class RunStore implements RunRepository {
  private readonly store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({ name: 'autoai-runs', defaults: { runs: [] } });
  }

  public add(run: RunRecord): void {
    this.store.set('runs', [...this.store.get('runs'), run]);
  }

  public listForProject(projectId: string): RunRecord[] {
    return this.store.get('runs').filter((r) => r.projectId === projectId);
  }

  public listAll(): RunRecord[] {
    return this.store.get('runs');
  }

  public removeAllForProject(projectId: string): void {
    this.store.set(
      'runs',
      this.store.get('runs').filter((r) => r.projectId !== projectId),
    );
  }
}
