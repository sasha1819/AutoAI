/**
 * The hard gate in front of every command AutoAI ever executes on a user's
 * machine on its own initiative. Claude proposes install/start commands as
 * plain strings (ProjectScanService's `setup` proposal) - grounded in what
 * it actually read, same discipline as a selector - but a project's own
 * files are untrusted content from AutoAI's perspective, and a
 * prompt-injection-style attack hidden in a README or config is a real,
 * documented risk class for agentic tools that read arbitrary repos.
 *
 * This is a pure, local, trivially-testable string check: no network call,
 * no filesystem access, no dependency on anything else in the app. A
 * command that fails it is never passed to `child_process` - see
 * ProjectSetupService, the only caller.
 */

/** Every prefix a command must start with (after trimming) to even be
 *  considered - a small, fixed allowlist of well-known package managers and
 *  dev-server launchers, not a general-purpose shell gate. */
const ALLOWED_PREFIXES: readonly string[] = [
  'npm ',
  'npx ',
  'yarn ',
  'pnpm ',
  'composer ',
  'pip ',
  'pip3 ',
  'bundle ',
  'php -S',
  'python -m http.server',
  'python3 -m http.server',
];

/** Any of these appearing anywhere in the command fails it outright, even if
 *  the prefix matches - shell-chaining, substitution, and redirection are
 *  exactly how a single "safe-looking" command smuggles a second one in. */
const FORBIDDEN_TOKENS: readonly string[] = [';', '&&', '||', '|', '`', '$(', '>', '<'];

export function isAllowedCommand(command: string): boolean {
  const trimmed = command.trim();
  if (trimmed.length === 0) return false;
  if (FORBIDDEN_TOKENS.some((token) => trimmed.includes(token))) return false;
  return ALLOWED_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}
