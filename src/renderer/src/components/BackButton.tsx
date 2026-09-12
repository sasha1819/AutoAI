import type { ButtonHTMLAttributes } from 'react';
import { ArrowLeftIcon } from './Icons';

/**
 * The low-emphasis "step backwards" control used by every screen in the
 * pre-`ready` flow (welcome -> register -> onboarding). It is deliberately
 * not a `PrimaryButton` variant: going back is never the call to action on
 * the screen it appears on, and giving it button chrome makes people click
 * it by mistake instead of the thing that moves them forward.
 */
export function BackButton({
  children = 'Back',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 text-ui font-medium text-muted transition hover:text-ink disabled:opacity-40 ${className ?? ''}`}
      {...rest}
    >
      <ArrowLeftIcon size={14} />
      {children}
    </button>
  );
}
