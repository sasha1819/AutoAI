import { TARGET_TYPE_LABEL, TargetType } from '@shared/ipc-contract';
import type { Project } from '@shared/ipc-contract';

const CONFIDENCE_COPY: Record<string, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence - please confirm',
};

interface DetectionSummaryProps {
  readonly project: Project;
}

/** What the (deliberately simple, v1) detection heuristic found for this
 * project, read-only - `TargetTypeSelect` (the pill in the header row) is
 * the one real control for `overriddenTargetType`; this used to duplicate
 * it with a second `<select>` writing the exact same field, which is
 * exactly the kind of "two controls for one value" this app's own
 * conventions rule out elsewhere. See `effectiveTargetType` in the shared
 * contract. */
export function DetectionSummary({ project }: DetectionSummaryProps): JSX.Element {
  const detection = project.detection;
  const effective = project.overriddenTargetType ?? detection?.targetType ?? TargetType.Unknown;

  return (
    <div className="rounded-lg border border-hairline bg-raised p-5">
      <div>
        <p className="text-body font-medium text-ink">{TARGET_TYPE_LABEL[effective]}</p>
        {detection && !project.overriddenTargetType && (
          <p className="text-caption text-muted">{CONFIDENCE_COPY[detection.confidence]}</p>
        )}
        {project.overriddenTargetType && <p className="text-caption text-accent-deep">Set manually</p>}
      </div>

      {detection && detection.evidence.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-hairline pt-3">
          {detection.evidence.map((item, i) => (
            <li key={`${item.path}-${i}`} className="text-caption text-muted">
              <code className="rounded bg-rail px-1 py-0.5 text-quiet">{item.path}</code> - {item.reason}
            </li>
          ))}
        </ul>
      )}
      {detection && detection.evidence.length === 0 && (
        <p className="mt-3 border-t border-hairline pt-3 text-caption text-muted">
          Nothing recognizable was found automatically - set the type manually above.
        </p>
      )}
    </div>
  );
}
