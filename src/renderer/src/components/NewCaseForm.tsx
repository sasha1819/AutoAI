import { useId, useState } from 'react';
import type { AreaRecord } from '@shared/ipc-contract';
import { parseSteps } from '../lib/testPlanDisplay';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { SelectField } from './SelectField';
import { TextAreaField } from './TextAreaField';

const UNSORTED_VALUE = '';

interface NewCaseFormProps {
  readonly areas: readonly AreaRecord[];
  /** Where the list is currently pointed, so a case written while looking
   * at Checkout lands in Checkout rather than in Unsorted. */
  readonly defaultAreaId: string | null;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onSubmit: (input: { name: string; areaId: string | null; steps: string[] }) => void;
  readonly onCancel: () => void;
}

/**
 * Writing a case by hand - the only way one gets into AutoAI today. It
 * opens inside the list rather than over it: what someone is about to
 * write is a sibling of what is already there, and a dialog would hide the
 * names they are trying not to duplicate.
 */
export function NewCaseForm({
  areas,
  defaultAreaId,
  saving,
  error,
  onSubmit,
  onCancel,
}: NewCaseFormProps): JSX.Element {
  const fieldId = useId();
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState<string>(defaultAreaId ?? UNSORTED_VALUE);
  const [stepsText, setStepsText] = useState('');

  const steps = parseSteps(stepsText);
  const canSubmit = name.trim().length > 0 && steps.length > 0 && !saving;

  const options = [
    { value: UNSORTED_VALUE, label: 'Unsorted' },
    ...[...areas]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((area) => ({ value: area.id, label: area.name })),
  ];

  return (
    <form
      className="flex flex-col gap-4 border-b border-hairline bg-surface px-5 py-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          name: name.trim(),
          areaId: areaId === UNSORTED_VALUE ? null : areaId,
          steps,
        });
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
        <FormField
          id={`${fieldId}-name`}
          tone="caps"
          label="What should happen"
          placeholder="Guest can buy one item"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <SelectField
          id={`${fieldId}-area`}
          tone="caps"
          label="Area"
          options={options}
          value={areaId}
          onChange={(event) => setAreaId(event.target.value)}
        />
      </div>

      <TextAreaField
        id={`${fieldId}-steps`}
        label="Steps"
        rows={6}
        placeholder={'Open the storefront\nAdd a mug to the cart\nOpen the cart\nThe total should be £18.00'}
        hint="One step per line, in the words you would use telling someone else to do it."
        value={stepsText}
        onChange={(event) => setStepsText(event.target.value)}
      />

      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <PrimaryButton type="submit" disabled={!canSubmit} loading={saving}>
          Save case
        </PrimaryButton>
        <PrimaryButton type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </PrimaryButton>
        <span className="text-caption text-faint">
          {steps.length === 0 ? 'No steps yet' : `${steps.length} steps`}
        </span>
      </div>
    </form>
  );
}
