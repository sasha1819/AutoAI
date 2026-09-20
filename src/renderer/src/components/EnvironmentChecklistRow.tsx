import { useState } from 'react';
import type { EnvironmentCheckItem, PlaywrightBrowserInstallErrorCode, SystemToolInstallErrorCode } from '@shared/ipc-contract';
import { usePlaywrightBrowsersStore } from '../state/usePlaywrightBrowsersStore';
import { useScanStore } from '../state/useScanStore';
import { useSystemToolStore } from '../state/useSystemToolStore';

const SYSTEM_TOOL_ERROR_COPY: Record<SystemToolInstallErrorCode, string> = {
  NOT_INSTALLABLE: "AutoAI doesn't have a one-click install for this.",
  BREW_NOT_FOUND: 'Homebrew was not found on this machine.',
  INSTALL_FAILED: 'The install did not finish.',
};

const PLAYWRIGHT_ERROR_COPY: Record<PlaywrightBrowserInstallErrorCode, string> = {
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
 * One environment-checklist row - present/missing, an install hint, and a
 * confirm-then-run "Install" button for anything with a safe one-click
 * path: either `SystemToolInstaller`'s closed binary list, or the one
 * "Playwright browsers" item via `PlaywrightBrowserInstaller`. Shared by
 * `ProjectScanCard`'s full checklist and `ProjectSetupCard`'s "still
 * missing" warning, so there's exactly one place that knows how to show
 * and run a real install for any of these items.
 */
export function EnvironmentChecklistRow({ item }: { readonly item: EnvironmentCheckItem }): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const binary = item.installableBinary;
  const isBrowsersInstall = item.installablePlaywrightBrowsers;

  const toolState = useSystemToolStore((s) => (binary ? s.byBinary[binary] : undefined));
  const installTool = useSystemToolStore((s) => s.install);
  const markToolInstalled = useScanStore((s) => s.markToolInstalled);

  const browsersState = usePlaywrightBrowsersStore((s) => s);
  const installBrowsers = usePlaywrightBrowsersStore((s) => s.install);
  const markPlaywrightBrowsersInstalled = useScanStore((s) => s.markPlaywrightBrowsersInstalled);

  const canInstall = Boolean(binary) || isBrowsersInstall;
  const installing = isBrowsersInstall ? browsersState.installing : (toolState?.installing ?? false);
  const output = isBrowsersInstall ? browsersState.output : (toolState?.output ?? null);
  const errorCopy = isBrowsersInstall
    ? browsersState.error && PLAYWRIGHT_ERROR_COPY[browsersState.error]
    : toolState?.error && SYSTEM_TOOL_ERROR_COPY[toolState.error];
  const errorDetail = isBrowsersInstall ? browsersState.detail : (toolState?.detail ?? null);
  const command = isBrowsersInstall ? 'npx playwright install' : binary ? brewInstallCommand(binary) : '';

  async function handleRun(): Promise<void> {
    setConfirming(false);
    if (isBrowsersInstall) {
      const nowPresent = await installBrowsers();
      if (nowPresent) markPlaywrightBrowsersInstalled();
      return;
    }
    if (!binary) return;
    const nowPresent = await installTool(binary);
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
        {!item.present && canInstall && !confirming && (
          <button
            type="button"
            disabled={installing}
            onClick={() => setConfirming(true)}
            className="shrink-0 text-caption font-medium text-accent-deep transition hover:text-accent-deep-hover disabled:opacity-50"
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        )}
      </div>

      {confirming && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-surface px-3 py-2">
          <span className="font-mono text-nano text-quiet">{command}</span>
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

      {errorCopy && (
        <p className="text-nano text-danger">
          {errorCopy}
          {errorDetail ? ` — ${errorDetail}` : ''}
        </p>
      )}
      {!errorCopy && !installing && output && (
        <p className="truncate font-mono text-nano text-faint" title={output}>
          {output}
        </p>
      )}
    </li>
  );
}
