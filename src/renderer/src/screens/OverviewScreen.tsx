import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProjectTable } from '../components/ProjectTable';
import { TransportFailedNotice } from '../components/TransportFailedNotice';
import { useProjectsStore } from '../state/useProjectsStore';
import { useSessionStore } from '../state/useSessionStore';

const SETUP_STEPS = [
  { step: '01', title: 'Choose the folder', text: 'Nothing is copied or uploaded.' },
  { step: '02', title: 'Confirm what it is', text: 'Mobile, web, or desktop - change it if AutoAI guesses wrong.' },
  { step: '03', title: 'Add what you already test', text: 'Cases you write, paste, or import land in the project.' },
] as const;

/**
 * The Overview screen from the v2 design, at `/`, real data only. The
 * design's populated state draws a live "Running" card with a progress bar
 * and per-project pass/fail sparklines - none of that is drawn here,
 * because none of it exists: there is no run engine yet (see RunsScreen),
 * so a sparkline here would be the same invented-data problem ProjectTable
 * already avoids for its own row. This screen tells the truth: how many
 * projects exist, and a way to add one.
 *
 * No spotlight/tour overlay either - the design specs exactly one slide of
 * a longer tour ("three more arrive when the first run finishes") that
 * points at nothing built yet. A tour that dead-ends is worse than no tour.
 */
function EmptyOverview(): JSX.Element {
  const navigate = useNavigate();
  const pickLocalFolder = useProjectsStore((s) => s.pickLocalFolder);
  const name = useSessionStore((s) => s.session?.name.split(' ')[0]);

  async function handleChooseFolder(): Promise<void> {
    const pickedPath = await pickLocalFolder();
    if (pickedPath === null) return;
    navigate('/projects/new', { state: { pickedPath } });
  }

  return (
    <div className="flex max-w-[640px] flex-col gap-8 px-8 py-9">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-hero font-bold text-ink">
          {name ? `Point AutoAI at something, ${name}` : 'Point AutoAI at something'}
        </h1>
        <p className="text-ui text-quiet">
          Pick a folder on this Mac, or give AutoAI a git URL to clone. It looks through the project,
          works out what kind of app it is, and shows you what it found before running anything.
        </p>
      </div>

      <div className="flex border-y border-hairline">
        {SETUP_STEPS.map((item, i) => (
          <div
            key={item.step}
            className={`flex flex-1 flex-col gap-1.5 py-5 ${i > 0 ? 'border-l border-hairline pl-6' : 'pr-6'}`}
          >
            <span className="font-mono text-tag font-semibold text-accent-deep">{item.step}</span>
            <span className="text-body font-medium text-ink">{item.title}</span>
            <span className="text-caption text-muted">{item.text}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-5">
        <PrimaryButton size="lg" onClick={() => void handleChooseFolder()}>
          Choose a folder
        </PrimaryButton>
        <span className="text-ui text-muted">
          or{' '}
          <button
            type="button"
            onClick={() => navigate('/projects/new')}
            className="text-ui text-accent-deep underline decoration-accent-deep/40 underline-offset-2 outline-none hover:text-ink focus-visible:text-ink"
          >
            type a path, or clone a git URL
          </button>
        </span>
      </div>
    </div>
  );
}

function PopulatedOverview(): JSX.Element {
  const navigate = useNavigate();
  const projects = useProjectsStore((s) => s.projects);

  return (
    <div className="flex flex-col gap-6 px-8 py-7">
      <div className="flex items-center justify-between">
        <p className="text-label text-muted">
          {projects.length} project{projects.length === 1 ? '' : 's'}, none have run yet.
        </p>
        <PrimaryButton onClick={() => navigate('/projects/new')}>Add project</PrimaryButton>
      </div>
      <ProjectTable projects={projects.slice(0, 5)} />
      {projects.length > 5 && (
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="self-start text-ui text-accent-deep outline-none hover:text-ink focus-visible:text-ink"
        >
          See all {projects.length} projects
        </button>
      )}
    </div>
  );
}

/**
 * A manual tester and an engineer see the same screen here rather than a
 * role-gated pair of views (the way the old Home screen split them): the
 * empty state's copy is already plain-language per the component-patterns
 * skill's rule for when the audience isn't yet known, and the populated
 * state is just real project data, which needs no translation either way.
 */
export function OverviewScreen(): JSX.Element {
  const projects = useProjectsStore((s) => s.projects);
  const loaded = useProjectsStore((s) => s.loaded);
  const transportFailed = useProjectsStore((s) => s.transportFailed);
  const loadProjects = useProjectsStore((s) => s.load);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  return (
    <AppShell title="Overview">
      {transportFailed && (
        <div className="px-8 pt-7">
          <TransportFailedNotice />
        </div>
      )}
      {loaded && (projects.length === 0 ? <EmptyOverview /> : <PopulatedOverview />)}
    </AppShell>
  );
}
