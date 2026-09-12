import type { TestCaseRecord } from '@shared/ipc-contract';
import { relativeTime } from '../lib/projectDisplay';
import { caseCountLabel, stepCountLabel } from '../lib/testPlanDisplay';
import { PlusIcon } from './Icons';
import { PrimaryButton } from './PrimaryButton';
import { SectionEmpty } from './SectionEmpty';

interface TestCaseListProps {
  readonly title: string;
  readonly cases: readonly TestCaseRecord[];
  readonly selectedCaseId: string | null;
  readonly onSelect: (caseId: string) => void;
  readonly onNew: () => void;
  /** True while the new-case form is open, so the header button doesn't
   * offer to open a second one. */
  readonly composing: boolean;
  readonly children?: JSX.Element | false;
}

/**
 * The case list from the design, minus the columns that only a run can
 * fill. The design shows duration and "12 min ago" beside every case and a
 * failing/never-run filter above them; with no run engine, every one of
 * those would read the same for every row, so the list shows what a
 * written case actually knows: its name, how many steps it has, and when
 * it was written.
 */
export function TestCaseList({
  title,
  cases,
  selectedCaseId,
  onSelect,
  onNew,
  composing,
  children,
}: TestCaseListProps): JSX.Element {
  const now = Date.now();
  const sorted = [...cases].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <section
      aria-labelledby="cases-heading"
      className="flex min-w-0 flex-col rounded-lg border border-hairline bg-raised"
    >
      <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2
            id="cases-heading"
            className="truncate font-display text-section font-semibold text-ink"
          >
            {title}
          </h2>
          <span className="shrink-0 text-caption text-muted">{caseCountLabel(cases.length)}</span>
        </div>
        <PrimaryButton size="sm" onClick={onNew} disabled={composing}>
          <PlusIcon size={13} />
          New case
        </PrimaryButton>
      </div>

      {children}

      {sorted.length === 0 ? (
        <div className="px-5">
          <SectionEmpty headline="No test cases here" frame={false}>
            A case is what you already do by hand, written down as steps. Write one and it stays on
            this machine with the project.
          </SectionEmpty>
        </div>
      ) : (
        <ul className="flex flex-col">
          {sorted.map((testCase) => {
            const selected = testCase.id === selectedCaseId;
            return (
              <li key={testCase.id} className="border-b border-hairline last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelect(testCase.id)}
                  aria-current={selected ? 'true' : undefined}
                  className={`flex w-full items-center gap-4 px-5 py-3.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${
                    selected ? 'bg-surface' : 'hover:bg-surface/70'
                  }`}
                >
                  <span
                    className={`min-w-0 flex-1 truncate text-card ${
                      selected ? 'font-medium text-ink' : 'text-ink'
                    }`}
                  >
                    {testCase.name}
                  </span>
                  <span className="shrink-0 font-mono text-meta text-muted">
                    {stepCountLabel(testCase.steps.length)}
                  </span>
                  <span className="w-[86px] shrink-0 text-right text-meta text-faint">
                    {relativeTime(testCase.createdAt, now)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
