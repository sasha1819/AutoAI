import type { McpServerConfig, Options, OutputFormat } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeEffortLevel } from '@shared/ipc-contract';
import type { ModelPreferenceRepository } from './ModelPreferenceStore';

/**
 * The one seam between AutoAI's main-process services and the Claude Agent
 * SDK. Everything that needs Claude to run - the Settings "check
 * connection" probe, a project scan - goes through this interface rather
 * than calling `query()` directly, so ClaudeConnectionService and
 * ProjectScanService can be unit-tested with a fake that returns a canned
 * result (success or an auth-shaped failure) instead of spending real
 * tokens every test run.
 */
export interface AgentRunOptions {
  readonly cwd?: string;
  /** The only tools the model is even given - not just auto-allowed. An
   *  empty array (the connection probe) means no tools at all. */
  readonly allowedTools?: readonly string[];
  readonly maxTurns?: number;
  readonly maxBudgetUsd?: number;
  readonly outputFormat?: OutputFormat;
  /** In-process MCP servers (from the SDK's `createSdkMcpServer`), keyed by
   *  server name - only AssistantService's custom tools use this today. A
   *  tool from server "x" must also appear in `allowedTools` as
   *  `mcp__x__<tool name>`, or the model is never even offered it. */
  readonly mcpServers?: Record<string, McpServerConfig>;
  /** Resumes a previous session's conversation history - see
   *  AssistantService, the only caller that threads conversations across
   *  calls. Every other caller in this app runs one-off, unrelated queries. */
  readonly resume?: string;
  /** Whether this call's session is written to `~/.claude/projects/` so a
   *  later call can `resume` it - the SDK's own `resume` doc is explicit
   *  that a session "cannot be resumed later" once persistence is off.
   *  Defaults to false here (deliberately the opposite of the SDK's own
   *  default) because every caller before AssistantService runs one-off,
   *  unrelated queries and has no reason to clutter that folder.
   *  AssistantService is the only caller that passes `true`. */
  readonly persistSession?: boolean;
  /** Overrides the stored model/effort preference for this one call.
   *  Nobody currently sets these - every real caller goes through the
   *  stored ModelPreferenceStore instead - but the seam exists for a
   *  future caller that genuinely needs a specific model regardless of
   *  what the user picked in Settings. */
  readonly model?: string;
  readonly effort?: ClaudeEffortLevel;
}

export type AgentRunOutcome =
  | {
      readonly ok: true;
      readonly text: string;
      readonly structuredOutput: unknown;
      /** The session id this call ran under - pass back as `resume` on a
       *  later call to continue the same conversation. Always populated by
       *  the real SDK on a successful result; optional here only so callers
       *  that never resume (every service but AssistantService) don't have
       *  to fabricate one in tests. */
      readonly sessionId?: string;
    }
  | { readonly ok: false; readonly reason: 'NOT_LOGGED_IN' | 'ERROR'; readonly detail?: string };

export interface AgentRunner {
  run(prompt: string, options: AgentRunOptions): Promise<AgentRunOutcome>;
}

/** `SDKAssistantMessageError` values (sdk.d.ts) that mean "this session
 * can't authenticate," as opposed to a rate limit, an overload, or some
 * other transient/API-side problem. */
const AUTH_ERROR_CODES = new Set<string>(['authentication_failed', 'oauth_org_not_allowed', 'account_on_hold']);

/**
 * Wraps a single `query()` call end to end: builds the SDK options, drains
 * the async generator, and maps whatever comes back onto AgentRunOutcome.
 *
 * There is no lightweight "is Claude logged in" check in the SDK - the only
 * way to find out is to run a real query and see what happens. Confirmed
 * directly against `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
 * (v0.3.268) and a live throwaway probe run against this exact install:
 *
 * - A query that cannot even be started (e.g. the Claude Code executable
 *   can't be spawned) throws synchronously out of the `for await` loop -
 *   observed live by pointing `pathToClaudeCodeExecutable` at a bogus path.
 *   Handled by the outer try/catch below.
 * - A query that starts but can't authenticate streams an `assistant`
 *   message carrying `error: 'authentication_failed'` (one of
 *   `SDKAssistantMessageError`'s values), followed by a `result` message
 *   whose `is_error` is true. Handled by tracking that error across the
 *   stream and consulting it once the terminal `result` message arrives.
 * - A query that succeeds streams a `result` message with
 *   `subtype: 'success'` and `is_error: false` - observed live, `result:
 *   'pong'` for a plain "ping" prompt.
 *
 * `tools` (not just `allowedTools`) is set to the same restricted list so a
 * disallowed tool is never even offered to the model, not merely denied
 * after being requested - the strongest form of "this can never modify
 * anything it's pointed at" the SDK exposes. `persistSession` defaults to
 * `false` here, keeping one-off automated calls out of
 * `~/.claude/projects/` - AssistantService opts back in per-call since its
 * `resume` support needs a persisted session to load history from.
 */
export class ClaudeAgentRunner implements AgentRunner {
  constructor(private readonly modelPreference: ModelPreferenceRepository) {}

  public async run(prompt: string, options: AgentRunOptions): Promise<AgentRunOutcome> {
    const tools = options.allowedTools ? [...options.allowedTools] : [];
    // The stored preference is injected here, transparently, so every
    // existing caller (ProjectScanService, CaseGenerationService,
    // AssistantService) gets it automatically without knowing it exists.
    // A caller's own explicit `model`/`effort` (none exist yet) would win.
    const preference = this.modelPreference.get();

    const sdkOptions: Options = {
      cwd: options.cwd,
      tools,
      allowedTools: tools,
      maxTurns: options.maxTurns,
      maxBudgetUsd: options.maxBudgetUsd,
      outputFormat: options.outputFormat,
      mcpServers: options.mcpServers,
      resume: options.resume,
      persistSession: options.persistSession ?? false,
      model: options.model ?? preference.model ?? undefined,
      effort: options.effort ?? preference.effort ?? undefined,
    };

    let authErrorDetail: string | null = null;

    try {
      // Dynamic import, not a static one: the SDK ships ESM-only
      // (sdk.mjs), but electron-vite's externalizeDepsPlugin leaves
      // node_modules imports as real require() calls in the CJS main
      // bundle, and require() of an ESM-only package throws
      // ERR_REQUIRE_ESM. A dynamic import() is what Node's CJS loader
      // can actually use to load it.
      const { query } = await import('@anthropic-ai/claude-agent-sdk');
      const stream = query({ prompt, options: sdkOptions });

      for await (const message of stream) {
        if (message.type === 'assistant' && message.error && AUTH_ERROR_CODES.has(message.error)) {
          authErrorDetail = message.error;
        }

        if (message.type === 'result') {
          if (message.subtype === 'success' && !message.is_error) {
            return {
              ok: true,
              text: message.result,
              structuredOutput: message.structured_output,
              sessionId: message.session_id,
            };
          }
          if (authErrorDetail) {
            return { ok: false, reason: 'NOT_LOGGED_IN', detail: authErrorDetail };
          }
          const detail =
            'errors' in message && message.errors.length > 0
              ? message.errors.join('; ')
              : message.subtype === 'success'
                ? message.result
                : message.subtype;
          return { ok: false, reason: 'ERROR', detail };
        }
      }

      return { ok: false, reason: 'ERROR', detail: 'The agent ended without returning a result.' };
    } catch (error) {
      const err = error as Error;
      return { ok: false, reason: 'ERROR', detail: err.message ?? String(error) };
    }
  }
}
