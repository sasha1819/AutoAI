import Store from 'electron-store';
import type { ProjectScanResult } from '@shared/ipc-contract';

interface StoreSchema {
  scans: Record<string, ProjectScanResult>;
}

export interface ScanRepository {
  get(projectId: string): ProjectScanResult | null;
  set(projectId: string, result: ProjectScanResult): void;
  remove(projectId: string): void;
}

/** Same dumb-persistence pattern as ProjectStore/TestPlanStore: one file, no
 * business logic, keyed by project id so reopening a project shows its last
 * scan instead of nothing. */
export class ScanStore implements ScanRepository {
  private readonly store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({ name: 'autoai-scans', defaults: { scans: {} } });
  }

  public get(projectId: string): ProjectScanResult | null {
    return this.store.get('scans', {})[projectId] ?? null;
  }

  public set(projectId: string, result: ProjectScanResult): void {
    const scans = { ...this.store.get('scans', {}) };
    scans[projectId] = result;
    this.store.set('scans', scans);
  }

  public remove(projectId: string): void {
    const scans = { ...this.store.get('scans', {}) };
    delete scans[projectId];
    this.store.set('scans', scans);
  }
}
