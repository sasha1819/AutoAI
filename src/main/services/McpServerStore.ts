import Store from 'electron-store';
import type { McpServerEntry } from '@shared/ipc-contract';

interface StoreSchema {
  servers: McpServerEntry[];
}

export interface McpServerRepository {
  list(): McpServerEntry[];
  add(server: McpServerEntry): void;
  remove(id: string): void;
}

/** Same dumb-persistence pattern as every other small store in this app -
 *  one file, no business logic (that's McpServerService). */
export class McpServerStore implements McpServerRepository {
  private readonly store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({ name: 'autoai-mcp-servers', defaults: { servers: [] } });
  }

  public list(): McpServerEntry[] {
    return this.store.get('servers', []);
  }

  public add(server: McpServerEntry): void {
    this.store.set('servers', [...this.store.get('servers', []), server]);
  }

  public remove(id: string): void {
    this.store.set(
      'servers',
      this.store.get('servers', []).filter((s) => s.id !== id),
    );
  }
}
