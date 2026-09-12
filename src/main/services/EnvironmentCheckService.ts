import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { EnvironmentCheckItem, TargetType } from '@shared/ipc-contract';
import { TargetType as Target } from '@shared/ipc-contract';

const execFileAsync = promisify(execFile);

/**
 * What EnvironmentCheckService needs from the outside world, kept separate
 * so the service is testable without depending on what's actually installed
 * on the machine running the suite - same seam as ProjectRepository /
 * TestPlanRepository elsewhere in this codebase.
 */
export interface EnvironmentProbe {
  /** True if running `command` with `args` exits without an ENOENT-style
   *  "not installed" failure. */
  commandAvailable(command: string, args: readonly string[]): Promise<boolean>;
  pathExists(path: string): Promise<boolean>;
}

/** Same ENOENT-catching pattern GitService.clone already uses for git. */
export class NodeEnvironmentProbe implements EnvironmentProbe {
  public async commandAvailable(command: string, args: readonly string[]): Promise<boolean> {
    try {
      await execFileAsync(command, [...args], { timeout: 10_000 });
      return true;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return false;
      // A non-zero exit or timeout still means the binary exists and ran -
      // e.g. `--version` on something that doesn't recognise the flag would
      // exit non-zero. Only ENOENT ("no such command") means "not present."
      return true;
    }
  }

  public async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}

/** Playwright's own default browser cache directory, so "browsers
 * installed" can be checked without running anything - a real, deterministic
 * filesystem fact rather than shelling out to `npx playwright ...`, which
 * would risk a network install attempt. Respects the same
 * `PLAYWRIGHT_BROWSERS_PATH` override Playwright itself honours. Exported
 * so tests can compute the same path the service checks. */
export function playwrightBrowsersDir(
  platform: NodeJS.Platform,
  home: string,
  env: NodeJS.ProcessEnv,
): string {
  const override = env['PLAYWRIGHT_BROWSERS_PATH'];
  if (override) return override;

  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'ms-playwright');
  if (platform === 'win32') return join(home, 'AppData', 'Local', 'ms-playwright');
  return join(home, '.cache', 'ms-playwright');
}

export interface EnvironmentChecker {
  check(targetType: TargetType, projectRoot: string): Promise<EnvironmentCheckItem[]>;
}

const MOBILE_STUB: EnvironmentCheckItem = {
  name: "Mobile test runner - AutoAI doesn't have an Appium adapter yet",
  present: false,
  installHint: null,
};

const DESKTOP_STUB: EnvironmentCheckItem = {
  name: "Desktop test runner - AutoAI doesn't have a desktop-driver adapter yet",
  present: false,
  installHint: null,
};

/**
 * The deterministic half of "what's missing to run tests" - the small set
 * of well-known tools a target type needs, checked locally and fast, no LLM
 * call of its own. Claude's own read of the project (ProjectScanService)
 * folds project-specific notes on top of this list; this service only ever
 * reports on tooling, never invents a check for something that doesn't
 * exist yet.
 */
export class EnvironmentCheckService implements EnvironmentChecker {
  constructor(private readonly probe: EnvironmentProbe = new NodeEnvironmentProbe()) {}

  public async check(targetType: TargetType, projectRoot: string): Promise<EnvironmentCheckItem[]> {
    if (targetType === Target.Web) return this.checkWeb(projectRoot);
    if (targetType === Target.Mobile) return [MOBILE_STUB];
    if (targetType === Target.Desktop) return [DESKTOP_STUB];
    return []; // unknown target type: nothing well-known enough to check yet
  }

  /**
   * `projectRoot` is unused now that the browsers check below is about
   * AutoAI's own machine, not the target project's `node_modules` - kept as
   * a parameter (rather than changing `check`'s signature) so the
   * EnvironmentChecker interface and its one caller (ProjectScanService)
   * don't need to change for what is, from their side, still "check this
   * project's target type."
   */
  private async checkWeb(_projectRoot: string): Promise<EnvironmentCheckItem[]> {
    const nodePresent = await this.probe.commandAvailable('node', ['--version']);
    const browsersDir = playwrightBrowsersDir(process.platform, homedir(), process.env);
    const browsersPresent = await this.probe.pathExists(browsersDir);

    return [
      {
        name: 'Node.js',
        present: nodePresent,
        installHint: nodePresent ? null : 'Install Node.js from https://nodejs.org, then check again.',
      },
      {
        name: 'Playwright browsers',
        present: browsersPresent,
        installHint: browsersPresent ? null : 'Run `npx playwright install` in the project, then check again.',
      },
    ];
  }
}
