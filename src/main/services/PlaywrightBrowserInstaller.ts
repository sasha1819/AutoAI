import { chromium } from 'playwright';
import type { PlaywrightBrowserInstallResult } from '@shared/ipc-contract';
import type { EnvironmentProbe } from './EnvironmentCheckService';
import { NodeEnvironmentProbe } from './EnvironmentCheckService';
import type { ProcessSpawner } from './ProjectSetupService';
import { NodeProcessSpawner } from './ProjectSetupService';

/**
 * AutoAI installing its own test-runner dependency's browsers - a
 * categorically simpler, safer case than SystemToolInstaller: `playwright`
 * is already AutoAI's own real dependency (TestRunnerService already
 * imports `chromium` from it to run tests), so there's no third-party
 * package manager to check for and no binary name to choose - one fixed
 * command (`npx playwright install`, matching the checklist's own existing
 * instructional hint text verbatim), always run from AutoAI's own app
 * directory, never a target project's.
 */
export class PlaywrightBrowserInstaller {
  constructor(
    private readonly appRoot: string,
    private readonly spawner: ProcessSpawner = new NodeProcessSpawner(),
    private readonly probe: EnvironmentProbe = new NodeEnvironmentProbe(),
  ) {}

  public async install(): Promise<PlaywrightBrowserInstallResult> {
    let result;
    try {
      result = await this.spawner.runToCompletion('npx playwright install', this.appRoot);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, error: 'INSTALL_FAILED', detail };
    }

    const nowPresent = await this.probe.pathExists(chromium.executablePath());
    if (result.exitCode !== 0 && !nowPresent) {
      return { ok: false, error: 'INSTALL_FAILED', detail: result.stderr || result.stdout || `exited ${result.exitCode}` };
    }

    return { ok: true, nowPresent, output: result.stdout || result.stderr };
  }
}
