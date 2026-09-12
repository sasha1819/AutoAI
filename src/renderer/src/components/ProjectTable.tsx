import { useNavigate } from 'react-router-dom';
import type { Project } from '@shared/ipc-contract';
import { relativeTime } from '../lib/projectDisplay';
import { PrimaryButton } from './PrimaryButton';
import { TargetTypeSelect } from './TargetTypeSelect';

/**
 * The project list from the v2 Overview: one hairline-separated row per
 * project, no cards.
 *
 * The design's row also carries a run sparkline and a "6 of 7 passing"
 * line. Neither is drawn here, because neither exists - there is no run
 * store yet, and a sparkline made of invented bars is the most convincing
 * lie a screen like this can tell. The row says what AutoAI actually
 * knows: where the project is, what it is, and when it was added.
 */
function ProjectRow({
  project,
  now,
}: {
  readonly project: Project;
  readonly now: number;
}): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-[18px] border-t border-hairline px-1 py-[15px] last:border-b">
      <div className="flex w-[230px] min-w-0 shrink-0 flex-col gap-0.5">
        <span className="truncate text-card font-medium text-ink">{project.name}</span>
        <span className="truncate font-mono text-meta text-muted" title={project.localPath}>
          {project.localPath}
        </span>
      </div>

      <TargetTypeSelect project={project} />

      <span className="min-w-0 flex-1 text-label text-muted">No runs yet</span>

      <span className="w-[92px] shrink-0 text-right text-caption text-faint">
        added {relativeTime(project.createdAt, now)}
      </span>

      <PrimaryButton
        variant="secondary"
        size="sm"
        onClick={() => navigate(`/projects/${project.id}`)}
      >
        Open
      </PrimaryButton>
    </div>
  );
}

export function ProjectTable({
  projects,
}: {
  readonly projects: readonly Project[];
}): JSX.Element {
  /* One clock reading for the whole table, taken at render. Calling
     Date.now() per row would let two rows added in the same second
     disagree with each other. */
  const now = Date.now();

  return (
    <div className="flex flex-col">
      {projects.map((project) => (
        <ProjectRow key={project.id} project={project} now={now} />
      ))}
    </div>
  );
}
