import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { RunRecord } from '@shared/ipc-contract';
import { AppShell } from '../components/AppShell';
import { SectionEmpty } from '../components/SectionEmpty';
import { relativeTime } from '../lib/projectDisplay';
import { useProjectsStore } from '../state/useProjectsStore';
import { useRunStore } from '../state/useRunStore';

function RunRow({ run, projectName }: { readonly run: RunRecord; readonly projectName: string }): JSX.Element {
  const passed = run.steps.filter((step) => step.status === 'passed').length;
  const failed = run.steps.filter((step) => step.status === 'failed').length;

  return (
    <Link
      to={`/projects/${run.projectId}`}
      className="flex items-center gap-4 rounded-lg border border-hairline bg-raised px-5 py-4 transition hover:border-edge"
    >
      <span
        className={`flex h-pill shrink-0 items-center rounded-full border px-3 text-caption font-semibold uppercase tracking-wide ${
          run.status === 'passed' ? 'border-ok/40 text-ok' : 'border-danger/40 text-danger'
        }`}
      >
        {run.status === 'passed' ? 'Passed' : 'Failed'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-label font-medium text-ink">{run.caseName}</p>
        <p className="truncate text-caption text-muted">
          {projectName} · {passed} passed{failed > 0 ? `, ${failed} failed` : ''} · finished{' '}
          {relativeTime(run.finishedAt, Date.now())}
        </p>
      </div>
    </Link>
  );
}

/**
 * A real list from `runs.listAll()`, newest first, each row linking to its
 * project. Runs are per-case only (no "run all" in this pass), so this is
 * every individual case run across every project, not one row per project.
 */
export function RunsScreen(): JSX.Element {
  const allRuns = useRunStore((s) => s.allRuns);
  const loadAll = useRunStore((s) => s.loadAll);
  const projects = useProjectsStore((s) => s.projects);
  const loadProjects = useProjectsStore((s) => s.load);

  useEffect(() => {
    void loadAll();
    void loadProjects();
  }, [loadAll, loadProjects]);

  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <AppShell title="Runs">
      <div className="flex flex-col gap-4 px-8 py-7">
        {allRuns.length === 0 ? (
          <SectionEmpty headline="Nothing has run yet">
            A run is AutoAI actually driving your app with a real, headless Chromium browser via
            Playwright. Open a test case with a runnable script, set the project&apos;s URL, and press
            Run - it will show up here.
          </SectionEmpty>
        ) : (
          allRuns.map((run) => (
            <RunRow key={run.id} run={run} projectName={projectNameById.get(run.projectId) ?? 'Unknown project'} />
          ))
        )}
      </div>
    </AppShell>
  );
}
