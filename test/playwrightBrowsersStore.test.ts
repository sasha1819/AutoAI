import { beforeEach, describe, expect, it } from 'vitest';
import type { AutoaiApi, PlaywrightBrowserInstallResult } from '../src/shared/ipc-contract';

/** Same shape as the other renderer-store suites: `autoaiClient` captures
 * `window.autoai` once at module load, so the fake bridge has to be in
 * place before the store is imported - hence the dynamic import below. */
interface Bridge {
  install: () => Promise<PlaywrightBrowserInstallResult>;
}

const bridge: Bridge = {
  install: async () => ({ ok: true, nowPresent: true, output: 'installed' }),
};

const fakeApi = {
  playwrightBrowsers: {
    install: () => bridge.install(),
  },
} as unknown as AutoaiApi;

(globalThis as { window?: unknown }).window = { autoai: fakeApi };

const { usePlaywrightBrowsersStore } = await import('../src/renderer/src/state/usePlaywrightBrowsersStore');

function transportFailure(): never {
  throw new Error("No handler registered for 'playwright-browsers:install'");
}

describe('usePlaywrightBrowsersStore', () => {
  beforeEach(() => {
    bridge.install = async () => ({ ok: true, nowPresent: true, output: 'installed' });
    usePlaywrightBrowsersStore.setState({ installing: false, error: null, detail: null, output: null, nowPresent: false });
  });

  it('records success and the real output', async () => {
    bridge.install = async () => ({ ok: true, nowPresent: true, output: 'downloaded chromium' });

    const nowPresent = await usePlaywrightBrowsersStore.getState().install();

    expect(nowPresent).toBe(true);
    const state = usePlaywrightBrowsersStore.getState();
    expect(state).toMatchObject({
      installing: false,
      error: null,
      detail: null,
      output: 'downloaded chromium',
      nowPresent: true,
    });
  });

  it('marks not-present when the install ran but the browser still cannot be found', async () => {
    bridge.install = async () => ({ ok: true, nowPresent: false, output: 'done, but odd' });

    const nowPresent = await usePlaywrightBrowsersStore.getState().install();

    expect(nowPresent).toBe(false);
    expect(usePlaywrightBrowsersStore.getState().nowPresent).toBe(false);
  });

  it('records a refusal error', async () => {
    bridge.install = async () => ({ ok: false, error: 'INSTALL_FAILED', detail: 'network error' });

    const nowPresent = await usePlaywrightBrowsersStore.getState().install();

    expect(nowPresent).toBe(false);
    const state = usePlaywrightBrowsersStore.getState();
    expect(state.error).toBe('INSTALL_FAILED');
    expect(state.detail).toBe('network error');
  });

  it('reports a transport failure as INSTALL_FAILED rather than throwing', async () => {
    bridge.install = transportFailure;

    const nowPresent = await usePlaywrightBrowsersStore.getState().install();

    expect(nowPresent).toBe(false);
    expect(usePlaywrightBrowsersStore.getState().error).toBe('INSTALL_FAILED');
  });

  it('sets installing true while the call is in flight', async () => {
    let release = (): void => undefined;
    bridge.install = () =>
      new Promise<PlaywrightBrowserInstallResult>((resolve) => {
        release = () => resolve({ ok: true, nowPresent: true, output: '' });
      });

    const pending = usePlaywrightBrowsersStore.getState().install();

    expect(usePlaywrightBrowsersStore.getState().installing).toBe(true);

    release();
    await pending;

    expect(usePlaywrightBrowsersStore.getState().installing).toBe(false);
  });
});
