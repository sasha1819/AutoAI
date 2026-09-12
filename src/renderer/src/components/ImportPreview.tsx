import type { ParsedImport } from '../lib/importParsing';
import { stepCountLabel } from '../lib/testPlanDisplay';

/**
 * What is about to be written, and what will not be.
 *
 * The skipped list is the reason this screen has a preview at all. An
 * import that quietly keeps the rows it understood leaves someone
 * comparing a list of 40 against a file of 50 to work out what happened;
 * showing every skipped row with its line number and the reason turns that
 * into something they can go and fix.
 */
export function ImportPreview({ parsed }: { readonly parsed: ParsedImport }): JSX.Element | null {
  if (parsed.cases.length === 0 && parsed.skipped.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {parsed.cases.length > 0 && (
        <section aria-labelledby="import-ready" className="flex flex-col gap-2">
          <h3
            id="import-ready"
            className="font-mono text-nano font-semibold uppercase tracking-wide text-muted"
          >
            Ready to import
          </h3>
          <ul className="flex flex-col rounded-lg border border-hairline bg-raised">
            {parsed.cases.map((testCase, index) => (
              <li
                key={`${index}-${testCase.name}`}
                className="flex items-center gap-4 border-b border-hairline px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-body text-ink">{testCase.name}</span>
                <span className="shrink-0 font-mono text-meta text-muted">
                  {stepCountLabel(testCase.steps.length)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {parsed.skipped.length > 0 && (
        <section aria-labelledby="import-skipped" className="flex flex-col gap-2">
          <h3
            id="import-skipped"
            className="font-mono text-nano font-semibold uppercase tracking-wide text-muted"
          >
            Will not be imported
          </h3>
          <ul className="flex flex-col rounded-lg border border-dashed border-edge">
            {parsed.skipped.map((row, index) => (
              <li
                key={`${index}-${row.line}`}
                className="flex items-baseline gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
              >
                <span className="shrink-0 font-mono text-meta text-faint">line {row.line}</span>
                <span className="min-w-0 flex-1 truncate text-label text-quiet">{row.excerpt}</span>
                <span className="shrink-0 text-caption text-muted">{row.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
