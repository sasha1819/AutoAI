import type { RunRecord, RunStepResult } from '@shared/ipc-contract';
import { relativeTime } from '../lib/projectDisplay';

const STEP_STATUS_COPY: Record<RunStepResult['status'], { readonly label: string; readonly className: string }> = {
  passed: { label: 'Passed', className: 'text-ok' },
  failed: { label: 'Failed', className: 'text-danger' },
  skipped: { label: 'Skipped', className: 'text-muted' },
};

/**
 * One real run's result - overall pass/fail, when it finished, and each
 * step's outcome. Shared by `TestCaseDetail`'s `RunPanel` and
 * `ProjectScanCard`'s `FlowCard`, which both run the same
 * `TestRunnerService.run` pipeline and need to show its result the same way.
 */
export function RunResultSummary({ run }: { readonly run: RunRecord }): JSX.Element {
  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-hairline bg-surface p-3.5">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`font-mono text-nano font-semibold uppercase tracking-wide ${
            run.status === 'passed' ? 'text-ok' : 'text-danger'
          }`}
        >
          {run.status === 'passed' ? 'Passed' : 'Failed'}
        </span>
        <span className="text-caption text-faint">finished {relativeTime(run.finishedAt, Date.now())}</span>
      </div>
      <ol className="flex flex-col gap-1.5">
        {run.steps.map((step, index) => (
          <li key={index} className="flex items-start gap-2 text-caption">
            <span
              className={`w-14 shrink-0 font-mono text-nano font-semibold uppercase tracking-wide ${STEP_STATUS_COPY[step.status].className}`}
            >
              {STEP_STATUS_COPY[step.status].label}
            </span>
            <span className="min-w-0 flex-1 text-quiet">
              {step.action.action}
              {step.action.selectorValue ? ` (${step.action.selectorKind}="${step.action.selectorValue}")` : ''}
              {step.error && <span className="block text-danger">{step.error}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
