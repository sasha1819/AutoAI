import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// https, no embedded userinfo (no "user:pass@") - see the note below on why
// credentials-in-URL are rejected outright rather than stored.
const HTTPS_GIT_URL = /^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?\/[a-zA-Z0-9._\-/]+(?:\.git)?\/?$/;
// git@host:path shorthand - auth here is via the user's own SSH agent/keys,
// never a secret embedded in the string.
const SSH_GIT_URL = /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._\-/]+(?:\.git)?$/;

/**
 * True only for a strictly-shaped https or SSH git remote. Rejects anything
 * with whitespace, shell metacharacters, or a leading '-' (which could be
 * interpreted as a git flag rather than a positional URL argument) even
 * though execFile below never goes through a shell - defense in depth, and
 * it also just rejects garbage input early with a clear error.
 */
export function isValidGitUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed !== url) return false; // no leading/trailing whitespace smuggled in
  if (trimmed.startsWith('-')) return false;
  if (trimmed.includes('@') && trimmed.startsWith('https://')) return false; // no embedded credentials
  return HTTPS_GIT_URL.test(trimmed) || SSH_GIT_URL.test(trimmed);
}

export type GitCloneOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'not-installed' | 'clone-failed'; readonly detail?: string };

/**
 * Clones `url` into `destDir` (which must already be an empty, pre-created
 * directory the caller controls - never a path derived from user input).
 * Uses execFile (argv array, no shell) plus a `--` separator before the
 * positional URL, which is git's own documented defense against a
 * maliciously-crafted "URL" being parsed as a flag instead
 * (e.g. `--upload-pack=...`). Shallow clone, bounded timeout, no prompts.
 */
export class GitService {
  public async clone(url: string, destDir: string, branch?: string): Promise<GitCloneOutcome> {
    if (!isValidGitUrl(url)) {
      return { ok: false, reason: 'clone-failed', detail: 'URL failed validation before any git process was spawned.' };
    }

    const args = ['clone', '--depth', '1', '--single-branch'];
    if (branch) {
      args.push('--branch', branch);
    }
    args.push('--', url, destDir);

    try {
      await execFileAsync('git', args, {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, // never hang waiting for interactive credentials
      });
      return { ok: true };
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stderr?: string };
      if (err.code === 'ENOENT') {
        return { ok: false, reason: 'not-installed' };
      }
      return { ok: false, reason: 'clone-failed', detail: (err.stderr ?? err.message ?? '').slice(0, 2000) };
    }
  }
}
