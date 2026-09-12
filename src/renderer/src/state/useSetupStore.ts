import { create } from 'zustand';
import type { SetupErrorCode, SetupRunResultData } from '@shared/ipc-contract';
import { autoaiClient } from '../lib/autoaiClient';

interface SetupStoreState {
  /** Which project `result` belongs to - same reasoning as useScanStore: the
   *  project screen stays mounted across a navigation between two projects. */
  projectId: string | null;
  result: SetupRunResultData | null;
  /** The setup request itself is in flight - distinct from `serverRunning`,
   *  which is about the process the last run started. */
  running: boolean;
  /** Set from the last successful result's `start.status === 'started'`, and
   *  cleared by `stop()` - there is no push channel to keep this in sync
   *  with reality across app restarts (see the plan's "no live-streaming
   *  log" decision), so it only reflects what this session has seen. */
  serverRunning: boolean;
  stopping: boolean;
  lastError: SetupErrorCode | null;
  lastErrorDetail: string | null;
  run: (projectId: string) => Promise<boolean>;
  stop: (projectId: string) => Promise<void>;
  clearError: () => void;
}

/**
 * "Set up this project", made real: one batch approval that runs the scan's
 * proposed install commands and start command - see ProjectSetupService.
 */
export const useSetupStore = create<SetupStoreState>((set) => ({
  projectId: null,
  result: null,
  running: false,
  serverRunning: false,
  stopping: false,
  lastError: null,
  lastErrorDetail: null,

  run: async (projectId) => {
    set({ running: true, lastError: null, lastErrorDetail: null });
    try {
      const outcome = await autoaiClient.setup.run(projectId);
      if (!outcome.ok) {
        set({ running: false, lastError: outcome.error, lastErrorDetail: outcome.detail ?? null });
        return false;
      }
      set({
        running: false,
        projectId,
        result: outcome.result,
        serverRunning: outcome.result.start?.status === 'started',
        lastError: null,
        lastErrorDetail: null,
      });
      return true;
    } catch {
      set({
        running: false,
        lastError: 'INSTALL_FAILED',
        lastErrorDetail: 'The request itself could not reach the main process.',
      });
      return false;
    }
  },

  stop: async (projectId) => {
    set({ stopping: true });
    try {
      await autoaiClient.setup.stop(projectId);
    } finally {
      set({ stopping: false, serverRunning: false });
    }
  },

  clearError: () => set({ lastError: null, lastErrorDetail: null }),
}));
