import { create } from 'zustand';
import type { AddMcpServerInput, McpServerEntry, McpServerErrorCode } from '@shared/ipc-contract';
import { autoaiClient } from '../lib/autoaiClient';

interface McpServersStoreState {
  servers: McpServerEntry[];
  loaded: boolean;
  adding: boolean;
  lastError: McpServerErrorCode | null;
  load: () => Promise<void>;
  add: (input: AddMcpServerInput) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  clearError: () => void;
}

/** The user's own MCP servers, reachable only from Ask AutoAI - see
 *  McpServerService's own doc comment for why. Same shape as
 *  useModelPreferenceStore: one store, loaded once, re-read after every
 *  mutation so the list always reflects what main actually persisted. */
export const useMcpServersStore = create<McpServersStoreState>((set, get) => ({
  servers: [],
  loaded: false,
  adding: false,
  lastError: null,

  load: async () => {
    const servers = await autoaiClient.mcpServers.list();
    set({ servers, loaded: true });
  },

  add: async (input) => {
    set({ adding: true, lastError: null });
    const result = await autoaiClient.mcpServers.add(input);
    if (!result.ok) {
      set({ adding: false, lastError: result.error });
      return false;
    }
    set({ servers: [...get().servers, result.server], adding: false });
    return true;
  },

  remove: async (id) => {
    await autoaiClient.mcpServers.remove(id);
    set({ servers: get().servers.filter((s) => s.id !== id) });
  },

  clearError: () => set({ lastError: null }),
}));
