import { create } from 'zustand';
import type { AssistantErrorCode } from '@shared/ipc-contract';
import { autoaiClient } from '../lib/autoaiClient';

export interface AssistantChatMessage {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

interface AssistantStoreState {
  messages: AssistantChatMessage[];
  sessionId: string | null;
  sending: boolean;
  lastError: AssistantErrorCode | null;
  lastErrorDetail: string | null;
  /** Set when the assistant used its `open_project_setup` tool - consumed
   *  by the dock to navigate there, then cleared. Not a navigation the
   *  assistant performs itself; the renderer owns all navigation. */
  pendingOpenProjectId: string | null;
  send: (text: string) => Promise<void>;
  clearPendingOpen: () => void;
  clearError: () => void;
}

/**
 * "Ask AutoAI" - a persistent bottom dock available from anywhere in the
 * app, distinct from CaseChatCard's project-scoped case generation. Always
 * mounted, nothing to open or close. Not persisted across app restarts in
 * this pass, same as the plan states.
 */
export const useAssistantStore = create<AssistantStoreState>((set, get) => ({
  messages: [],
  sessionId: null,
  sending: false,
  lastError: null,
  lastErrorDetail: null,
  pendingOpenProjectId: null,

  send: async (text) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;

    set((state) => ({
      messages: [...state.messages, { role: 'user', text: trimmed }],
      sending: true,
      lastError: null,
      lastErrorDetail: null,
    }));

    try {
      const outcome = await autoaiClient.assistant.send(trimmed, get().sessionId);
      if (!outcome.ok) {
        set({ sending: false, lastError: outcome.error, lastErrorDetail: outcome.detail ?? null });
        return;
      }
      set((state) => ({
        sending: false,
        sessionId: outcome.reply.sessionId,
        messages: [...state.messages, { role: 'assistant', text: outcome.reply.text }],
        pendingOpenProjectId: outcome.reply.openProjectSetupId,
      }));
    } catch {
      set({
        sending: false,
        lastError: 'ASSISTANT_FAILED',
        lastErrorDetail: 'The request itself could not reach the main process.',
      });
    }
  },

  clearPendingOpen: () => set({ pendingOpenProjectId: null }),
  clearError: () => set({ lastError: null, lastErrorDetail: null }),
}));
