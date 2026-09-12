import { describe, expect, it } from 'vitest';
import {
  casesFromCsv,
  guessCsvMapping,
  importCountLabel,
  parseCsv,
  parsePastedCases,
} from '../src/renderer/src/lib/importParsing';
import type { CsvMapping } from '../src/renderer/src/lib/importParsing';

describe('parsePastedCases', () => {
  it('reads one case per block, first line the name', () => {
    const result = parsePastedCases(
      'Guest can buy one item\nOpen the storefront\nAdd a mug to the cart\n\nPromo code applies\nEnter SAVE20\nThe total should drop',
    );

    expect(result.skipped).toEqual([]);
    expect(result.cases).toEqual([
      {
        name: 'Guest can buy one item',
        steps: ['Open the storefront', 'Add a mug to the cart'],
      },
      { name: 'Promo code applies', steps: ['Enter SAVE20', 'The total should drop'] },
    ]);
  });

  it('strips the bullets and numbers someone pasted with their list', () => {
    const result = parsePastedCases('Guest can buy one item\n- Open the storefront\n2. Add a mug\n* Pay');

    expect(result.cases[0]?.steps).toEqual(['Open the storefront', 'Add a mug', 'Pay']);
  });

  it('treats several blank lines as one break, not as empty cases', () => {
    const result = parsePastedCases('One\nStep\n\n\n\nTwo\nStep');

    expect(result.cases).toHaveLength(2);
    expect(result.skipped).toEqual([]);
  });

  /* The whole point of reporting skips: importing 40 of 50 rows silently
     leaves someone with no way to find the 10 that vanished. */
  it('reports a case with no steps rather than dropping it quietly', () => {
    const result = parsePastedCases('Guest can buy one item\nOpen the storefront\n\nA lonely title');

    expect(result.cases).toHaveLength(1);
    expect(result.skipped).toEqual([
      { line: 4, reason: 'no steps under it', excerpt: 'A lonely title' },
    ]);
  });

  it('numbers a skipped block by the line it started on', () => {
    const result = parsePastedCases('One\nStep\n\nTwo\nStep\n\nOrphan');

    expect(result.skipped[0]?.line).toBe(7);
  });

  it('gives nothing for an empty paste', () => {
    expect(parsePastedCases('   \n\n  ')).toEqual({ cases: [], skipped: [] });
  });

  it('ignores trailing blank lines at the end of a paste', () => {
    const result = parsePastedCases('One\nStep\n\n\n');

    expect(result.cases).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });
});

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a comma that is inside quotes', () => {
    expect(parseCsv('name,steps\n"Buy, then pay",Open')).toEqual([
      ['name', 'steps'],
      ['Buy, then pay', 'Open'],
    ]);
  });

  it('keeps a newline that is inside quotes', () => {
    expect(parseCsv('name,steps\nBuy,"Open\nPay"')).toEqual([
      ['name', 'steps'],
      ['Buy', 'Open\nPay'],
    ]);
  });

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('a\n"He said ""hi"""')).toEqual([['a'], ['He said "hi"']]);
  });

  it('does not invent a row from the final newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles a file saved on Windows', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps empty cells rather than collapsing them', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });
});

describe('guessCsvMapping', () => {
  it('finds columns by the names the export tools use', () => {
    expect(guessCsvMapping(['id', 'Title', 'Steps'])).toMatchObject({
      nameColumn: 1,
      stepsColumn: 2,
    });
  });

  it('falls back to the first two columns', () => {
    expect(guessCsvMapping(['alpha', 'beta', 'gamma'])).toMatchObject({
      nameColumn: 0,
      stepsColumn: 1,
    });
  });

  /* Both guesses landing on one column would make the opening preview
     read every case's name as its own steps. */
  it('never points both columns at the same place', () => {
    const mapping = guessCsvMapping(['summary', 'description']);

    expect(mapping.nameColumn).not.toBe(mapping.stepsColumn);
  });
});

describe('casesFromCsv', () => {
  const mapping: CsvMapping = { nameColumn: 0, stepsColumn: 1, stepSeparator: 'newline' };

  it('splits a steps cell on the chosen separator', () => {
    const rows = [
      ['name', 'steps'],
      ['Buy one item', 'Open the shop\nAdd a mug\nPay'],
    ];

    expect(casesFromCsv(rows, mapping, true).cases).toEqual([
      { name: 'Buy one item', steps: ['Open the shop', 'Add a mug', 'Pay'] },
    ]);
  });

  it('can split on a semicolon instead', () => {
    const rows = [['Buy one item', 'Open; Add a mug; Pay']];
    const semi: CsvMapping = { ...mapping, stepSeparator: 'semicolon' };

    expect(casesFromCsv(rows, semi, false).cases[0]?.steps).toEqual(['Open', 'Add a mug', 'Pay']);
  });

  it('keeps the first row when there is no header', () => {
    const rows = [['Buy one item', 'Open the shop']];

    expect(casesFromCsv(rows, mapping, false).cases).toHaveLength(1);
  });

  it('reports a row whose name cell is empty, with the line it was on', () => {
    const rows = [
      ['name', 'steps'],
      ['Buy one item', 'Open'],
      ['', 'Open'],
    ];

    const result = casesFromCsv(rows, mapping, true);

    expect(result.cases).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ line: 3, reason: 'the name column was empty' });
  });

  it('skips a wholly blank row without calling it an error', () => {
    const rows = [['Buy one item', 'Open'], ['', '']];

    const result = casesFromCsv(rows, mapping, false);

    expect(result.cases).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });

  it('survives a row with fewer columns than the mapping expects', () => {
    const rows = [['Buy one item']];

    const result = casesFromCsv(rows, mapping, false);

    expect(result.cases).toEqual([]);
    expect(result.skipped[0]?.reason).toBe('the steps column was empty');
  });
});

describe('importCountLabel', () => {
  it('says nothing, one, or many', () => {
    expect(importCountLabel(0)).toBe('Nothing to import');
    expect(importCountLabel(1)).toBe('Import 1 case');
    expect(importCountLabel(7)).toBe('Import 7 cases');
  });
});
