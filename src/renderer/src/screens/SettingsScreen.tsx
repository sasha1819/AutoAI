import { ROLE_OPTIONS } from '@shared/ipc-contract';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/PrimaryButton';
import { RoleCard } from '../components/RoleCard';
import { ShieldCheckIcon } from '../components/Icons';
import { relativeTime } from '../lib/projectDisplay';
import { useClaudeConnectionStore } from '../state/useClaudeConnectionStore';
import { useSessionStore } from '../state/useSessionStore';

function Field({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1 border-t border-hairline py-4">
      <span className="font-mono text-nano font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className={`truncate text-body text-ink ${mono ? 'font-mono text-caption' : ''}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * "Connect Claude": a real probe, not a cached flag. There is no
 * lightweight "am I connected" check in the Agent SDK, so `check()` runs an
 * actual minimal query every time this button is pressed - see
 * ClaudeConnectionService. AutoAI never stores a credential of any kind;
 * this only ever asks "does a query work right now."
 */
function ClaudeConnectionSection(): JSX.Element {
  const connected = useClaudeConnectionStore((s) => s.connected);
  const checking = useClaudeConnectionStore((s) => s.checking);
  const lastCheckedAt = useClaudeConnectionStore((s) => s.lastCheckedAt);
  const lastReason = useClaudeConnectionStore((s) => s.lastReason);
  const lastDetail = useClaudeConnectionStore((s) => s.lastDetail);
  const check = useClaudeConnectionStore((s) => s.check);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="claude-heading">
      <div className="flex flex-col gap-1.5">
        <h2 id="claude-heading" className="font-display text-section font-semibold text-ink">
          Claude connection
        </h2>
        <p className="text-label text-muted">
          Scanning a project asks Claude to read it and suggest test flows. AutoAI needs a working
          Claude connection on this machine to do that.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`flex h-pill items-center gap-1.5 rounded-full border px-3 text-caption ${
            connected ? 'border-ok/30 bg-ok/10 text-ok' : 'border-edge bg-raised text-muted'
          }`}
        >
          <span className={`size-1.5 rounded-full ${connected ? 'bg-ok' : 'bg-faint'}`} aria-hidden="true" />
          {connected ? 'Connected' : 'Not connected'}
        </span>
        <PrimaryButton variant="secondary" size="sm" loading={checking} onClick={() => void check()}>
          Check connection
        </PrimaryButton>
        {lastCheckedAt && (
          <span className="text-caption text-faint">checked {relativeTime(lastCheckedAt, Date.now())}</span>
        )}
      </div>

      {!connected && lastReason && (
        <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-raised p-4">
          <p className="text-caption leading-relaxed text-quiet">
            {lastReason === 'NOT_LOGGED_IN'
              ? "Claude isn't logged in on this machine. Open Terminal, run claude login, then check again - AutoAI doesn't drive that login itself, only detects and reports the result."
              : `AutoAI couldn't reach Claude${lastDetail ? ` (${lastDetail})` : ''}. Make sure the claude CLI is installed, then check again.`}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Everything else on this screen is backed by a channel that already
 * exists: the profile comes from `session:get-current`, the role picker
 * writes through `onboarding:set-role` (the same call onboarding makes),
 * and logging out is `auth:logout`.
 *
 * The design's Settings artboard also carries MCP servers and device
 * setup. Neither has a main-process side, so neither is drawn here.
 */
export function SettingsScreen(): JSX.Element {
  const session = useSessionStore((s) => s.session);
  const setRole = useSessionStore((s) => s.setRole);
  const logout = useSessionStore((s) => s.logout);

  return (
    <AppShell title="Settings">
      <div className="flex max-w-[640px] flex-col gap-9 px-8 py-7">
        <section className="flex flex-col" aria-labelledby="profile-heading">
          <h2 id="profile-heading" className="pb-2 font-display text-section font-semibold text-ink">
            Your profile
          </h2>
          <Field label="Name" value={session?.name ?? '—'} />
          <Field label="Email" value={session?.email ?? '—'} mono />
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="role-heading">
          <div className="flex flex-col gap-1.5">
            <h2 id="role-heading" className="font-display text-section font-semibold text-ink">
              How you work
            </h2>
            <p className="text-label text-muted">
              This is a vocabulary dial, not a permission level. It changes how AutoAI writes to you
              and how much it explains.
            </p>
          </div>
          <div role="radiogroup" aria-labelledby="role-heading" className="flex flex-col gap-3">
            {ROLE_OPTIONS.map((option) => (
              <RoleCard
                key={option.role}
                option={option}
                selected={session?.role === option.role}
                onSelect={() => void setRole(option.role)}
              />
            ))}
          </div>
        </section>

        <ClaudeConnectionSection />

        <section className="flex flex-col gap-3" aria-labelledby="local-heading">
          <h2 id="local-heading" className="font-display text-section font-semibold text-ink">
            This machine
          </h2>
          <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-raised p-4">
            <span className="mt-0.5 shrink-0 text-accent-deep">
              <ShieldCheckIcon size={14} />
            </span>
            <p className="text-caption leading-relaxed text-quiet">
              Your profile, your password hash, and your project list live on this Mac only, and
              there is no account to sign out of anywhere else. The one exception: scanning a
              project - only when you choose to, from that project&apos;s own page - sends its code
              to Claude so it can write the description and suggest test flows.
            </p>
          </div>
          <PrimaryButton variant="secondary" className="self-start" onClick={() => void logout()}>
            Log out
          </PrimaryButton>
        </section>
      </div>
    </AppShell>
  );
}
