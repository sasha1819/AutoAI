import { create } from 'zustand';
import type { SystemToolInstallErrorCode } from '@shared/ipc-contract';
import { autoaiClient } from '../lib/autoaiClient';

interface ToolInstallState {
  installing: boolean;
  error: SystemToolInstallErrorCode | null;
  detail: string | null;
  /** The last real output brew produced, shown so a failure is never a
   *  silent dead end - same "show the exact command, then the exact
   *  result" discipline as ProjectSetupCard's own run output. */
  output: string | null;
  nowPresent: boolean;
}

interface SystemToolStoreState {
  /** Keyed by binary (e.g. "php") - a card can have more than one missing,
   *  installable item at once, each with its own independent progress. */
  byBinary: Record<string, ToolInstallState>;
  /** Runs the real `brew install`, via main, for one binary already
   *  confirmed to be on SystemToolInstaller's closed allowlist. Returns
   *  whether the binary is present afterward, so the caller can refresh
   *  just that one checklist row without a fresh (paid) project scan. */
  install: (binary: string) => Promise<boolean>;
}

const IDLE: ToolInstallState = { installing: false, error: null, detail: null, output: null, nowPresent: false };

export const useSystemToolStore = create<SystemToolStoreState>((set) => ({
  byBinary: {},

  install: async (binary) => {
    set((s) => ({ byBinary: { ...s.byBinary, [binary]: { ...IDLE, installing: true } } }));
    try {
      const result = await autoaiClient.systemTool.install(binary);
      if (!result.ok) {
        set((s) => ({
          byBinary: {
            ...s.byBinary,
            [binary]: { installing: false, error: result.error, detail: result.detail ?? null, output: null, nowPresent: false },
          },
        }));
        return false;
      }
      set((s) => ({
        byBinary: {
          ...s.byBinary,
          [binary]: { installing: false, error: null, detail: null, output: result.output, nowPresent: result.nowPresent },
        },
      }));
      return result.nowPresent;
    } catch {
      set((s) => ({
        byBinary: {
          ...s.byBinary,
          [binary]: { installing: false, error: 'INSTALL_FAILED', detail: 'AutoAI could not reach the app to install this.', output: null, nowPresent: false },
        },
      }));
      return false;
    }
  },
}));
