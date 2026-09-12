import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly loading?: boolean;
  /** 'primary' (default) is the one call-to-action style; 'secondary' is
   * for a lower-emphasis action next to a primary one. Still the same
   * button component, not a second system - any future variant belongs
   * here too. */
  readonly variant?: 'primary' | 'secondary';
  /** 'md' (default) matches `h-control`; 'lg' matches `h-cta` for the one
   * or two calls to action a screen actually leads with; 'sm' matches a
   * table row's own height for an inline action like "Open". */
  readonly size?: 'sm' | 'md' | 'lg';
}

/** Amber has nowhere near the contrast a call to action needs, so the
 * primary fill is `ink`, not `accent` - see the component-patterns skill. */
const VARIANT_CLASSES: Record<NonNullable<PrimaryButtonProps['variant']>, string> = {
  primary: 'bg-ink text-surface hover:bg-ink/90',
  secondary: 'border border-edge bg-raised text-ink hover:bg-rail',
};

const SIZE_CLASSES: Record<NonNullable<PrimaryButtonProps['size']>, string> = {
  sm: 'h-row px-3 text-caption',
  md: 'h-control px-4 text-ui',
  lg: 'h-cta px-5 text-body',
};

/** A `forwardRef` because ConfirmDialog moves focus onto Cancel itself
 * when it opens destructively - see the ref on that component's usage. */
export const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(function PrimaryButton(
  { loading = false, disabled, variant = 'primary', size = 'md', children, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className ?? ''}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
});
