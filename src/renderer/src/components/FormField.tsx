import { useId, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { EyeIcon, EyeOffIcon } from './Icons';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly id: string;
  /** 'default' is a normal field label; 'caps' is the small uppercase
   * label used above a value that reads more like data than prose (a
   * folder path, a name). Mirrors SelectField's own `tone` prop. */
  readonly tone?: 'default' | 'caps';
  /** A specific, field-level validation message - shown in place, not just
   *  a generic form-wide banner. Null/undefined means the field currently
   *  has nothing wrong with it, which is different from "hasn't been
   *  checked yet"; the caller decides when that switches. */
  readonly error?: string | null;
}

const LABEL_CLASSES: Record<NonNullable<FormFieldProps['tone']>, string> = {
  default: 'text-label font-medium text-ink',
  caps: 'text-tag font-semibold uppercase tracking-wide text-muted',
};

export function FormField({
  label,
  id,
  tone = 'default',
  error,
  className,
  type,
  ...inputProps
}: FormFieldProps): JSX.Element {
  const errorId = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const effectiveType = isPassword && revealed ? 'text' : type;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL_CLASSES[tone]}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={effectiveType}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`h-field w-full rounded-md border bg-raised px-3 text-body text-ink outline-none transition placeholder:text-faint focus:ring-1 ${
            error ? 'border-danger focus:border-danger focus:ring-danger/30' : 'border-edge focus:border-accent focus:ring-accent/30'
          } ${isPassword ? 'pr-10' : ''} ${className ?? ''}`}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-faint outline-none transition hover:text-muted focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {revealed ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
