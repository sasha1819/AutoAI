import { useEffect, useState } from 'react';
import type { Project, RunRecord, ScanErrorCode, SuggestedFlow } from '@shared/ipc-contract';
import { computeRunDisabledReason, describeRunError, RUN_DISABLED_REASON_COPY } from '../lib/runErrors';
import { useClaudeConnectionStore } from '../state/useClaudeConnectionStore';
import { useRunStore } from '../state/useRunStore';
import { useScanStore } from '../state/useScanStore';
import { useTestPlanStore } from '../state/useTestPlanStore';
import { ClaudeConnectPrompt } from './ClaudeConnectPrompt';
import { EnvironmentChecklistRow } from './EnvironmentChecklistRow';
import { PrimaryButton } from './PrimaryButton';
import { RunResultSummary } from './RunResultSummary';

const SCAN_ERROR_COPY: Record<ScanErrorCode, string> = {
  NOT_CONNECTED: "Claude isn't connected. Connect it in Settings, then try again.",
  PROJECT_NOT_FOUND: "AutoAI couldn't find this project anymore.",
  SCAN_FAILED: 'The scan did not finish. You can try again.',
};

/**
 * A suggested flow with a `script` can be run right here, without first
 * navigating to the case it becomes - it reuses the exact same
 * `TestRunnerService.run` pipeline `TestCaseDetail`'s own Run button does
 * (`ensureCase` creates the case silently, the same `createCase` call
 * "Add as test case" makes, the first time either button is used, so
 * clicking both never creates a duplicate).
 */
function FlowCard({
  flow,
  project,
  onAdded,
}: {
  readonly flow: SuggestedFlow;
  readonly project: Project;
  readonly onAdded: (caseId: string) => void;
}): JSX.Element {
  const createCase = useTestPlanStore((s) => s.createCase);
  const saving = useTestPlanStore((s) => s.saving);
  const [caseId, setCaseId] = useState<string | null>(null);
  // useRunStore's running/lastError are global, not keyed by case - a
  // second FlowCard would otherwise show the first one's failure. This
  // scopes "was the run this card just triggered the one that failed" to
  // this card alone, same single-flow-at-a-time assumption `running` (also
  // global) already bakes into every Run button in this app.
  const [attempted, setAttempted] = useState(false);

  const runsByCase = useRunStore((s) => s.runsByCase);
  const running = useRunStore((s) => s.running);
  const runCase = useRunStore((s) => s.run);
  const runError = useRunStore((s) => s.lastError);
  const runErrorDetail = useRunStore((s) => s.lastErrorDetail);
  const clearRunError = useRunStore((s) => s.clearError);

  const scanResult = useScanStore((s) => s.result);
  const scanProjectId = useScanStore((s) => s.projectId);

  const hasScript = Boolean(flow.script && flow.script.length > 0);
  const hasBaseUrl = Boolean(project.baseUrl);
  const lastScan = scanProjectId === project.id ? scanResult : null;
  const browsersItem = lastScan?.environment.find((item) => item.name === 'Playwright browsers') ?? null;
  const browsersKnownMissing = browsersItem !== null && !browsersItem.present;

  const disabledReasonCode = computeRunDisabledReason(hasScript, hasBaseUrl, browsersKnownMissing);
  // FlowCard sits right above the Setup card that actually starts the
  // server and fills the URL in - "below" is literally true here, unlike
  // TestCaseDetail's RunPanel, which sits under its own project-URL field.
  const disabledReason =
    disabledReasonCode === 'NO_BASE_URL'
      ? 'Set up this project below to start it and get a URL.'
      : disabledReasonCode
        ? RUN_DISABLED_REASON_COPY[disabledReasonCode]
        : null;

  const lastRun: RunRecord | null = caseId ? (runsByCase[caseId] ?? null) : null;

  async function ensureCase(): Promise<string | null> {
    if (caseId) return caseId;
    const created = await createCase({
      projectId: project.id,
      areaId: null,
      name: flow.name,
      steps: flow.steps.length > 0 ? [...flow.steps] : [flow.description],
      script: flow.script && flow.script.length > 0 ? [...flow.script] : null,
    });
    if (created) setCaseId(created.id);
    return created?.id ?? null;
  }

  async function handleAdd(): Promise<void> {
    const id = await ensureCase();
    if (id) onAdded(id);
  }

  async function handleRun(): Promise<void> {
    const id = await ensureCase();
    if (!id) return;
    setAttempted(true);
    await runCase(id);
  }

  function handleDismissRunError(): void {
    clearRunError();
    setAttempted(false);
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-hairline bg-surface p-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-label font-medium text-ink">{flow.name}</p>
          {hasScript && (
            <span className="flex h-pill items-center rounded-full border border-ok/40 px-2.5 text-nano font-semibold uppercase tracking-wide text-ok">
              Runnable
            </span>
          )}
        </div>
        <p className="text-caption text-muted">{flow.description}</p>
        <ol className="mt-2 flex flex-col gap-0.5 text-caption text-quiet">
          {flow.steps.map((step, i) => (
            <li key={i}>
              {i + 1}. {step}
            </li>
          ))}
        </ol>
        {flow.targetSelectors && flow.targetSelectors.length > 0 && (
          <p className="mt-2 truncate font-mono text-nano text-faint" title={flow.targetSelectors.join(', ')}>
            {flow.targetSelectors.join(', ')}
          </p>
        )}
        {hasScript && (
          <div className="mt-2.5 flex flex-col gap-2">
            {disabledReason && !lastRun && <p className="text-caption text-muted">{disabledReason}</p>}
            {attempted && !running && runError && !lastRun && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-caption text-quiet">{describeRunError(runError)}</p>
                  {runErrorDetail && <p className="mt-0.5 truncate text-nano text-faint">{runErrorDetail}</p>}
                </div>
                <button
                  type="button"
                  onClick={handleDismissRunError}
                  className="shrink-0 text-caption text-muted transition hover:text-ink"
                >
                  Dismiss
                </button>
              </div>
            )}
            {lastRun && <RunResultSummary run={lastRun} />}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <PrimaryButton variant="secondary" size="sm" disabled={saving} onClick={() => void handleAdd()}>
          {caseId ? 'Added' : 'Add as test case'}
        </PrimaryButton>
        {hasScript && (
          <PrimaryButton
            size="sm"
            disabled={Boolean(disabledReason) || running}
            loading={running}
            onClick={() => void handleRun()}
          >
            Run
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}

interface ProjectScanCardProps {
  readonly project: Project;
  /** Called with the id of a case created from a suggested flow, so the
   *  screen can select it and land the person on it immediately editable -
   *  same UX as the rest of this screen's create flow. */
  readonly onCaseCreated: (caseId: string) => void;
}

/**
 * "What AutoAI found": one Scan project action, then Claude's plain-language
 * read of the project, its suggested test flows (each one click from
 * becoming a real test case), and the local checklist of what this machine
 * needs to actually run tests against it.
 *
 * The button stays disabled - with an inline reason, never hidden - until a
 * Claude connection check has succeeded at least once this session (see
 * useClaudeConnectionStore). That is a client-side convenience, not the
 * real gate: ProjectScanService.run still returns NOT_CONNECTED on its own
 * if a scan somehow reaches main without one.
 */
export function ProjectScanCard({ project, onCaseCreated }: ProjectScanCardProps): JSX.Element {
  const connected = useClaudeConnectionStore((s) => s.connected);
  const scanResult = useScanStore((s) => s.result);
  const scanProjectId = useScanStore((s) => s.projectId);
  const scanning = useScanStore((s) => s.scanning);
  const lastError = useScanStore((s) => s.lastError);
  const lastErrorDetail = useScanStore((s) => s.lastErrorDetail);
  const runScan = useScanStore((s) => s.run);
  const loadLastScan = useScanStore((s) => s.loadLast);
  const clearScanError = useScanStore((s) => s.clearError);

  useEffect(() => {
    void loadLastScan(project.id);
  }, [loadLastScan, project.id]);

  const result = scanProjectId === project.id ? scanResult : null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-hairline bg-raised p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-section font-semibold text-ink">What AutoAI found</h2>
          <p className="text-caption text-muted">
            Claude reads this project and suggests test flows, plus what this machine needs to run them.
          </p>
        </div>
        <PrimaryButton
          variant="secondary"
          size="sm"
          disabled={!connected || scanning}
          loading={scanning}
          onClick={() => void runScan(project.id)}
        >
          Scan project
        </PrimaryButton>
      </div>

      {!connected && <ClaudeConnectPrompt />}

      {lastError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3"
        >
          <p className="text-label text-quiet">{SCAN_ERROR_COPY[lastError] ?? lastErrorDetail ?? 'The scan failed.'}</p>
          <button
            type="button"
            onClick={clearScanError}
            className="shrink-0 text-caption text-muted transition hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-5 border-t border-hairline pt-4">
          <p className="text-label leading-relaxed text-quiet">{result.description}</p>

          {result.suggestedFlows.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-nano font-semibold uppercase tracking-wide text-muted">
                Suggested test flows
              </span>
              <div className="flex flex-col gap-2">
                {result.suggestedFlows.map((flow) => (
                  <FlowCard key={flow.name} flow={flow} project={project} onAdded={onCaseCreated} />
                ))}
              </div>
            </div>
          )}

          {result.environment.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-nano font-semibold uppercase tracking-wide text-muted">
                What this machine needs to run tests
              </span>
              <ul className="flex flex-col gap-1.5">
                {result.environment.map((item) => (
                  <EnvironmentChecklistRow key={item.name} item={item} />
                ))}
              </ul>
            </div>
          )}

          {result.environmentNotes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-nano font-semibold uppercase tracking-wide text-muted">
                Claude noticed
              </span>
              <ul className="flex flex-col gap-1 text-caption text-quiet">
                {result.environmentNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
