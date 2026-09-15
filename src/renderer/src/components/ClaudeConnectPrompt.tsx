import { useClaudeConnectionStore } from '../state/useClaudeConnectionStore';
import { PrimaryButton } from './PrimaryButton';

/**
 * The "not connected" block `ProjectScanCard` and `CaseChatCard` both used
 * to render on their own - identically, down to the wording - as a link
 * away to Settings ("Connect it in Settings, then come back here"). That's
 * a detour in the middle of what should be one flow on the project's own
 * page: connect, then scan, then see what's missing. This connects inline
 * instead, through the same global `useClaudeConnectionStore` Settings'
 * own section uses - once `check()` succeeds here, `connected` flips for
 * the whole app, and the card that rendered this unlocks immediately with
 * no navigation and no remount.
 */
export function ClaudeConnectPrompt(): JSX.Element {
  const checking = useClaudeConnectionStore((s) => s.checking);
  const lastReason = useClaudeConnectionStore((s) => s.lastReason);
  const lastDetail = useClaudeConnectionStore((s) => s.lastDetail);
  const check = useClaudeConnectionStore((s) => s.check);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-quiet">Claude isn&apos;t connected yet.</p>
        <PrimaryButton variant="secondary" size="sm" loading={checking} onClick={() => void check()}>
          Connect Claude
        </PrimaryButton>
      </div>
      {lastReason && (
        <p className="text-caption leading-relaxed text-muted">
          {lastReason === 'NOT_LOGGED_IN'
            ? 'Claude isn’t logged in on this machine. Open Terminal, run claude login, then try again.'
            : `AutoAI couldn’t reach Claude${lastDetail ? ` (${lastDetail})` : ''}. Make sure the claude CLI is installed, then try again.`}
        </p>
      )}
    </div>
  );
}
