import { beforeEach, describe, expect, it } from 'vitest';
import type { AutoaiApi, SystemToolInstallResult } from '../src/shared/ipc-contract';

/** Same shape as the other renderer-store suites: `autoaiClient` captures
 * `window.autoai` once at module load, so the fake bridge has to be in
 * place before the store is imported - hence the dynamic import below. */
interface Bridge {
  install: (binary: string) => Promise<SystemToolInstallResult>;
}

const bridge: Bridge = {
  install: async () => ({ ok: true, nowPresent: true, output: 'installed' }),
};

const fakeApi = {
  systemTool: {
    install: (binary: string) => bridge.install(binary),
  },
} as unknown as AutoaiApi;

(globalThis as { window?: unknown }).window = { autoai: fakeApi };

const { useSystemToolStore } = await import('../src/renderer/src/state/useSystemToolStore');

function transportFailure(): never {
  throw new Error("No handler registered for 'system-tool:install'");
}

describe('useSystemToolStore', () => {
  beforeEach(() => {
    bridge.install = async () => ({ ok: true, nowPresent: true, output: 'installed' });
    useSystemToolStore.setState({ byBinary: {} });
  });

  it('records success and the real output for the installed binary', async () => {
    bridge.install = async () => ({ ok: true, nowPresent: true, output: '==> Installing php' });

    const nowPresent = await useSystemToolStore.getState().install('php');

    expect(nowPresent).toBe(true);
    expect(useSystemToolStore.getState().byBinary['php']).toEqual({
      installing: false,
      error: null,
      detail: null,
      output: '==> Installing php',
      nowPresent: true,
    });
  });

  it('marks not-present when brew ran but the binary still cannot be found', async () => {
    bridge.install = async () => ({ ok: true, nowPresent: false, output: 'done, but odd' });

    const nowPresent = await useSystemToolStore.getState().install('ruby');

    expect(nowPresent).toBe(false);
    expect(useSystemToolStore.getState().byBinary['ruby']?.nowPresent).toBe(false);
  });

  it('records a refusal error without touching other binaries in progress', async () => {
    useSystemToolStore.setState({
      byBinary: { python: { installing: false, error: null, detail: null, output: 'ok', nowPresent: true } },
    });
    bridge.install = async () => ({ ok: false, error: 'BREW_NOT_FOUND', detail: 'Homebrew was not found.' });

    const nowPresent = await useSystemToolStore.getState().install('php');

    expect(nowPresent).toBe(false);
    const state = useSystemToolStore.getState();
    expect(state.byBinary['php']).toEqual({
      installing: false,
      error: 'BREW_NOT_FOUND',
      detail: 'Homebrew was not found.',
      output: null,
      nowPresent: false,
    });
    expect(state.byBinary['python']?.nowPresent).toBe(true);
  });

  it('reports a transport failure as INSTALL_FAILED rather than throwing', async () => {
    bridge.install = transportFailure;

    const nowPresent = await useSystemToolStore.getState().install('dotnet');

    expect(nowPresent).toBe(false);
    expect(useSystemToolStore.getState().byBinary['dotnet']?.error).toBe('INSTALL_FAILED');
  });

  it('sets installing true while the call is in flight', async () => {
    let release = (): void => undefined;
    bridge.install = () =>
      new Promise<SystemToolInstallResult>((resolve) => {
        release = () => resolve({ ok: true, nowPresent: true, output: '' });
      });

    const pending = useSystemToolStore.getState().install('composer');

    expect(useSystemToolStore.getState().byBinary['composer']?.installing).toBe(true);

    release();
    await pending;

    expect(useSystemToolStore.getState().byBinary['composer']?.installing).toBe(false);
  });
});
