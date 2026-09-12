import { TARGET_TYPE_LABEL, TargetType } from '@shared/ipc-contract';
import type { Project } from '@shared/ipc-contract';
import { useProjectsStore } from '../state/useProjectsStore';

const CONFIDENCE_COPY: Record<string, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence - please confirm',
};

interface DetectionSummaryProps {
  readonly project: Project;
}

/** What the (deliberately simple, v1) detection heuristic found for this
 * project, and the override that always wins over it - see
 * `effectiveTargetType` in the shared contract. */
export function DetectionSummary({ project }: DetectionSummaryProps): JSX.Element {
  const setOverride = useProjectsStore((s) => s.setOverride);
  const detection = project.detection;
  const effective = project.overriddenTargetType ?? detection?.targetType ?? TargetType.Unknown;

  return (
    <div className="rounded-lg border border-hairline bg-raised p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-body font-medium text-ink">{TARGET_TYPE_LABEL[effective]}</p>
          {detection && !project.overriddenTargetType && (
            <p className="text-caption text-muted">{CONFIDENCE_COPY[detection.confidence]}</p>
          )}
          {project.overriddenTargetType && <p className="text-caption text-accent-deep">Set manually</p>}
        </div>

        <select
          value={project.overriddenTargetType ?? ''}
          onChange={(e) => void setOverride(project.id, (e.target.value as TargetType) || null)}
          className="h-control rounded-md border border-edge bg-raised px-2.5 text-caption text-quiet outline-none focus:border-accent"
        >
          <option value="">Auto-detected</option>
          {Object.values(TargetType)
            .filter((t) => t !== TargetType.Unknown)
            .map((t) => (
              <option key={t} value={t}>
                Override: {TARGET_TYPE_LABEL[t]}
              </option>
            ))}
        </select>
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
