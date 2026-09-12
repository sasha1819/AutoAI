/**
 * The seven import sources from the design, in the design's order.
 *
 * Five of them are listed and unavailable rather than hidden. Hiding them
 * would answer "can AutoAI read my TestRail suite?" with silence; listing
 * them with the reason answers it with "not yet, and here is what that
 * needs". What none of them do is open onto a form that cannot finish.
 */
export const ImportSourceId = {
  Code: 'code',
  Jira: 'jira',
  TestRail: 'testrail',
  Csv: 'csv',
  Postman: 'postman',
  Paste: 'paste',
  Record: 'record',
} as const;

export type ImportSourceId = (typeof ImportSourceId)[keyof typeof ImportSourceId];

export interface ImportSource {
  readonly id: ImportSourceId;
  readonly title: string;
  readonly description: string;
  /** Null when the source works today. Otherwise the reason it doesn't,
   * written as what is missing rather than as an apology. */
  readonly blockedBecause: string | null;
}

export const IMPORT_SOURCES: readonly ImportSource[] = [
  {
    id: ImportSourceId.Code,
    title: 'Existing test code',
    description: 'Point at a folder of Playwright, Appium, or XCUITest specs.',
    blockedBecause:
      'Reading a spec means understanding three test frameworks’ syntax. That reader is not written.',
  },
  {
    id: ImportSourceId.Jira,
    title: 'Jira / Xray',
    description: 'Pull test cases linked to a project or epic.',
    blockedBecause: 'Needs a connection to your Jira site. Connections are not built yet.',
  },
  {
    id: ImportSourceId.TestRail,
    title: 'TestRail',
    description: 'Import a suite by project and section.',
    blockedBecause: 'Needs a connection to your TestRail instance. Connections are not built yet.',
  },
  {
    id: ImportSourceId.Csv,
    title: 'CSV or spreadsheet',
    description: 'Map a column to names and a column to steps.',
    blockedBecause: null,
  },
  {
    id: ImportSourceId.Postman,
    title: 'Postman collection',
    description: 'Turn saved requests into API checks.',
    blockedBecause: 'An API check is a kind of test AutoAI cannot run yet, so there is nothing to turn them into.',
  },
  {
    id: ImportSourceId.Paste,
    title: 'Paste cases',
    description: 'One case per block: a name, then its steps underneath.',
    blockedBecause: null,
  },
  {
    id: ImportSourceId.Record,
    title: 'Record by clicking through',
    description: 'Walk the app once; AutoAI writes the case as you go.',
    blockedBecause: 'Recording means driving your app and watching it. No engine drives an app yet.',
  },
];

export function findImportSource(id: ImportSourceId): ImportSource {
  const source = IMPORT_SOURCES.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`unknown import source: ${id}`);
  return source;
}
