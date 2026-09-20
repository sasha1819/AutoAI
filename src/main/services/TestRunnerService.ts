import { randomUUID } from 'node:crypto';
import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import type { RunRecord, RunResult, RunStepResult, TestStepAction } from '@shared/ipc-contract';
import { effectiveTargetType } from '@shared/ipc-contract';
import type { EnvironmentProbe } from './EnvironmentCheckService';
import { NodeEnvironmentProbe } from './EnvironmentCheckService';
import type { ProjectDataOwner } from './ProjectService';
import type { ProjectRepository } from './ProjectStore';
import type { RunRepository } from './RunStore';
import type { TestPlanRepository } from './TestPlanStore';

/** Not Playwright's own 30s default - a run that hangs on one bad selector
 *  should fail that step quickly, not stall the whole run for half a
 *  minute. */
const PER_ACTION_TIMEOUT_MS = 10_000;

/**
 * The thing that actually drives a browser, kept behind an interface so
 * TestRunnerService's guard logic and persistence are unit-testable with a
 * fake driver - no real browser spinning up in CI, same seam as
 * AgentRunner for the Claude SDK.
 */
export interface BrowserDriver {
  run(script: readonly TestStepAction[], baseUrl: string): Promise<RunStepResult[]>;
}

/** `[kind="value"]` attribute-selector form for all five selector kinds -
 *  a pure function so it's trivially testable on its own. */
export function buildSelector(kind: string, value: string): string {
  return `[${kind}="${value}"]`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runStep(page: Page, step: TestStepAction, baseUrl: string): Promise<void> {
  if (step.action === 'goto') {
    await page.goto(new URL(step.value ?? '', baseUrl).toString(), { timeout: PER_ACTION_TIMEOUT_MS });
    return;
  }

  if (!step.selectorKind || !step.selectorValue) {
    throw new Error(`"${step.action}" has no selector to act on.`);
  }
  const selector = buildSelector(step.selectorKind, step.selectorValue);
  const locator = page.locator(selector);

  switch (step.action) {
    case 'click':
      await locator.click({ timeout: PER_ACTION_TIMEOUT_MS });
      return;
    case 'fill':
      await locator.fill(step.value ?? '', { timeout: PER_ACTION_TIMEOUT_MS });
      return;
    case 'check':
      await locator.check({ timeout: PER_ACTION_TIMEOUT_MS });
      return;
    case 'select':
      await locator.selectOption(step.value ?? '', { timeout: PER_ACTION_TIMEOUT_MS });
      return;
    case 'assertText': {
      const text = await locator.textContent({ timeout: PER_ACTION_TIMEOUT_MS });
      const expected = step.value ?? '';
      if (!text || !text.includes(expected)) {
        throw new Error(`Expected text containing "${expected}" but found "${text ?? ''}".`);
      }
      return;
    }
    default:
      throw new Error(`Unknown action "${step.action}".`);
  }
}

/**
 * Real Playwright execution: headless Chromium, one page, walks `script`
 * in order, stops at the first failed step. Browser is always closed in a
 * `finally` regardless of how the walk ends.
 */
export class PlaywrightBrowserDriver implements BrowserDriver {
  public async run(script: readonly TestStepAction[], baseUrl: string): Promise<RunStepResult[]> {
    const results: RunStepResult[] = [];
    let browser: Browser | null = null;

    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      let stopped = false;
      for (const step of script) {
        if (stopped) {
          results.push({ action: step, status: 'skipped', error: null, durationMs: 0 });
          continue;
        }

        const startedAt = Date.now();
        try {
          await runStep(page, step, baseUrl);
          results.push({ action: step, status: 'passed', error: null, durationMs: Date.now() - startedAt });
        } catch (error) {
          stopped = true;
          results.push({
            action: step,
            status: 'failed',
            error: errorMessage(error),
            durationMs: Date.now() - startedAt,
          });
        }
      }

      return results;
    } finally {
      if (browser) await browser.close();
    }
  }
}

/**
 * One "Run" action, one real Playwright execution of a single test case's
 * `script`. Every guard maps to a distinct, honest RunErrorCode rather than
 * a generic failure, so the renderer can explain exactly what's missing
 * (see TestCaseDetail's three disabled states) instead of just "run
 * failed."
 *
 * Implements ProjectDataOwner so a project's runs are deleted with it, same
 * as TestPlanService and ProjectScanService - see main/index.ts.
 */
export class TestRunnerService implements ProjectDataOwner {
  constructor(
    private readonly testPlanRepository: TestPlanRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly runRepository: RunRepository,
    private readonly browserDriver: BrowserDriver,
    private readonly probe: EnvironmentProbe = new NodeEnvironmentProbe(),
  ) {}

  public async run(caseId: string): Promise<RunResult> {
    const testCase = this.testPlanRepository.findCase(caseId);
    if (!testCase) {
      return { ok: false, error: 'CASE_NOT_FOUND' };
    }

    if (!testCase.script || testCase.script.length === 0) {
      return { ok: false, error: 'NO_SCRIPT' };
    }

    const project = this.projectRepository.find(testCase.projectId);
    // A case whose project no longer exists would already have been
    // deleted with it (ProjectService.remove cascades to TestPlanService) -
    // this is only a defensive fallback, reported the same way a case that
    // never existed would be.
    if (!project) {
      return { ok: false, error: 'CASE_NOT_FOUND' };
    }

    if (!project.baseUrl) {
      return { ok: false, error: 'NO_BASE_URL' };
    }

    if (effectiveTargetType(project) !== 'web') {
      return { ok: false, error: 'UNSUPPORTED_TARGET' };
    }

    // Same exact-binary check EnvironmentCheckService's checklist item
    // uses - the coarse "does the cache directory exist" check this
    // replaced could pass while the specific build chromium.launch() below
    // needs was still missing, letting a raw Playwright launch exception
    // escape as a RUN_FAILED instead of this clean, expected error.
    const browsersPresent = await this.probe.pathExists(chromium.executablePath());
    if (!browsersPresent) {
      return { ok: false, error: 'BROWSER_NOT_READY' };
    }

    const startedAt = new Date().toISOString();
    let steps: RunStepResult[];
    try {
      steps = await this.browserDriver.run(testCase.script, project.baseUrl);
    } catch (error) {
      return { ok: false, error: 'RUN_FAILED', detail: errorMessage(error) };
    }

    const run: RunRecord = {
      id: randomUUID(),
      projectId: project.id,
      caseId: testCase.id,
      caseName: testCase.name,
      status: steps.some((step) => step.status === 'failed') ? 'failed' : 'passed',
      steps,
      startedAt,
      finishedAt: new Date().toISOString(),
    };

    this.runRepository.add(run);
    return { ok: true, run };
  }

  public listForProject(projectId: string): RunRecord[] {
    return this.runRepository.listForProject(projectId);
  }

  public listAll(): RunRecord[] {
    return this.runRepository.listAll();
  }

  /** ProjectDataOwner: a project's run history goes when the project does. */
  public removeAllForProject(projectId: string): void {
    this.runRepository.removeAllForProject(projectId);
  }
}
