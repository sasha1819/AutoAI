import type { ImportedCase } from '@shared/ipc-contract';

/**
 * What a source produced, and what it could not use. A parser that
 * silently dropped the rows it did not understand would let someone import
 * 40 of the 50 cases in a file and never learn which 10 went missing, so
 * every skipped row is reported with the reason and the line it was on.
 */
export interface ParsedImport {
  readonly cases: readonly ImportedCase[];
  readonly skipped: readonly SkippedRow[];
}

export interface SkippedRow {
  /** 1-based, counted in the source the person is looking at. */
  readonly line: number;
  readonly reason: string;
  /** Enough of the row to recognise it, trimmed for display. */
  readonly excerpt: string;
}

const BULLET = /^(?:[-*•]|\d+[.)])\s+/;

/** A step someone pasted may carry the bullet or number they typed in
 * front of it. That is list formatting, not part of the instruction. */
function stripBullet(line: string): string {
  return line.replace(BULLET, '').trim();
}

function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}

/**
 * Pasted text, one case per block, blank lines between blocks. The first
 * line of a block names the case and the rest are its steps.
 *
 * This is a fixed shape rather than an interpretation. The design has
 * Claude reading cases written in any form, which needs a model
 * connection; until then, saying exactly what the format is beats
 * guessing at prose and getting it subtly wrong.
 */
export function parsePastedCases(text: string): ParsedImport {
  const cases: ImportedCase[] = [];
  const skipped: SkippedRow[] = [];

  const lines = text.split('\n');
  let block: { line: number; text: string }[] = [];

  const flush = (): void => {
    if (block.length === 0) return;

    const [head, ...rest] = block;
    if (!head) return;

    const name = stripBullet(head.text);
    const steps = rest.map((entry) => stripBullet(entry.text)).filter((step) => step.length > 0);

    if (name.length === 0) {
      skipped.push({ line: head.line, reason: 'no name on the first line', excerpt: excerptOf(head.text) });
    } else if (steps.length === 0) {
      skipped.push({ line: head.line, reason: 'no steps under it', excerpt: excerptOf(name) });
    } else {
      cases.push({ name, steps });
    }
    block = [];
  };

  for (const [index, raw] of lines.entries()) {
    if (raw.trim().length === 0) {
      flush();
      continue;
    }
    block.push({ line: index + 1, text: raw });
  }
  flush();

  return { cases, skipped };
}

/**
 * A CSV reader that handles the parts of RFC 4180 a spreadsheet export
 * actually produces: quoted fields, commas and newlines inside quotes, and
 * a doubled quote standing for one. Written here rather than pulled in as
 * a dependency because it is fifty lines and the renderer has no runtime
 * dependencies by design.
 *
 * `\r\n` is normalised to `\n` first, so a file saved on Windows does not
 * leave a stray carriage return on the end of every last field.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  const source = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
      started = true;
      continue;
    }
    if (char === ',') {
      endField();
      started = true;
      continue;
    }
    if (char === '\n') {
      endRow();
      continue;
    }
    field += char;
    started = true;
  }

  /* A file ending in a newline must not produce a final empty row - that
     is the line terminator of the last real row, not a row of its own. */
  if (started || field.length > 0 || row.length > 0) {
    endRow();
  }

  return rows;
}

export interface CsvMapping {
  /** Column index holding the case name. */
  readonly nameColumn: number;
  /** Column index holding the steps. */
  readonly stepsColumn: number;
  /** How several steps are packed into one cell. */
  readonly stepSeparator: 'newline' | 'semicolon' | 'pipe';
}

const SEPARATORS: Record<CsvMapping['stepSeparator'], RegExp> = {
  newline: /\n/,
  semicolon: /;/,
  pipe: /\|/,
};

/** What a header row is called in the tools people export from, lowercased
 * for matching. Used only to pick the opening guess; the reader can change
 * either column afterwards. */
const NAME_HEADERS = ['title', 'name', 'case', 'summary', 'test case', 'test'];
const STEPS_HEADERS = ['steps', 'step', 'actions', 'procedure', 'test steps', 'description'];

function indexOfHeader(header: readonly string[], wanted: readonly string[]): number {
  const normalised = header.map((cell) => cell.trim().toLowerCase());
  for (const candidate of wanted) {
    const found = normalised.indexOf(candidate);
    if (found !== -1) return found;
  }
  return -1;
}

/** The mapping to open with. Columns named like a title and like steps are
 * picked when they exist; otherwise the first two columns, which is what a
 * two-column export almost always is. */
export function guessCsvMapping(header: readonly string[]): CsvMapping {
  const name = indexOfHeader(header, NAME_HEADERS);
  const steps = indexOfHeader(header, STEPS_HEADERS);

  const nameColumn = name !== -1 ? name : 0;
  let stepsColumn = steps !== -1 ? steps : 1;
  if (stepsColumn === nameColumn) {
    stepsColumn = nameColumn === 0 ? 1 : 0;
  }

  return { nameColumn, stepsColumn, stepSeparator: 'newline' };
}

/**
 * Turns parsed CSV rows into cases under a mapping.
 *
 * `hasHeader` skips the first row. It is a parameter rather than something
 * detected here because a one-row file of real data and a header-only file
 * look identical, and only the person looking at the preview can tell
 * which one they have.
 */
export function casesFromCsv(
  rows: readonly (readonly string[])[],
  mapping: CsvMapping,
  hasHeader: boolean,
): ParsedImport {
  const cases: ImportedCase[] = [];
  const skipped: SkippedRow[] = [];
  const separator = SEPARATORS[mapping.stepSeparator];

  const body = hasHeader ? rows.slice(1) : rows;
  const offset = hasHeader ? 2 : 1;

  for (const [index, row] of body.entries()) {
    const line = index + offset;
    if (row.every((cell) => cell.trim().length === 0)) continue;

    const name = (row[mapping.nameColumn] ?? '').trim();
    const stepsCell = row[mapping.stepsColumn] ?? '';
    const steps = stepsCell
      .split(separator)
      .map((step) => stripBullet(step))
      .filter((step) => step.length > 0);

    if (name.length === 0) {
      skipped.push({ line, reason: 'the name column was empty', excerpt: excerptOf(row.join(' ')) });
      continue;
    }
    if (steps.length === 0) {
      skipped.push({ line, reason: 'the steps column was empty', excerpt: excerptOf(name) });
      continue;
    }
    cases.push({ name, steps });
  }

  return { cases, skipped };
}

/** "3 cases" / "1 case" / "Nothing" - used on the import button and in the
 * preview heading. */
export function importCountLabel(count: number): string {
  if (count === 0) return 'Nothing to import';
  return count === 1 ? 'Import 1 case' : `Import ${count} cases`;
}
