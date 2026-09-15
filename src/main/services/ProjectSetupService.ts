import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import type { Project, SetupCommandOutcome, SetupCommandStatus, SetupRunResult, SetupStartOutcome } from '@shared/ipc-contract';
import { isAllowedCommand } from './CommandAllowlist';
import type { ProjectService } from './ProjectService';
import type { ProjectRepository } from './ProjectStore';
import type { ScanRepository } from './ScanStore';

/** Long enough to catch an immediate crash-on-boot (a missing dependency, a
 *  bad port) without meaningfully slowing down "Set up this project". */
const START_GRACE_MS = 1500;
const MAX_OUTPUT_CHARS = 4000;
const REJECTED_MESSAGE = "Claude suggested this, AutoAI won't run it automatically.";

function truncate(text: string): string {
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (truncated)` : text;
}

export interface RunToCompletionResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** A long-running process AutoAI started, kept alive past the grace period -
 *  the seam ProjectSetupService tracks per project and can `kill()` later,
 *  either from "Stop server" or on app quit. */
export interface DetachedProcessHandle {
  readonly pid: number | undefined;
  /** Resolves true (a crash-on-boot) if the process exits within `graceMs`
   *  of being spawned, false if it's still alive once the grace period
   *  elapses. `output` reflects whatever was captured either way. */
  waitForCrash(graceMs: number): Promise<boolean>;
  readonly output: string;
  kill(): void;
}

/**
 * What ProjectSetupService needs from the outside world to actually run
 * anything - kept separate so the service's guard logic, allowlist
 * enforcement, and stop-at-first-failure sequencing are unit-testable
 * without spawning a real process, same seam as BrowserDriver/AgentRunner.
 */
export interface ProcessSpawner {
  /** Runs one command to completion, scoped to `cwd`, capturing
   *  stdout/stderr/exit code. Rejects only on a genuine spawn-level failure
   *  (the shell itself could not start) - a non-zero exit is a normal
   *  resolved result, not a rejection. */
  runToCompletion(command: string, cwd: string): Promise<RunToCompletionResult>;
  /** Starts a long-running command detached from AutoAI's own process. */
  spawnDetached(command: string, cwd: string): DetachedProcessHandle;
}

class NodeDetachedProcessHandle implements DetachedProcessHandle {
  private readonly child: ChildProcess;
  private exited = false;
  private captured = '';

  constructor(command: string, cwd: string) {
    this.child = spawn(command, { shell: true, cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.captured = truncate(this.captured + String(chunk));
    });
    this.child.stderr?.on('data', (chunk: Buffer) => {
      this.captured = truncate(this.captured + String(chunk));
    });
    this.child.once('exit', () => {
      this.exited = true;
    });
    // Never let a healthy long-running server keep AutoAI's own event loop
    // alive on its own - the process is tracked and killed explicitly (Stop
    // server, app quit), not awaited.
    this.child.unref();
  }

  public get pid(): number | undefined {
    return this.child.pid;
  }

  public get output(): string {
    return this.captured;
  }

  public async waitForCrash(graceMs: number): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, graceMs));
    return this.exited;
  }

  public kill(): void {
    const pid = this.child.pid;
    if (pid === undefined) return;
    try {
      // Negative pid kills the whole detached process group (shell +
      // whatever it spawned), not just the shell itself.
      process.kill(-pid);
    } catch {
      try {
        this.child.kill();
      } catch {
        // best-effort only
      }
    }
  }
}

/** Real execution: `spawn` with `shell: true`, exactly as the plan
 *  specifies, scoped to the project's own folder. */
export class NodeProcessSpawner implements ProcessSpawner {
  public runToCompletion(command: string, cwd: string): Promise<RunToCompletionResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, { shell: true, cwd });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += String(chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += String(chunk);
      });
      child.once('error', (error) => reject(error));
      child.once('exit', (code) => resolve({ exitCode: code, stdout: truncate(stdout), stderr: truncate(stderr) }));
    });
  }

  public spawnDetached(command: string, cwd: string): DetachedProcessHandle {
    return new NodeDetachedProcessHandle(command, cwd);
  }
}

const PHP_SERVER_PATTERN = /^php\s+-S\s+([\w.-]+:\d+)/i;
const PYTHON_HTTP_SERVER_PATTERN = /^python3?\s+-m\s+http\.server(?:\s+(\d+))?/i;

/** Pulls a `host:port` straight out of a *recognized command pattern* - not
 *  by scraping arbitrary log output, which could be spoofed by whatever the
 *  command prints. Returns null for anything not recognized (e.g. `npm run
 *  dev`, whose actual port is only known to the tool it runs). */
export function extractStartUrl(command: string): string | null {
  const trimmed = command.trim();

  const phpMatch = trimmed.match(PHP_SERVER_PATTERN);
  if (phpMatch?.[1]) return `http://${phpMatch[1]}`;

  const pyMatch = trimmed.match(PYTHON_HTTP_SERVER_PATTERN);
  if (pyMatch) return `http://localhost:${pyMatch[1] ?? '8000'}`;

  return null;
}

/** A deterministic comparison, not a judgment call - so it's computed here,
 *  not asked of Claude. Fires only when both sides are known: an
 *  `expectedBasePath` Claude actually found, and a `baseUrlAutoFilled` this
 *  service actually resolved. There is no general way to make `php -S` (or
 *  any allowlisted start command) serve at an arbitrary sub-path, so this
 *  only ever reports the mismatch - it never attempts to reconcile it. */
export function buildBaseUrlMismatchNote(expectedBasePath: string | null, baseUrlAutoFilled: string | null): string | null {
  if (!expectedBasePath || !baseUrlAutoFilled) return null;
  return `This project expects to be served at a path ending in "${expectedBasePath}", but AutoAI can only start it at the root of ${baseUrlAutoFilled} - links the app generates itself (email verification, redirects) will point to the wrong place until it's served at the expected path.`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * "Set up this project", made real: runs a scan's proposed install commands
 * sequentially (stopping at the first failure, same convention as
 * TestRunnerService), then - if every install passed and a start command was
 * proposed - starts it detached and tracks the process so it can be stopped
 * later, on app quit, or when this project is removed.
 *
 * Every proposed command is untrusted until CommandAllowlist says otherwise;
 * nothing here ever reaches `child_process` without passing it first. A
 * rejected command still shows up in the result (per-command outcomes),
 * never silently dropped - the one exception is the fully degenerate case
 * where *nothing* in the proposal is allowlisted, which fails fast with
 * COMMAND_REJECTED rather than "running" an empty sequence.
 */
export class ProjectSetupService {
  private readonly running = new Map<string, DetachedProcessHandle>();

  constructor(
    private readonly scanRepository: ScanRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly projectService: ProjectService,
    private readonly spawner: ProcessSpawner,
  ) {}

  public async run(projectId: string): Promise<SetupRunResult> {
    const project = this.projectRepository.find(projectId);
    if (!project) {
      return { ok: false, error: 'PROJECT_NOT_FOUND' };
    }

    if (this.running.has(projectId)) {
      return { ok: false, error: 'ALREADY_RUNNING' };
    }

    const proposal = this.scanRepository.get(projectId)?.setup ?? null;
    if (!proposal) {
      return { ok: false, error: 'NO_PROPOSAL' };
    }

    const { installCommands, startCommand, expectedBasePath } = proposal;

    if (isFullyRejected(installCommands)) {
      return {
        ok: false,
        error: 'COMMAND_REJECTED',
        detail: 'None of the proposed commands passed AutoAI\'s allowlist.',
      };
    }

    const installResults: SetupCommandOutcome[] = [];
    let stopped = false;

    for (const command of installCommands) {
      if (stopped) {
        installResults.push({ command, status: 'skipped', exitCode: null, stdout: '', stderr: '' });
        continue;
      }

      if (!isAllowedCommand(command)) {
        installResults.push({ command, status: 'failed', exitCode: null, stdout: '', stderr: REJECTED_MESSAGE });
        stopped = true;
        continue;
      }

      let outcome: RunToCompletionResult;
      try {
        outcome = await this.spawner.runToCompletion(command, project.localPath);
      } catch (error) {
        return { ok: false, error: 'INSTALL_FAILED', detail: errorMessage(error) };
      }

      const status: SetupCommandStatus = outcome.exitCode === 0 ? 'passed' : 'failed';
      installResults.push({ command, status, exitCode: outcome.exitCode, stdout: outcome.stdout, stderr: outcome.stderr });
      if (status === 'failed') stopped = true;
    }

    const installsAllPassed = installResults.every((r) => r.status === 'passed');

    const { start, baseUrlAutoFilled } = await this.resolveStart(project, startCommand, installsAllPassed);
    const baseUrlMismatchNote = buildBaseUrlMismatchNote(expectedBasePath, baseUrlAutoFilled);

    return { ok: true, result: { installResults, start, baseUrlAutoFilled, baseUrlMismatchNote } };
  }

  private async resolveStart(
    project: Project,
    startCommand: string | null,
    installsAllPassed: boolean,
  ): Promise<{ start: SetupStartOutcome | null; baseUrlAutoFilled: string | null }> {
    if (!startCommand) {
      return { start: null, baseUrlAutoFilled: null };
    }

    if (!installsAllPassed) {
      return { start: { command: startCommand, status: 'skipped', output: '' }, baseUrlAutoFilled: null };
    }

    if (!isAllowedCommand(startCommand)) {
      return { start: { command: startCommand, status: 'rejected', output: REJECTED_MESSAGE }, baseUrlAutoFilled: null };
    }

    const handle = this.spawner.spawnDetached(startCommand, project.localPath);
    const crashed = await handle.waitForCrash(START_GRACE_MS);

    if (crashed) {
      return { start: { command: startCommand, status: 'crashed', output: handle.output }, baseUrlAutoFilled: null };
    }

    this.running.set(project.id, handle);

    const startUrl = extractStartUrl(startCommand);
    if (startUrl) {
      this.projectService.setBaseUrl(project.id, startUrl);
    }

    return {
      start: { command: startCommand, status: 'started', output: '' },
      baseUrlAutoFilled: startUrl,
    };
  }

  public stop(projectId: string): void {
    const handle = this.running.get(projectId);
    if (!handle) return;
    handle.kill();
    this.running.delete(projectId);
  }

  /** Called once on app quit - nothing AutoAI started should outlive it. */
  public stopAll(): void {
    for (const projectId of [...this.running.keys()]) {
      this.stop(projectId);
    }
  }
}

/** The one case that fails fast rather than "surfacing in the result": a
 *  non-empty install list where *every* command is rejected, so nothing
 *  about installing this project could even begin. A lone rejected
 *  `startCommand` with no installs is not this - it is one ordinary,
 *  per-item rejected outcome (see `resolveStart`), the same as a rejected
 *  command anywhere in the middle of an otherwise-fine install list. */
function isFullyRejected(installCommands: readonly string[]): boolean {
  return installCommands.length > 0 && installCommands.every((c) => !isAllowedCommand(c));
}
