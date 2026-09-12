import type { TestPlanErrorCode } from '@shared/ipc-contract';

const MESSAGES: Record<TestPlanErrorCode, string> = {
  INVALID_INPUT: "That didn't come through correctly - try again.",
  NAME_REQUIRED: 'Give it a name.',
  STEPS_REQUIRED: 'Write at least one step.',
  PROJECT_NOT_FOUND: 'That project is no longer on this machine - reopen AutoAI to refresh.',
  AREA_NOT_FOUND: 'That area is gone - reopen the project to refresh the list.',
  AREA_ALREADY_EXISTS: 'This project already has an area with that name.',
  CASE_NOT_FOUND: 'That test case is gone - reopen the project to refresh the list.',
  NOTHING_TO_IMPORT: 'There was nothing in there to import.',
};

export function describeTestPlanError(code: TestPlanErrorCode): string {
  return MESSAGES[code];
}
