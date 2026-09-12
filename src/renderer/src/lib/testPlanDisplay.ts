import type { AreaRecord, TestCaseRecord } from '@shared/ipc-contract';

/**
 * What the areas rail currently has selected. A union rather than a
 * nullable id because three states have to be told apart and two of them
 * are not areas: "All" spans every case, "Unsorted" means the cases that
 * deliberately have no area, and `null` would have to stand for one of
 * them while silently being a legal value of the other.
 */
export type AreaSelection =
  | { readonly kind: 'all' }
  | { readonly kind: 'unsorted' }
  | { readonly kind: 'area'; readonly areaId: string };

export const ALL_CASES: AreaSelection = { kind: 'all' };
export const UNSORTED: AreaSelection = { kind: 'unsorted' };

export function areaSelection(areaId: string): AreaSelection {
  return { kind: 'area', areaId };
}

export function isSameSelection(a: AreaSelection, b: AreaSelection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'area' && b.kind === 'area') return a.areaId === b.areaId;
  return true;
}

export function casesInSelection(
  cases: readonly TestCaseRecord[],
  selection: AreaSelection,
): TestCaseRecord[] {
  switch (selection.kind) {
    case 'all':
      return [...cases];
    case 'unsorted':
      return cases.filter((testCase) => testCase.areaId === null);
    case 'area':
      return cases.filter((testCase) => testCase.areaId === selection.areaId);
  }
}

/** How many cases sit in each area, plus the two rows that aren't areas.
 * Counted once for the whole rail rather than filtering per row, so a
 * project with a lot of cases doesn't walk the list once per folder. */
export interface AreaCounts {
  readonly total: number;
  readonly unsorted: number;
  /** Keyed by area id. An area with no cases is absent, not zero - read
   * it through `countForArea`. */
  readonly byArea: ReadonlyMap<string, number>;
}

export function countCases(cases: readonly TestCaseRecord[]): AreaCounts {
  const byArea = new Map<string, number>();
  let unsorted = 0;

  for (const testCase of cases) {
    if (testCase.areaId === null) {
      unsorted += 1;
      continue;
    }
    byArea.set(testCase.areaId, (byArea.get(testCase.areaId) ?? 0) + 1);
  }

  return { total: cases.length, unsorted, byArea };
}

export function countForArea(counts: AreaCounts, areaId: string): number {
  return counts.byArea.get(areaId) ?? 0;
}

export function countForSelection(counts: AreaCounts, selection: AreaSelection): number {
  switch (selection.kind) {
    case 'all':
      return counts.total;
    case 'unsorted':
      return counts.unsorted;
    case 'area':
      return countForArea(counts, selection.areaId);
  }
}

/** The heading over the case list: the area's own name, or the name of
 * whichever pseudo-row is selected. */
export function selectionTitle(areas: readonly AreaRecord[], selection: AreaSelection): string {
  switch (selection.kind) {
    case 'all':
      return 'All cases';
    case 'unsorted':
      return 'Unsorted';
    case 'area':
      return areas.find((area) => area.id === selection.areaId)?.name ?? 'Area';
  }
}

/** "12 cases" / "1 case" / "No cases" - the count beside that heading. */
export function caseCountLabel(count: number): string {
  if (count === 0) return 'No cases';
  return count === 1 ? '1 case' : `${count} cases`;
}

export function stepCountLabel(count: number): string {
  return count === 1 ? '1 step' : `${count} steps`;
}

/**
 * Steps are typed as one per line. Splitting is the renderer's job because
 * the textarea is the only place a step is ever a line of a larger string;
 * everywhere else, including the contract, a step is its own value.
 */
export function parseSteps(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
