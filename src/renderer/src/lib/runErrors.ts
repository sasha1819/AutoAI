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
