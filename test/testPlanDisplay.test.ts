import { describe, expect, it } from 'vitest';
import type { AreaRecord, TestCaseRecord } from '../src/shared/ipc-contract';
import {
  ALL_CASES,
  UNSORTED,
  areaSelection,
  caseCountLabel,
  casesInSelection,
  countCases,
  countForArea,
  countForSelection,
  isSameSelection,
  parseSteps,
  selectionTitle,
  stepCountLabel,
} from '../src/renderer/src/lib/testPlanDisplay';

function area(id: string, name: string): AreaRecord {
  return { id, projectId: 'p1', name, createdAt: '2026-03-10T09:00:00.000Z' };
}

function testCase(id: string, areaId: string | null): TestCaseRecord {
  return {
    id,
    projectId: 'p1',
    areaId,
    name: id,
    steps: ['Open the app'],
    createdAt: '2026-03-10T09:00:00.000Z',
  };
}

const AREAS = [area('a1', 'Checkout'), area('a2', 'Login')];
const CASES = [
  testCase('c1', 'a1'),
  testCase('c2', 'a1'),
  testCase('c3', 'a2'),
  testCase('c4', null),
];

describe('casesInSelection', () => {
  it('gives every case for All', () => {
    expect(casesInSelection(CASES, ALL_CASES)).toHaveLength(4);
  });

  it('gives only the cases with no area for Unsorted', () => {
    expect(casesInSelection(CASES, UNSORTED).map((c) => c.id)).toEqual(['c4']);
  });

  it('gives one area’s cases and never another’s', () => {
    expect(casesInSelection(CASES, areaSelection('a1')).map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('gives nothing for an area that has no cases', () => {
    expect(casesInSelection(CASES, areaSelection('a9'))).toEqual([]);
  });
});

describe('isSameSelection', () => {
  it('tells two different areas apart', () => {
    expect(isSameSelection(areaSelection('a1'), areaSelection('a2'))).toBe(false);
    expect(isSameSelection(areaSelection('a1'), areaSelection('a1'))).toBe(true);
  });

  /* The reason this is a union rather than a nullable id: these two are
     both "no particular area" and must not compare equal. */
  it('does not confuse All with Unsorted', () => {
    expect(isSameSelection(ALL_CASES, UNSORTED)).toBe(false);
  });
});

describe('countCases', () => {
  it('counts each area, the unsorted pile, and the total separately', () => {
    const counts = countCases(CASES);

    expect(counts.total).toBe(4);
    expect(counts.unsorted).toBe(1);
    expect(countForArea(counts, 'a1')).toBe(2);
    expect(countForArea(counts, 'a2')).toBe(1);
  });

  it('reports zero for an area nothing points at', () => {
    expect(countForArea(countCases(CASES), 'a9')).toBe(0);
  });

  it('matches what the selection filter returns', () => {
    const counts = countCases(CASES);
    for (const selection of [ALL_CASES, UNSORTED, areaSelection('a1'), areaSelection('a2')]) {
      expect(countForSelection(counts, selection)).toBe(casesInSelection(CASES, selection).length);
    }
  });
});

describe('selectionTitle', () => {
  it('names the area, or the row that is not one', () => {
    expect(selectionTitle(AREAS, ALL_CASES)).toBe('All cases');
    expect(selectionTitle(AREAS, UNSORTED)).toBe('Unsorted');
    expect(selectionTitle(AREAS, areaSelection('a2'))).toBe('Login');
  });

  it('falls back rather than rendering undefined for a stale id', () => {
    expect(selectionTitle(AREAS, areaSelection('gone'))).toBe('Area');
  });
});

describe('count labels', () => {
  it('says nothing, one, or many', () => {
    expect(caseCountLabel(0)).toBe('No cases');
    expect(caseCountLabel(1)).toBe('1 case');
    expect(caseCountLabel(12)).toBe('12 cases');
    expect(stepCountLabel(1)).toBe('1 step');
    expect(stepCountLabel(9)).toBe('9 steps');
  });
});

describe('parseSteps', () => {
  it('makes one step per line and trims each', () => {
    expect(parseSteps('  Open the storefront \n Add a mug ')).toEqual([
      'Open the storefront',
      'Add a mug',
    ]);
  });

  it('drops the blank lines someone typed for spacing', () => {
    expect(parseSteps('One\n\n   \nTwo')).toEqual(['One', 'Two']);
  });

  it('gives nothing for an empty field', () => {
    expect(parseSteps('   \n  ')).toEqual([]);
  });
});
