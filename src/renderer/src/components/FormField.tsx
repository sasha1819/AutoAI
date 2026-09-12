import type { InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly id: string;
  /** 'default' is a normal field label; 'caps' is the small uppercase
   * label used above a value that reads more like data than prose (a
   * folder path, a name). Mirrors SelectField's own `tone` prop. */
  readonly tone?: 'default' | 'caps';
}

const LABEL_CLASSES: Record<NonNullable<FormFieldProps['tone']>, string> = {
  default: 'text-label font-medium text-ink',
  caps: 'text-tag font-semibold uppercase tracking-wide text-muted',
};

export function FormField({ label, id, tone = 'default', className, ...inputProps }: FormFieldProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL_CLASSES[tone]}>
        {label}
      </label>
      <input
        id={id}
        className={`h-field rounded-md border border-edge bg-raised px-3 text-body text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent/30 ${className ?? ''}`}
        {...inputProps}
      />
    </div>
  );
}
