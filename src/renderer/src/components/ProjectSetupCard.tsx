import { useEffect } from 'react';
import type { Project, SetupCommandOutcome, SetupErrorCode, SetupStartOutcome } from '@shared/ipc-contract';
import { useScanStore } from '../state/useScanStore';
import { useSetupStore } from '../state/useSetupStore';
import { PrimaryButton } from './PrimaryButton';

const SETUP_ERROR_COPY: Record<SetupErrorCode, string> = {
  PROJECT_NOT_FOUND: "AutoAI couldn't find this project anymore.",
  NO_PROPOSAL: 'There is no setup proposal for this project yet - run a scan first.',
  COMMAND_REJECTED: "None of the proposed commands passed AutoAI's safety check.",
  INSTALL_FAILED: 'AutoAI could not even start running the install commands.',
  ALREADY_RUNNING: 'AutoAI already has a server running for this project.',
};

const COMMAND_STATUS_COPY: Record<SetupCommandOutcome['status'], string> = {
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'Skipped',
};

const COMMAND_STATUS_CLASS: Record<SetupCommandOutcome['status'], string> = {
  passed: 'text-ok',
  failed: 'text-danger',
  skipped: 'text-muted',
};

const START_STATUS_COPY: Record<SetupStartOutcome['status'], string> = {
  started: 'Started',
  crashed: 'Crashed on boot',
  rejected: 'Rejected',
  skipped: 'Skipped',
};

const START_STATUS_CLASS: Record<SetupStartOutcome['status'], string> = {
  started: 'text-ok',
  crashed: 'text-danger',
  rejected: 'text-danger',
  skipped: 'text-muted',
};

function CommandRow({ outcome }: { readonly outcome: SetupCommandOutcome }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-hairline bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-mono text-nano font-semibold uppercase tracking-wide ${COMMAND_STATUS_CLASS[outcome.status]}`}>
          {COMMAND_STATUS_COPY[outcome.status]}
        </span>
        <code className="truncate text-caption text-ink">{outcome.command}</code>
        {outcome.exitCode !== null && <span className="text-nano text-faint">exit {outcome.exitCode}</span>}
      </div>
      {(outcome.stdout || outcome.stderr) && (
        <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-nano text-muted">
          {[outcome.stdout, outcome.stderr].filter(Boolean).join('\n')}
        </pre>
      )}
    </div>
  );
}

/**
 * "Set up this project": one batch approval that runs a scan's proposed
 * install commands, then its start command - see ProjectSetupService. Only
 * appears once a scan has actually produced a setup proposal; the exact
 * command list is shown verbatim before the one approval point, per the
 * plan's "no per-command nagging" decision.
 */
export function ProjectSetupCard({ project }: { readonly project: Project }): JSX.Element | null {
  const scanResult = useScanStore((s) => s.result);
  const scanProjectId = useScanStore((s) => s.projectId);

  const result = useSetupStore((s) => s.result);
  const setupProjectId = useSetupStore((s) => s.projectId);
  const running = useSetupStore((s) => s.running);
  const serverRunning = useSetupStore((s) => s.serverRunning);
  const stopping = useSetupStore((s) => s.stopping);
  const lastError = useSetupStore((s) => s.lastError);
  const lastErrorDetail = useSetupStore((s) => s.lastErrorDetail);
  const runSetup = useSetupStore((s) => s.run);
  const stopSetup = useSetupStore((s) => s.stop);
  const clearSetupError = useSetupStore((s) => s.clearError);

  useEffect(() => {
    clearSetupError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const proposal = scanProjectId === project.id ? scanResult?.setup ?? null : null;
  const shownResult = setupProjectId === project.id ? result : null;
  const shownServerRunning = setupProjectId === project.id && serverRunning;

  if (!proposal) return null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-hairline bg-raised p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-section font-semibold text-ink">Set up this project</h2>
          <p className="text-caption text-muted">
            AutoAI can install what this project needs and start it - nothing runs until you approve it here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {shownServerRunning && (
            <PrimaryButton
              variant="secondary"
              size="sm"
              disabled={stopping}
              loading={stopping}
              onClick={() => void stopSetup(project.id)}
            >
              Stop server
            </PrimaryButton>
          )}
          <PrimaryButton size="sm" disabled={running} loading={running} onClick={() => void runSetup(project.id)}>
            Set up this project
          </PrimaryButton>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-md border border-hairline bg-surface p-3.5">
        <span className="font-mono text-nano font-semibold uppercase tracking-wide text-muted">Proposed commands</span>
        {proposal.installCommands.length === 0 && !proposal.startCommand && (
          <p className="text-caption text-quiet">Nothing to install or start.</p>
        )}
        {proposal.installCommands.map((command) => (
          <code key={command} className="text-caption text-ink">
            {command}
          </code>
        ))}
        {proposal.startCommand && <code className="text-caption text-ink">{proposal.startCommand}</code>}
        {!proposal.startCommand && proposal.startCommandExplanation && (
          <p className="text-caption text-muted">{proposal.startCommandExplanation}</p>
        )}
      </div>

      {lastError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3"
        >
          <p className="text-label text-quiet">{SETUP_ERROR_COPY[lastError] ?? lastErrorDetail ?? 'Setup failed.'}</p>
          <button
            type="button"
            onClick={clearSetupError}
            className="shrink-0 text-caption text-muted transition hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {shownResult && (
        <div className="flex flex-col gap-3 border-t border-hairline pt-4">
          {shownResult.baseUrlAutoFilled && (
            <div className="rounded-md border border-ok/40 bg-surface px-3.5 py-2.5 text-caption text-quiet">
              Project URL auto-filled to{' '}
              <code className="text-ink">{shownResult.baseUrlAutoFilled}</code>.
            </div>
          )}

          {shownResult.baseUrlMismatchNote && (
            <div
              role="alert"
              className="rounded-md border border-accent-deep/40 bg-accent-soft px-3.5 py-2.5 text-caption leading-relaxed text-accent-deep"
            >
              {shownResult.baseUrlMismatchNote}
            </div>
          )}

          {shownResult.installResults.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-nano font-semibold uppercase tracking-wide text-muted">Install</span>
              <div className="flex flex-col gap-2">
                {shownResult.installResults.map((outcome, i) => (
                  <CommandRow key={i} outcome={outcome} />
                ))}
              </div>
            </div>
          )}

          {shownResult.start && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-nano font-semibold uppercase tracking-wide text-muted">Start</span>
              <div className="flex flex-col gap-1 rounded-md border border-hairline bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-mono text-nano font-semibold uppercase tracking-wide ${START_STATUS_CLASS[shownResult.start.status]}`}
                  >
                    {START_STATUS_COPY[shownResult.start.status]}
                  </span>
                  <code className="truncate text-caption text-ink">{shownResult.start.command}</code>
                </div>
                {shownResult.start.output && (
                  <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-nano text-muted">
                    {shownResult.start.output}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
