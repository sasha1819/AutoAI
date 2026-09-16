import Store from 'electron-store';
import type { ModelPreference } from '@shared/ipc-contract';

interface StoreSchema {
  preference: ModelPreference;
}

const DEFAULT_PREFERENCE: ModelPreference = { model: null, effort: null };

export interface ModelPreferenceRepository {
  get(): ModelPreference;
  set(preference: ModelPreference): void;
}

/** Same dumb-persistence pattern as ScanStore/ProfileStore: one small file,
 *  no business logic. Null fields are the real, persisted meaning of "use
 *  the claude CLI's own account default" - not merely the absence of a
 *  choice, so `defaults` below is a real value, not a placeholder. */
export class ModelPreferenceStore implements ModelPreferenceRepository {
  private readonly store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({ name: 'autoai-model-preference', defaults: { preference: DEFAULT_PREFERENCE } });
  }

  public get(): ModelPreference {
    return this.store.get('preference', DEFAULT_PREFERENCE);
  }

  public set(preference: ModelPreference): void {
    this.store.set('preference', preference);
  }
}
