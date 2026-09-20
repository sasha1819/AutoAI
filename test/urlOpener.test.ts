import { describe, expect, it } from 'vitest';
import type { ExternalOpener } from '../src/main/services/UrlOpener';
import { UrlOpener } from '../src/main/services/UrlOpener';

class FakeOpener implements ExternalOpener {
  public readonly opened: string[] = [];
  constructor(private readonly shouldThrow = false) {}

  async openExternal(url: string): Promise<void> {
    if (this.shouldThrow) throw new Error('denied');
    this.opened.push(url);
  }
}

describe('UrlOpener.open', () => {
  it('opens a real http URL', async () => {
    const opener = new FakeOpener();
    const urlOpener = new UrlOpener(opener);

    const result = await urlOpener.open('http://localhost:8000/taaza');

    expect(result).toEqual({ ok: true });
    expect(opener.opened).toEqual(['http://localhost:8000/taaza']);
  });

  it('opens a real https URL', async () => {
    const opener = new FakeOpener();
    const urlOpener = new UrlOpener(opener);

    const result = await urlOpener.open('https://example.com');

    expect(result).toEqual({ ok: true });
  });

  it('refuses a non-http(s) scheme without calling the opener', async () => {
    const opener = new FakeOpener();
    const urlOpener = new UrlOpener(opener);

    const result = await urlOpener.open('javascript:alert(1)');

    expect(result).toEqual({ ok: false, error: 'INVALID_URL' });
    expect(opener.opened).toEqual([]);
  });

  it('refuses a file:// URL', async () => {
    const opener = new FakeOpener();
    const urlOpener = new UrlOpener(opener);

    const result = await urlOpener.open('file:///etc/passwd');

    expect(result).toEqual({ ok: false, error: 'INVALID_URL' });
    expect(opener.opened).toEqual([]);
  });

  it('refuses a string that is not a URL at all', async () => {
    const opener = new FakeOpener();
    const urlOpener = new UrlOpener(opener);

    const result = await urlOpener.open('not a url');

    expect(result).toEqual({ ok: false, error: 'INVALID_URL' });
  });

  it('reports OPEN_FAILED when the OS opener itself throws', async () => {
    const opener = new FakeOpener(true);
    const urlOpener = new UrlOpener(opener);

    const result = await urlOpener.open('http://localhost:8000');

    expect(result).toEqual({ ok: false, error: 'OPEN_FAILED', detail: 'denied' });
  });
});
