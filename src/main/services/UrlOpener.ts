import { shell } from 'electron';
import type { UrlOpenResult } from '@shared/ipc-contract';

/** What UrlOpener needs from Electron - kept separate so it's testable
 *  without a real OS browser launching in the test suite. */
export interface ExternalOpener {
  openExternal(url: string): Promise<void>;
}

export class ElectronExternalOpener implements ExternalOpener {
  public openExternal(url: string): Promise<void> {
    return shell.openExternal(url);
  }
}

/**
 * Opens a URL in the OS default browser - the one thing AutoAI never did
 * automatically even after auto-filling a project's URL from a real
 * running server. Refuses anything that isn't plain http(s): a project's
 * own proposed URL is grounded in a real allowlisted start command, but
 * this is still the one place a string reaches `shell.openExternal`, so it
 * never trusts the scheme blindly.
 */
export class UrlOpener {
  constructor(private readonly opener: ExternalOpener) {}

  public async open(url: string): Promise<UrlOpenResult> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: 'INVALID_URL' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'INVALID_URL' };
    }

    try {
      await this.opener.openExternal(url);
      return { ok: true };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, error: 'OPEN_FAILED', detail };
    }
  }
}
