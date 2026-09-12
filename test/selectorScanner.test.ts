import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_FILES_SCANNED,
  MAX_TOTAL_FINDINGS,
  scanSelectors,
  SelectorAttributeKind,
} from '../src/main/services/SelectorScanner';

describe('scanSelectors', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'autoai-selector-scan-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(relPath: string, content: string): void {
    const full = join(root, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }

  it('finds id/name/data-testid/for/aria-label only inside a real tag', async () => {
    write(
      'checkout.php',
      [
        '<form id="checkout-form" name="checkout">',
        '  <label for="qty">Quantity</label>',
        '  <input id="qty" name="qty" aria-label="Item quantity" />',
        '  <input data-testid="submit-btn" type="submit" />',
        '</form>',
      ].join('\n'),
    );

    const result = await scanSelectors(root);

    const byKind = (kind: string): string[] =>
      result.findings.filter((f) => f.kind === kind).map((f) => f.value);

    expect(byKind(SelectorAttributeKind.Id).sort()).toEqual(['checkout-form', 'qty']);
    expect(byKind(SelectorAttributeKind.Name).sort()).toEqual(['checkout', 'qty']);
    expect(byKind(SelectorAttributeKind.For)).toEqual(['qty']);
    expect(byKind(SelectorAttributeKind.AriaLabel)).toEqual(['Item quantity']);
    expect(byKind(SelectorAttributeKind.DataTestId)).toEqual(['submit-btn']);
    expect(result.filesScanned).toBe(1);
    expect(result.truncated).toBe(false);
  });

  /* The whole reason tag-scoped extraction exists rather than a bare
     attribute regex: a PHP variable assignment must never be mistaken for
     an HTML id/name attribute just because the raw text contains
     `name = "..."`. */
  it('does not mistake a PHP variable assignment for an HTML attribute', async () => {
    write(
      'config.php',
      [
        '<?php',
        '$name = "checkout";',
        '$id = 42;',
        '?>',
        '<div id="real-div"></div>',
      ].join('\n'),
    );

    const result = await scanSelectors(root);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ kind: SelectorAttributeKind.Id, value: 'real-div' });
  });

  it('skips a dynamic JSX value rather than guessing at it', async () => {
    write('Widget.tsx', '<input id={dynamicId} name="static-name" />');

    const result = await scanSelectors(root);

    expect(result.findings.map((f) => f.kind)).toEqual([SelectorAttributeKind.Name]);
    expect(result.findings[0]?.value).toBe('static-name');
  });

  it('dedups repeated values and counts occurrences, keyed by kind and value', async () => {
    write(
      'form.html',
      [
        '<input id="email" />',
        '<input id="email" />',
        '<input id="email" />',
        '<input name="email" />',
      ].join('\n'),
    );

    const result = await scanSelectors(root);

    const idFinding = result.findings.find((f) => f.kind === SelectorAttributeKind.Id && f.value === 'email');
    const nameFinding = result.findings.find((f) => f.kind === SelectorAttributeKind.Name && f.value === 'email');

    expect(idFinding?.occurrences).toBe(3);
    expect(nameFinding?.occurrences).toBe(1);
    // First occurrence's line is kept, not overwritten by later repeats.
    expect(idFinding?.line).toBe(1);
  });

  it('records the tag and project-root-relative path a finding came from', async () => {
    write('src/pages/login.html', '<input id="username" />');

    const result = await scanSelectors(root);

    expect(result.findings[0]).toMatchObject({
      tag: 'input',
      path: join('src', 'pages', 'login.html'),
      line: 1,
    });
  });

  it('excludes vendored library directories by name, never reading inside them', async () => {
    write('vendor/PHPMailer/PHPMailer.php', '<div id="should-not-be-found"></div>');
    write('app/index.php', '<div id="should-be-found"></div>');

    const result = await scanSelectors(root);

    expect(result.findings.map((f) => f.value)).toEqual(['should-be-found']);
    expect(result.filesScanned).toBe(1);
  });

  it('excludes node_modules, .git, and build output directories', async () => {
    write('node_modules/some-pkg/index.html', '<div id="pkg"></div>');
    write('.git/hooks/x.html', '<div id="hook"></div>');
    write('dist/bundle.html', '<div id="bundled"></div>');
    write('real.html', '<div id="real"></div>');

    const result = await scanSelectors(root);

    expect(result.findings.map((f) => f.value)).toEqual(['real']);
  });

  it('ignores extensions outside the covered set', async () => {
    write('notes.txt', '<div id="ignored"></div>');
    write('real.html', '<div id="real"></div>');

    const result = await scanSelectors(root);

    expect(result.findings.map((f) => f.value)).toEqual(['real']);
  });

  it('stops and reports truncated once the file cap is hit', async () => {
    // No extractable attributes per file, so it is the file limit (not the
    // findings limit, which is far smaller) that trips here.
    for (let i = 0; i < MAX_FILES_SCANNED + 5; i++) {
      write(`page-${i}.html`, '<div class="no-selectors-here">plain content</div>');
    }

    const result = await scanSelectors(root);

    expect(result.filesScanned).toBe(MAX_FILES_SCANNED);
    expect(result.findings).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  it('stops and reports truncated once the findings cap is hit', async () => {
    // One finding per file, well under the file cap but over the findings
    // cap, so it is the findings limit (not the file limit) that trips.
    for (let i = 0; i < MAX_TOTAL_FINDINGS + 10; i++) {
      write(`unique-${i}.html`, `<div id="unique-id-${i}"></div>`);
    }

    const result = await scanSelectors(root);

    expect(result.findings.length).toBeLessThanOrEqual(MAX_TOTAL_FINDINGS);
    expect(result.truncated).toBe(true);
  });

  it('reports an empty, non-truncated result for a project with nothing recognisable', async () => {
    write('README.md', '# Nothing scannable here');

    const result = await scanSelectors(root);

    expect(result.findings).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});
