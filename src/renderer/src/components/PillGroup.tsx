interface PillOption {
  readonly value: string;
  readonly label: string;
}

interface PillGroupProps {
  readonly legend: string;
  readonly options: readonly PillOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/**
 * The "pick one of a small fixed set" control from the design - used for
 * target type on the add-project screen. Radio semantics, pill chrome: it
 * is one choice, so it announces as one choice rather than as a row of
 * unrelated buttons.
 */
export function PillGroup({ legend, options, value, onChange }: PillGroupProps): JSX.Element {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-tag font-semibold uppercase tracking-wide text-muted">
        {legend}
      </legend>
      <div role="radiogroup" aria-label={legend} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`rounded-full border px-3.5 py-2 text-ui transition outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                selected
                  ? 'border-accent bg-accent-soft font-medium text-accent-deep'
                  : 'border-edge bg-raised text-quiet hover:border-faint hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
