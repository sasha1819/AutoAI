import type { CreateTestCaseInput, Project, SuggestedFlow, TestCaseRecord } from '@shared/ipc-contract';
import { computeRunDisabledReason } from './runErrors';

/**
 * A suggested flow's case always lands in Unsorted under the flow's own
 * name (see `ensureCaseForFlow` below) - matching that exact shape is how
 * both an individual `FlowCard` and a "Run all" batch action find the same
 * case, entirely through `useTestPlanStore`'s already-shared `cases` list
 * rather than component-local state a sibling action couldn't see.
 */
export function findCaseForFlow(
  cases: readonly TestCaseRecord[],
  projectId: string,
  flowName: string,
): TestCaseRecord | null {
  return cases.find((c) => c.projectId === projectId && c.areaId === null && c.name === flowName) ?? null;
}

/** Returns the existing case's id if one already exists for this flow,
 *  otherwise creates it (in Unsorted, with a script when the flow has one)
 *  and returns the new id - the same "create silently, once" behavior
 *  `FlowCard` and "Run all" both need before they can call `runs.run`. */
export async function ensureCaseForFlow(
  flow: SuggestedFlow,
  project: Project,
  cases: readonly TestCaseRecord[],
  createCase: (input: CreateTestCaseInput) => Promise<TestCaseRecord | null>,
): Promise<string | null> {
  const existing = findCaseForFlow(cases, project.id, flow.name);
  if (existing) return existing.id;

  const created = await createCase({
    projectId: project.id,
    areaId: null,
    name: flow.name,
    steps: flow.steps.length > 0 ? [...flow.steps] : [flow.description],
    script: flow.script && flow.script.length > 0 ? [...flow.script] : null,
  });
  return created?.id ?? null;
}

/** Same three-way check `computeRunDisabledReason` already makes for one
 *  flow's own Run button - "Run all" uses this to silently skip anything
 *  that isn't actually runnable right now, rather than attempting (and
 *  failing) every suggested flow indiscriminately. */
export function isFlowEligibleToRun(hasScript: boolean, hasBaseUrl: boolean, browsersKnownMissing: boolean): boolean {
  return computeRunDisabledReason(hasScript, hasBaseUrl, browsersKnownMissing) === null;
}
