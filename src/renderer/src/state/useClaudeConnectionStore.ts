import { create } from 'zustand';
import { autoaiClient } from '../lib/autoaiClient';

interface ClaudeConnectionStoreState {
  connected: boolean;
  checking: boolean;
  lastCheckedAt: string | null;
  /** Why the last check failed, for the Settings screen's plain-language
   *  instructions. Null once connected, or before any check has run. */
  lastReason: 'NOT_LOGGED_IN' | 'SDK_ERROR' | null;
  lastDetail: string | null;
  check: () => Promise<boolean>;
}

/**
 * Whether a real `query()` call has succeeded against this machine's Claude
 * credentials - checked explicitly from Settings, never assumed. There is
 * no lightweight "am I connected" probe in the SDK, so this is a real
 * network round-trip every time `check()` runs, not a cached flag; `stage`
 * has nothing to do with it, and this store resets to unconnected on every
 * app launch by design - see ClaudeConnectionService.
 *
 * The Project screen's "Scan project" button reads `connected` to decide
 * whether scanning is even offered this session.
 */
export const useClaudeConnectionStore = create<ClaudeConnectionStoreState>((set) => ({
  connected: false,
  checking: false,
  lastCheckedAt: null,
  lastReason: null,
  lastDetail: null,

  check: async () => {
    set({ checking: true });
    try {
      const status = await autoaiClient.claude.checkConnection();
      if (status.connected) {
        set({
          checking: false,
          connected: true,
          lastCheckedAt: new Date().toISOString(),
          lastReason: null,
          lastDetail: null,
        });
        return true;
      }
      set({
        checking: false,
        connected: false,
        lastCheckedAt: new Date().toISOString(),
        lastReason: status.reason,
        lastDetail: status.detail ?? null,
      });
      return false;
    } catch {
      set({
        checking: false,
        connected: false,
        lastCheckedAt: new Date().toISOString(),
        lastReason: 'SDK_ERROR',
        lastDetail: 'The connection check itself could not reach the main process.',
      });
      return false;
    }
  },
}));
