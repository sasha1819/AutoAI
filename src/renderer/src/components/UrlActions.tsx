import { useState } from 'react';
import { autoaiClient } from '../lib/autoaiClient';
import { PrimaryButton } from './PrimaryButton';

interface ReachabilityState {
  readonly reachable: boolean;
  readonly status: number | null;
}

/**
 * Two small, read-only, non-destructive things to do with a URL AutoAI
 * already knows about (manually set, or auto-filled after Setup starts a
 * server): open it in the OS default browser, or check whether anything is
 * actually listening there yet. Local component state is enough here -
 * unlike Setup/Install, there's nothing here that needs to survive a
 * remount or be shared across components. Shared by `ProjectSetupCard`'s
 * auto-filled URL and `ProjectUrlField`'s manual one.
 */
export function UrlActions({ url }: { readonly url: string }): JSX.Element {
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [reachability, setReachability] = useState<ReachabilityState | null>(null);

  async function handleOpen(): Promise<void> {
    setOpening(true);
    setOpenError(null);
    try {
      const result = await autoaiClient.url.open(url);
      if (!result.ok) {
        setOpenError(
          result.error === 'INVALID_URL' ? "That doesn't look like a web address." : (result.detail ?? "AutoAI couldn't open that."),
        );
      }
    } catch {
      setOpenError("AutoAI couldn't open that.");
    } finally {
      setOpening(false);
    }
  }

  async function handleCheck(): Promise<void> {
    setChecking(true);
    setReachability(null);
    try {
      setReachability(await autoaiClient.url.checkReachable(url));
    } catch {
      setReachability({ reachable: false, status: null });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PrimaryButton
        variant="secondary"
        size="sm"
        disabled={opening}
        loading={opening}
        onClick={() => void handleOpen()}
      >
        Open in browser
      </PrimaryButton>
      <PrimaryButton variant="secondary" size="sm" disabled={checking} loading={checking} onClick={() => void handleCheck()}>
        Check
      </PrimaryButton>
      {openError && <span className="text-nano text-danger">{openError}</span>}
      {reachability && (
        <span
          className={`font-mono text-nano font-semibold uppercase tracking-wide ${
            reachability.reachable ? 'text-ok' : 'text-danger'
          }`}
        >
          {reachability.reachable ? `Reachable${reachability.status !== null ? ` (${reachability.status})` : ''}` : 'Not reachable'}
        </span>
      )}
    </div>
  );
}
