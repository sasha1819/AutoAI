import { create } from 'zustand';
import type {
  AreaRecord,
  CreateTestCaseInput,
  ImportTestCasesInput,
  TestCaseRecord,
  TestPlanErrorCode,
} from '@shared/ipc-contract';
import { autoaiClient } from '../lib/autoaiClient';

interface TestPlanStoreState {
  /** Which project the loaded plan belongs to. The project screen is the
   * only reader, but it stays mounted across a navigation between two
   * projects, so without this the second project renders the first one's
   * cases for as long as the fetch takes. */
  projectId: string | null;
  areas: AreaRecord[];
  cases: TestCaseRecord[];
  loaded: boolean;
  saving: boolean;
  lastError: TestPlanErrorCode | null;
  /** The IPC call itself failed, rather than the main process deciding
   * against the request. Same split as the projects store. */
  transportFailed: boolean;
  load: (projectId: string) => Promise<void>;
  createArea: (projectId: string, name: string) => Promise<AreaRecord | null>;
  renameArea: (areaId: string, name: string) => Promise<boolean>;
  createCase: (input: CreateTestCaseInput) => Promise<TestCaseRecord | null>;
  moveCase: (caseId: string, areaId: string | null) => Promise<boolean>;
  deleteCase: (caseId: string) => Promise<boolean>;
  /** The cases that landed, or null if none did. All or nothing - see
   * TestPlanService.importCases. */
  importCases: (input: ImportTestCasesInput) => Promise<TestCaseRecord[] | null>;
  clearError: () => void;
}

/**
 * Areas and test cases for the project currently open.
 *
 * Every write reads its result back from the main process rather than
 * updating the list optimistically. A test case is the thing this whole
 * app exists to keep, so a row that shows a name which was never written
 * to disk is the one failure worth going out of the way to prevent.
 */
export const useTestPlanStore = create<TestPlanStoreState>((set, get) => ({
  projectId: null,
  areas: [],
  cases: [],
  loaded: false,
  saving: false,
  lastError: null,
  transportFailed: false,

  load: async (projectId) => {
    if (get().projectId !== projectId) {
      set({ projectId, areas: [], cases: [], loaded: false });
    }
    try {
      const plan = await autoaiClient.testPlan.list(projectId);
      set({
        projectId,
        areas: [...plan.areas],
        cases: [...plan.cases],
        loaded: true,
        transportFailed: false,
      });
    } catch {
      set({ projectId, loaded: true, transportFailed: true });
    }
  },

  createArea: async (projectId, name) => {
    set({ saving: true, transportFailed: false });
    try {
      const result = await autoaiClient.testPlan.createArea({ projectId, name });
      if (!result.ok) {
        set({ saving: false, lastError: result.error });
        return null;
      }
      set((state) => ({
        saving: false,
        lastError: null,
        areas: [...state.areas, result.area],
      }));
      return result.area;
    } catch {
      set({ saving: false, transportFailed: true });
      return null;
    }
  },

  renameArea: async (areaId, name) => {
    set({ saving: true, transportFailed: false });
    try {
      const result = await autoaiClient.testPlan.renameArea({ areaId, name });
      if (!result.ok) {
        set({ saving: false, lastError: result.error });
        return false;
      }
      set((state) => ({
        saving: false,
        lastError: null,
        areas: state.areas.map((a) => (a.id === result.area.id ? result.area : a)),
      }));
      return true;
    } catch {
      set({ saving: false, transportFailed: true });
      return false;
    }
  },

  createCase: async (input) => {
    set({ saving: true, transportFailed: false });
    try {
      const result = await autoaiClient.testPlan.createCase(input);
      if (!result.ok) {
        set({ saving: false, lastError: result.error });
        return null;
      }
      set((state) => ({
        saving: false,
        lastError: null,
        cases: [...state.cases, result.testCase],
      }));
      return result.testCase;
    } catch {
      set({ saving: false, transportFailed: true });
      return null;
    }
  },

  moveCase: async (caseId, areaId) => {
    set({ saving: true, transportFailed: false });
    try {
      const result = await autoaiClient.testPlan.moveCase({ caseId, areaId });
      if (!result.ok) {
        set({ saving: false, lastError: result.error });
        return false;
      }
      set((state) => ({
        saving: false,
        lastError: null,
        cases: state.cases.map((c) => (c.id === result.testCase.id ? result.testCase : c)),
      }));
      return true;
    } catch {
      set({ saving: false, transportFailed: true });
      return false;
    }
  },

  deleteCase: async (caseId) => {
    set({ saving: true, transportFailed: false });
    try {
      const result = await autoaiClient.testPlan.deleteCase(caseId);
      if (!result.ok) {
        set({ saving: false, lastError: result.error });
        return false;
      }
      set((state) => ({
        saving: false,
        lastError: null,
        cases: state.cases.filter((c) => c.id !== result.caseId),
      }));
      return true;
    } catch {
      set({ saving: false, transportFailed: true });
      return false;
    }
  },

  importCases: async (input) => {
    set({ saving: true, transportFailed: false });
    try {
      const result = await autoaiClient.testPlan.importCases(input);
      if (!result.ok) {
        set({ saving: false, lastError: result.error });
        return null;
      }
      set((state) => ({
        saving: false,
        lastError: null,
        cases: [...state.cases, ...result.cases],
      }));
      return [...result.cases];
    } catch {
      set({ saving: false, transportFailed: true });
      return null;
    }
  },

  clearError: () => set({ lastError: null, transportFailed: false }),
}));
