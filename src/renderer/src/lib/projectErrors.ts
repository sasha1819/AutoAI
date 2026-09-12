import type { AddProjectErrorCode } from '@shared/ipc-contract';

const MESSAGES: Record<AddProjectErrorCode, string> = {
  NAME_REQUIRED: 'Give the project a name.',
  INVALID_GIT_URL: 'That doesn’t look like a git URL AutoAI can clone.',
  GIT_NOT_INSTALLED: 'git isn’t installed on this machine.',
  CLONE_FAILED: 'The clone failed.',
  INVALID_LOCAL_PATH: 'Choose a folder first.',
  PATH_NOT_FOUND: 'That folder couldn’t be found.',
};

export function describeProjectError(code: AddProjectErrorCode): string {
  return MESSAGES[code];
}
