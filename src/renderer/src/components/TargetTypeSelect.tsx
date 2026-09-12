import { useState } from 'react';
import type { Project, TargetType } from '@shared/ipc-contract';
import { effectiveTargetType } from '@shared/ipc-contract';
import { useProjectsStore } from '../state/useProjectsStore';

const CHOICES = [
  { value: '', label: 'Not sure yet' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'web', label: 'Web' },
  { value: 'desktop', label: 'Desktop' },
] as const;

/**
 * The target type is a control, not a status badge: it always shows what
 * AutoAI will actually use - `project.overriddenTargetType` if the person
 * has set one, otherwise whatever `runDetection` last found, otherwise
 * "not sure yet". Picking an option here always writes an explicit
 * override; there is no way to type an override the detector could later
 * overwrite without the person choosing that.
 *
 * The design draws this as a static pill on the project row. It keeps the
 * pill's chrome here but stays a real select, because a control that
 * renders has to do the thing it says.
 */
export function TargetTypeSelect({ project }: { readonly project: Project }): JSX.Element {
  const setOverride = useProjectsStore((s) => s.setOverride);
  const [saving, setSaving] = useState(false);

  const effective = effectiveTargetType(project);

  async function handleChange(value: string): Promise<void> {
    setSaving(true);
    await setOverride(project.id, value.length > 0 ? (value as TargetType) : null);
    setSaving(false);
  }

  return (
    <select
      aria-label={`Target type for ${project.name}`}
      value={project.overriddenTargetType ?? ''}
      disabled={saving}
      onChange={(e) => void handleChange(e.target.value)}
      className={`h-pill cursor-pointer rounded-full border bg-raised px-2.5 text-meta outline-none transition focus:border-accent disabled:opacity-50 ${
        effective !== 'unknown' ? 'border-accent text-accent-deep' : 'border-edge text-quiet'
      }`}
    >
      {CHOICES.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}
