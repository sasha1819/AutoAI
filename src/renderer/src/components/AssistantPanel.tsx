import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AssistantErrorCode } from '@shared/ipc-contract';
import { useAssistantStore } from '../state/useAssistantStore';
import { PrimaryButton } from './PrimaryButton';

const ASSISTANT_ERROR_COPY: Record<AssistantErrorCode, string> = {
  NOT_CONNECTED: "Claude isn't connected. Connect it in Settings, then try again.",
  ASSISTANT_FAILED: 'That request failed. You can try again.',
};

/**
 * "Ask AutoAI" - a persistent dock along the bottom of the content area
 * (mounted once in AppShell, past the permanent left rail so it never
 * covers it), not a topbar-triggered slide-over. Always visible, nothing to
 * open or close - the message history only takes up space once there's
 * something in it, everything else stays a slim, always-reachable input
 * row. When the assistant uses its `open_project_setup` tool, this
 * navigates there - the assistant never navigates or executes anything on
 * its own.
 */
export function AssistantPanel(): JSX.Element {
  const navigate = useNavigate();
  const messages = useAssistantStore((s) => s.messages);
  const sending = useAssistantStore((s) => s.sending);
  const lastError = useAssistantStore((s) => s.lastError);
  const lastErrorDetail = useAssistantStore((s) => s.lastErrorDetail);
  const pendingOpenProjectId = useAssistantStore((s) => s.pendingOpenProjectId);
  const send = useAssistantStore((s) => s.send);
  const clearPendingOpen = useAssistantStore((s) => s.clearPendingOpen);
  const clearError = useAssistantStore((s) => s.clearError);

  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendingOpenProjectId) return;
    navigate(`/projects/${pendingOpenProjectId}`);
    clearPendingOpen();
  }, [pendingOpenProjectId, navigate, clearPendingOpen]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, sending]);

  async function handleSubmit(): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setText('');
    await send(trimmed);
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 left-[232px] z-40 flex flex-col border-t border-hairline bg-raised shadow-[0_-8px_24px_rgba(26,24,21,0.06)] animate-dock-in"
      aria-label="Ask AutoAI"
    >
      {(messages.length > 0 || sending) && (
        <div ref={listRef} className="flex max-h-56 flex-col gap-3 overflow-y-auto px-6 py-3.5">
          {messages.map((message, i) => (
            <div
              key={i}
              className={`max-w-[70%] rounded-md px-3.5 py-2.5 text-body leading-relaxed animate-message-in ${
                message.role === 'user' ? 'self-end bg-ink text-surface' : 'self-start border border-hairline bg-surface text-ink'
              }`}
            >
              {message.text}
            </div>
          ))}
          {sending && <p className="self-start text-caption text-muted">Thinking…</p>}
        </div>
      )}

      {lastError && (
        <div role="alert" className="flex items-center justify-between gap-3 border-t border-danger/30 bg-danger-soft px-6 py-2.5">
          <p className="text-caption text-quiet">{ASSISTANT_ERROR_COPY[lastError] ?? lastErrorDetail ?? 'That failed.'}</p>
          <button type="button" onClick={clearError} className="shrink-0 text-caption text-muted transition hover:text-ink">
            Dismiss
          </button>
        </div>
      )}

      <form
        className="flex shrink-0 items-center gap-3 px-6 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <span className="shrink-0 font-display text-label font-semibold text-ink">Ask AutoAI</span>
        <input
          type="text"
          aria-label="Message AutoAI"
          placeholder="Ask about your projects and runs, or have AutoAI run a scan, draft a test case, or open a project's Setup card…"
          value={text}
          disabled={sending}
          onChange={(event) => setText(event.target.value)}
          className="h-field min-w-0 flex-1 rounded-md border border-edge bg-surface px-3 text-body text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-60"
        />
        <PrimaryButton type="submit" size="md" disabled={sending || text.trim().length === 0} loading={sending}>
          Send
        </PrimaryButton>
      </form>
    </div>
  );
}
