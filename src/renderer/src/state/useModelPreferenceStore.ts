import { create } from 'zustand';
import type { ModelPreference } from '@shared/ipc-contract';
import { autoaiClient } from '../lib/autoaiClient';

interface ModelPreferenceStoreState {
  preference: ModelPreference;
  loaded: boolean;
  saving: boolean;
  load: () => Promise<void>;
  setModel: (model: string | null) => Promise<void>;
  setEffort: (effort: ModelPreference['effort']) => Promise<void>;
}

/** Which Claude model/effort every Agent SDK call in this app currently
 *  uses - null fields mean "the claude CLI's own account default," the
 *  same meaning ModelPreferenceStore gives them in main. Settings is the
 *  only screen that reads/writes this today. */
export const useModelPreferenceStore = create<ModelPreferenceStoreState>((set, get) => ({
  preference: { model: null, effort: null },
  loaded: false,
  saving: false,

  load: async () => {
    const preference = await autoaiClient.claude.getModelPreference();
    set({ preference, loaded: true });
  },

  setModel: async (model) => {
    set({ saving: true });
    const preference = await autoaiClient.claude.setModelPreference({ model, effort: get().preference.effort });
    set({ preference, saving: false });
  },

  setEffort: async (effort) => {
    set({ saving: true });
    const preference = await autoaiClient.claude.setModelPreference({ model: get().preference.model, effort });
    set({ preference, saving: false });
  },
}));
