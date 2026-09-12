import Store from 'electron-store';
import type { Project } from '@shared/ipc-contract';

interface StoreSchema {
  projects: Project[];
}

export interface ProjectRepository {
  list(): Project[];
  add(project: Project): void;
  update(id: string, patch: Partial<Project>): Project | null;
  remove(id: string): void;
  find(id: string): Project | null;
}

/** Same pattern as ProfileStore: dumb persistence, no business logic. */
export class ProjectStore implements ProjectRepository {
  private readonly store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({ name: 'autoai-projects', defaults: { projects: [] } });
  }

  public list(): Project[] {
    return this.store.get('projects', []);
  }

  public find(id: string): Project | null {
    return this.list().find((p) => p.id === id) ?? null;
  }

  public add(project: Project): void {
    this.store.set('projects', [...this.list(), project]);
  }

  public update(id: string, patch: Partial<Project>): Project | null {
    let updated: Project | null = null;
    const next = this.list().map((p) => {
      if (p.id !== id) return p;
      updated = { ...p, ...patch };
      return updated;
    });
    this.store.set('projects', next);
    return updated;
  }

  public remove(id: string): void {
    this.store.set('projects', this.list().filter((p) => p.id !== id));
  }
}
