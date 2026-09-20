import { create } from 'zustand';
import type { ProjectScanResult, ScanErrorCode, TargetType } from '@shared/ipc-contract';
import { autoaiClient } from '../lib/autoaiClient';

interface ScanStoreState {
  /** Which project `result` belongs to - same reasoning as useTestPlanStore:
   *  the project screen stays mounted across a navigation between two
   *  projects, so without this the second project would render the first
   *  one's scan for as long as loadLast's fetch takes. */
  projectId: string | null;
  result: ProjectScanResult | null;
  scanning: boolean;
  lastError: ScanErrorCode | null;
  lastErrorDetail: string | null;
  /** The IPC call itself failed, rather than main deciding against the
   *  request. Same split as every other store in this app. */
  transportFailed: boolean;
  /** Non-null only right after a `run()` where main actually applied a
   *  target type it read from the project (see `ScanRunResult`'s own doc).
   *  Transient - read once by the caller to sync `useProjectsStore`, then
   *  irrelevant; not meant to be displayed on its own. */
  lastAppliedTargetType: TargetType | null;
  /** Runs a fresh scan and replaces `result` with what it found. */
  run: (projectId: string) => Promise<boolean>;
  /** Loads whatever was last persisted for this project, if anything - so
   *  reopening a project shows the last scan instead of nothing. */
  loadLast: (projectId: string) => Promise<void>;
  clearError: () => void;
  /** Flips one checklist row to present after a real SystemToolInstaller
   *  install confirmed it via its own probe - cheaper and faster than a
   *  fresh (paid, Claude-driven) scan just to refresh one line. */
  markToolInstalled: (binary: string) => void;
  /** Same idea as markToolInstalled, for the one "Playwright browsers" row
   *  - matched by name since that item has no installableBinary of its
   *  own (see PlaywrightBrowserInstaller). */
  markPlaywrightBrowsersInstalled: () => void;
}

/**
 * The last project scan - Claude's plain-language read, suggested test
 * flows, and the environment checklist - for the project currently open.
 */
export const useScanStore = create<ScanStoreState>((set, get) => ({
  projectId: null,
  result: null,
  scanning: false,
  lastError: null,
  lastErrorDetail: null,
  transportFailed: false,
  lastAppliedTargetType: null,

  loadLast: async (projectId) => {
    if (get().projectId !== projectId) {
      set({ projectId, result: null });
    }
    try {
      const result = await autoaiClient.scan.getLast(projectId);
      set({ projectId, result, transportFailed: false });
    } catch {
      set({ projectId, transportFailed: true });
    }
  },

  run: async (projectId) => {
    set({ scanning: true, lastError: null, lastErrorDetail: null, transportFailed: false });
    try {
      const outcome = await autoaiClient.scan.run(projectId);
      if (!outcome.ok) {
        set({ scanning: false, lastError: outcome.error, lastErrorDetail: outcome.detail ?? null });
        return false;
      }
      set({
        scanning: false,
        projectId,
        result: outcome.result,
        lastError: null,
        lastErrorDetail: null,
        lastAppliedTargetType: outcome.appliedTargetType,
      });
      return true;
    } catch {
      set({ scanning: false, transportFailed: true });
      return false;
    }
  },

  clearError: () => set({ lastError: null, lastErrorDetail: null, transportFailed: false }),

  markToolInstalled: (binary) => {
    const { result } = get();
    if (!result) return;
    set({
      result: {
        ...result,
        environment: result.environment.map((item) =>
          item.installableBinary === binary
            ? { ...item, present: true, installHint: null, installableBinary: null }
            : item,
        ),
      },
    });
  },

  markPlaywrightBrowsersInstalled: () => {
    const { result } = get();
    if (!result) return;
    set({
      result: {
        ...result,
        environment: result.environment.map((item) =>
          item.name === 'Playwright browsers'
            ? { ...item, present: true, installHint: null, installablePlaywrightBrowsers: false }
            : item,
        ),
      },
    });
  },
}));
