import type { UrlReachabilityResult } from '@shared/ipc-contract';

const TIMEOUT_MS = 5000;

/** What UrlReachabilityChecker needs from the outside world - kept separate
 *  so a test can fake a slow/failing/successful response without a real
 *  network call, same seam as EnvironmentProbe/ProcessSpawner elsewhere. */
export interface UrlFetcher {
  fetch(url: string, init: { signal: AbortSignal }): Promise<{ status: number }>;
}

class NodeUrlFetcher implements UrlFetcher {
  public fetch(url: string, init: { signal: AbortSignal }): Promise<{ status: number }> {
    return fetch(url, { method: 'GET', signal: init.signal });
  }
}

/**
 * "Is anything even listening at this URL" - a plain HTTP request with a
 * short timeout, nothing else. Deliberately not a Playwright launch: this
 * answers a narrower, much cheaper question (does a real server exist)
 * without needing browsers installed at all, distinct from TestRunnerService
 * actually exercising a script against the page.
 */
export class UrlReachabilityChecker {
  constructor(private readonly fetcher: UrlFetcher = new NodeUrlFetcher()) {}

  public async check(url: string): Promise<UrlReachabilityResult> {
    try {
      const response = await this.fetcher.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      return { reachable: true, status: response.status };
    } catch {
      return { reachable: false, status: null };
    }
  }
}
