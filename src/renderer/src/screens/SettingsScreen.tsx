import { useEffect, useState } from 'react';
import type { McpServerErrorCode } from '@shared/ipc-contract';
import { CLAUDE_EFFORT_OPTIONS, CLAUDE_MODEL_OPTIONS, ROLE_OPTIONS } from '@shared/ipc-contract';
import { AppShell } from '../components/AppShell';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { RoleCard } from '../components/RoleCard';
import { SelectField } from '../components/SelectField';
import { TextAreaField } from '../components/TextAreaField';
import { ShieldCheckIcon } from '../components/Icons';
import { relativeTime } from '../lib/projectDisplay';
import { useClaudeConnectionStore } from '../state/useClaudeConnectionStore';
import { useMcpServersStore } from '../state/useMcpServersStore';
import { useModelPreferenceStore } from '../state/useModelPreferenceStore';
import { useSessionStore } from '../state/useSessionStore';

const MCP_ERROR_COPY: Record<McpServerErrorCode, string> = {
  NAME_REQUIRED: 'Give this server a name.',
  NAME_RESERVED: '"autoai" is reserved for AutoAI\'s own tools - pick a different name.',
  NAME_TAKEN: 'A server with that name already exists.',
  COMMAND_REQUIRED: 'Give this server a command to run.',
};

/** Splits on whitespace and drops empty pieces - the same parsing for the
 *  Args field's one space-separated line. */
function splitArgs(raw: string): string[] {
  return raw.trim().length === 0 ? [] : raw.trim().split(/\s+/);
}

/** One `KEY=value` per line, blank lines ignored. Lines without an `=` are
 *  dropped rather than guessed at. */
function parseEnvLines(raw: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

/**
 * The user's own MCP servers - reachable only from Ask AutoAI, never from a
 * project scan or generated test case (see McpServerService's own doc
 * comment for why those stay on their narrow, fixed tool lists). Adding one
 * here does not start anything by itself; it only stores the configuration
 * that AssistantService reads the next time "Ask AutoAI" runs a query.
 */
function McpServersSection(): JSX.Element {
  const servers = useMcpServersStore((s) => s.servers);
  const loaded = useMcpServersStore((s) => s.loaded);
  const adding = useMcpServersStore((s) => s.adding);
  const lastError = useMcpServersStore((s) => s.lastError);
  const load = useMcpServersStore((s) => s.load);
  const add = useMcpServersStore((s) => s.add);
  const remove = useMcpServersStore((s) => s.remove);
  const clearError = useMcpServersStore((s) => s.clearError);

  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [env, setEnv] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(): Promise<void> {
    const ok = await add({ name, command, args: splitArgs(args), env: parseEnvLines(env) });
    if (ok) {
      setName('');
      setCommand('');
      setArgs('');
      setEnv('');
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="mcp-heading">
      <div className="flex flex-col gap-1.5">
        <h2 id="mcp-heading" className="font-display text-section font-semibold text-ink">
          MCP servers
        </h2>
        <p className="text-label text-muted">
          Extra tools Ask AutoAI can reach, on top of its own. Never used by a project scan or a
          generated test case - only by chat.
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft p-4">
        <p className="text-caption leading-relaxed text-quiet">
          A server you add here runs a real command with real access on this machine, the moment
          Ask AutoAI actually calls one of its tools. Only add servers you trust.
        </p>
      </div>

      {loaded && servers.length === 0 && (
        <p className="rounded-lg border border-hairline bg-raised p-4 text-caption text-faint">
          No MCP servers added yet.
        </p>
      )}

      {servers.length > 0 && (
        <ul className="flex flex-col gap-2">
          {servers.map((server) => (
            <li
              key={server.id}
              className="flex items-center justify-between gap-4 rounded-md border border-hairline bg-surface p-3.5"
            >
              <div className="min-w-0">
                <p className="text-label font-medium text-ink">{server.name}</p>
                <p className="truncate font-mono text-caption text-muted">
                  {[server.command, ...server.args].join(' ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(server.id)}
                className="shrink-0 text-caption text-muted transition hover:text-danger"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {lastError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3"
        >
          <p className="text-label text-quiet">{MCP_ERROR_COPY[lastError]}</p>
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 text-caption text-muted transition hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-raised p-4">
        <div className="flex flex-wrap gap-3">
          <FormField id="mcp-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <FormField id="mcp-command" label="Command" value={command} onChange={(e) => setCommand(e.target.value)} />
          <FormField
            id="mcp-args"
            label="Args"
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder="space separated"
          />
        </div>
        <TextAreaField
          id="mcp-env"
          label="Env (optional)"
          hint="One KEY=value per line."
          rows={3}
          value={env}
          onChange={(e) => setEnv(e.target.value)}
        />
        <PrimaryButton
          variant="secondary"
          size="sm"
          className="self-start"
          disabled={name.trim().length === 0 || command.trim().length === 0}
          loading={adding}
          onClick={() => void handleAdd()}
        >
          Add server
        </PrimaryButton>
      </div>
    </section>
  );
}

const DEFAULT_VALUE = '';

const EFFORT_LABEL: Record<(typeof CLAUDE_EFFORT_OPTIONS)[number], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

/**
 * Which model/effort every Agent SDK call in this app uses - a real,
 * changeable setting, not a silent default. Null on either field is a real
 * choice ("use the claude CLI's own account default"), represented here as
 * the empty-string option rather than left out of the list.
 */
function ModelPreferenceSection(): JSX.Element {
  const preference = useModelPreferenceStore((s) => s.preference);
  const loaded = useModelPreferenceStore((s) => s.loaded);
  const load = useModelPreferenceStore((s) => s.load);
  const setModel = useModelPreferenceStore((s) => s.setModel);
  const setEffort = useModelPreferenceStore((s) => s.setEffort);

  useEffect(() => {
    void load();
  }, [load]);

  const activeModelLabel = CLAUDE_MODEL_OPTIONS.find((option) => option.id === preference.model)?.label ?? 'Sonnet 5';
  const activeEffortLabel = preference.effort ? EFFORT_LABEL[preference.effort] : 'account default';

  return (
    <section className="flex flex-col gap-3" aria-labelledby="model-heading">
      <div className="flex flex-col gap-1.5">
        <h2 id="model-heading" className="font-display text-section font-semibold text-ink">
          Model
        </h2>
        <p className="text-label text-muted">
          Which Claude model and effort level every scan, generated test case, and Ask AutoAI
          reply uses. A faster or cheaper choice trades away some depth - useful when you're
          iterating quickly or watching token cost.
        </p>
      </div>

      {loaded && (
        <>
          <p className="text-caption text-faint">
            Currently: {activeModelLabel} · {activeEffortLabel} effort
          </p>
          <div className="flex flex-wrap gap-3">
            <SelectField
              id="model-select"
              tone="caps"
              label="Model"
              value={preference.model ?? DEFAULT_VALUE}
              onChange={(event) => void setModel(event.target.value === DEFAULT_VALUE ? null : event.target.value)}
              options={[
                { value: DEFAULT_VALUE, label: 'Default' },
                ...CLAUDE_MODEL_OPTIONS.map((option) => ({ value: option.id, label: `${option.label} - ${option.hint}` })),
              ]}
            />
            <SelectField
              id="effort-select"
              tone="caps"
              label="Effort"
              value={preference.effort ?? DEFAULT_VALUE}
              onChange={(event) =>
                void setEffort(event.target.value === DEFAULT_VALUE ? null : (event.target.value as typeof preference.effort))
              }
              options={[
                { value: DEFAULT_VALUE, label: 'Default' },
                ...CLAUDE_EFFORT_OPTIONS.map((level) => ({ value: level, label: EFFORT_LABEL[level] })),
              ]}
            />
          </div>
        </>
      )}
    </section>
  );
}

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
 * Device setup is the one thing the design's Settings artboard carries that
 * still has no main-process side, so it stays out of this screen.
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

        <ModelPreferenceSection />

        <McpServersSection />

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
