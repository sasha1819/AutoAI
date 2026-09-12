import type { SelectorFinding, SelectorScanResult } from './SelectorScanner';
import type { SuggestedFlow, TestActionKind, TestStepAction } from '@shared/ipc-contract';

/**
 * Shared between ProjectScanService and CaseGenerationService: the JSON
 * schema for one `SuggestedFlow` (including its optional `script`), the
 * selector-grounding prompt block, and the defensive parsing of a flow that
 * comes back from Claude's structured output. Stated once and reused, per
 * the plan, rather than duplicated across a full scan and a single-flow
 * chat generation.
 */

const TEST_ACTION_KINDS: readonly TestActionKind[] = ['goto', 'click', 'fill', 'check', 'select', 'assertText'];
const SELECTOR_ATTRIBUTE_KINDS = ['id', 'name', 'data-testid', 'for', 'aria-label'] as const;

/** Keeps the selector context folded into the prompt to a few hundred
 *  tokens even when a scan found the full 150-finding cap. */
export const MAX_SELECTORS_IN_PROMPT = 40;

export const TEST_STEP_ACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: TEST_ACTION_KINDS },
    selectorKind: { type: 'string', enum: SELECTOR_ATTRIBUTE_KINDS },
    selectorValue: { type: 'string' },
    value: { type: 'string' },
  },
  required: ['action'],
  additionalProperties: false,
};

export const SUGGESTED_FLOW_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    targetSelectors: { type: 'array', items: { type: 'string' } },
    script: { type: 'array', items: TEST_STEP_ACTION_SCHEMA },
  },
  required: ['name', 'description', 'steps'],
  additionalProperties: false,
};

/** The rules every prompt that asks Claude to produce a `script` restates
 *  by reference to this text - grounding a runnable step exactly as
 *  strictly as `targetSelectors` already is. */
export const SCRIPT_GROUNDING_RULES: readonly string[] = [
  '`script` is the machine-executable subset of `steps` - it does not need to cover every step, and can be shorter than `steps` or even empty.',
  'Only ever build a `script` step from a selectorKind/selectorValue pair that is a real id/name/data-testid/for/aria-label value you actually found - either in the selector list below or while reading the code yourself. Never invent one.',
  'A step that cannot be grounded in a real selector stays described in `steps` only and is left out of `script` entirely - do not guess a selector just to fill it in.',
  'For a `goto` step, `value` is a path actually seen referenced in the project (a route, a link href, a form action), relative to the project root - e.g. "/checkout". Never invent a route.',
  'For `fill`, `value` is the literal text to type. For `select`, `value` is the option value to choose. For `assertText`, `value` is the substring expected to appear. `click` and `check` need no `value`.',
];

export function buildSelectorGroundingBlock(selectors: SelectorScanResult): string[] {
  const lines: string[] = [];
  if (selectors.findings.length > 0) {
    lines.push(
      'A separate local scan already found these real HTML/template attributes in the project (kind="value" <tag> path xOccurrences) - ground selectors in these where they genuinely fit, but you are not limited to them if you find better ones while reading:',
      summarizeSelectors(selectors),
    );
  } else {
    lines.push(
      'A separate local scan found no id/name/data-testid/for/aria-label attributes in the project. Do not invent any - describe steps in plain language instead, unless you find real ones yourself while reading.',
    );
  }

  if (selectors.truncated) {
    lines.push(
      '(That local scan stopped early after hitting its size limits, so more selectors may exist in the project than are listed above.)',
    );
  }

  return lines;
}

function summarizeSelectors(selectors: SelectorScanResult): string {
  const top: readonly SelectorFinding[] = [...selectors.findings]
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, MAX_SELECTORS_IN_PROMPT);

  return top.map((f) => `- ${f.kind}="${f.value}" <${f.tag ?? '?'}> ${f.path} x${f.occurrences}`).join('\n');
}

/**
 * Defensive parsing of one `SuggestedFlow` from a model's structured
 * output - a trust boundary the same way any renderer-supplied IPC payload
 * is, per TestPlanService's parse* functions and ProjectScanService's own
 * note on this.
 */
export function parseSuggestedFlow(raw: unknown): SuggestedFlow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const name = row['name'];
  const description = row['description'];
  const steps = row['steps'];
  const targetSelectors = row['targetSelectors'];
  const scriptRaw = row['script'];

  if (typeof name !== 'string') return null;
  if (typeof description !== 'string') return null;
  if (!Array.isArray(steps) || !steps.every((step) => typeof step === 'string')) return null;
  if (
    targetSelectors !== undefined &&
    (!Array.isArray(targetSelectors) || !targetSelectors.every((s) => typeof s === 'string'))
  ) {
    return null;
  }

  let script: TestStepAction[] | undefined;
  if (scriptRaw !== undefined) {
    if (!Array.isArray(scriptRaw)) return null;
    script = [];
    for (const entry of scriptRaw) {
      const parsed = parseTestStepAction(entry);
      if (!parsed) return null;
      script.push(parsed);
    }
  }

  return {
    name,
    description,
    steps: steps as string[],
    targetSelectors: targetSelectors as string[] | undefined,
    script,
  };
}

/** Exported (not just used internally by parseSuggestedFlow) so
 *  TestPlanService can validate a renderer-supplied `script` with the same
 *  rules, rather than a second, looser check at the IPC boundary. */
export function parseTestStepAction(raw: unknown): TestStepAction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const action = row['action'];
  const selectorKind = row['selectorKind'];
  const selectorValue = row['selectorValue'];
  const value = row['value'];

  if (typeof action !== 'string' || !TEST_ACTION_KINDS.includes(action as TestActionKind)) return null;
  if (selectorKind !== undefined && !SELECTOR_ATTRIBUTE_KINDS.includes(selectorKind as (typeof SELECTOR_ATTRIBUTE_KINDS)[number])) {
    return null;
  }
  if (selectorValue !== undefined && typeof selectorValue !== 'string') return null;
  if (value !== undefined && typeof value !== 'string') return null;

  return {
    action: action as TestActionKind,
    selectorKind: selectorKind as TestStepAction['selectorKind'],
    selectorValue: selectorValue as string | undefined,
    value: value as string | undefined,
  };
}
