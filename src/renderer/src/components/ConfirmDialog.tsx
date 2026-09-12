import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { PrimaryButton } from './PrimaryButton';

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  /** True for a confirmation that destroys something. It paints the
   * confirm button in `danger` and, more importantly, leaves the focus on
   * Cancel so a stray Enter does nothing. */
  readonly destructive?: boolean;
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * The "are you sure?" in front of anything that cannot be undone.
 *
 * Built on the native `<dialog>` element rather than a div with a high
 * z-index: `showModal()` brings the focus trap, the inert background, the
 * Escape key, and the "this is a dialog" announcement with it. Hand-rolled
 * modals get all four of those wrong, and the last one is invisible to
 * whoever is testing it with a mouse.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      /* The destructive action must not be what Enter lands on. The
         browser focuses the first focusable child, which is the close
         control, so this only matters when that changes - but it is the
         difference between a slip and a deletion. */
      if (destructive) cancelRef.current?.focus();
    }
    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, destructive]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-dialog-title"
      /* Escape fires `cancel`, and the browser closes the dialog whether
         or not React knows. Telling the parent keeps its `open` state from
         drifting out of step with what is on screen. */
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="w-[min(420px,calc(100vw-48px))] rounded-window border border-hairline bg-raised p-0 text-ink shadow-[0_18px_44px_rgba(26,24,21,0.18)] backdrop:bg-ink/25"
    >
      <div className="flex flex-col gap-3 px-6 pb-5 pt-6">
        <h2 id="confirm-dialog-title" className="font-display text-section font-semibold text-ink">
          {title}
        </h2>
        <div className="text-body leading-relaxed text-quiet">{children}</div>
      </div>

      <div className="flex items-center justify-end gap-2.5 border-t border-hairline bg-surface px-6 py-4">
        <PrimaryButton
          ref={cancelRef}
          variant="secondary"
          onClick={onCancel}
          disabled={busy}
        >
          {cancelLabel}
        </PrimaryButton>
        <PrimaryButton
          onClick={onConfirm}
          loading={busy}
          className={destructive ? '!bg-danger hover:!bg-danger' : undefined}
        >
          {confirmLabel}
        </PrimaryButton>
      </div>
    </dialog>
  );
}
