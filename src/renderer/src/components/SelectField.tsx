import type { SelectHTMLAttributes } from 'react';

interface Option {
  readonly value: string;
  readonly label: string;
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label: string;
  readonly id: string;
  readonly options: readonly Option[];
  readonly tone?: 'default' | 'caps';
}

const LABEL_CLASSES: Record<NonNullable<SelectFieldProps['tone']>, string> = {
  default: 'text-label font-medium text-ink',
  caps: 'text-tag font-semibold uppercase tracking-wide text-muted',
};

/** Same visual language as FormField, for a "pick one of a fixed set" field
 * that has too many options to sit in a PillGroup. */
export function SelectField({
  label,
  id,
  options,
  tone = 'default',
  className,
  ...selectProps
}: SelectFieldProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL_CLASSES[tone]}>
        {label}
      </label>
      <select
        id={id}
        className={`h-field w-full rounded-md border border-edge bg-raised px-3 text-body text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30 ${className ?? ''}`}
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
