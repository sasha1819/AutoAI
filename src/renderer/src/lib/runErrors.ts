import type { RunErrorCode } from '@shared/ipc-contract';

const MESSAGES: Record<RunErrorCode, string> = {
  CASE_NOT_FOUND: 'That test case is gone - reopen the project to refresh the list.',
  NO_SCRIPT: 'This case has no runnable script yet.',
  NO_BASE_URL: 'Set a project URL first, then try again.',
  UNSUPPORTED_TARGET: 'Only web projects can run today.',
  BROWSER_NOT_READY: "Playwright browsers aren't installed on this machine yet. Run `npx playwright install`, then try again.",
  RUN_FAILED: 'The run did not finish. You can try again.',
};

export function describeRunError(code: RunErrorCode): string {
  return MESSAGES[code];
}

/**
 * The two checks a renderer can answer on its own without a real run
 * attempt (does this case have a script at all; does the project have a
 * base URL), plus whether a project scan already found Playwright's
 * browsers missing - so those three read as calm, permanent explanations
 * rather than a run that visibly fails first. Anything else
 * (`TestRunnerService.run`'s remaining checks) is reported the honest way,
 * as the run's own error once attempted.
 *
 * Returns a code rather than a rendered string because the right copy for
 * `NO_BASE_URL` depends on where it's shown: `TestCaseDetail`'s `RunPanel`
 * sits right below its own project-URL field ("above"), while
 * `ProjectScanCard`'s `FlowCard` sits above the Setup card that's what
 * actually starts the server and fills the URL in ("below") - see
 * `RUN_DISABLED_REASON_COPY` for the default (RunPanel's) wording and
 * `FlowCard` for its own override.
 */
export type RunDisabledReasonCode = 'NO_SCRIPT' | 'NO_BASE_URL' | 'BROWSERS_MISSING';

export function computeRunDisabledReason(
  hasScript: boolean,
  hasBaseUrl: boolean,
  browsersKnownMissing: boolean,
): RunDisabledReasonCode | null {
  if (!hasScript) return 'NO_SCRIPT';
  if (!hasBaseUrl) return 'NO_BASE_URL';
  if (browsersKnownMissing) return 'BROWSERS_MISSING';
  return null;
}

export const RUN_DISABLED_REASON_COPY: Record<RunDisabledReasonCode, string> = {
  NO_SCRIPT: 'This case has no runnable script yet - only chat-generated and scan-suggested cases get one.',
  NO_BASE_URL: 'Set a project URL above first.',
  BROWSERS_MISSING: describeRunError('BROWSER_NOT_READY'),
};
