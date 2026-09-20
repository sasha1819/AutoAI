import { describe, expect, it } from 'vitest';
import type { UrlFetcher } from '../src/main/services/UrlReachabilityChecker';
import { UrlReachabilityChecker } from '../src/main/services/UrlReachabilityChecker';

describe('UrlReachabilityChecker.check', () => {
  it('reports reachable with the real status code on a successful response', async () => {
    const fetcher: UrlFetcher = { fetch: async () => ({ status: 200 }) };
    const checker = new UrlReachabilityChecker(fetcher);

    const result = await checker.check('http://localhost:8000');

    expect(result).toEqual({ reachable: true, status: 200 });
  });

  it('still reports reachable for a non-2xx status - something answered, that is the whole question', async () => {
    const fetcher: UrlFetcher = { fetch: async () => ({ status: 404 }) };
    const checker = new UrlReachabilityChecker(fetcher);

    const result = await checker.check('http://localhost:8000/missing');

    expect(result).toEqual({ reachable: true, status: 404 });
  });

  it('reports not reachable when the fetch rejects (connection refused)', async () => {
    const fetcher: UrlFetcher = {
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    };
    const checker = new UrlReachabilityChecker(fetcher);

    const result = await checker.check('http://localhost:9999');

    expect(result).toEqual({ reachable: false, status: null });
  });

  it('reports not reachable on an abort/timeout', async () => {
    const fetcher: UrlFetcher = {
      fetch: async () => {
        throw new DOMException('The operation was aborted.', 'TimeoutError');
      },
    };
    const checker = new UrlReachabilityChecker(fetcher);

    const result = await checker.check('http://localhost:8000');

    expect(result).toEqual({ reachable: false, status: null });
  });
});
