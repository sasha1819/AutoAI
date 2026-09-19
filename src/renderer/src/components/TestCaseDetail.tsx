import { useId, useState } from 'react';
import type { AreaRecord, Project, TestCaseRecord } from '@shared/ipc-contract';
import { relativeTime } from '../lib/projectDisplay';
import { computeRunDisabledReason, describeRunError, RUN_DISABLED_REASON_COPY } from '../lib/runErrors';
import { stepCountLabel } from '../lib/testPlanDisplay';
import { useRunStore } from '../state/useRunStore';
import { useScanStore } from '../state/useScanStore';
import { TrashIcon } from './Icons';
import { PrimaryButton } from './PrimaryButton';
import { RunResultSummary } from './RunResultSummary';
import { SelectField } from './SelectField';

const UNSORTED_VALUE = '';

interface TestCaseDetailProps {
  readonly testCase: TestCaseRecord;
  readonly areas: readonly AreaRecord[];
  readonly project: Project;
  readonly saving: boolean;
  readonly onMove: (areaId: string | null) => void;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}

/**
 * A real run of this case's `script`, once it exists. TestRunnerService
 * already tells us exactly why a case can't run (NO_SCRIPT, NO_BASE_URL,
 * BROWSER_NOT_READY, ...); this only pre-empts the two checks the renderer
 * can answer on its own without a real attempt - whether the case has a
 * script at all, and whether the project has a base URL - so those two
 * read as calm, permanent explanations rather than a run that visibly
 * fails first. Whether Playwright's browsers are actually installed on
 * this machine is not something the contract exposes as its own check (see
 * EnvironmentCheckService, folded into a project scan's environment
 * checklist instead) - if a scan has already run for this project and
 * found them missing, that is surfaced here too; otherwise a genuinely
 * missing browser is reported the honest way, as the run's own
 * BROWSER_NOT_READY result.
 */
function RunPanel({ testCase, project }: { readonly testCase: TestCaseRecord; readonly project: Project }): JSX.Element {
  const runsByCase = useRunStore((s) => s.runsByCase);
  const running = useRunStore((s) => s.running);
  const lastError = useRunStore((s) => s.lastError);
  const lastErrorDetail = useRunStore((s) => s.lastErrorDetail);
  const runCase = useRunStore((s) => s.run);
  const clearRunError = useRunStore((s) => s.clearError);

  const scanResult = useScanStore((s) => s.result);
  const scanProjectId = useScanStore((s) => s.projectId);

  const hasScript = Boolean(testCase.script && testCase.script.length > 0);
  const hasBaseUrl = Boolean(project.baseUrl);
  const lastScan = scanProjectId === project.id ? scanResult : null;
  const browsersItem = lastScan?.environment.find((item) => item.name === 'Playwright browsers') ?? null;
  const browsersKnownMissing = browsersItem !== null && !browsersItem.present;

  const disabledReasonCode = computeRunDisabledReason(hasScript, hasBaseUrl, browsersKnownMissing);
  const disabledReason = disabledReasonCode ? RUN_DISABLED_REASON_COPY[disabledReasonCode] : null;

  const lastRun = runsByCase[testCase.id] ?? null;

  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-nano font-semibold uppercase tracking-wide text-muted">Run</span>
        <PrimaryButton
          size="sm"
          variant="secondary"
          disabled={Boolean(disabledReason) || running}
          loading={running}
          onClick={() => void runCase(testCase.id)}
        >
          Run
        </PrimaryButton>
      </div>

      {disabledReason && !lastRun && <p className="text-caption text-muted">{disabledReason}</p>}

      {lastError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-label text-quiet">{describeRunError(lastError)}</p>
            {lastErrorDetail && <p className="mt-0.5 truncate text-caption text-faint">{lastErrorDetail}</p>}
          </div>
          <button
            type="button"
            onClick={clearRunError}
            className="shrink-0 text-caption text-muted transition hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {lastRun && <RunResultSummary run={lastRun} />}
    </div>
  );
}

/**
 * One case, opened: its steps, whether it can actually run and - once it
 * has - what happened, plus the two things a person can do to it besides
 * that: move it to another area, or delete it.
 */
export function TestCaseDetail({
  testCase,
  areas,
  project,
  saving,
  onMove,
  onDelete,
  onClose,
}: TestCaseDetailProps): JSX.Element {
  const fieldId = useId();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const options = [
    { value: UNSORTED_VALUE, label: 'Unsorted' },
    ...[...areas]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((area) => ({ value: area.id, label: area.name })),
  ];

  return (
    <aside
      aria-label={`Test case: ${testCase.name}`}
      className="flex min-w-0 flex-col gap-5 rounded-lg border border-hairline bg-raised px-5 py-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="font-display text-section font-semibold leading-snug text-ink">
            {testCase.name}
          </h2>
          <p className="font-mono text-meta text-muted">
            {stepCountLabel(testCase.steps.length)} · written{' '}
            {relativeTime(testCase.createdAt, Date.now())}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close this case"
          className="shrink-0 text-muted outline-none transition hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          &times;
        </button>
      </div>

      <RunPanel testCase={testCase} project={project} />

      <ol className="flex flex-col gap-2.5">
        {testCase.steps.map((step, index) => (
          <li key={`${index}-${step}`} className="flex gap-3">
            <span className="w-5 shrink-0 pt-px text-right font-mono text-meta text-accent-deep">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 text-body leading-relaxed text-quiet">{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-3 border-t border-hairline pt-5">
        <SelectField
          id={`${fieldId}-area`}
          tone="caps"
          label="Area"
          options={options}
          disabled={saving}
          value={testCase.areaId ?? UNSORTED_VALUE}
          onChange={(event) =>
            onMove(event.target.value === UNSORTED_VALUE ? null : event.target.value)
          }
        />

        {confirmingDelete ? (
          <div className="flex flex-col gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3.5">
            <p className="text-caption leading-relaxed text-quiet">
              Delete this case and its steps? Nothing else holds a copy.
            </p>
            <div className="flex items-center gap-2.5">
              <PrimaryButton
                size="sm"
                onClick={onDelete}
                loading={saving}
                className="!bg-danger hover:!bg-danger"
              >
                Delete
              </PrimaryButton>
              <PrimaryButton
                size="sm"
                variant="secondary"
                onClick={() => setConfirmingDelete(false)}
                disabled={saving}
              >
                Keep it
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center gap-2 self-start text-caption text-muted outline-none transition hover:text-danger focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <TrashIcon size={13} />
            Delete this case
          </button>
        )}
      </div>
    </aside>
  );
}
