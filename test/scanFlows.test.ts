import { describe, expect, it } from 'vitest';
import { ensureCaseForFlow, findCaseForFlow, isFlowEligibleToRun } from '../src/renderer/src/lib/scanFlows';
import type { CreateTestCaseInput, Project, SuggestedFlow, TestCaseRecord } from '../src/shared/ipc-contract';

function testCase(overrides: Partial<TestCaseRecord> = {}): TestCaseRecord {
  return {
    id: 'case-1',
    projectId: 'proj-1',
    areaId: null,
    name: 'Guest opens the home page',
    steps: ['Open the home page'],
    createdAt: '2026-03-10T09:00:00.000Z',
    script: null,
    ...overrides,
  };
}

const FLOW: SuggestedFlow = {
  name: 'Guest opens the home page',
  description: 'Loads the home page and confirms it responds.',
  steps: ['Open the home page'],
  script: [{ action: 'goto', value: '/' }],
};

const PROJECT: Project = {
  id: 'proj-1',
  name: 'Project-Taaza',
  source: { type: 'local', path: '/fake/path' },
  localPath: '/fake/path',
  createdAt: '2026-03-10T09:00:00.000Z',
  detection: null,
  overriddenTargetType: 'web',
  baseUrl: 'http://localhost:8000',
  testCaseFolderPath: null,
};

describe('findCaseForFlow', () => {
  it('finds a case matching project, Unsorted, and the flow\'s exact name', () => {
    const cases = [testCase()];

    expect(findCaseForFlow(cases, 'proj-1', 'Guest opens the home page')).toEqual(cases[0]);
  });

  it('ignores a same-named case that belongs to a different project', () => {
    const cases = [testCase({ projectId: 'other-project' })];

    expect(findCaseForFlow(cases, 'proj-1', 'Guest opens the home page')).toBeNull();
  });

  it('ignores a same-named case that has been moved into an area', () => {
    const cases = [testCase({ areaId: 'area-1' })];

    expect(findCaseForFlow(cases, 'proj-1', 'Guest opens the home page')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(findCaseForFlow([], 'proj-1', 'Guest opens the home page')).toBeNull();
  });
});

describe('ensureCaseForFlow', () => {
  it('returns the existing case id without creating a new one', async () => {
    const existing = testCase();
    let createCalls = 0;
    const createCase = async (): Promise<TestCaseRecord | null> => {
      createCalls += 1;
      return null;
    };

    const id = await ensureCaseForFlow(FLOW, PROJECT, [existing], createCase);

    expect(id).toBe('case-1');
    expect(createCalls).toBe(0);
  });

  it('creates the case in Unsorted with the flow\'s script when none exists yet', async () => {
    let received: CreateTestCaseInput | null = null;
    const createCase = async (input: CreateTestCaseInput): Promise<TestCaseRecord | null> => {
      received = input;
      return testCase({ id: 'new-case' });
    };

    const id = await ensureCaseForFlow(FLOW, PROJECT, [], createCase);

    expect(id).toBe('new-case');
    expect(received).toEqual({
      projectId: 'proj-1',
      areaId: null,
      name: 'Guest opens the home page',
      steps: ['Open the home page'],
      script: [{ action: 'goto', value: '/' }],
    });
  });

  it('falls back to the flow description as the one step when it has none', async () => {
    const flow: SuggestedFlow = { ...FLOW, steps: [], script: undefined };
    const receivedCalls: CreateTestCaseInput[] = [];
    const createCase = async (input: CreateTestCaseInput): Promise<TestCaseRecord | null> => {
      receivedCalls.push(input);
      return testCase({ id: 'new-case' });
    };

    await ensureCaseForFlow(flow, PROJECT, [], createCase);

    expect(receivedCalls).toHaveLength(1);
    expect(receivedCalls[0]?.steps).toEqual([flow.description]);
    expect(receivedCalls[0]?.script).toBeNull();
  });

  it('returns null when creation fails', async () => {
    const createCase = async (): Promise<TestCaseRecord | null> => null;

    const id = await ensureCaseForFlow(FLOW, PROJECT, [], createCase);

    expect(id).toBeNull();
  });
});

describe('isFlowEligibleToRun', () => {
  it('is eligible only when there is a script, a base URL, and browsers are not known missing', () => {
    expect(isFlowEligibleToRun(true, true, false)).toBe(true);
  });

  it('is not eligible without a script', () => {
    expect(isFlowEligibleToRun(false, true, false)).toBe(false);
  });

  it('is not eligible without a base URL', () => {
    expect(isFlowEligibleToRun(true, false, false)).toBe(false);
  });

  it('is not eligible when browsers are known missing', () => {
    expect(isFlowEligibleToRun(true, true, true)).toBe(false);
  });
});
