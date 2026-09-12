import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AssistantErrorCode } from '@shared/ipc-contract';
import { useAssistantStore } from '../state/useAssistantStore';
import { XIcon } from './Icons';
import { PrimaryButton } from './PrimaryButton';

const ASSISTANT_ERROR_COPY: Record<AssistantErrorCode, string> = {
  NOT_CONNECTED: "Claude isn't connected. Connect it in Settings, then try again.",
  ASSISTANT_FAILED: 'That request failed. You can try again.',
};

/**
 * "Ask AutoAI" - a slide-over panel, not a full screen, available from
 * anywhere in the app (mounted once in AppShell). A simple message list plus
 * a text input; when the assistant uses its `open_project_setup` tool, this
 * panel navigates there and closes itself - the assistant never navigates or
 * executes anything on its own.
 */
export function AssistantPanel(): JSX.Element | null {
  const navigate = useNavigate();
  const open = useAssistantStore((s) => s.open);
  const messages = useAssistantStore((s) => s.messages);
  const sending = useAssistantStore((s) => s.sending);
  const lastError = useAssistantStore((s) => s.lastError);
  const lastErrorDetail = useAssistantStore((s) => s.lastErrorDetail);
  const pendingOpenProjectId = useAssistantStore((s) => s.pendingOpenProjectId);
  const close = useAssistantStore((s) => s.close);
  const send = useAssistantStore((s) => s.send);
  const clearPendingOpen = useAssistantStore((s) => s.clearPendingOpen);
  const clearError = useAssistantStore((s) => s.clearError);

  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendingOpenProjectId) return;
    navigate(`/projects/${pendingOpenProjectId}`);
    clearPendingOpen();
    close();
  }, [pendingOpenProjectId, navigate, clearPendingOpen, close]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, sending]);

  if (!open) return null;

  async function handleSubmit(): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setText('');
    await send(trimmed);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close assistant"
        onClick={close}
        className="fixed inset-0 z-40 bg-ink/20"
      />
      <div
        role="dialog"
        aria-label="Ask AutoAI"
        className="fixed inset-y-0 right-0 z-50 flex w-[min(420px,100vw)] flex-col border-l border-hairline bg-raised shadow-[-18px_0_44px_rgba(26,24,21,0.14)]"
      >
        <div className="flex h-topbar shrink-0 items-center justify-between border-b border-hairline px-5">
          <span className="font-display text-section font-semibold text-ink">Ask AutoAI</span>
          <button
            type="button"
            onClick={close}
            className="flex size-7 items-center justify-center rounded-full text-muted outline-none transition hover:bg-rail hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <XIcon size={15} />
          </button>
        </div>

        <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <p className="text-caption text-muted">
              Ask about your projects and runs, or have AutoAI run a scan, draft a test case, or open a project&apos;s
              Setup card for you.
            </p>
          )}
          {messages.map((message, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-md px-3.5 py-2.5 text-body leading-relaxed ${
                message.role === 'user' ? 'self-end bg-ink text-surface' : 'self-start border border-hairline bg-surface text-ink'
              }`}
            >
              {message.text}
            </div>
          ))}
          {sending && <p className="self-start text-caption text-muted">Thinking…</p>}
        </div>

        {lastError && (
          <div role="alert" className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5">
            <p className="text-caption text-quiet">{ASSISTANT_ERROR_COPY[lastError] ?? lastErrorDetail ?? 'That failed.'}</p>
            <button type="button" onClick={clearError} className="shrink-0 text-caption text-muted transition hover:text-ink">
              Dismiss
            </button>
          </div>
        )}

        <form
          className="flex shrink-0 items-center gap-2 border-t border-hairline p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <input
            type="text"
            aria-label="Message AutoAI"
            placeholder="Ask AutoAI…"
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
    </>
  );
}
