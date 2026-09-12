import { create } from 'zustand';
import type { RunErrorCode, RunRecord } from '@shared/ipc-contract';
import { autoaiClient } from '../lib/autoaiClient';

interface RunStoreState {
  /** Every run this session has loaded or produced, keyed by the case it
   *  ran - only the most recent run per case is kept in memory (enough for
   *  TestCaseDetail and the project's RunStrip), not a full history. */
  runsByCase: Record<string, RunRecord>;
  /** The full run history across every project, for RunsScreen - unlike
   *  `runsByCase` this is not deduplicated per case. */
  allRuns: RunRecord[];
  running: boolean;
  lastError: RunErrorCode | null;
  lastErrorDetail: string | null;
  /** Runs one case for real and records the outcome, replacing whatever run
   *  was previously known for it. */
  run: (caseId: string) => Promise<RunRecord | null>;
  /** Loads every run for a project and folds each case's most recent one
   *  into `runsByCase`, so reopening a project shows its last results
   *  instead of nothing. */
  loadForProject: (projectId: string) => Promise<void>;
  /** Loads every run across every project, newest first, for RunsScreen. */
  loadAll: () => Promise<void>;
  clearError: () => void;
}

/** Keeps only the newest run per case id - `runs` is expected newest-last
 *  (creation order), same as every other list this app persists. */
function latestPerCase(runs: readonly RunRecord[]): Record<string, RunRecord> {
  const byCase: Record<string, RunRecord> = {};
  for (const run of runs) {
    byCase[run.caseId] = run;
  }
  return byCase;
}

/**
 * Real Playwright run results for the project currently open. Per-case
 * only - there is no "run all" in this pass, so this store never tracks
 * more than one in-flight run at a time.
 */
export const useRunStore = create<RunStoreState>((set) => ({
  runsByCase: {},
  allRuns: [],
  running: false,
  lastError: null,
  lastErrorDetail: null,

  run: async (caseId) => {
    set({ running: true, lastError: null, lastErrorDetail: null });
    try {
      const outcome = await autoaiClient.runs.run(caseId);
      if (!outcome.ok) {
        set({ running: false, lastError: outcome.error, lastErrorDetail: outcome.detail ?? null });
        return null;
      }
      set((state) => ({
        running: false,
        runsByCase: { ...state.runsByCase, [caseId]: outcome.run },
      }));
      return outcome.run;
    } catch {
      set({ running: false, lastError: 'RUN_FAILED', lastErrorDetail: 'The run itself could not reach the main process.' });
      return null;
    }
  },

  loadForProject: async (projectId) => {
    try {
      const runs = await autoaiClient.runs.listForProject(projectId);
      set({ runsByCase: latestPerCase(runs) });
    } catch {
      // A failed load leaves whatever was already known in place - the
      // same "don't erase a good state over a transport hiccup" reasoning
      // as every other store's read path in this app.
    }
  },

  loadAll: async () => {
    try {
      const runs = await autoaiClient.runs.listAll();
      set({ allRuns: [...runs].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)) });
    } catch {
      // Same "leave what's known in place" reasoning as loadForProject.
    }
  },

  clearError: () => set({ lastError: null, lastErrorDetail: null }),
}));
