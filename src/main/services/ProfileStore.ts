import Store from 'electron-store';

/**
 * The one thing that must never leave the main process: password hash +
 * salt live here and nowhere else. This type is intentionally NOT part of
 * the shared IPC contract - the renderer only ever sees a SessionState.
 */
export interface StoredProfile {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly passwordSalt: string;
  readonly loggedIn: boolean;
}

interface StoreSchema {
  profile: StoredProfile | undefined;
}

/**
 * What AuthService actually depends on. Kept separate from the concrete
 * ProfileStore class so tests can swap in an in-memory fake without pulling
 * in electron-store (which needs a real Electron runtime to resolve its
 * default storage path).
 */
export interface ProfileRepository {
  getRaw(): StoredProfile | undefined;
  save(profile: StoredProfile): void;
  setLoggedIn(loggedIn: boolean): void;
}

/**
 * Thin persistence layer over a local, encrypted-at-rest-by-the-OS-profile
 * JSON file (electron-store, scoped to userData). MVP supports exactly one
 * local profile per install - multi-profile switching can be added later
 * without changing this shape, since every read already goes through here.
 *
 * This class does no validation and no hashing - see AuthService for that.
 * Keeping it dumb means swapping the backing store later (e.g. to SQLite,
 * if project/run-history data outgrows a single JSON file) only touches
 * this one file.
 */
export class ProfileStore implements ProfileRepository {
  private readonly store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({ name: 'autoai-profile' });
  }

  public getRaw(): StoredProfile | undefined {
    return this.store.get('profile');
  }

  public hasProfile(): boolean {
    return this.getRaw() !== undefined;
  }

  public save(profile: StoredProfile): void {
    this.store.set('profile', profile);
  }

  public setLoggedIn(loggedIn: boolean): void {
    const current = this.getRaw();
    if (!current) return;
    this.save({ ...current, loggedIn });
  }
}
