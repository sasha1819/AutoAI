import type { Project, ProjectScanResult, ProjectSetupProposal, ScanRunResult, SuggestedFlow } from '@shared/ipc-contract';
import { effectiveTargetType, TargetType } from '@shared/ipc-contract';
import type { AgentRunner } from './AgentRunner';
import type { EnvironmentChecker } from './EnvironmentCheckService';
import type { ProjectDataOwner } from './ProjectService';
import type { ProjectRepository } from './ProjectStore';
import type { ScanRepository } from './ScanStore';
import type { SelectorScanResult } from './SelectorScanner';
import { scanSelectors } from './SelectorScanner';
import {
  buildSelectorGroundingBlock,
  parseSuggestedFlow,
  SCRIPT_GROUNDING_RULES,
  SUGGESTED_FLOW_SCHEMA,
} from './TestFlowSchema';

/** Low single dollars, as a safety rail on top of maxTurns - the plan's own
 * words for this budget. */
const MAX_BUDGET_USD = 2;
/** Enough round-trips for Claude to actually explore a small-to-medium
 * project with Read/Grep/Glob before it has to wrap up. */
const MAX_TURNS = 40;

const SETUP_PROPOSAL_SCHEMA: Record<string, unknown> = {
  type: ['object', 'null'],
  properties: {
    installCommands: { type: 'array', items: { type: 'string' } },
    startCommand: { type: ['string', 'null'] },
    startCommandExplanation: { type: ['string', 'null'] },
    expectedBasePath: { type: ['string', 'null'] },
  },
  required: ['installCommands', 'startCommand', 'startCommandExplanation', 'expectedBasePath'],
  additionalProperties: false,
};

const SCAN_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    suggestedFlows: {
      type: 'array',
      items: SUGGESTED_FLOW_SCHEMA,
    },
    environmentNotes: { type: 'array', items: { type: 'string' } },
    setup: SETUP_PROPOSAL_SCHEMA,
    detectedTargetType: { type: ['string', 'null'], enum: [TargetType.Mobile, TargetType.Web, TargetType.Desktop, null] },
  },
  required: ['description', 'suggestedFlows', 'environmentNotes', 'setup', 'detectedTargetType'],
  additionalProperties: false,
};

/**
 * One "Scan project" action, one Agent SDK call: a plain-language
 * description, suggested test flows grounded in real selectors where one
 * exists, and short environment notes - folded together with the
 * deterministic local tooling checklist from EnvironmentCheckService into a
 * single ProjectScanResult, persisted per project so reopening one shows
 * the last scan instead of nothing.
 *
 * Implements ProjectDataOwner so a scan is deleted with its project, same
 * as TestPlanService - see main/index.ts where both are registered.
 */
export class ProjectScanService implements ProjectDataOwner {
  constructor(
    private readonly scanRepository: ScanRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly agentRunner: AgentRunner,
    private readonly environmentChecker: EnvironmentChecker,
  ) {}

  public async run(projectId: string): Promise<ScanRunResult> {
    const project = this.projectRepository.find(projectId);
    if (!project) {
      return { ok: false, error: 'PROJECT_NOT_FOUND' };
    }

    const selectors = await safeScanSelectors(project.localPath);

    const outcome = await this.agentRunner.run(buildPrompt(project, selectors), {
      cwd: project.localPath,
      // Read/Grep/Glob only - no Write/Edit/Bash, so a scan can never
      // modify anything it's pointed at.
      allowedTools: ['Read', 'Grep', 'Glob'],
      maxTurns: MAX_TURNS,
      maxBudgetUsd: MAX_BUDGET_USD,
      outputFormat: { type: 'json_schema', schema: SCAN_OUTPUT_SCHEMA },
    });

    if (!outcome.ok) {
      if (outcome.reason === 'NOT_LOGGED_IN') {
        return { ok: false, error: 'NOT_CONNECTED', detail: outcome.detail };
      }
      return { ok: false, error: 'SCAN_FAILED', detail: outcome.detail };
    }

    const parsed = parseStructuredOutput(outcome.structuredOutput);
    if (!parsed) {
      return { ok: false, error: 'SCAN_FAILED', detail: 'Claude did not return the expected structured result.' };
    }

    // Only fills in a target type nobody has settled yet - never overwrites
    // a manual override or a detection heuristic that already found
    // something. Applied (not just proposed) before the environment check
    // below, so a project that was Unknown a moment ago gets a checklist
    // that actually matches what it turned out to be, in the same scan.
    let appliedTargetType: TargetType | null = null;
    let effectiveProject = project;
    if (
      effectiveTargetType(project) === TargetType.Unknown &&
      project.overriddenTargetType === null &&
      parsed.detectedTargetType !== null
    ) {
      const updated = this.projectRepository.update(projectId, { overriddenTargetType: parsed.detectedTargetType });
      if (updated) {
        appliedTargetType = parsed.detectedTargetType;
        effectiveProject = updated;
      }
    }

    // Runs only now, not in parallel with the agent call above, because it
    // needs to know what the scan actually proposed running - checking for
    // PHP only makes sense once `setup.startCommand` says the project needs
    // `php -S ...`. The selector scan above has no such dependency and
    // stays parallel with the agent call.
    const environment = await this.environmentChecker.check(
      effectiveTargetType(effectiveProject),
      effectiveProject.localPath,
      parsed.setup?.startCommand ?? null,
      effectiveProject.detection?.evidence ?? [],
    );

    const result: ProjectScanResult = {
      description: parsed.description,
      suggestedFlows: parsed.suggestedFlows,
      environmentNotes: parsed.environmentNotes,
      environment,
      setup: parsed.setup,
      generatedAt: new Date().toISOString(),
    };

    this.scanRepository.set(projectId, result);
    return { ok: true, result, appliedTargetType };
  }

  public getLast(projectId: string): ProjectScanResult | null {
    return this.scanRepository.get(projectId);
  }

  /** ProjectDataOwner: the scan goes when the project it describes does. */
  public removeAllForProject(projectId: string): void {
    this.scanRepository.remove(projectId);
  }
}

/** Selector scanning reads arbitrary project files - a crash there (a
 * permission error, something unreadable) should degrade to "no selector
 * context" rather than fail the whole scan, same reasoning as
 * `safeDetect` in ProjectService. */
async function safeScanSelectors(root: string): Promise<SelectorScanResult> {
  try {
    return await scanSelectors(root);
  } catch {
    return { findings: [], filesScanned: 0, filesSkipped: 0, truncated: false, generatedAt: new Date().toISOString() };
  }
}

function buildPrompt(project: Project, selectors: SelectorScanResult): string {
  const lines: string[] = [
    `You are looking at a real project called "${project.name}" at the current working directory. Explore it with Read, Grep, and Glob to understand what it is and how it is structured - you have no ability to modify anything here, so explore as freely as you need to.`,
    '',
    'Produce exactly five things, matching the required output shape:',
    '1. `description` - a plain-language paragraph (roughly 3-6 sentences) describing the project\'s structure and purpose, written for someone who has not opened the code yet.',
    '2. `suggestedFlows` - a handful (aim for 3-8) of realistic end-to-end test flows a person could run against this project. Each needs a short `name`, a one-sentence `description`, ordered plain-language `steps`, and - only when you actually found a matching real selector, either below or while reading the code yourself - a `targetSelectors` list of the exact id/name/data-testid/for/aria-label values a test could target. Never invent a selector you did not actually see. Also produce a `script` for each flow, per the rules below.',
    '3. `environmentNotes` - short strings (a sentence or less each) for anything you noticed while reading that a test runner would need in order to actually exercise this project: a database dependency, a required environment variable, a third-party API key, that kind of thing. An empty array is correct if you saw nothing like that.',
    '4. `setup` - what it would actually take to install this project\'s dependencies and start it, or null if you are not confident enough to propose one. Only ever propose a command you can ground in a real file you read: a `composer.json` means `composer install`; a `package.json` with a `dev` or `start` script means `npm run <that script>`; plain `.php` files with no framework marker mean `php -S localhost:8000 -t .`; that kind of reasoning. `installCommands` is an ordered list of shell commands (empty array if nothing needs installing). `startCommand` is the one command that actually runs the project, or null if you cannot confidently identify one - in that case `startCommandExplanation` says why in a sentence, otherwise it is null. `expectedBasePath` is a literal sub-path (like `/taaza`) you actually found hardcoded somewhere in the project\'s own code - a verification link, a base-URL constant, a config file - where the app expects to be served, as distinct from whatever host:port it runs on. Null unless you genuinely saw one; do not infer it from the folder or project name. Never invent a command or a path that does not match what you actually found.',
    '5. `detectedTargetType` - "mobile", "web", or "desktop" if what you read makes it clearly one of those (a package.json with react-native/expo, or an index.html/web server entry point, or a desktop-app manifest like electron-builder.yml or a .csproj), otherwise `null`. This only fills in a target type that is still unset and unconfirmed elsewhere in the app - like everything else here, only report it when you are actually confident from what you read, never guess to fill in the field.',
    '',
    'Rules for each flow\'s `script` (a machine-executable subset of its `steps`):',
    ...SCRIPT_GROUNDING_RULES.map((rule) => `- ${rule}`),
    '',
    ...buildSelectorGroundingBlock(selectors),
  ];

  return lines.join('\n');
}

interface ParsedScanOutput {
  readonly description: string;
  readonly suggestedFlows: SuggestedFlow[];
  readonly environmentNotes: string[];
  readonly setup: ProjectSetupProposal | null;
  readonly detectedTargetType: TargetType | null;
}

const DETECTABLE_TARGET_TYPES: readonly TargetType[] = [TargetType.Mobile, TargetType.Web, TargetType.Desktop];

/**
 * Defensive parsing of Claude's structured output. `outputFormat` constrains
 * the *shape* the SDK asks the model to produce, but it is still a model
 * output crossing a trust boundary into data this app persists and the
 * renderer displays - so it gets the same "never trust the annotation"
 * treatment as any renderer-supplied IPC payload (see TestPlanService's
 * parse* functions).
 */
function parseStructuredOutput(raw: unknown): ParsedScanOutput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  const description = candidate['description'];
  const suggestedFlowsRaw = candidate['suggestedFlows'];
  const environmentNotesRaw = candidate['environmentNotes'];
  const setupRaw = candidate['setup'];
  // Same leniency `setup` already gets below - an omitted key and an
  // explicit null mean the same thing to this parser.
  const detectedTargetTypeRaw = candidate['detectedTargetType'] ?? null;

  if (typeof description !== 'string') return null;
  if (!Array.isArray(suggestedFlowsRaw)) return null;
  if (!Array.isArray(environmentNotesRaw)) return null;
  if (!environmentNotesRaw.every((note) => typeof note === 'string')) return null;
  if (detectedTargetTypeRaw !== null && !DETECTABLE_TARGET_TYPES.includes(detectedTargetTypeRaw as TargetType)) {
    return null;
  }
  const detectedTargetType = detectedTargetTypeRaw as TargetType | null;

  const suggestedFlows: SuggestedFlow[] = [];
  for (const entry of suggestedFlowsRaw) {
    const flow = parseSuggestedFlow(entry);
    if (!flow) return null;
    suggestedFlows.push(flow);
  }

  const environmentNotes = environmentNotesRaw as string[];

  if (setupRaw !== null && setupRaw !== undefined) {
    const setup = parseSetupProposal(setupRaw);
    if (!setup) return null;
    return { description, suggestedFlows, environmentNotes, setup, detectedTargetType };
  }

  return { description, suggestedFlows, environmentNotes, setup: null, detectedTargetType };
}

/** Same defensive-parsing reasoning as `parseSuggestedFlow` in
 *  TestFlowSchema - a model output crossing a trust boundary into data this
 *  app persists and (eventually) acts on via CommandAllowlist, never
 *  assumed well-formed just because `outputFormat` asked for this shape. */
function parseSetupProposal(raw: unknown): ProjectSetupProposal | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const installCommandsRaw = row['installCommands'];
  const startCommand = row['startCommand'];
  const startCommandExplanation = row['startCommandExplanation'];
  const expectedBasePath = row['expectedBasePath'];

  if (!Array.isArray(installCommandsRaw) || !installCommandsRaw.every((c) => typeof c === 'string')) return null;
  if (startCommand !== null && typeof startCommand !== 'string') return null;
  if (startCommandExplanation !== null && typeof startCommandExplanation !== 'string') return null;
  if (expectedBasePath !== null && typeof expectedBasePath !== 'string') return null;

  return {
    installCommands: installCommandsRaw as string[],
    startCommand,
    startCommandExplanation,
    expectedBasePath,
  };
}
