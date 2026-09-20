import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import type { EnvironmentProbe } from '../src/main/services/EnvironmentCheckService';
import { PlaywrightBrowserInstaller } from '../src/main/services/PlaywrightBrowserInstaller';
import type { DetachedProcessHandle, ProcessSpawner, RunToCompletionResult } from '../src/main/services/ProjectSetupService';

const APP_ROOT = '/fake/app/root';
const CHROMIUM_PATH = chromium.executablePath();

/** Records every command and cwd it was asked to run and returns a scripted
 * result - lets tests assert the exact command PlaywrightBrowserInstaller
 * builds without ever shelling out for real. */
class FakeSpawner implements ProcessSpawner {
  public readonly commandsRun: { command: string; cwd: string }[] = [];
  constructor(private readonly result: RunToCompletionResult = { exitCode: 0, stdout: '', stderr: '' }) {}

  async runToCompletion(command: string, cwd: string): Promise<RunToCompletionResult> {
    this.commandsRun.push({ command, cwd });
    return this.result;
  }

  spawnDetached(): DetachedProcessHandle {
    throw new Error('not used by PlaywrightBrowserInstaller');
  }
}

class FakeProbe implements EnvironmentProbe {
  constructor(private readonly present: boolean) {}

  async commandAvailable(): Promise<boolean> {
    return true;
  }

  async pathExists(): Promise<boolean> {
    return this.present;
  }
}

describe('PlaywrightBrowserInstaller.install', () => {
  it('runs exactly `npx playwright install` from the injected app root', async () => {
    const spawner = new FakeSpawner({ exitCode: 0, stdout: 'installed', stderr: '' });
    const installer = new PlaywrightBrowserInstaller(APP_ROOT, spawner, new FakeProbe(true));

    const result = await installer.install();

    expect(spawner.commandsRun).toEqual([{ command: 'npx playwright install', cwd: APP_ROOT }]);
    expect(result).toEqual({ ok: true, nowPresent: true, output: 'installed' });
  });

  it('checks the exact chromium.executablePath() the installed Playwright version expects', async () => {
    const probe: EnvironmentProbe = {
      commandAvailable: async () => true,
      pathExists: async (path: string) => path === CHROMIUM_PATH,
    };
    const installer = new PlaywrightBrowserInstaller(APP_ROOT, new FakeSpawner(), probe);

    const result = await installer.install();

    expect(result).toEqual({ ok: true, nowPresent: true, output: '' });
  });

  it('reports INSTALL_FAILED when the command exits non-zero and the browser still is not present', async () => {
    const spawner = new FakeSpawner({ exitCode: 1, stdout: '', stderr: 'network error' });
    const installer = new PlaywrightBrowserInstaller(APP_ROOT, spawner, new FakeProbe(false));

    const result = await installer.install();

    expect(result).toEqual({ ok: false, error: 'INSTALL_FAILED', detail: 'network error' });
  });

  it('treats a non-zero exit as success if the browser is present afterward anyway', async () => {
    const spawner = new FakeSpawner({ exitCode: 1, stdout: '', stderr: 'already installed, warning' });
    const installer = new PlaywrightBrowserInstaller(APP_ROOT, spawner, new FakeProbe(true));

    const result = await installer.install();

    expect(result).toEqual({ ok: true, nowPresent: true, output: 'already installed, warning' });
  });

  it('reports INSTALL_FAILED when the spawner itself rejects', async () => {
    const spawner: ProcessSpawner = {
      runToCompletion: () => Promise.reject(new Error('spawn ENOENT')),
      spawnDetached: () => {
        throw new Error('not used');
      },
    };
    const installer = new PlaywrightBrowserInstaller(APP_ROOT, spawner, new FakeProbe(false));

    const result = await installer.install();

    expect(result).toEqual({ ok: false, error: 'INSTALL_FAILED', detail: 'spawn ENOENT' });
  });

  it('reports nowPresent false when the exit code is 0 but the browser still is not there', async () => {
    const spawner = new FakeSpawner({ exitCode: 0, stdout: 'done', stderr: '' });
    const installer = new PlaywrightBrowserInstaller(APP_ROOT, spawner, new FakeProbe(false));

    const result = await installer.install();

    expect(result).toEqual({ ok: true, nowPresent: false, output: 'done' });
  });
});
