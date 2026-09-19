import { useState } from 'react';
import type { EnvironmentCheckItem, SystemToolInstallErrorCode } from '@shared/ipc-contract';
import { useScanStore } from '../state/useScanStore';
import { useSystemToolStore } from '../state/useSystemToolStore';

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

/**
 * One environment-checklist row - present/missing, an install hint, and (for
 * anything on `SystemToolInstaller`'s closed list) a confirm-then-run
 * "Install" button. Shared by `ProjectScanCard`'s full checklist and
 * `ProjectSetupCard`'s "still missing" warning, so there's exactly one place
 * that knows how to show and run a real install for one of these items.
 */
export function EnvironmentChecklistRow({ item }: { readonly item: EnvironmentCheckItem }): JSX.Element {
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
        <p className="text-nano text-danger">
          {SYSTEM_TOOL_ERROR_COPY[toolState.error]}
          {toolState.detail ? ` — ${toolState.detail}` : ''}
        </p>
      )}
      {toolState && !toolState.error && !toolState.installing && toolState.output && (
        <p className="truncate font-mono text-nano text-faint" title={toolState.output}>
          {toolState.output}
        </p>
      )}
    </li>
  );
}
