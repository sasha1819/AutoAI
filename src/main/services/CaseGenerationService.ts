import type { CaseGenerationResult, Project } from '@shared/ipc-contract';
import type { AgentRunner } from './AgentRunner';
import type { ProjectRepository } from './ProjectStore';
import type { SelectorScanResult } from './SelectorScanner';
import { scanSelectors } from './SelectorScanner';
import { buildSelectorGroundingBlock, parseSuggestedFlow, SCRIPT_GROUNDING_RULES, SUGGESTED_FLOW_SCHEMA } from './TestFlowSchema';

/** Smaller than a full project scan (ProjectScanService's MAX_BUDGET_USD/
 *  MAX_TURNS): this is one targeted flow from an already-specific prompt,
 *  not an open-ended read of the whole project. */
const MAX_BUDGET_USD = 0.5;
const MAX_TURNS = 15;

const CASE_GENERATION_OUTPUT_SCHEMA: Record<string, unknown> = SUGGESTED_FLOW_SCHEMA;

/**
 * The chat alternative to a project scan's suggested flows: one plain-
 * language request in, one `SuggestedFlow` out - for when the person knows
 * exactly what they want tested rather than wanting AutoAI to explore and
 * suggest. Structurally a smaller sibling of ProjectScanService - same
 * AgentRunner/selector-grounding/json_schema/defensive-parsing pattern,
 * reusing the same grounding rules and parser from TestFlowSchema so the
 * two never drift apart on what "runnable" means.
 *
 * Not persisted here - the renderer holds the returned flow locally as a
 * preview until "Add as test case" turns it into a real TestCaseRecord via
 * the existing testPlan.createCase.
 */
export class CaseGenerationService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly agentRunner: AgentRunner,
  ) {}

  public async generate(projectId: string, prompt: string): Promise<CaseGenerationResult> {
    const project = this.projectRepository.find(projectId);
    if (!project) {
      return { ok: false, error: 'PROJECT_NOT_FOUND' };
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
      return { ok: false, error: 'PROMPT_REQUIRED' };
    }

    const selectors = await safeScanSelectors(project.localPath);

    const outcome = await this.agentRunner.run(buildPrompt(project, trimmedPrompt, selectors), {
      cwd: project.localPath,
      // Read/Grep/Glob only - no Write/Edit/Bash, same as a full scan: this
      // never modifies anything it's pointed at.
      allowedTools: ['Read', 'Grep', 'Glob'],
      maxTurns: MAX_TURNS,
      maxBudgetUsd: MAX_BUDGET_USD,
      outputFormat: { type: 'json_schema', schema: CASE_GENERATION_OUTPUT_SCHEMA },
    });

    if (!outcome.ok) {
      if (outcome.reason === 'NOT_LOGGED_IN') {
        return { ok: false, error: 'NOT_CONNECTED', detail: outcome.detail };
      }
      return { ok: false, error: 'GENERATION_FAILED', detail: outcome.detail };
    }

    const flow = parseSuggestedFlow(outcome.structuredOutput);
    if (!flow) {
      return { ok: false, error: 'GENERATION_FAILED', detail: 'Claude did not return the expected structured result.' };
    }

    return { ok: true, flow };
  }
}

/** Same degrade-to-empty reasoning as ProjectScanService's
 *  safeScanSelectors: a crash reading the project's own files should never
 *  fail generation outright, only drop the selector context. */
async function safeScanSelectors(root: string): Promise<SelectorScanResult> {
  try {
    return await scanSelectors(root);
  } catch {
    return { findings: [], filesScanned: 0, filesSkipped: 0, truncated: false, generatedAt: new Date().toISOString() };
  }
}

function buildPrompt(project: Project, prompt: string, selectors: SelectorScanResult): string {
  const lines: string[] = [
    `You are looking at a real project called "${project.name}" at the current working directory. Explore it with Read, Grep, and Glob as needed - you have no ability to modify anything here.`,
    '',
    `A person who wants a test case has described it in their own words: "${prompt}"`,
    '',
    'Turn that into exactly one realistic, well-formed test flow, matching the required output shape: a short `name`, a one-sentence `description`, ordered plain-language `steps` that actually reflect what they asked for, and - only when you actually found a matching real selector, either below or while reading the code yourself - a `targetSelectors` list of the exact id/name/data-testid/for/aria-label values a test could target. Never invent a selector you did not actually see. Also produce a `script`, per the rules below.',
    '',
    'Rules for `script` (a machine-executable subset of `steps`):',
    ...SCRIPT_GROUNDING_RULES.map((rule) => `- ${rule}`),
    '',
    ...buildSelectorGroundingBlock(selectors),
  ];

  return lines.join('\n');
}
