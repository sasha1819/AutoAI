import { create } from 'zustand';
import type { PlaywrightBrowserInstallErrorCode } from '@shared/ipc-contract';
import { autoaiClient } from '../lib/autoaiClient';

interface PlaywrightBrowsersStoreState {
  installing: boolean;
  error: PlaywrightBrowserInstallErrorCode | null;
  detail: string | null;
  /** The last real output `npx playwright install` produced, same "show
   *  the exact result" discipline as useSystemToolStore. */
  output: string | null;
  nowPresent: boolean;
  /** Runs the real `npx playwright install`, via main, from AutoAI's own
   *  app directory - not keyed by anything, since there is exactly one
   *  such checklist item ever (unlike useSystemToolStore's byBinary map,
   *  which exists because several different binaries can be missing at
   *  once). Returns whether the browser is present afterward. */
  install: () => Promise<boolean>;
}

const IDLE = { installing: false, error: null, detail: null, output: null, nowPresent: false } as const;

export const usePlaywrightBrowsersStore = create<PlaywrightBrowsersStoreState>((set) => ({
  ...IDLE,

  install: async () => {
    set({ ...IDLE, installing: true });
    try {
      const result = await autoaiClient.playwrightBrowsers.install();
      if (!result.ok) {
        set({ installing: false, error: result.error, detail: result.detail ?? null, output: null, nowPresent: false });
        return false;
      }
      set({ installing: false, error: null, detail: null, output: result.output, nowPresent: result.nowPresent });
      return result.nowPresent;
    } catch {
      set({
        installing: false,
        error: 'INSTALL_FAILED',
        detail: 'AutoAI could not reach the app to install this.',
        output: null,
        nowPresent: false,
      });
      return false;
    }
  },
}));
