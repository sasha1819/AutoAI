import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import type { DetectionEvidence, EnvironmentCheckItem, TargetType } from '@shared/ipc-contract';
import { TargetType as Target } from '@shared/ipc-contract';
import { isInstallableBinary } from './SystemToolInstaller';

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

export interface EnvironmentChecker {
  check(
    targetType: TargetType,
    projectRoot: string,
    startCommand: string | null,
    evidence: readonly DetectionEvidence[],
  ): Promise<EnvironmentCheckItem[]>;
}

/** One entry per runtime an allowlisted command family might need beyond
 *  Node.js (already checked unconditionally below). Matched by prefix
 *  against a scan's own proposed `startCommand`, the same command families
 *  CommandAllowlist already commits to supporting - never a guessed check
 *  for a command this app doesn't otherwise recognize. Composer and Bundler
 *  need their own interpreter (PHP, Ruby) checked alongside the tool
 *  itself; `npm`/`npx`/`yarn`/`pnpm` need nothing beyond Node.js. */
const RUNTIME_CHECKS: readonly { readonly prefix: string; readonly checks: readonly { readonly binary: string; readonly label: string }[] }[] = [
  { prefix: 'php -S', checks: [{ binary: 'php', label: 'PHP' }] },
  { prefix: 'composer', checks: [{ binary: 'php', label: 'PHP' }, { binary: 'composer', label: 'Composer' }] },
  { prefix: 'python3 -m http.server', checks: [{ binary: 'python3', label: 'Python' }] },
  { prefix: 'python -m http.server', checks: [{ binary: 'python', label: 'Python' }] },
  { prefix: 'pip3', checks: [{ binary: 'python3', label: 'Python' }] },
  { prefix: 'pip', checks: [{ binary: 'python', label: 'Python' }] },
  { prefix: 'bundle', checks: [{ binary: 'ruby', label: 'Ruby' }, { binary: 'bundle', label: 'Bundler' }] },
];

/** Which extra runtimes (beyond Node.js) a proposed start command implies -
 *  exported so tests can exercise the matching logic directly without a
 *  full EnvironmentCheckService. Null/unrecognized commands need nothing
 *  extra - never invents a check for a command family this app doesn't
 *  otherwise support. */
export function requiredRuntimesFor(startCommand: string | null): readonly { readonly binary: string; readonly label: string }[] {
  if (!startCommand) return [];
  const trimmed = startCommand.trim();
  const match = RUNTIME_CHECKS.find((entry) => trimmed.startsWith(entry.prefix));
  return match?.checks ?? [];
}

const MOBILE_STUB: EnvironmentCheckItem = {
  name: "Mobile test runner - AutoAI doesn't have an Appium adapter yet",
  present: false,
  installHint: null,
  installableBinary: null,
  installablePlaywrightBrowsers: false,
};

const DESKTOP_STUB: EnvironmentCheckItem = {
  name: "Desktop test runner - AutoAI doesn't have a desktop-driver adapter yet",
  present: false,
  installHint: null,
  installableBinary: null,
  installablePlaywrightBrowsers: false,
};

type RuntimeCheck = { readonly binary: string; readonly label: string };

/** Matched against a project's own real `detection.evidence` - the exact
 *  `path`/`reason` strings `DetectionService.ts` already writes for each
 *  framework it recognizes, not a guess. AutoAI still can't run a mobile or
 *  desktop test (no Appium adapter, no OS accessibility driver), but what
 *  to install doesn't have to wait on that - this is suggestion-only,
 *  same as every other item this service reports. */
const FRAMEWORK_CHECKS: readonly { readonly match: (e: DetectionEvidence) => boolean; readonly checks: readonly RuntimeCheck[] }[] = [
  { match: (e) => e.path.startsWith('android/'), checks: [{ binary: 'adb', label: 'Android SDK (adb)' }] },
  { match: (e) => e.path.startsWith('ios/'), checks: [{ binary: 'xcodebuild', label: 'Xcode command line tools' }] },
  {
    match: (e) => e.reason.includes("'react-native'"),
    checks: [
      { binary: 'node', label: 'Node.js' },
      { binary: 'adb', label: 'Android SDK (adb)' },
      { binary: 'xcodebuild', label: 'Xcode command line tools' },
    ],
  },
  { match: (e) => e.reason.includes("'expo'"), checks: [{ binary: 'node', label: 'Node.js' }] },
  { match: (e) => e.path === 'pubspec.yaml', checks: [{ binary: 'flutter', label: 'Flutter SDK' }] },
  { match: (e) => e.reason.includes("'electron'") || e.path === 'electron-builder.yml', checks: [{ binary: 'node', label: 'Node.js' }] },
  {
    match: (e) => e.path === 'src-tauri/',
    checks: [
      { binary: 'cargo', label: 'Rust (cargo)' },
      { binary: 'node', label: 'Node.js' },
    ],
  },
  { match: (e) => e.reason.includes('.NET project file'), checks: [{ binary: 'dotnet', label: '.NET SDK' }] },
];

/** Which runtimes a project's own detected framework(s) imply, deduped by
 *  binary - exported so tests can exercise the matching logic directly.
 *  Evidence that matches nothing here returns an empty list, never a
 *  guessed check for a framework this table doesn't recognize. */
export function requiredRuntimesForFrameworks(evidence: readonly DetectionEvidence[]): readonly RuntimeCheck[] {
  const seen = new Map<string, RuntimeCheck>();
  for (const item of evidence) {
    for (const entry of FRAMEWORK_CHECKS) {
      if (!entry.match(item)) continue;
      for (const check of entry.checks) {
        seen.set(check.binary, check);
      }
    }
  }
  return [...seen.values()];
}

/**
 * The deterministic half of "what's missing to run tests" - the small set
 * of well-known tools a target type needs, checked locally and fast, no LLM
 * call of its own. Claude's own read of the project (ProjectScanService)
 * folds project-specific notes on top of this list; this service only ever
 * reports on tooling, never invents a check for something that doesn't
 * exist yet. For web that means Node/Playwright/the runtime a proposed
 * start command implies; for mobile/desktop it means whatever real
 * framework `DetectionService`'s own evidence actually found (Android,
 * iOS, React Native, Expo, Flutter, Electron, Tauri, .NET) - suggestion
 * only, since there's no adapter yet to actually run either kind of test.
 */
export class EnvironmentCheckService implements EnvironmentChecker {
  constructor(private readonly probe: EnvironmentProbe = new NodeEnvironmentProbe()) {}

  public async check(
    targetType: TargetType,
    projectRoot: string,
    startCommand: string | null,
    evidence: readonly DetectionEvidence[],
  ): Promise<EnvironmentCheckItem[]> {
    if (targetType === Target.Web) return this.checkWeb(projectRoot, startCommand);
    if (targetType === Target.Mobile) return this.checkFrameworkRuntimes(evidence, MOBILE_STUB);
    if (targetType === Target.Desktop) return this.checkFrameworkRuntimes(evidence, DESKTOP_STUB);
    return []; // unknown target type: nothing well-known enough to check yet
  }

  /** Mobile/desktop can't run a test yet (no Appium adapter, no OS
   *  accessibility driver) - but grounded in real detected-framework
   *  evidence, AutoAI can still say what building/running one manually
   *  would need. Falls back to the honest "no adapter yet" stub when
   *  nothing in `evidence` matches a recognized framework, same as before
   *  this existed. */
  private async checkFrameworkRuntimes(
    evidence: readonly DetectionEvidence[],
    fallback: EnvironmentCheckItem,
  ): Promise<EnvironmentCheckItem[]> {
    const runtimes = requiredRuntimesForFrameworks(evidence);
    if (runtimes.length === 0) return [fallback];

    const items: EnvironmentCheckItem[] = [];
    for (const runtime of runtimes) {
      const present = await this.probe.commandAvailable(runtime.binary, ['--version']);
      items.push({
        name: runtime.label,
        present,
        installHint: present ? null : `Install ${runtime.label}, then check again.`,
        installableBinary: !present && isInstallableBinary(runtime.binary) ? runtime.binary : null,
        installablePlaywrightBrowsers: false,
      });
    }
    return items;
  }

  /**
   * `projectRoot` is unused now that the browsers check below is about
   * AutoAI's own machine, not the target project's `node_modules` - kept as
   * a parameter (rather than changing `check`'s signature) so the
   * EnvironmentChecker interface and its one caller (ProjectScanService)
   * don't need to change for what is, from their side, still "check this
   * project's target type."
   *
   * `startCommand` is the scan's own proposed way to run the project - a
   * PHP project's checklist used to come back all-green (Node.js present,
   * Playwright browsers present) and then crash the moment Setup actually
   * ran `php -S ...` on a machine without PHP. Checking the runtime the
   * project's own command implies, not just the two things every web
   * project happens to need, is what catches that before Setup does.
   */
  private async checkWeb(_projectRoot: string, startCommand: string | null): Promise<EnvironmentCheckItem[]> {
    const nodePresent = await this.probe.commandAvailable('node', ['--version']);
    // The exact binary the installed Playwright version expects, not just
    // "does the browser cache directory exist" - a machine can have the
    // directory (old or partial downloads) while missing the specific
    // build TestRunnerService's own chromium.launch() needs, which used to
    // report a false "Present" here.
    const browsersPresent = await this.probe.pathExists(chromium.executablePath());

    const items: EnvironmentCheckItem[] = [
      {
        name: 'Node.js',
        present: nodePresent,
        installHint: nodePresent ? null : 'Install Node.js from https://nodejs.org, then check again.',
        // Not on SystemToolInstaller's list - Node is what AutoAI itself
        // runs on, and https://nodejs.org isn't a one-command brew formula
        // story worth special-casing here.
        installableBinary: null,
        installablePlaywrightBrowsers: false,
      },
      {
        name: 'Playwright browsers',
        present: browsersPresent,
        installHint: browsersPresent ? null : 'Run `npx playwright install` in the project, then check again.',
        installableBinary: null,
        installablePlaywrightBrowsers: !browsersPresent,
      },
    ];

    for (const runtime of requiredRuntimesFor(startCommand)) {
      const present = await this.probe.commandAvailable(runtime.binary, ['--version']);
      items.push({
        name: runtime.label,
        present,
        installHint: present ? null : `Install ${runtime.label}, then check again.`,
        installableBinary: !present && isInstallableBinary(runtime.binary) ? runtime.binary : null,
        installablePlaywrightBrowsers: false,
      });
    }

    return items;
  }
}
