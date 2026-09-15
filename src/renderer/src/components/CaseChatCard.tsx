import { useState } from 'react';
import type { CaseGenerationErrorCode, Project } from '@shared/ipc-contract';
import { useCaseChatStore } from '../state/useCaseChatStore';
import { useClaudeConnectionStore } from '../state/useClaudeConnectionStore';
import { useTestPlanStore } from '../state/useTestPlanStore';
import { ClaudeConnectPrompt } from './ClaudeConnectPrompt';
import { PrimaryButton } from './PrimaryButton';

const CASE_GENERATION_ERROR_COPY: Record<CaseGenerationErrorCode, string> = {
  NOT_CONNECTED: "Claude isn't connected. Connect it in Settings, then try again.",
  PROJECT_NOT_FOUND: "AutoAI couldn't find this project anymore.",
  PROMPT_REQUIRED: 'Describe the test first.',
  GENERATION_FAILED: 'AutoAI could not turn that into a test case. You can try again.',
};

interface CaseChatCardProps {
  readonly project: Project;
  /** Same contract as ProjectScanCard's onCaseCreated - called with the id
   *  of the case created from the generated flow, so the screen can select
   *  it and land the person on it immediately editable. */
  readonly onCaseCreated: (caseId: string) => void;
}

/**
 * The chat alternative to a project scan's suggested flows: describe a test
 * in plain language, get back one editable, previewed flow, then turn it
 * into a real test case - for when you already know exactly what you want
 * tested rather than wanting AutoAI to explore and suggest.
 *
 * Gated on a Claude connection exactly like ProjectScanCard, for the same
 * reason: a client-side convenience, not the real gate - CaseGenerationService
 * still returns NOT_CONNECTED on its own if a request somehow reaches main
 * without one.
 */
export function CaseChatCard({ project, onCaseCreated }: CaseChatCardProps): JSX.Element {
  const connected = useClaudeConnectionStore((s) => s.connected);
  const pendingFlow = useCaseChatStore((s) => s.pendingFlow);
  const generating = useCaseChatStore((s) => s.generating);
  const lastError = useCaseChatStore((s) => s.lastError);
  const lastErrorDetail = useCaseChatStore((s) => s.lastErrorDetail);
  const generate = useCaseChatStore((s) => s.generate);
  const clearPending = useCaseChatStore((s) => s.clearPending);
  const clearChatError = useCaseChatStore((s) => s.clearError);

  const createCase = useTestPlanStore((s) => s.createCase);
  const saving = useTestPlanStore((s) => s.saving);

  const [prompt, setPrompt] = useState('');

  async function handleGenerate(): Promise<void> {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    const ok = await generate(project.id, trimmed);
    if (ok) setPrompt('');
  }

  async function handleAdd(): Promise<void> {
    if (!pendingFlow) return;
    const created = await createCase({
      projectId: project.id,
      areaId: null,
      name: pendingFlow.name,
      steps: pendingFlow.steps.length > 0 ? [...pendingFlow.steps] : [pendingFlow.description],
      script: pendingFlow.script && pendingFlow.script.length > 0 ? [...pendingFlow.script] : null,
    });
    if (created) {
      clearPending();
      onCaseCreated(created.id);
    }
  }

  const runnable = Boolean(pendingFlow?.script && pendingFlow.script.length > 0);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-hairline bg-raised p-5">
      <div>
        <h2 className="font-display text-section font-semibold text-ink">Describe a test</h2>
        <p className="text-caption text-muted">
          Tell Claude what should happen in plain language, and it turns it into an editable test case.
        </p>
      </div>

      {!connected && <ClaudeConnectPrompt />}

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
        onSubmit={(event) => {
          event.preventDefault();
          void handleGenerate();
        }}
      >
        <input
          type="text"
          aria-label="Describe the test you want"
          placeholder="A guest can add an item to the cart and check out"
          value={prompt}
          disabled={!connected || generating}
          onChange={(event) => setPrompt(event.target.value)}
          className="h-field min-w-0 flex-1 rounded-md border border-edge bg-surface px-3 text-body text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-60"
        />
        <PrimaryButton
          type="submit"
          variant="secondary"
          size="sm"
          disabled={!connected || generating || prompt.trim().length === 0}
          loading={generating}
        >
          Generate test case
        </PrimaryButton>
      </form>

      {lastError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3"
        >
          <p className="text-label text-quiet">
            {CASE_GENERATION_ERROR_COPY[lastError] ?? lastErrorDetail ?? 'That request failed.'}
          </p>
          <button
            type="button"
            onClick={clearChatError}
            className="shrink-0 text-caption text-muted transition hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {pendingFlow && (
        <div className="flex flex-col gap-3 rounded-md border border-hairline bg-surface p-3.5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-label font-medium text-ink">{pendingFlow.name}</p>
                {runnable && (
                  <span className="flex h-pill items-center rounded-full border border-ok/40 px-2.5 text-nano font-semibold uppercase tracking-wide text-ok">
                    Runnable
                  </span>
                )}
              </div>
              <p className="text-caption text-muted">{pendingFlow.description}</p>
              <ol className="mt-2 flex flex-col gap-0.5 text-caption text-quiet">
                {pendingFlow.steps.map((step, i) => (
                  <li key={i}>
                    {i + 1}. {step}
                  </li>
                ))}
              </ol>
            </div>
            <PrimaryButton variant="secondary" size="sm" disabled={saving} onClick={() => void handleAdd()}>
              Add as test case
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
