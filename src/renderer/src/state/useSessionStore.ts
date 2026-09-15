import { create } from 'zustand';
import type { AuthErrorCode, LoginInput, RegisterInput, SessionState, UserRole } from '@shared/ipc-contract';
import { autoaiClient } from '../lib/autoaiClient';

export type BootstrapStage =
  | 'loading'
  | 'welcome'
  | 'needs-registration'
  | 'needs-login'
  | 'needs-onboarding'
  | 'ready';

interface SessionStoreState {
  stage: BootstrapStage;
  session: SessionState | null;
  lastError: AuthErrorCode | null;
  /** Whether Welcome has already been stepped past this run - kept so a
   * failed registration attempt (which reloads nothing, just re-renders)
   * doesn't bounce someone back to Welcome on the next bootstrap check. */
  welcomeDismissed: boolean;
  bootstrap: () => Promise<void>;
  /** Welcome -> registration. A store action rather than local screen
   * state, same reasoning as everywhere else in this gate: `stage` stays
   * the one thing that decides which screen is on screen. */
  startRegistration: () => void;
  /** Registration -> Welcome. Resets `welcomeDismissed` too, so a reload
   * from here lands back on Welcome instead of skipping it - the flag
   * tracks what's actually on screen, not just "has this run ever seen
   * Welcome". Also clears a failed-registration error, which belongs to
   * the screen being left, not the one being returned to. */
  backToWelcome: () => void;
  register: (input: RegisterInput) => Promise<boolean>;
  login: (input: LoginInput) => Promise<boolean>;
  logout: () => Promise<void>;
  setRole: (role: UserRole) => Promise<void>;
  clearError: () => void;
  /** Dev-only escape hatch: force `stage` directly, bypassing stageFor's
   *  real hasProfile/session computation. Only ever called from
   *  DevScreenSwitcher, which is itself compiled out of a production build
   *  by `import.meta.env.DEV` - this action existing in the store doesn't
   *  make it reachable, since nothing in the shipped UI ever calls it. */
  devSetStage: (stage: BootstrapStage) => void;
}

function stageFor(hasProfile: boolean, session: SessionState | null): BootstrapStage {
  if (!hasProfile) return 'needs-registration';
  if (!session) return 'needs-login';
  if (!session.onboardingCompleted) return 'needs-onboarding';
  return 'ready';
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  stage: 'loading',
  session: null,
  lastError: null,
  welcomeDismissed: false,

  bootstrap: async () => {
    const [hasProfile, session] = await Promise.all([
      autoaiClient.auth.hasProfile(),
      autoaiClient.session.getCurrent(),
    ]);
    // A profile already exists (login/onboarding/ready) or Welcome has
    // already been stepped past this run - stageFor decides the rest.
    // Only a genuinely first launch, with nothing on disk yet, opens on
    // Welcome instead of straight at the registration form.
    const stage = !hasProfile && !get().welcomeDismissed ? 'welcome' : stageFor(hasProfile, session);
    set({ stage, session });
  },

  startRegistration: () => set({ welcomeDismissed: true, stage: 'needs-registration' }),

  backToWelcome: () => set({ welcomeDismissed: false, stage: 'welcome', lastError: null }),

  register: async (input) => {
    const result = await autoaiClient.auth.register(input);
    if (!result.ok) {
      set({ lastError: result.error });
      return false;
    }
    set({ session: result.session, stage: stageFor(true, result.session), lastError: null });
    return true;
  },

  login: async (input) => {
    const result = await autoaiClient.auth.login(input);
    if (!result.ok) {
      set({ lastError: result.error });
      return false;
    }
    set({ session: result.session, stage: stageFor(true, result.session), lastError: null });
    return true;
  },

  logout: async () => {
    await autoaiClient.auth.logout();
    set({ session: null, stage: 'needs-login', lastError: null });
  },

  setRole: async (role) => {
    const result = await autoaiClient.onboarding.setRole(role);
    set({ session: result.session, stage: stageFor(true, result.session) });
  },

  clearError: () => set({ lastError: null }),

  devSetStage: (stage) => set({ stage }),
}));
