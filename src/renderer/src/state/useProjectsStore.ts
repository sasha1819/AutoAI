import { create } from 'zustand';
import type { AddProjectErrorCode, Project, TargetType } from '@shared/ipc-contract';
import { autoaiClient } from '../lib/autoaiClient';

interface ProjectsStoreState {
  projects: Project[];
  loaded: boolean;
  loading: boolean;
  /** A domain error the main process returned deliberately. */
  lastError: AddProjectErrorCode | null;
  lastErrorDetail: string | null;
  /** The IPC call itself failed - handler threw, or the channel isn't
   * registered (the classic symptom of main/preload not having been
   * restarted after a contract change). Kept separate from lastError
   * because it isn't the user's fault and isn't actionable by them. */
  transportFailed: boolean;
  load: () => Promise<void>;
  pickLocalFolder: () => Promise<string | null>;
  addFromGit: (input: { url: string; branch?: string; name?: string }) => Promise<Project | null>;
  addFromLocalPath: (input: { path: string; name?: string }) => Promise<Project | null>;
  /** Writes first, then updates the list from what main actually stored -
   * not optimistically. This is the field standing in for detection, so a
   * row showing a type that was never persisted is exactly the wrong
   * failure: the whole point of the control is that it tells the truth
   * about what AutoAI will use. */
  setOverride: (projectId: string, targetType: TargetType | null) => Promise<boolean>;
  /** Same not-optimistic, write-then-read-back pattern as setOverride. */
  setBaseUrl: (projectId: string, url: string | null) => Promise<boolean>;
  setTestCaseFolder: (projectId: string, path: string | null) => Promise<boolean>;
  /** True once the main process confirms the project (and, per
   * ProjectService.remove, its test plan) is gone - a caller can navigate
   * away on the strength of the answer rather than on hope. */
  remove: (projectId: string) => Promise<boolean>;
  clearError: () => void;
}

/**
 * One store for project data, read by every AppShell-based screen (the
 * permanent nav's own project count and "Recent" list included) so none of
 * them can disagree about what projects exist.
 *
 * Every autoaiClient call is wrapped: ipcRenderer.invoke rejects when the
 * main handler throws or the channel was never registered, and an
 * unguarded rejection here becomes an unhandled promise rejection with no
 * visible symptom beyond a control that silently does nothing.
 */
export const useProjectsStore = create<ProjectsStoreState>((set) => ({
  projects: [],
  loaded: false,
  loading: false,
  lastError: null,
  lastErrorDetail: null,
  transportFailed: false,

  load: async () => {
    try {
      const projects = await autoaiClient.projects.list();
      set({ projects, loaded: true, transportFailed: false });
    } catch {
      set({ loaded: true, transportFailed: true });
    }
  },

  pickLocalFolder: async () => {
    try {
      return await autoaiClient.projects.pickLocalFolder();
    } catch {
      set({ transportFailed: true });
      return null;
    }
  },

  addFromGit: async (input) => {
    set({ loading: true, lastError: null, lastErrorDetail: null, transportFailed: false });
    try {
      const result = await autoaiClient.projects.addFromGit(input);
      set({ loading: false });
      if (!result.ok) {
        set({ lastError: result.error, lastErrorDetail: result.detail ?? null });
        return null;
      }
      set((state) => ({ projects: [...state.projects, result.project] }));
      return result.project;
    } catch {
      set({ loading: false, transportFailed: true });
      return null;
    }
  },

  addFromLocalPath: async (input) => {
    set({ loading: true, lastError: null, lastErrorDetail: null, transportFailed: false });
    try {
      const result = await autoaiClient.projects.addFromLocalPath(input);
      set({ loading: false });
      if (!result.ok) {
        set({ lastError: result.error, lastErrorDetail: result.detail ?? null });
        return null;
      }
      set((state) => ({ projects: [...state.projects, result.project] }));
      return result.project;
    } catch {
      set({ loading: false, transportFailed: true });
      return null;
    }
  },

  setOverride: async (projectId, targetType) => {
    set({ transportFailed: false });
    try {
      const project = await autoaiClient.projects.setOverride(projectId, targetType);
      if (!project) return false;
      set((state) => ({
        projects: state.projects.map((p) => (p.id === project.id ? project : p)),
      }));
      return true;
    } catch {
      set({ transportFailed: true });
      return false;
    }
  },

  setBaseUrl: async (projectId, url) => {
    set({ transportFailed: false });
    try {
      const project = await autoaiClient.projects.setBaseUrl(projectId, url);
      if (!project) return false;
      set((state) => ({
        projects: state.projects.map((p) => (p.id === project.id ? project : p)),
      }));
      return true;
    } catch {
      set({ transportFailed: true });
      return false;
    }
  },

  setTestCaseFolder: async (projectId, path) => {
    set({ transportFailed: false });
    try {
      const project = await autoaiClient.projects.setTestCaseFolder(projectId, path);
      if (!project) return false;
      set((state) => ({
        projects: state.projects.map((p) => (p.id === project.id ? project : p)),
      }));
      return true;
    } catch {
      set({ transportFailed: true });
      return false;
    }
  },

  remove: async (projectId) => {
    set({ loading: true, transportFailed: false });
    try {
      await autoaiClient.projects.remove(projectId);
      set((state) => ({
        loading: false,
        projects: state.projects.filter((p) => p.id !== projectId),
      }));
      return true;
    } catch {
      set({ loading: false, transportFailed: true });
      return false;
    }
  },

  clearError: () => set({ lastError: null, lastErrorDetail: null, transportFailed: false }),
}));
