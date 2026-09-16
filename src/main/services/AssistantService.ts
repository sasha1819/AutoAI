import type { McpServerConfig, SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AssistantSendResult, CaseGenerationResult, ScanRunResult } from '@shared/ipc-contract';
import { effectiveTargetType } from '@shared/ipc-contract';
import type { AgentRunner } from './AgentRunner';
import type { McpServerRepository } from './McpServerStore';
import type { ProjectRepository } from './ProjectStore';
import type { RunRepository } from './RunStore';

/** Low single dollars, same rail every other Agent SDK call in this app
 *  carries - a chat turn is small (a handful of tool calls at most), so this
 *  is deliberately the smallest budget in the app. */
const MAX_BUDGET_USD = 0.5;
const MAX_TURNS = 10;

const MCP_SERVER_NAME = 'autoai';

/** Each tool built below has its own concrete Zod shape; a heterogeneous
 *  array of them can only be typed the same way the SDK's own
 *  `CreateSdkMcpServerOptions.tools` is (`Array<SdkMcpToolDefinition<any>>`),
 *  since a specific tool's handler is contravariant in its arguments and
 *  isn't assignable to a shared supertype otherwise. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AssistantTool = SdkMcpToolDefinition<any>;

/** What ProjectScanService looks like from here - narrowed to the one method
 *  the `run_scan` tool actually calls, so tests can fake it without
 *  constructing a real ProjectScanService (and its own AgentRunner,
 *  EnvironmentChecker, ...). Same "take an interface, not a concrete class"
 *  convention as every other service in this app. */
export interface ScanRunner {
  run(projectId: string): Promise<ScanRunResult>;
}

/** Same narrowing as ScanRunner, for CaseGenerationService's `generate`. */
export interface CaseGenerator {
  generate(projectId: string, prompt: string): Promise<CaseGenerationResult>;
}

export interface AssistantToolDeps {
  readonly projectRepository: ProjectRepository;
  readonly runRepository: RunRepository;
  readonly scanRunner: ScanRunner;
  readonly caseGenerator: CaseGenerator;
  /** The user's own MCP servers - reachable only from here, never from a
   *  scan or case generation (see McpServerService's own doc comment). Each
   *  configured entry becomes one more stdio `mcpServers` entry and one more
   *  `mcp__<name>__*` wildcard in `allowedTools` in `send()` below. */
  readonly mcpServerRepository: McpServerRepository;
}

/** The five tools the assistant gets, plus a way to read what
 *  `open_project_setup` was called with after the query completes - it
 *  returns a marker to the model, not to the renderer, so the renderer
 *  learns about it through this closure instead. Exported (not just used
 *  internally by `send`) so tests can invoke each tool's handler directly
 *  without spending a real query() call. */
export async function buildAssistantTools(
  deps: AssistantToolDeps,
): Promise<{ tools: AssistantTool[]; getOpenProjectSetupId: () => string | null }> {
  // Dynamic import, not static - same ERR_REQUIRE_ESM reasoning as
  // AgentRunner: the SDK ships ESM-only, and electron-vite's
  // externalizeDepsPlugin would otherwise leave this as a real require()
  // call in the CJS main bundle.
  const { tool } = await import('@anthropic-ai/claude-agent-sdk');

  let openProjectSetupId: string | null = null;

  const listProjects = tool(
    'list_projects',
    'List every project AutoAI currently knows about: id, name, effective target type, and whether a base URL is set.',
    {},
    async () => {
      const summary = deps.projectRepository.list().map((project) => ({
        id: project.id,
        name: project.name,
        targetType: effectiveTargetType(project),
        baseUrl: project.baseUrl,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(summary) }] };
    },
  );

  const listRuns = tool(
    'list_runs',
    'List recent test runs, optionally scoped to one project id. Each entry has the case name, pass/fail status, and when it finished.',
    { projectId: z.string().optional() },
    async ({ projectId }) => {
      const runs = projectId ? deps.runRepository.listForProject(projectId) : deps.runRepository.listAll();
      const summary = runs.map((run) => ({
        id: run.id,
        projectId: run.projectId,
        caseName: run.caseName,
        status: run.status,
        finishedAt: run.finishedAt,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(summary) }] };
    },
  );

  const runScan = tool(
    'run_scan',
    "Run AutoAI's project scan for one project id - the same action as pressing \"Scan project\" on that project's page. Reads the project and returns a description, suggested test flows, and what this machine needs to run them.",
    { projectId: z.string() },
    async ({ projectId }) => {
      const result = await deps.scanRunner.run(projectId);
      if (!result.ok) {
        return {
          content: [{ type: 'text', text: `The scan failed: ${result.error}${result.detail ? ` - ${result.detail}` : ''}` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: `Scan complete. ${result.result.description} Found ${result.result.suggestedFlows.length} suggested test flow(s).`,
          },
        ],
      };
    },
  );

  const generateTestCase = tool(
    'generate_test_case',
    'Turn a plain-language description into one draft test case for a project - the same action as the "Describe a test" chat on that project\'s page. This only drafts a preview; it does not save anything, the person still has to add it themselves.',
    { projectId: z.string(), prompt: z.string() },
    async ({ projectId, prompt }) => {
      const result = await deps.caseGenerator.generate(projectId, prompt);
      if (!result.ok) {
        return {
          content: [
            { type: 'text', text: `Could not generate a test case: ${result.error}${result.detail ? ` - ${result.detail}` : ''}` },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Drafted "${result.flow.name}": ${result.flow.description}` }],
      };
    },
  );

  const openProjectSetup = tool(
    'open_project_setup',
    "Open a project's Setup card so the person can review and approve AutoAI installing and starting it. This never installs or starts anything itself - AutoAI only ever runs those commands after the person's own click there.",
    { projectId: z.string() },
    async ({ projectId }) => {
      const project = deps.projectRepository.find(projectId);
      if (!project) {
        return { content: [{ type: 'text', text: `No project with id ${projectId}.` }], isError: true };
      }
      openProjectSetupId = project.id;
      return {
        content: [
          {
            type: 'text',
            text: `Opened the Setup card for "${project.name}". They can review the proposed commands and approve them there - AutoAI never runs them from chat.`,
          },
        ],
      };
    },
  );

  // Each tool above has its own concrete Zod shape, so its handler's
  // parameter type is a specific object type, not `AssistantTool`'s (widened
  // via `any`) one - the same contravariant-parameter mismatch the type
  // alias's own comment explains. `unknown` is the standard, honest way to
  // cross that gap: it does not silently reinterpret anything as a
  // different type the way a direct `as AssistantTool` on each entry would
  // risk masking a real mistake.
  const tools = [listProjects, listRuns, runScan, generateTestCase, openProjectSetup] as unknown as AssistantTool[];

  return { tools, getOpenProjectSetupId: () => openProjectSetupId };
}

/**
 * "Ask AutoAI" from anywhere in the app - a general conversational assistant,
 * distinct from CaseChatCard's project-scoped case generation. It never
 * executes anything consequential directly: it can read (list_projects,
 * list_runs) and trigger the exact same one-click actions that already exist
 * outside chat (run_scan, generate_test_case), plus open_project_setup,
 * which only navigates - the actual install/start still requires the
 * person's own click on the Setup card. No Read/Write/Edit/Bash is ever in
 * `allowedTools`.
 *
 * Conversation continuity is renderer-driven: the caller passes back
 * whatever `sessionId` the previous reply carried, which is threaded through
 * as the Agent SDK's `resume` option.
 */
export class AssistantService {
  constructor(
    private readonly agentRunner: AgentRunner,
    private readonly deps: AssistantToolDeps,
  ) {}

  public async send(message: string, sessionId: string | null): Promise<AssistantSendResult> {
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: 'ASSISTANT_FAILED', detail: 'Say something first.' };
    }

    const { tools, getOpenProjectSetupId } = await buildAssistantTools(this.deps);

    // Dynamic import - see buildAssistantTools' own note on why.
    const { createSdkMcpServer } = await import('@anthropic-ai/claude-agent-sdk');
    const server = createSdkMcpServer({ name: MCP_SERVER_NAME, tools });

    const allowedTools = tools.map((t) => `mcp__${MCP_SERVER_NAME}__${t.name}`);
    const mcpServers: Record<string, McpServerConfig> = { [MCP_SERVER_NAME]: server };

    // The user's own configured MCP servers - reachable only from here (see
    // AssistantToolDeps.mcpServerRepository's own comment). Each one is a
    // real command this machine will spawn the moment the model actually
    // calls one of its tools; McpServerService.add is what keeps a server
    // from ever being named "autoai" and colliding with the entry above.
    for (const entry of this.deps.mcpServerRepository.list()) {
      mcpServers[entry.name] = { type: 'stdio', command: entry.command, args: [...entry.args], env: { ...entry.env } };
      allowedTools.push(`mcp__${entry.name}__*`);
    }

    const outcome = await this.agentRunner.run(trimmed, {
      allowedTools,
      mcpServers,
      maxTurns: MAX_TURNS,
      maxBudgetUsd: MAX_BUDGET_USD,
      resume: sessionId ?? undefined,
      persistSession: true,
    });

    if (!outcome.ok) {
      if (outcome.reason === 'NOT_LOGGED_IN') {
        return { ok: false, error: 'NOT_CONNECTED', detail: outcome.detail };
      }
      return { ok: false, error: 'ASSISTANT_FAILED', detail: outcome.detail };
    }

    return {
      ok: true,
      reply: {
        text: outcome.text,
        sessionId: outcome.sessionId ?? '',
        openProjectSetupId: getOpenProjectSetupId(),
      },
    };
  }
}
