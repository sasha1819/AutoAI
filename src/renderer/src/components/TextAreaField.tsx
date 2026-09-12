import type { TextareaHTMLAttributes } from 'react';

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly label: string;
  readonly id: string;
  /** Sits under the field, in the same muted register FormField's labels
   * use. For saying how the field is read, not for errors. */
  readonly hint?: string;
}

/**
 * FormField's sibling for the one input in the app that is genuinely
 * multi-line: the steps of a test case. Same chrome, same focus ring, same
 * label treatment - a second visual system for a taller box would be a new
 * pattern for no reason.
 */
export function TextAreaField({
  label,
  id,
  hint,
  className,
  ...textAreaProps
}: TextAreaFieldProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-tag font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      <textarea
        id={id}
        className={`w-full resize-y rounded-md border border-edge bg-raised px-3 py-2.5 text-body leading-relaxed text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent/30 ${className ?? ''}`}
        {...textAreaProps}
      />
      {hint && <p className="text-caption text-muted">{hint}</p>}
    </div>
  );
}
