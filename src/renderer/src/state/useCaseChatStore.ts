import { create } from 'zustand';
import type { CaseGenerationErrorCode, SuggestedFlow } from '@shared/ipc-contract';
import { autoaiClient } from '../lib/autoaiClient';

interface CaseChatStoreState {
  /** The most recently generated flow, held locally as a preview - never
   *  persisted on its own. "Add as test case" is what turns it into a real
   *  TestCaseRecord, via the existing testPlan.createCase. */
  pendingFlow: SuggestedFlow | null;
  generating: boolean;
  lastError: CaseGenerationErrorCode | null;
  lastErrorDetail: string | null;
  generate: (projectId: string, prompt: string) => Promise<boolean>;
  /** Clears the preview once it has become a real test case, or the person
   *  starts a new request. */
  clearPending: () => void;
  clearError: () => void;
}

/**
 * The chat alternative to a project scan's suggested flows: one request in,
 * one SuggestedFlow preview out. Same shape family as useScanStore, scoped
 * down to a single flow rather than a whole project's worth.
 */
export const useCaseChatStore = create<CaseChatStoreState>((set) => ({
  pendingFlow: null,
  generating: false,
  lastError: null,
  lastErrorDetail: null,

  generate: async (projectId, prompt) => {
    set({ generating: true, lastError: null, lastErrorDetail: null });
    try {
      const outcome = await autoaiClient.caseGeneration.run(projectId, prompt);
      if (!outcome.ok) {
        set({ generating: false, lastError: outcome.error, lastErrorDetail: outcome.detail ?? null });
        return false;
      }
      set({ generating: false, pendingFlow: outcome.flow, lastError: null, lastErrorDetail: null });
      return true;
    } catch {
      set({
        generating: false,
        lastError: 'GENERATION_FAILED',
        lastErrorDetail: 'The request itself could not reach the main process.',
      });
      return false;
    }
  },

  clearPending: () => set({ pendingFlow: null }),
  clearError: () => set({ lastError: null, lastErrorDetail: null }),
}));
