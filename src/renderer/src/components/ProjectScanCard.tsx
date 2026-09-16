import { useEffect, useState } from 'react';
import type {
  EnvironmentCheckItem,
  Project,
  ScanErrorCode,
  SuggestedFlow,
  SystemToolInstallErrorCode,
} from '@shared/ipc-contract';
import { useClaudeConnectionStore } from '../state/useClaudeConnectionStore';
import { useScanStore } from '../state/useScanStore';
import { useSystemToolStore } from '../state/useSystemToolStore';
import { useTestPlanStore } from '../state/useTestPlanStore';
import { ClaudeConnectPrompt } from './ClaudeConnectPrompt';
import { PrimaryButton } from './PrimaryButton';

const SCAN_ERROR_COPY: Record<ScanErrorCode, string> = {
  NOT_CONNECTED: "Claude isn't connected. Connect it in Settings, then try again.",
  PROJECT_NOT_FOUND: "AutoAI couldn't find this project anymore.",
  SCAN_FAILED: 'The scan did not finish. You can try again.',
};

const SYSTEM_TOOL_ERROR_COPY: Record<SystemToolInstallErrorCode, string> = {
  NOT_INSTALLABLE: "AutoAI doesn't have a one-click install for this.",
  BREW_NOT_FOUND: 'Homebrew was not found on this machine.',
  INSTALL_FAILED: 'The install did not finish.',
};

/**
 * Every binary SystemToolInstaller currently supports maps to a Homebrew
 * formula with the exact same name - true for all five entries in its own
 * closed map (php/composer/python/python3/ruby/dotnet) - so the literal
 * command shown here before the one click is accurate without needing a
 * second channel back from main just to carry a formula name.
 */
function brewInstallCommand(binary: string): string {
  return `brew install ${binary}`;
}

function EnvironmentItemRow({ item }: { readonly item: EnvironmentCheckItem }): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const binary = item.installableBinary;
  const toolState = useSystemToolStore((s) => (binary ? s.byBinary[binary] : undefined));
  const install = useSystemToolStore((s) => s.install);
  const markToolInstalled = useScanStore((s) => s.markToolInstalled);

  async function handleRun(): Promise<void> {
    if (!binary) return;
    setConfirming(false);
    const nowPresent = await install(binary);
    if (nowPresent) markToolInstalled(binary);
  }

  return (
    <li className="flex flex-col gap-1.5 text-caption">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`font-mono text-nano font-semibold uppercase tracking-wide ${
            item.present ? 'text-ok' : 'text-danger'
          }`}
        >
          {item.present ? 'Present' : 'Missing'}
        </span>
        <span className="text-quiet">{item.name}</span>
        {!item.present && item.installHint && <span className="text-faint">— {item.installHint}</span>}
        {!item.present && binary && !confirming && (
          <button
            type="button"
            disabled={toolState?.installing}
            onClick={() => setConfirming(true)}
            className="shrink-0 text-caption font-medium text-accent-deep transition hover:text-accent-deep-hover disabled:opacity-50"
          >
            {toolState?.installing ? 'Installing…' : 'Install'}
          </button>
        )}
      </div>

      {confirming && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-surface px-3 py-2">
          <span className="font-mono text-nano text-quiet">{brewInstallCommand(binary ?? '')}</span>
          <button
            type="button"
            onClick={() => void handleRun()}
            className="shrink-0 text-caption font-medium text-accent-deep transition hover:text-accent-deep-hover"
          >
            Run
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="shrink-0 text-caption text-muted transition hover:text-ink"
          >
            Cancel
          </button>
        </div>
      )}

      {toolState?.error && (
        <p className="text-nano text-danger">{SYSTEM_TOOL_ERROR_COPY[toolState.error]}{toolState.detail ? ` — ${toolState.detail}` : ''}</p>
      )}
      {toolState && !toolState.error && !toolState.installing && toolState.output && (
        <p className="truncate font-mono text-nano text-faint" title={toolState.output}>
          {toolState.output}
        </p>
      )}
    </li>
  );
}

function FlowCard({
  flow,
  projectId,
  onAdded,
}: {
  readonly flow: SuggestedFlow;
  readonly projectId: string;
  readonly onAdded: (caseId: string) => void;
}): JSX.Element {
  const createCase = useTestPlanStore((s) => s.createCase);
  const saving = useTestPlanStore((s) => s.saving);

  async function handleAdd(): Promise<void> {
    const created = await createCase({
      projectId,
      areaId: null,
      name: flow.name,
      steps: flow.steps.length > 0 ? [...flow.steps] : [flow.description],
      script: flow.script && flow.script.length > 0 ? [...flow.script] : null,
    });
    if (created) onAdded(created.id);
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-hairline bg-surface p-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-label font-medium text-ink">{flow.name}</p>
          {flow.script && flow.script.length > 0 && (
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
      </div>
      <PrimaryButton variant="secondary" size="sm" disabled={saving} onClick={() => void handleAdd()}>
        Add as test case
      </PrimaryButton>
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
                  <FlowCard key={flow.name} flow={flow} projectId={project.id} onAdded={onCaseCreated} />
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
                  <EnvironmentItemRow key={item.name} item={item} />
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
